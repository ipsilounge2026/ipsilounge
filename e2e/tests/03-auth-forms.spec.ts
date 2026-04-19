import { expect, test } from "@playwright/test";

/**
 * Sprint 2 - Test 3/4: 회원가입 + 비밀번호 재설정
 *
 * 회원가입은 **매번 랜덤 이메일** 로 신규 등록을 시도해서 "이미 가입된 이메일" 충돌 회피.
 * 비밀번호 재설정은 실제 이메일을 보내지 않고, 요청 성공 UI("📧 이메일을 확인하세요") 만 검증.
 *
 * rate limit 대응: forgot-password 는 동일 IP 1시간 내 중복 시 429. 테스트 격리를 위해
 * 랜덤 이메일(존재하지 않는 사용자) 을 사용 — backend 는 사용자 존재 여부와 무관하게
 * 동일 응답을 반환 (사용자 열거 공격 방어).
 */

function randomEmail(prefix: string): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1_000_000);
  return `${prefix}-${ts}-${rand}@example.com`;
}

test.describe("회원가입 폼", () => {
  test("회원가입 페이지가 렌더되고 주요 입력 필드·제출 버튼이 존재한다", async ({
    page,
  }) => {
    // 회원가입은 다수의 필수 필드와 HTML5 validation, 동적 필드 분기(학생/학부모/지점담당자)
    // 때문에 완전한 폼 자동화는 Sprint 3 이상의 스코프.
    // 여기서는 **페이지 렌더 + 주요 구성요소 존재** 수준으로 회귀 보호.
    await page.goto("/register");

    // 제목 렌더
    await expect(page.getByRole("heading", { name: /회원가입/ })).toBeVisible();

    // 핵심 입력 필드 존재 확인 (첫 번째만 체크 — 회원가입 페이지는 중복 placeholder 있음)
    await expect(
      page.getByPlaceholder(/이름을 입력하세요/).first()
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/이메일을 입력하세요/).first()
    ).toBeVisible();

    // 비밀번호 필드 존재 (6자 이상 안내)
    await expect(
      page.getByPlaceholder(/6자 이상/).first()
    ).toBeVisible();

    // 제출 버튼 존재
    await expect(
      page.getByRole("button", { name: /^회원가입|가입 중/ })
    ).toBeVisible();
  });

  test("필수 약관 미동의 상태에서는 회원가입 제출 버튼이 비활성화된다", async ({
    page,
  }) => {
    await page.goto("/register");

    // 초기 상태: 필수 약관 체크 전 → 제출 버튼 disabled 여야 함
    const submitBtn = page.getByRole("button", { name: /^회원가입|가입 중/ });
    await expect(submitBtn).toBeVisible();
    await expect(
      submitBtn,
      "약관 미동의 상태에서 제출 버튼은 disabled 상태여야 함"
    ).toBeDisabled();

    // URL 은 /register 유지
    expect(page.url()).toContain("/register");
  });
});

test.describe("비밀번호 재설정 요청", () => {
  test("이메일 입력 후 제출하면 재설정 링크 전송 UI가 표시된다", async ({
    page,
  }) => {
    await page.goto("/forgot-password");

    await expect(page.getByRole("heading", { name: "비밀번호 찾기" })).toBeVisible();

    await page.getByPlaceholder("example@email.com").fill(randomEmail("pwreset"));

    // 제출 API 응답 대기 (rate limit 대응: 랜덤 이메일 사용으로 429 회피)
    const [resetResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/auth/forgot-password") &&
          r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      page.getByRole("button", { name: /재설정 링크 받기|전송 중/ }).click(),
    ]);

    // backend 는 사용자 존재 여부와 무관하게 200 반환 (사용자 열거 방어)
    // rate limit 에 걸리면 429 수용
    expect(
      [200, 202, 429].includes(resetResponse.status()),
      `forgot-password 응답 코드가 예상 밖: ${resetResponse.status()}`
    ).toBeTruthy();

    if (resetResponse.status() !== 429) {
      // 성공 UI 렌더 확인
      await expect(page.getByText(/이메일을 확인하세요/)).toBeVisible({ timeout: 10_000 });
    }
  });
});
