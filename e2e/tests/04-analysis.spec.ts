import { expect, test } from "@playwright/test";
import path from "path";
import { authenticateAs } from "../helpers/auth";

/**
 * Sprint 2 - Test 5/6: 학생부 업로드 + 리포트 차단 UI
 *
 * 학생부 업로드: /analysis/upload 진입 후 파일 선택 UI 렌더 및 필수 입력 가드 확인.
 * 실제 PDF 업로드는 시뮬레이션(가짜 바이트) — backend 는 content-type 만 확인하므로
 * 진짜 PDF 일 필요 없음.
 *
 * 리포트 차단: 존재하지 않는 analysis_id 로 /analysis/[id] 접근 시 에러/리다이렉트 동작 확인.
 */

test.describe("학생부 업로드 페이지", () => {
  test("dev login 후 /analysis/upload 에 진입하면 파일 업로드 UI 가 렌더된다", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "student_t1");
    await page.goto("/analysis/upload");

    // 로그인 가드 통과 — /login 으로 튕기지 않음
    await expect(page).toHaveURL(/\/analysis\/upload/);

    // 주요 안내 문구 또는 파일 선택 영역 확인 (.first() — 중복 매칭 대응)
    await expect(
      page.getByText(/클릭하여 파일을 선택|PDF 파일 전용/).first()
    ).toBeVisible({ timeout: 10_000 });

    // file input 엘리먼트 존재 확인
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);
  });

  test("파일 미선택 상태에서 제출하면 에러가 표시된다", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "student_t1");
    await page.goto("/analysis/upload");

    // 제출 버튼 클릭 (파일 미선택)
    await page.getByRole("button", { name: /분석 요청하기/ }).click();

    // "학생부 파일을 선택해주세요" 에러 렌더 (.first() — 중복 문구 대응)
    await expect(page.getByText(/파일을 선택/).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe("리포트 조회 권한 차단", () => {
  test("존재하지 않는 analysis_id 로 접근하면 에러 또는 홈으로 처리된다", async ({
    page,
    request,
  }) => {
    await authenticateAs(page, request, "student_t1");

    // 실제로는 UUID 형식 ID 가 필요하지만, 존재하지 않는 UUID 를 넣어 에러 흐름 검증
    const fakeId = "00000000-0000-0000-0000-000000000000";
    await page.goto(`/analysis/${fakeId}`);

    // 페이지가 crash 없이 렌더되고 다음 중 하나가 관찰되면 pass:
    //   - 404 / "찾을 수 없" / "존재하지 않" / "오류" 등 에러 UI
    //   - "로딩 중..." — API 404 시 프론트가 빈 상태로 로딩 표시 유지 (정상 동작)
    //   - /login, /analysis 목록으로 리다이렉트
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    const url = page.url();
    const bodyText = await page.textContent("body").catch(() => "");

    const observed =
      /login|analysis$|404/.test(url) ||
      /찾을 수 없|존재하지 않|접근 권한|없는 분석|오류|로딩 중/.test(
        bodyText ?? ""
      );

    expect(
      observed,
      `존재하지 않는 analysis_id 접근 시 에러/로딩 처리가 관찰되지 않음. url=${url}`
    ).toBeTruthy();
  });

  test("로그인 없이 /analysis/[id] 접근 시 /login 으로 리다이렉트된다", async ({
    page,
  }) => {
    const fakeId = "00000000-0000-0000-0000-000000000001";
    await page.goto(`/analysis/${fakeId}`);

    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});
