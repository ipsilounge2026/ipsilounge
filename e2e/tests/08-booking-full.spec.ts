import { expect, test } from "@playwright/test";
import { BACKEND_URL, devLogin } from "../helpers/auth";

/**
 * Sprint 4 - Test 09: 실제 booking 생성 E2E
 *
 * 리드타임이 없는 "심리상담" 유형으로 booking 생성.
 *   · 학생부분석/학종전략 — 업로드 + 7일 리드타임 필요 (seed 에 미준비)
 *   · 학습상담 — 설문 제출 + 7일 리드타임 필요
 *   · 선배상담 — 선배 매칭 필요
 *   · **심리상담/기타** — 리드타임 없음 ← 여기서 사용
 *
 * 쿨다운: 이전 booking 이 없으면 걸리지 않음 → fresh student 사용.
 *
 * 흐름:
 *   1) devLogin → student_t3 access token (t1/t2 는 다른 테스트에서 사용)
 *   2) GET /api/consultation/slots — 이번달/다음달 슬롯 조회
 *   3) 첫 번째 available 슬롯 선택
 *   4) POST /api/consultation/book { type: "심리상담", mode: "remote", slot_id }
 *   5) 200/201 + booking.id 응답
 *   6) GET /api/consultation/my 에서 해당 booking 확인
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

/** 이번달 + 다음달 슬롯을 모두 조회해서 available 한 것 하나 반환. */
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
  throw new Error("available slot 을 찾을 수 없음 (seed 확인 필요)");
}

test.describe("실제 booking 생성 E2E (심리상담, 리드타임 없음)", () => {
  test("student_t3 로 심리상담 booking 을 생성하면 /consultation/my 에서 조회된다", async ({
    request,
  }) => {
    const { accessToken } = await devLogin(request, "student_t3");

    // 1) 슬롯 선택
    const slot = await pickAvailableSlot(request, accessToken);
    expect(slot.id).toBeTruthy();

    // 2) booking 생성 (심리상담 — 리드타임 없음)
    const bookRes = await apiFetch(
      request,
      "POST",
      "/api/consultation/book",
      accessToken,
      {
        slot_id: slot.id,
        type: "심리상담",
        mode: "remote",
        memo: "E2E Sprint 4 테스트",
      }
    );

    // 400 수용 — 이전 테스트 실행으로 쿨다운이 걸린 경우 (same student 재실행시).
    // CI 에서 fresh DB 라면 200/201.
    if ([200, 201].includes(bookRes.status)) {
      expect(bookRes.json.id, "booking id 응답").toBeTruthy();
      expect(bookRes.json.type).toBe("심리상담");
      expect(bookRes.json.mode).toBe("remote");

      // 3) GET /api/consultation/my 조회
      const myRes = await apiFetch(
        request,
        "GET",
        "/api/consultation/my",
        accessToken
      );
      expect(myRes.status).toBe(200);
      const myList: any[] = Array.isArray(myRes.json)
        ? myRes.json
        : myRes.json?.items ?? [];
      const found = myList.find((b: any) => b.id === bookRes.json.id);
      expect(
        found,
        "방금 생성한 booking 이 /consultation/my 에서 조회되어야 함"
      ).toBeTruthy();
    } else {
      // 쿨다운/중복 예약 인 경우 — 테스트 재실행 환경에서 예상 가능
      const detail = bookRes.json?.detail ?? "";
      expect(
        [400, 409].includes(bookRes.status) &&
          /쿨다운|3개월|이미.*예약|이전 상담일/.test(String(detail)),
        `예상 가능한 거절(쿨다운/중복) 이 아닌 오류: ${bookRes.status} ${JSON.stringify(
          bookRes.json
        )}`
      ).toBeTruthy();

      // 실패하더라도 기존 booking 이 /consultation/my 에 하나 이상 있어야 정상
      const myRes = await apiFetch(
        request,
        "GET",
        "/api/consultation/my",
        accessToken
      );
      expect(myRes.status).toBe(200);
      const myList: any[] = Array.isArray(myRes.json)
        ? myRes.json
        : myRes.json?.items ?? [];
      expect(
        myList.length,
        "쿨다운/중복 오류라면 이전 booking 최소 1건 존재"
      ).toBeGreaterThan(0);
    }
  });
});
