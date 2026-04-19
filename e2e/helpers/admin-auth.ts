import { APIRequestContext, Page, expect } from "@playwright/test";
import { BACKEND_URL, devLogin } from "./auth";

export const ADMIN_WEB_URL =
  process.env.E2E_ADMIN_WEB_URL ?? "http://localhost:3001";

export interface AdminInfo {
  id: string;
  name: string;
  role: string;
  allowed_menus: string[];
}

/**
 * admin-web 인증 주입.
 *
 * admin-web 은 localStorage 에 다음 2개 키를 사용:
 *   - admin_token: JWT access_token
 *   - admin_info: {id, name, role, allowed_menus}
 *
 * 실제 /login 폼 대신 dev bypass 로 JWT 획득 후 /api/admin/admins/me 호출해서
 * 양쪽 모두 심어둠. page.addInitScript 로 페이지 로드 전 주입.
 */
export async function authenticateAdminAs(
  page: Page,
  request: APIRequestContext,
  identifier: string  // e.g., "admin_a", "counselor_a"
): Promise<{ accessToken: string; adminInfo: AdminInfo }> {
  const { accessToken } = await devLogin(request, identifier);

  // admin_info 조회 (admin-web 이 요구하는 형태)
  const meResp = await request.fetch(`${BACKEND_URL}/api/admin/admins/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(
    meResp.status(),
    `GET /api/admin/admins/me 실패 (${identifier}): ${await meResp.text()}`
  ).toBe(200);
  const adminInfo = (await meResp.json()) as AdminInfo;

  // 페이지 로드 전 localStorage 에 주입 (admin-web 의 login 가드 통과용)
  await page.addInitScript(
    ({ token, info }) => {
      try {
        localStorage.setItem("admin_token", token);
        localStorage.setItem("admin_info", JSON.stringify(info));
      } catch {
        /* localStorage 접근 불가 페이지는 무시 */
      }
    },
    { token: accessToken, info: adminInfo }
  );

  return { accessToken, adminInfo };
}
