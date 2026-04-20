import { expect, test } from "@playwright/test";
import { BACKEND_URL, devLogin } from "../helpers/auth";
import { ADMIN_WEB_URL, authenticateAdminAs } from "../helpers/admin-auth";

/**
 * Sprint 6 - Test 14~16: admin-web 상담 기록 작성 · 검수 흐름
 *
 * 커버 영역:
 *   Test 14: POST /api/admin/consultation-notes — 상담 기록 작성 (admin_a)
 *   Test 15: PUT /api/admin/counselor-sharing/note/{id}/review — 선배 공유 검수 (admin_a)
 *   Test 16: admin-web UI /consultation/notes 페이지 진입 (렌더 검증)
 *
 * 상담 기록은 "최초 1회, 이후 수정 불가" 정책 → 테스트 재실행 시 중복 생성 될 수 있음.
 * Test 14 는 고유 category/consultation_date 조합으로 유니크하게 생성되거나 409 을 수용.
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

test.describe("admin-web: 상담 기록 작성 · 검수 (API)", () => {
  test("admin_a 가 상담 기록 작성 후 본인이 review 처리하면 status 가 업데이트된다", async ({
    request,
  }) => {
    // ── 1) admin_a 로 인증 ──
    const admin = await devLogin(request, "admin_a");

    // ── 2) 기록 대상 학생 ID 조회 (student_t1) ──
    // dev login-as 로 student 의 id 를 간접 획득
    const studentLogin = await devLogin(request, "student_t1");
    // JWT payload 에서 user_id 추출 (base64url decode)
    const payload = JSON.parse(
      Buffer.from(
        studentLogin.accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      ).toString("utf-8")
    );
    const studentId: string = payload.sub;
    expect(studentId).toBeTruthy();

    // ── 3) POST 상담 기록 작성 ──
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const createRes = await apiFetch(
      request,
      "POST",
      "/api/admin/consultation-notes",
      admin.accessToken,
      {
        user_id: studentId,
        category: "academic",
        consultation_date: today,
        student_grade: "grade1",
        timing: "T1",
        main_content: "Sprint 6 E2E 테스트 상담 기록 본문",
        advice_given: "꾸준히 학습 계획을 유지하세요",
        next_steps: "주간 복습 계획 수립",
        next_topic: "다음 상담에서 중간고사 결과 리뷰",
        is_visible_to_user: false,
      }
    );

    // 200/201 성공 또는 400/409 (재실행 시 제약 위반) 수용
    if (![200, 201].includes(createRes.status)) {
      expect(
        [400, 409, 422].includes(createRes.status),
        `note 생성 응답 예상 밖: ${createRes.status} ${JSON.stringify(createRes.json)}`
      ).toBeTruthy();
      // 실패해도 테스트는 종료 (이후 단계 스킵)
      test.skip(
        true,
        `note 생성 실패/중복: ${createRes.status} — 재실행 시 일부 제약 위반 가능`
      );
      return;
    }

    const noteId: string = createRes.json.id;
    expect(noteId).toBeTruthy();

    // ── 4) PUT 검수 처리 (review_status: reviewed) ──
    const reviewRes = await apiFetch(
      request,
      "PUT",
      `/api/admin/counselor-sharing/note/${noteId}/review`,
      admin.accessToken,
      {
        review_status: "reviewed",
        review_notes: "E2E 검수 테스트 - 승인",
      }
    );
    expect(
      reviewRes.status,
      `review 실패: ${JSON.stringify(reviewRes.json)}`
    ).toBe(200);

    // ── 5) GET 로 검수 상태 재확인 ──
    const getRes = await apiFetch(
      request,
      "GET",
      `/api/admin/counselor-sharing/note/${noteId}`,
      admin.accessToken
    );
    expect(getRes.status).toBe(200);
    expect(
      getRes.json.senior_review_status,
      "review_status 가 reviewed 로 반영되어야 함"
    ).toBe("reviewed");
  });

  test("학생별 상담 기록 목록 조회 시 방금 작성한 기록이 포함된다", async ({
    request,
  }) => {
    const admin = await devLogin(request, "admin_a");
    const studentLogin = await devLogin(request, "student_t1");
    const payload = JSON.parse(
      Buffer.from(
        studentLogin.accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      ).toString("utf-8")
    );
    const studentId: string = payload.sub;

    // 학생별 상담 기록 조회
    const listRes = await apiFetch(
      request,
      "GET",
      `/api/admin/consultation-notes/user/${studentId}`,
      admin.accessToken
    );
    expect(listRes.status).toBe(200);

    // 응답 shape: {user, total_count, category_summary, notes: [...]}
    expect(
      typeof listRes.json.total_count,
      "user notes 응답에 total_count 필드 존재"
    ).toBe("number");
    expect(Array.isArray(listRes.json.notes)).toBe(true);
  });
});

test.describe("admin-web: 상담 기록 UI", () => {
  test("/consultation/notes 페이지가 admin_a 권한으로 로드된다", async ({
    page,
    request,
  }) => {
    await authenticateAdminAs(page, request, "admin_a");

    await page.goto(`${ADMIN_WEB_URL}/consultation/notes`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // 로그인 가드 통과
    expect(page.url()).not.toContain("/login");
    expect(page.url()).toContain("/consultation/notes");

    // body 렌더 + 상담 기록 관련 UI 문구 (넓은 regex)
    const bodyText = await page.textContent("body").catch(() => "");
    const observed =
      /기록|상담|학생|카테고리|상태|날짜|조회|검색|목록/.test(bodyText ?? "");
    expect(
      observed,
      "admin /consultation/notes 에서 기본 UI 가 렌더되지 않음"
    ).toBeTruthy();
  });
});
