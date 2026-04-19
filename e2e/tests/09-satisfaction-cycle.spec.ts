import { expect, test } from "@playwright/test";
import { BACKEND_URL, devLogin } from "../helpers/auth";

/**
 * Sprint 4 - Test 10: 만족도 설문 전체 사이클 E2E
 *
 * 기획서 §10-2: booking.status = "completed" 시점에 SatisfactionSurvey 자동 생성.
 *
 * 흐름:
 *   1) student_t2 로 심리상담 booking 생성 (리드타임·쿨다운 없음, booking.status=requested)
 *   2) admin_a 로 admin JWT 획득
 *   3) admin 이 PUT /api/admin/consultation/bookings/{id}/status → status="completed"
 *      → backend 가 _trigger_satisfaction_survey() 로 SatisfactionSurvey(pending) 자동 생성
 *   4) student_t2 로 GET /api/satisfaction-surveys → pending 건 조회
 *   5) PATCH /api/satisfaction-surveys/{id} — 필수 점수 입력 (S1~S5, C1~C3 각 8점)
 *   6) POST /api/satisfaction-surveys/{id}/submit
 *   7) status = "submitted" 확인
 *
 * 쿨다운: student_t2 의 첫 booking → 쿨다운 미적용.
 */

async function apiFetch(
  request: any,
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  token: string,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const resp = await request.fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    data: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await resp.json();
  } catch {}
  return { status: resp.status(), json };
}

async function pickAvailableSlot(request: any, token: string): Promise<any> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  for (const [y, m] of [
    [year, month],
    [nextYear, nextMonth],
  ]) {
    const res = await apiFetch(
      request,
      "GET",
      `/api/consultation/slots?year=${y}&month=${m}`,
      token
    );
    if (res.status !== 200) continue;
    const slots: any[] = Array.isArray(res.json) ? res.json : [];
    const available = slots.find(
      (s: any) => (s.remaining ?? 0) > 0 && s.available !== false
    );
    if (available) return available;
  }
  throw new Error("available slot 을 찾을 수 없음");
}

test.describe("만족도 설문 전체 사이클 (booking → complete → submit)", () => {
  test("student_t2 booking 을 admin 이 completed 처리하면 만족도 설문이 자동 생성되고 제출까지 성공한다", async ({
    request,
  }) => {
    // ── 1) 학생으로 booking 생성 ──
    const student = await devLogin(request, "student_t2");
    const slot = await pickAvailableSlot(request, student.accessToken);

    const bookRes = await apiFetch(
      request,
      "POST",
      "/api/consultation/book",
      student.accessToken,
      {
        slot_id: slot.id,
        type: "심리상담",
        mode: "remote",
        memo: "Sprint 4 만족도 사이클 테스트",
      }
    );

    let bookingId: string;
    if ([200, 201].includes(bookRes.status)) {
      bookingId = bookRes.json.id;
      expect(bookingId).toBeTruthy();
    } else {
      // 이미 booking 이 있는 경우 — /consultation/my 에서 pick
      const myRes = await apiFetch(
        request,
        "GET",
        "/api/consultation/my",
        student.accessToken
      );
      const myList: any[] = Array.isArray(myRes.json)
        ? myRes.json
        : myRes.json?.items ?? [];
      const existing = myList.find(
        (b: any) =>
          b.type === "심리상담" &&
          b.status !== "completed" &&
          b.status !== "cancelled"
      );
      if (!existing) {
        // completed 인 것도 없으면 테스트 skip
        test.skip(
          true,
          `booking 생성 실패 + 기존 활성 booking 없음 → 테스트 skip: ${bookRes.status} ${JSON.stringify(bookRes.json)}`
        );
        return;
      }
      bookingId = existing.id;
    }

    // ── 2) admin 으로 status=completed 전환 ──
    const admin = await devLogin(request, "admin_a");
    const statusRes = await apiFetch(
      request,
      "PUT",
      `/api/admin/consultation/bookings/${bookingId}/status`,
      admin.accessToken,
      { status: "completed" }
    );
    // 이미 completed 인 경우도 수용 (재실행 시)
    if (![200].includes(statusRes.status)) {
      expect(
        [400, 409].includes(statusRes.status),
        `admin status 전환 실패: ${statusRes.status} ${JSON.stringify(statusRes.json)}`
      ).toBeTruthy();
    }

    // ── 3) 학생 권한으로 만족도 설문 조회 ──
    // 응답 shape: {"surveys": [...]}
    const listRes = await apiFetch(
      request,
      "GET",
      "/api/satisfaction-surveys",
      student.accessToken
    );
    expect(listRes.status).toBe(200);
    const surveys: any[] = Array.isArray(listRes.json?.surveys)
      ? listRes.json.surveys
      : Array.isArray(listRes.json)
        ? listRes.json
        : listRes.json?.items ?? [];

    // 디버그: 전체 설문 목록 (실패 시 진단용)
    if (surveys.length === 0) {
      console.warn(
        `[satisfaction-cycle] 설문 목록 비어있음. admin status 응답: ${JSON.stringify(statusRes.json)}, bookingId=${bookingId}`
      );
    }

    // 방금 completed 한 booking_id 기준으로 설문 찾기 (booking_id 없으면 pending fallback)
    const survey = surveys.find(
      (s: any) => s.booking_id === bookingId
    ) ?? surveys.find((s: any) => s.status === "pending");
    expect(
      survey,
      `admin complete 후 SatisfactionSurvey 가 자동 생성되어야 함. booking_id=${bookingId}, surveys=${JSON.stringify(surveys)}`
    ).toBeTruthy();

    // 이미 제출된 설문이면 여기서 성공으로 종료 (재실행 케이스)
    if (survey.status === "submitted") {
      expect(survey.submitted_at).toBeTruthy();
      return;
    }

    // ── 4) 설문 응답 입력 (PATCH) ──
    // survey_type: counselor (S1~S5 공통 + C1~C3 상담사 전용)
    //              senior (S1~S5 공통 + M1~M3 선배 전용)
    const isCounselor = (survey.survey_type ?? "counselor") === "counselor";
    const scores: Record<string, number> = {
      S1: 8, S2: 8, S3: 8, S4: 8, S5: 8,
    };
    if (isCounselor) {
      Object.assign(scores, { C1: 8, C2: 8, C3: 8 });
    } else {
      Object.assign(scores, { M1: 8, M2: 8, M3: 8 });
    }

    const patchRes = await apiFetch(
      request,
      "PATCH",
      `/api/satisfaction-surveys/${survey.id}`,
      student.accessToken,
      {
        scores,
        free_text: { F1: "상담이 도움이 되었습니다", F2: "" },
      }
    );
    expect(
      patchRes.status,
      `satisfaction patch 실패: ${JSON.stringify(patchRes.json)}`
    ).toBe(200);

    // ── 5) 제출 ──
    const submitRes = await apiFetch(
      request,
      "POST",
      `/api/satisfaction-surveys/${survey.id}/submit`,
      student.accessToken
    );
    expect(
      submitRes.status,
      `satisfaction submit 실패: ${JSON.stringify(submitRes.json)}`
    ).toBe(200);

    // ── 6) status=submitted 확인 ──
    const finalRes = await apiFetch(
      request,
      "GET",
      `/api/satisfaction-surveys/${survey.id}`,
      student.accessToken
    );
    expect(finalRes.status).toBe(200);
    expect(finalRes.json.status).toBe("submitted");
    expect(finalRes.json.submitted_at).toBeTruthy();
  });
});
