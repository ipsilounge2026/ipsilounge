import { expect, test } from "@playwright/test";
import { ADMIN_WEB_URL, authenticateAdminAs } from "../helpers/admin-auth";

/**
 * Sprint 5 - Test 11~13: admin-web E2E 기본 흐름
 *
 * admin-web 은 별도 포트(3001) 에서 기동되며 localStorage 키도 다름:
 *   - admin_token (JWT)
 *   - admin_info   (id/name/role/allowed_menus)
 *
 * 실제 /login 폼 대신 devLogin(admin_a) + /api/admin/admins/me 로 두 값 주입.
 *
 * 커버 영역:
 *   Test 11: admin_a 로 인증 후 대시보드(/) 진입 — 권한 가드 통과 검증
 *   Test 12: /consultation 페이지 진입 → 예약 목록 렌더 + 전환 UI 존재 확인
 *   Test 13: /login 페이지 직접 접근 — 폼 렌더 + 필드 존재 (이메일/비밀번호)
 */

test.describe("admin-web: 인증 + 대시보드", () => {
  test("admin_a 로 인증하면 / 에 진입해도 /login 으로 튕기지 않는다", async ({
    page,
    request,
  }) => {
    const { adminInfo } = await authenticateAdminAs(page, request, "admin_a");
    expect(adminInfo.role).toBe("super_admin");

    await page.goto(`${ADMIN_WEB_URL}/`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // 로그인 가드 통과 — /login 으로 리다이렉트되지 않음
    expect(page.url()).not.toContain("/login");

    // 대시보드 컨텐츠가 로드되었는지 (body 가 비어있지 않음)
    const bodyText = await page.textContent("body").catch(() => "");
    expect((bodyText ?? "").length).toBeGreaterThan(30);
  });

  test("비인증 상태에서 / 접근 시 /login 으로 리다이렉트된다", async ({ page }) => {
    // authenticateAdminAs 미호출 → token 없음
    await page.goto(`${ADMIN_WEB_URL}/`);
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });
});

test.describe("admin-web: 상담 예약 관리", () => {
  test("admin_a 로 /consultation 에 진입하면 예약 관리 UI 가 렌더된다", async ({
    page,
    request,
  }) => {
    await authenticateAdminAs(page, request, "admin_a");

    await page.goto(`${ADMIN_WEB_URL}/consultation`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // 로그인 가드 통과
    expect(page.url()).not.toContain("/login");
    expect(page.url()).toContain("/consultation");

    // 상담 관리 관련 UI 가 렌더되었는지 — 넓은 regex 로 페이지 crash 아님을 확인
    const bodyText = await page.textContent("body").catch(() => "");
    const observed =
      /예약|상담|학생|상태|확정|일정|목록|전체|Booking|cancelled/.test(
        bodyText ?? ""
      );
    expect(
      observed,
      "admin /consultation 에서 예약 관련 UI 가 관찰되지 않음"
    ).toBeTruthy();
  });
});

test.describe("admin-web: 로그인 페이지 렌더", () => {
  test("/login 이 이메일·비밀번호 필드와 제출 버튼을 렌더한다", async ({ page }) => {
    await page.goto(`${ADMIN_WEB_URL}/login`);
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    // 이메일 입력 필드 존재
    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 10_000 });

    // 비밀번호 입력 필드 존재
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();

    // 제출 버튼 존재 (텍스트는 "로그인" / "로그인 중...")
    await expect(
      page.getByRole("button", { name: /로그인/ }).first()
    ).toBeVisible();
  });
});
