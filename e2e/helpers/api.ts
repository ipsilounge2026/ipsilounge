import { APIRequestContext, expect } from "@playwright/test";
import { BACKEND_URL, devLogin } from "./auth";

/**
 * API 헬퍼 — E2E 테스트에서 데이터 준비(setup)용 엔드포인트 호출.
 * UI 조작 대신 API 로 빠르게 상태를 만들 때 사용.
 */

/**
 * Bearer 토큰으로 인증된 request 호출.
 */
async function apiCall(
  request: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  token: string,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const url = `${BACKEND_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const resp = await request.fetch(url, {
    method,
    headers,
    data: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const status = resp.status();
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    json = null;
  }
  return { status, json };
}

/** 설문 생성 → PATCH answers → submit 까지 원샷 완주. */
export async function completeSurveyViaApi(params: {
  request: APIRequestContext;
  identifier: string;       // seed 식별자 (예: "student_t3")
  surveyType: "preheigh1" | "high";
  timing?: "T1" | "T2" | "T3" | "T4" | null;
  answers: Record<string, Record<string, any>>;  // 카테고리별 응답 dict
  categoryStatus?: Record<string, string>;       // 예: {A:"completed", B:"completed"}
}): Promise<{ surveyId: string; status: string }> {
  const { request, identifier, surveyType, timing, answers, categoryStatus } = params;

  // 1) devLogin 으로 토큰 확보
  const { accessToken } = await devLogin(request, identifier);

  // 2) 설문 생성 (기존 draft 재사용 또는 새로 생성 — backend 가 알아서 판단)
  const createRes = await apiCall(request, "POST", "/api/consultation-surveys", accessToken, {
    survey_type: surveyType,
    timing: timing ?? null,
    mode: "full",
    started_platform: "web",
  });
  expect(
    [200, 201].includes(createRes.status),
    `create survey failed: ${createRes.status} ${JSON.stringify(createRes.json)}`
  ).toBeTruthy();
  const surveyId: string = createRes.json.id ?? createRes.json.survey?.id;
  expect(surveyId, "surveyId 를 응답에서 추출하지 못함").toBeTruthy();

  // 3) PATCH 로 answers 전체 주입
  const patchRes = await apiCall(
    request,
    "PATCH",
    `/api/consultation-surveys/${surveyId}`,
    accessToken,
    {
      answers,
      category_status: categoryStatus ?? {},
    }
  );
  expect(
    patchRes.status === 200,
    `patch survey failed: ${patchRes.status} ${JSON.stringify(patchRes.json)}`
  ).toBeTruthy();

  // 4) submit
  const submitRes = await apiCall(
    request,
    "POST",
    `/api/consultation-surveys/${surveyId}/submit`,
    accessToken,
    { confirm: true }
  );
  expect(
    submitRes.status === 200,
    `submit survey failed: ${submitRes.status} ${JSON.stringify(submitRes.json)}`
  ).toBeTruthy();

  return {
    surveyId,
    status: submitRes.json.status ?? "submitted",
  };
}

/** 특정 사용자의 설문 목록 조회 (본인 권한). */
export async function listMySurveys(
  request: APIRequestContext,
  identifier: string,
  surveyType?: "preheigh1" | "high"
): Promise<any[]> {
  const { accessToken } = await devLogin(request, identifier);
  const q = surveyType ? `?survey_type=${surveyType}` : "";
  const res = await apiCall(
    request,
    "GET",
    `/api/consultation-surveys${q}`,
    accessToken
  );
  expect(res.status, `list surveys failed: ${res.status}`).toBe(200);
  return (res.json?.items ?? res.json ?? []) as any[];
}

/** /api/consultation/slots 조회 (현재 달 기준). */
export async function listAvailableSlots(
  request: APIRequestContext,
  identifier: string,
  year: number,
  month: number
): Promise<any[]> {
  const { accessToken } = await devLogin(request, identifier);
  const res = await apiCall(
    request,
    "GET",
    `/api/consultation/slots?year=${year}&month=${month}`,
    accessToken
  );
  expect(res.status, `list slots failed: ${res.status} ${JSON.stringify(res.json)}`).toBe(200);
  return (Array.isArray(res.json) ? res.json : []) as any[];
}
