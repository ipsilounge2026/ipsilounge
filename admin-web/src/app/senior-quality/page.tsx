"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSatisfactionStats } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface SeniorStat {
  admin_id: string;
  admin_name: string;
  survey_count: number;
  average_score: number;
  item_averages: Record<string, number>;
  last_date: string | null;
}

interface StatsResponse {
  stats: SeniorStat[];
  overall_item_averages: Record<string, number>;
  timing_averages: Record<string, number>;
}

const ITEM_LABELS: Record<string, string> = {
  S1: "전반 만족도",
  S2: "이해도",
  S3: "분위기",
  S4: "실행 가능성",
  S5: "재이용 의향",
  M1: "경험 공유",
  M2: "경청/공감",
  M3: "실전 정보",
  C1: "데이터 분석",
  C2: "전략 구체성",
  C3: "진로 조언",
};

const TIMING_ORDER = ["S1", "S2", "S3", "S4"];

function scoreColor(score: number): string {
  if (score >= 8) return "#10B981";
  if (score >= 6) return "#F59E0B";
  return "#EF4444";
}

function scoreBg(score: number): string {
  if (score >= 8) return "#D1FAE5";
  if (score >= 6) return "#FEF3C7";
  return "#FEE2E2";
}

export default function SeniorQualityPage() {
  const router = useRouter();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const result = await getSatisfactionStats();
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>로딩 중...</div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>{error || "데이터가 없습니다"}</div>
        </main>
      </div>
    );
  }

  const seniorStats = data.stats.filter(s => s.admin_id !== "unassigned");
  const timingAvgs = data.timing_averages || {};
  const itemAvgs = data.overall_item_averages || {};

  // Sort timing keys in order
  const sortedTimings = Object.keys(timingAvgs).sort((a, b) => {
    const ai = TIMING_ORDER.indexOf(a);
    const bi = TIMING_ORDER.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    return a.localeCompare(b);
  });

  // All item keys for section 3
  const allItemKeys = Object.keys(itemAvgs).sort((a, b) => {
    const order = ["S1", "S2", "S3", "S4", "S5", "M1", "M2", "M3", "C1", "C2", "C3"];
    return order.indexOf(a) - order.indexOf(b);
  });

  const maxTimingScore = sortedTimings.length > 0
    ? Math.max(...sortedTimings.map(t => timingAvgs[t]))
    : 10;

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1 style={{ margin: 0 }}>선배 상담 품질 대시보드</h1>
        </div>

        {seniorStats.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", background: "white", borderRadius: 8, border: "1px solid #E5E7EB" }}>
            아직 만족도 설문 데이터가 없습니다.
          </div>
        )}

        {/* Section 1: 선배별 만족도 순위 */}
        {seniorStats.length > 0 && (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 16px 0", color: "#374151" }}>선배별 만족도 순위</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: "#6B7280", fontWeight: 600 }}>선배명</th>
                    <th style={{ textAlign: "center", padding: "8px 12px", color: "#6B7280", fontWeight: 600 }}>총 상담수</th>
                    <th style={{ textAlign: "center", padding: "8px 12px", color: "#6B7280", fontWeight: 600 }}>평균 만족도</th>
                    <th style={{ textAlign: "center", padding: "8px 12px", color: "#6B7280", fontWeight: 600 }}>경험공유(M1)</th>
                    <th style={{ textAlign: "center", padding: "8px 12px", color: "#6B7280", fontWeight: 600 }}>경청/공감(M2)</th>
                    <th style={{ textAlign: "center", padding: "8px 12px", color: "#6B7280", fontWeight: 600 }}>실전정보(M3)</th>
                    <th style={{ textAlign: "center", padding: "8px 12px", color: "#6B7280", fontWeight: 600 }}>최근 상담일</th>
                  </tr>
                </thead>
                <tbody>
                  {seniorStats.map((s) => (
                    <tr key={s.admin_id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>{s.admin_name}</td>
                      <td style={{ textAlign: "center", padding: "8px 12px" }}>{s.survey_count}</td>
                      <td style={{ textAlign: "center", padding: "8px 12px" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 10px", borderRadius: 4, fontWeight: 600,
                          background: scoreBg(s.average_score), color: scoreColor(s.average_score),
                        }}>
                          {s.average_score.toFixed(1)}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", padding: "8px 12px" }}>
                        {s.item_averages?.M1 != null ? (
                          <span style={{ color: scoreColor(s.item_averages.M1), fontWeight: 500 }}>
                            {s.item_averages.M1.toFixed(1)}
                          </span>
                        ) : <span style={{ color: "#D1D5DB" }}>-</span>}
                      </td>
                      <td style={{ textAlign: "center", padding: "8px 12px" }}>
                        {s.item_averages?.M2 != null ? (
                          <span style={{ color: scoreColor(s.item_averages.M2), fontWeight: 500 }}>
                            {s.item_averages.M2.toFixed(1)}
                          </span>
                        ) : <span style={{ color: "#D1D5DB" }}>-</span>}
                      </td>
                      <td style={{ textAlign: "center", padding: "8px 12px" }}>
                        {s.item_averages?.M3 != null ? (
                          <span style={{ color: scoreColor(s.item_averages.M3), fontWeight: 500 }}>
                            {s.item_averages.M3.toFixed(1)}
                          </span>
                        ) : <span style={{ color: "#D1D5DB" }}>-</span>}
                      </td>
                      <td style={{ textAlign: "center", padding: "8px 12px", fontSize: 12, color: "#6B7280" }}>
                        {s.last_date || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section 2: 회차별 만족도 추이 */}
        {sortedTimings.length > 0 && (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 16px 0", color: "#374151" }}>회차별 만족도 추이</h3>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 24, height: 200, padding: "0 20px" }}>
              {sortedTimings.map((timing) => {
                const score = timingAvgs[timing];
                const barHeight = (score / 10) * 160;
                return (
                  <div key={timing} style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
                      {score.toFixed(1)}
                    </span>
                    <div style={{
                      width: "100%", maxWidth: 60, height: barHeight, minHeight: 4,
                      background: "linear-gradient(180deg, #7C3AED, #A78BFA)",
                      borderRadius: "4px 4px 0 0",
                      transition: "height 0.3s",
                    }} />
                    <span style={{ fontSize: 13, color: "#6B7280", marginTop: 8, fontWeight: 600 }}>{timing}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 3: 항목별 분석 */}
        {allItemKeys.length > 0 && (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 16px 0", color: "#374151" }}>항목별 분석</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {allItemKeys.map((key) => {
                const avg = itemAvgs[key];
                const barWidth = (avg / 10) * 100;
                const label = ITEM_LABELS[key] || key;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 130, fontSize: 13, color: "#374151", fontWeight: 500, flexShrink: 0 }}>
                      {key} {label}
                    </div>
                    <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 4, height: 24, position: "relative", overflow: "hidden" }}>
                      <div style={{
                        width: `${barWidth}%`, height: "100%",
                        background: avg >= 8 ? "#10B981" : avg >= 6 ? "#F59E0B" : "#EF4444",
                        borderRadius: 4, transition: "width 0.3s",
                      }} />
                    </div>
                    <div style={{ width: 40, textAlign: "right", fontSize: 13, fontWeight: 600, color: scoreColor(avg), flexShrink: 0 }}>
                      {avg.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
