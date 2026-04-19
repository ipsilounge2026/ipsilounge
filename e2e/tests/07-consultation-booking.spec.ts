import { expect, test } from "@playwright/test";
import { BACKEND_URL, devLogin } from "../helpers/auth";

/**
 * Sprint 3 - Test 08: 상담 예약 슬롯 seed 검증
 *
 * 목적: seed_l3_test_data.py 가 생성하는 counselor_a 의 ConsultationSlot 42개가
 *      /api/consultation/slots 엔드포인트를 통해 조회되는지 검증.
 *
 * ※ 실제 booking 생성까지 end-to-end 검증은 리드타임(학습상담 설문제출+7일),
 *   3개월 쿨다운, 설문 제출 상태 등 다수 전제조건이 얽혀있어 CI 재현성이 약함.
 *   → Sprint 3 에서는 **슬롯 seed 확장 검증** 에 집중. 실제 booking API 흐름은
 *   별도 Sprint 에서 쿨다운·리드타임 정책까지 포함해 seed 를 재설계한 뒤 진행.
 */

async function apiGet(
  request: any,
  path: string,
  token: string
): Promise<{ status: number; json: any }> {
  const resp = await request.fetch(`${BACKEND_URL}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  let json: any = null;
  try {
    json = await resp.json();
  } catch {}
  return { status: resp.status(), json };
}

test.describe("상담 예약 슬롯 (seed 검증)", () => {
  test("counselor_a 의 seed 슬롯이 /api/consultation/slots 로 조회된다", async ({
    request,
  }) => {
    const { accessToken } = await devLogin(request, "student_t1");

    // seed 가 오늘로부터 8~21일 범위에 슬롯 생성 → 이번 달 또는 다음 달 둘 중 하나에 분포
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    const thisMonthSlots = await apiGet(
      request,
      `/api/consultation/slots?year=${year}&month=${month}`,
      accessToken
    );
    const nextMonthSlots = await apiGet(
      request,
      `/api/consultation/slots?year=${nextYear}&month=${nextMonth}`,
      accessToken
    );

    expect(thisMonthSlots.status).toBe(200);
    expect(nextMonthSlots.status).toBe(200);

    const thisList: any[] = Array.isArray(thisMonthSlots.json)
      ? thisMonthSlots.json
      : [];
    const nextList: any[] = Array.isArray(nextMonthSlots.json)
      ? nextMonthSlots.json
      : [];
    const totalSlots = thisList.length + nextList.length;

    // seed 는 14일 × 3 = 42 슬롯 생성. 월 경계에 분산될 수 있음.
    // 최소 20개 이상이 조회되어야 seed 확장이 의미가 있음.
    expect(
      totalSlots,
      `seed 슬롯이 이번달(${thisList.length}) + 다음달(${nextList.length}) = ${totalSlots}개로 너무 적음. seed 확장 확인 필요.`
    ).toBeGreaterThan(20);

    // 슬롯 스키마 검증 — id / date / start_time / end_time / remaining / admin_id
    const sample = [...thisList, ...nextList].find((s: any) => s.id);
    expect(sample).toBeTruthy();
    expect(sample.id).toMatch(/[0-9a-f-]{36}/);
    expect(sample.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sample.start_time).toMatch(/^\d{2}:\d{2}/);
    expect(typeof sample.remaining).toBe("number");
  });

  test("동일 슬롯 목록을 반복 조회해도 cache 일관성이 유지된다", async ({
    request,
  }) => {
    const { accessToken } = await devLogin(request, "student_t1");
    const now = new Date();
    const nextMonth = now.getMonth() + 2; // 0-indexed → 실제는 2달 후
    const year = nextMonth > 12 ? now.getFullYear() + 1 : now.getFullYear();
    const month = nextMonth > 12 ? nextMonth - 12 : nextMonth;

    const resp1 = await apiGet(
      request,
      `/api/consultation/slots?year=${year}&month=${month}`,
      accessToken
    );
    const resp2 = await apiGet(
      request,
      `/api/consultation/slots?year=${year}&month=${month}`,
      accessToken
    );

    expect(resp1.status).toBe(200);
    expect(resp2.status).toBe(200);
    // 두 조회 결과 개수 동일
    const list1 = Array.isArray(resp1.json) ? resp1.json : [];
    const list2 = Array.isArray(resp2.json) ? resp2.json : [];
    expect(list1.length).toBe(list2.length);
  });
});
