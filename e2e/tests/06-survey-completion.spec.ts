import { expect, test } from "@playwright/test";
import { completeSurveyViaApi, listMySurveys } from "../helpers/api";

/**
 * Sprint 3 - Test 06/07: 설문 완주 (API 주입)
 *
 * UI 로 36문항 전체 채우는 대신 API 로 answers 를 주입하고 submit 까지 완료 후
 * UI(/mypage 또는 /consultation) 에서 "submitted" 상태가 반영되는지 검증.
 *
 * 흐름:
 *   1) devLogin → access_token
 *   2) POST /api/consultation-surveys  (survey 생성/재사용)
 *   3) PATCH /api/consultation-surveys/{id}  (answers 전체 주입)
 *   4) POST /api/consultation-surveys/{id}/submit  (상태 → submitted)
 *   5) GET /api/consultation-surveys?survey_type=...  (본인 권한으로 조회)
 *   6) submitted 건 존재 확인
 *
 * seed 는 student_t1~t4 에 high 설문 draft 4개를 이미 생성해둠.
 * student_t4 (timing=T4) 의 high 설문을 완주시키는 형태로 테스트.
 */

test.describe("고등 설문 완주 (API 주입)", () => {
  test("student_t4 의 high 설문을 answers 주입 후 submit 하면 submitted 상태가 된다", async ({
    request,
  }) => {
    // T4 학생의 고등 설문 answers — 핵심 카테고리만 채워서 submit 성립시킴
    const answers = {
      A: {
        A1: "테스트학생T4",
        A2: "테스트고등학교",
        A3: "3학년 2반",
        A4: "T4",
      },
      // 필요 최소한의 다른 카테고리 (spec 상 필수)
      B: { B1: "수시", B2: "학종" },
      C: { C1: "보통" },
      D: { D1: "보통" },
      E: { E1: "보통" },
      F: { F1: "없음" },
      G: { G1: "해당없음" },
    };

    const { surveyId, status } = await completeSurveyViaApi({
      request,
      identifier: "student_t4",
      surveyType: "high",
      timing: "T4",
      answers,
      categoryStatus: {
        A: "completed",
        B: "completed",
        C: "completed",
        D: "completed",
        E: "completed",
        F: "completed",
        G: "completed",
      },
    });

    expect(surveyId).toBeTruthy();
    expect(status).toBe("submitted");

    // 본인 권한으로 설문 목록 조회 → submitted 건 하나 이상
    const mySurveys = await listMySurveys(request, "student_t4", "high");
    const submitted = mySurveys.filter(
      (s: any) => s.status === "submitted" && s.id === surveyId
    );
    expect(
      submitted.length,
      "submit 한 survey 가 listMySurveys 에서 submitted 상태로 관찰되어야 함"
    ).toBe(1);
  });
});

test.describe("예비고1 설문 완주 (API 주입)", () => {
  test("student_t1 의 preheigh1 설문을 answers 주입 후 submit 하면 submitted 상태가 된다", async ({
    request,
  }) => {
    // preheigh1 은 6개 카테고리 (§3-1 ~ §3-6 정도)
    // 실제 스키마는 복잡하지만 PATCH 는 deep merge 이므로 기본 필수 필드만 채워 submit.
    const answers = {
      A: {
        A1: "테스트학생T1",
        A2: "테스트중학교",
        A3: "서울 강남구",
        A4: "일반고",
      },
      B: { B1: "수시", B2: "학종" },
      C: { C1: "보통" },
      D: { D1: "보통" },
      E: { E1: "보통" },
      F: { F1: "없음" },
    };

    const { surveyId, status } = await completeSurveyViaApi({
      request,
      identifier: "student_t1",
      surveyType: "preheigh1",
      timing: null,  // preheigh1 은 timing 무관
      answers,
      categoryStatus: {
        A: "completed",
        B: "completed",
        C: "completed",
        D: "completed",
        E: "completed",
        F: "completed",
      },
    });

    expect(surveyId).toBeTruthy();
    expect(status).toBe("submitted");

    const mySurveys = await listMySurveys(request, "student_t1", "preheigh1");
    const submitted = mySurveys.filter(
      (s: any) => s.status === "submitted" && s.id === surveyId
    );
    expect(
      submitted.length,
      "submit 한 preheigh1 survey 가 listMySurveys 에서 submitted 로 관찰되어야 함"
    ).toBe(1);
  });
});
