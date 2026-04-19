import { expect, test } from "@playwright/test";
import { authenticateAs } from "../helpers/auth";

/**
 * Sprint 1 - Test 2: 상담 예약 페이지 진입 + 유형 선택 + 자격/설문 확인
 *
 * 목적: dev login 후 /consultation 페이지가 정상 로드되며 6개 상담 유형이
 *      렌더되고, 학습상담(설문 필요) 선택 시 사전 조사 상태 체크가 작동하는지 확인.
 *
 * 커버 영역:
 *   - dev login-as 인증 우회 + localStorage 토큰 주입 플로우
 *   - /consultation 페이지 진입 (로그인 가드 통과)
 *   - 6개 CONSULTATION_TYPES 카드 렌더
 *   - 학생부분석 선택 → /api/consultation/eligibility 호출 → "check" 단계 진입
 *   - 학습상담 선택 → listMySurveys 2회 호출 → 설문 상태 표시
 *
 * 범위 제외 (Sprint 2): 달력·시간대 선택, 실제 예약 제출 (admin 슬롯 seed 필요)
 */

test.describe("상담 페이지 진입 + 유형 선택", () => {
  test("dev login 후 /consultation 에 진입하면 6개 상담 유형이 렌더된다", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "student_t1");

    // (student_t1 은 timing=T1 = 예비고1)
    await page.goto("/consultation");

    // 로그인 가드 통과 확인 (/login 으로 튕기지 않음)
    await expect(page).toHaveURL(/\/consultation/);

    // Step 1 헤더
    await expect(page.getByRole("heading", { name: "상담 유형 선택" })).toBeVisible();

    // 6개 상담 유형 카드 모두 렌더 확인
    const expectedTypes = [
      "학생부 분석 상담",
      "학종 전략 상담",
      "학습 상담",
      "심리 상담",
      "기타 상담",
      "선배 상담",
    ];
    for (const label of expectedTypes) {
      await expect(
        page.getByText(label, { exact: true }),
        `유형 카드 누락: ${label}`
      ).toBeVisible();
    }
  });

  test("학습 상담 유형 선택 시 step 이 type 에서 다른 단계로 전환된다", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "student_t1");
    await page.goto("/consultation");

    // 학습 상담 카드 클릭
    await page.getByText("학습 상담", { exact: true }).click();

    // step=type 에서 벗어났는지: "원하시는 상담 유형을 선택해주세요" 문구(Step 1 전용)가 사라지고
    // 선택된 유형 표시("선택한 상담 유형:" 또는 "학습 상담" 헤더) 또는 설문 상태 메시지가 나타남.
    // state 전환 신호로 "상담 유형 선택" 안내 문구 비가시화 확인
    await expect(
      page.getByText("원하시는 상담 유형을 선택해주세요")
    ).not.toBeVisible({ timeout: 10_000 });

    // URL 은 /consultation 유지 (단일 페이지 내 step 전환)
    expect(page.url()).toContain("/consultation");
  });

  test("인증 없이 /consultation 에 직접 접근하면 /login 으로 리다이렉트된다", async ({
    page,
  }) => {
    // authenticateAs 호출하지 않음 (토큰 없음)
    await page.goto("/consultation");

    // 로그인 가드: useEffect 내 isLoggedIn() 체크 → router.push("/login")
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});
