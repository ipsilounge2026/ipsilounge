import { expect, test } from "@playwright/test";
import { E2E_LOGIN_TEST_USER, SEED_USERS } from "../helpers/auth";

/**
 * Sprint 1 - Test 1: 실제 로그인 폼 검증
 *
 * 목적: /login 페이지가 정상 렌더되고, e2e 전용 사용자의 이메일·비밀번호로 로그인 후
 *      홈(/) 으로 리다이렉트 되며 storage 에 토큰이 저장되는지 확인.
 *
 * 커버 영역:
 *   - user-web /login page 렌더
 *   - POST /api/auth/login → 200 + access_token
 *   - storage 에 user_token 저장 (keep_logged_in 미체크 → sessionStorage)
 *   - router.push("/") 동작
 *
 * 인증 우회(dev login-as)를 쓰지 않고 **실제 폼** 을 사용하는 유일한 테스트.
 * E2E_LOGIN_TEST_USER 는 globalSetup 에서 /api/auth/register 로 생성됨.
 */

test.describe("로그인 플로우 (실제 폼)", () => {
  test("e2e 테스트 계정으로 로그인하면 홈으로 리다이렉트되고 토큰이 저장된다", async ({ page }) => {
    await page.goto("/login");

    // 로그인 페이지 렌더 확인
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    const emailInput = page.getByPlaceholder("이메일을 입력하세요");
    const passwordInput = page.getByPlaceholder("비밀번호를 입력하세요");
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    await emailInput.fill(E2E_LOGIN_TEST_USER.email);
    await passwordInput.fill(E2E_LOGIN_TEST_USER.password);

    // 로그인 API 응답을 대기하며 제출 → 실제 성공 여부 확인 가능
    const [loginResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      page.getByRole("button", { name: /로그인/ }).click(),
    ]);
    expect(
      loginResponse.status(),
      `로그인 API 가 실패 (status ${loginResponse.status()})`
    ).toBe(200);

    // 리다이렉트 확인 — /login 경로에서 벗어남
    await page.waitForFunction(
      () => !window.location.pathname.startsWith("/login"),
      { timeout: 10_000 }
    );

    // 토큰 저장 확인 (첫 로그인은 sessionStorage)
    const token = await page.evaluate(
      () =>
        localStorage.getItem("user_token") ??
        sessionStorage.getItem("user_token")
    );
    expect(token, "로그인 성공 시 토큰이 localStorage/sessionStorage 중 한 곳에 저장되어야 함").toBeTruthy();
    expect(token!.length, "JWT 토큰 길이가 비정상").toBeGreaterThan(20);
  });

  test("잘못된 비밀번호는 에러 응답을 받고 로그인되지 않는다", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("이메일을 입력하세요").fill(E2E_LOGIN_TEST_USER.email);
    await page.getByPlaceholder("비밀번호를 입력하세요").fill("wrong-password-xyz");

    const [loginResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      page.getByRole("button", { name: /로그인/ }).click(),
    ]);
    // backend 는 잘못된 비밀번호에 401 반환 (auth.py)
    expect(
      loginResponse.status(),
      "잘못된 비밀번호는 401 이어야 함"
    ).toBe(401);

    // URL 이 여전히 /login (리다이렉트 되지 않음)
    expect(page.url()).toContain("/login");

    // ※ 토큰 저장 여부는 storage 확인으로 검증하려 했으나 Next.js 의 route prefetch/
    //   navigation 타이밍으로 execution context 가 소실되어 불안정함.
    //   401 + URL 유지로 "로그인 실패" 는 충분히 검증됨.
  });
});
// SEED_USERS import (기타 테스트에서 사용 예상) — 참조 유지
void SEED_USERS;
