import { expect, test } from "@playwright/test";
import { authenticateAs } from "../helpers/auth";

/**
 * Sprint 2 - Test 7~10: 설문 3종 + 만족도 진입 검증
 *
 * 각 설문 페이지가 **로그인 가드 통과 + 주요 렌더 요소 존재** 수준으로 검증.
 * 36개 문항 전체 완주는 Sprint 3 이후 과제 (데이터 준비 복잡).
 *
 * 페이지 경로:
 *   - 고등 설문:   /consultation-survey/high
 *   - 예비고1 설문: /consultation-survey/preheigh1
 *   - 선배 설문:   /senior-pre-survey
 *   - 만족도 설문: /satisfaction-survey?booking_id=...
 */

test.describe("고등 설문 (/consultation-survey/high)", () => {
  test("student_t1 (timing=T1) 로 진입 시 timing 선택 또는 기존 draft 가 로드된다", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "student_t1");
    await page.goto("/consultation-survey/high");

    await expect(page).toHaveURL(/\/consultation-survey\/high/);

    // 두 가지 경로 중 하나 관찰:
    //   (A) 신규 진입 → timing 선택 카드 (T1~T4) 표시
    //   (B) 기존 draft 로드 → 설문 폼 또는 "설문 시작" 버튼
    //   (C) seed 가 생성한 submitted 설문 → 읽기전용 / "제출 완료" 안내
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    const bodyText = await page.textContent("body").catch(() => "");
    const observed =
      /T1|T2|T3|T4|설문 시작|이어쓰기|제출 완료|불러오는 중|계속하기/.test(
        bodyText ?? ""
      );

    expect(
      observed,
      "고등 설문 페이지에서 timing/draft/제출완료 UI 중 하나도 관찰되지 않음"
    ).toBeTruthy();
  });
});

test.describe("예비고1 설문 (/consultation-survey/preheigh1)", () => {
  test("로그인 사용자로 진입 시 설문 로더 또는 폼이 렌더된다", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "student_t1");
    await page.goto("/consultation-survey/preheigh1");

    await expect(page).toHaveURL(/\/consultation-survey\/preheigh1/);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    const bodyText = await page.textContent("body").catch(() => "");
    // preheigh1 페이지 특징 문구 (실제 렌더링 기반)
    const observed =
      /예비고1|고등학교|지원 전략|학습 준비|기본 정보|진로|중학교|학생 이름|단계|문항|설문|불러오는 중/.test(
        bodyText ?? ""
      );

    expect(observed, "예비고1 설문 관련 UI 미렌더").toBeTruthy();
  });
});

test.describe("선배 사전 설문 (/senior-pre-survey)", () => {
  test("로그인 사용자로 진입 시 세션 선택 또는 질문 폼이 렌더된다", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "student_t1");
    await page.goto("/senior-pre-survey");

    await expect(page).toHaveURL(/\/senior-pre-survey/);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    const bodyText = await page.textContent("body").catch(() => "");
    // S1~S4 세션 또는 질문 구조 관찰 (senior-pre-survey/page.tsx 참조)
    const observed =
      /S[1-4]|세션|선배|문항|설문|불러오는 중/.test(bodyText ?? "");

    expect(observed, "선배 사전 설문 UI 미렌더").toBeTruthy();
  });
});

test.describe("만족도 설문 (/satisfaction-survey)", () => {
  test("booking_id 없이 진입해도 페이지가 정상 로드된다 (crash 없음)", async ({
    page,
    request,
  }) => {
    // booking_id 없을 때 UI 분기가 복잡 (현재 pending 만족도 설문 자동 로드 /
    // 에러 메시지 / 빈 상태) 하고 사용자 상태에 따라 렌더가 달라져 키워드 매칭이
    // 불안정함. 여기서는 **페이지 crash 없이 body 가 렌더되는지** 만 검증.
    await authenticateAs(page, request, "student_t1");
    await page.goto("/satisfaction-survey");

    await expect(page).toHaveURL(/\/satisfaction-survey/);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // body 가 존재하고 non-empty
    const bodyText = await page.textContent("body").catch(() => "");
    expect(
      bodyText,
      "만족도 설문 페이지 body 가 비어있거나 crash"
    ).toBeTruthy();
    expect((bodyText ?? "").length, "body 가 너무 짧아 정상 렌더 의심").toBeGreaterThan(10);
  });

  test("존재하지 않는 booking_id 로 접근해도 페이지 자체는 정상 로드된다", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "student_t1");
    await page.goto(
      "/satisfaction-survey?booking_id=00000000-0000-0000-0000-000000000000"
    );

    await expect(page).toHaveURL(/\/satisfaction-survey/);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // 페이지가 crash 하지 않고 어떤 형태로든 렌더되었는지 body 존재 확인
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});
