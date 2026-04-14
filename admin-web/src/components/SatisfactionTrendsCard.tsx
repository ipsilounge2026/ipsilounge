"use client";

/**
 * 상담 만족도 시점별 추이 (최고관리자 전용)
 *
 * - 선배상담: M1(경험 공유) / M2(경청·공감) / M3(실전 정보) 월별 평균
 * - 상담사 상담: C1(데이터 분석) / C2(전략 구체성) / C3(진로 조언) 월별 평균
 * - 데이터 출처: GET /api/admin/satisfaction-surveys/trends
 */

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { getSatisfactionTrends } from "@/lib/api";

type TrendRow = {
  month: string;
  count: number;
  overall: number | null;
  [key: string]: number | string | null;
};

interface TrendsData {
  months: string[];
  senior: TrendRow[];
  counselor: TrendRow[];
}

const SENIOR_KEYS = [
  { key: "M1", label: "M1 경험 공유", color: "#4472C4" },
  { key: "M2", label: "M2 경청/공감", color: "#ED7D31" },
  { key: "M3", label: "M3 실전 정보", color: "#70AD47" },
];

const COUNSELOR_KEYS = [
  { key: "C1", label: "C1 데이터 분석", color: "#4472C4" },
  { key: "C2", label: "C2 전략 구체성", color: "#ED7D31" },
  { key: "C3", label: "C3 진로 조언", color: "#70AD47" },
];

export default function SatisfactionTrendsCard() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [months, setMonths] = useState(6);
  const [tab, setTab] = useState<"senior" | "counselor">("senior");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getSatisfactionTrends({ months })
      .then((res) => { if (alive) setData(res); })
      .catch((err) => { if (alive) setError(err?.message ?? "불러오기 실패"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [months]);

  const series = tab === "senior" ? data?.senior ?? [] : data?.counselor ?? [];
  const keys = tab === "senior" ? SENIOR_KEYS : COUNSELOR_KEYS;
  const totalCount = series.reduce((sum, r) => sum + (r.count || 0), 0);

  const overallAvg = (() => {
    const vals = series.map((r) => (typeof r.overall === "number" ? r.overall : null)).filter((v): v is number => v != null);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : "—";
  })();

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["senior", "counselor"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: "6px 12px",
                border: "1px solid",
                borderColor: tab === t ? "#4472C4" : "#D1D5DB",
                background: tab === t ? "#4472C4" : "#fff",
                color: tab === t ? "#fff" : "#374151",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t === "senior" ? "선배 상담" : "상담사 상담"}
            </button>
          ))}
        </div>
        <select
          className="form-control"
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          style={{ width: 120, fontSize: 13 }}
        >
          {[3, 6, 12].map((m) => (
            <option key={m} value={m}>최근 {m}개월</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 13, color: "#6B7280" }}>
        <span>제출 설문: <strong style={{ color: "#111827" }}>{totalCount}건</strong></span>
        <span>평균 점수: <strong style={{ color: "#111827" }}>{overallAvg}</strong> / 10</span>
      </div>

      {loading && <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>불러오는 중...</div>}
      {error && <div style={{ padding: 24, textAlign: "center", color: "#DC2626" }}>오류: {error}</div>}

      {!loading && !error && data && (
        totalCount === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
            해당 기간에 제출된 만족도 설문이 없습니다.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: any) => (value == null ? "-" : value)}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {keys.map((k) => (
                <Line
                  key={k.key}
                  type="monotone"
                  dataKey={k.key}
                  name={k.label}
                  stroke={k.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )
      )}
    </div>
  );
}
