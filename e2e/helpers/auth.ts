import { APIRequestContext, Page, expect } from "@playwright/test";

export const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://127.0.0.1:8000";
export const USER_WEB_URL = process.env.E2E_USER_WEB_URL ?? "http://localhost:3000";

/** seed 스크립트가 만드는 기본 비밀번호 (backend/scripts/seed_l3_test_data.py 과 동기). */
export const SEED_DEFAULT_PASSWORD = "devpass1!";

export interface DevLoginResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * DEV_MODE 전용 login-as 엔드포인트로 JWT 획득.
 * 실제 로그인 폼 UI 를 거치지 않으므로 테스트 속도가 빠르고 안정적.
 *
 * @param request  Playwright request context (test.request 또는 browser context 에서 주입)
 * @param identifier  "student_t1" / "parent_a" / "admin_a" / "counselor_a" 등 seed 식별자
 */
export async function devLogin(
  request: APIRequestContext,
  identifier: string
): Promise<DevLoginResult> {
  const response = await request.post(
    `${BACKEND_URL}/api/dev/login-as/${identifier}`
  );
  expect(response.status(), `dev login-as/${identifier} 실패`).toBe(200);
  const body = await response.json();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
  };
}

/**
 * dev login 으로 획득한 토큰을 브라우저 localStorage 에 심어
 * 이후 페이지 네비게이션 시 인증된 상태로 시작하도록 만듦.
 *
 * 페이지 최초 접속 *전* 에 호출해야 함 (addInitScript).
 */
export async function authenticateAs(
  page: Page,
  request: APIRequestContext,
  identifier: string
): Promise<DevLoginResult> {
  const tokens = await devLogin(request, identifier);

  // user-web 의 lib/api.ts 는 access_token 을 localStorage.user_token 으로 저장.
  await page.addInitScript((token) => {
    try {
      localStorage.setItem("user_token", token);
      localStorage.setItem("keep_logged_in", "true");
    } catch {
      /* localStorage 접근 불가 페이지에서는 무시 */
    }
  }, tokens.accessToken);

  return tokens;
}

/** seed 식별자 별 실제 이메일 (seed_l3_test_data.py 기준). */
export const SEED_USERS = {
  student_t1: { email: "student.t1@test.local", name: "테스트학생T1" },
  student_t2: { email: "student.t2@test.local", name: "테스트학생T2" },
  student_t3: { email: "student.t3@test.local", name: "테스트학생T3" },
  student_t4: { email: "student.t4@test.local", name: "테스트학생T4" },
  parent_a: { email: "parent.a@test.local", name: "학부모A" },
  admin_a: { email: "admin.a@test.local", name: "관리자A" },
  counselor_a: { email: "counselor.a@test.local", name: "상담사A" },
} as const;

/**
 * e2e 전용 로그인 테스트 사용자.
 * seed 의 `@test.local` 은 pydantic EmailStr 이 reserved TLD 로 거부하여
 * 실제 /api/auth/login 폼 로그인이 422 가 되므로, 유효한 도메인 전용 사용자를
 * globalSetup 에서 별도 register 한다. 실제 로그인 폼 E2E 검증 전용.
 */
export const E2E_LOGIN_TEST_USER = {
  email: "e2e-login@example.com",
  password: "E2eTest123!",
  name: "E2E로그인테스트",
} as const;
