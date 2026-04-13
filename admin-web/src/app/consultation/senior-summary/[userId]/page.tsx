"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { getSeniorCumulativeSummary } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface SessionSummary {
  session_number: number;
  session_timing: string | null;
  consultation_date: string | null;
  review_status: string;
  core_topics_count: number;
  core_topics_covered: number;
  optional_topics_covered: number;
  action_items_count: number;
  has_special_observations: boolean;
  student_mood: string | null;
  study_attitude: string | null;
  key_content_summary: string[];
}

interface ActionTracking {
  session: string;
  action: string;
  priority: string;
  followed_up: boolean | null;
}

interface TrendItem {
  session: string;
  value: string;
}

interface CumulativeData {
  user_id: string;
  user_name: string;
  total_sessions: number;
  sessions: SessionSummary[];
  mood_trend: TrendItem[];
  attitude_trend: TrendItem[];
  action_items_tracking: ActionTracking[];
  all_action_items: { session: string; action: string; priority: string }[];
  topic_coverage: Record<string, { session: string; status: string }[]>;
}

const MOOD_COLORS: Record<string, string> = {
  "밝고 적극적": "#10B981",
  "차분하고 안정적": "#3B82F6",
  "보통": "#6B7280",
  "다소 지쳐 보임": "#F59E0B",
  "불안/초조해 보임": "#EF4444",
  "무기력/의욕 없음": "#991B1B",
};

const ATTITUDE_COLORS: Record<string, string> = {
  "매우 성실/열정적": "#10B981",
  "꾸준히 노력 중": "#3B82F6",
  "보통": "#6B7280",
  "조금 느슨해진 상태": "#F59E0B",
  "방향을 잃은 상태": "#EF4444",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "충분히 다룸": { bg: "#D1FAE5", text: "#065F46" },
  "간단히 다룸": { bg: "#FEF3C7", text: "#92400E" },
  "다루지 못함": { bg: "#FEE2E2", text: "#991B1B" },
  "미진행": { bg: "#F3F4F6", text: "#6B7280" },
};

export default function SeniorCumulativeSummaryPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;

  const [data, setData] = useState<CumulativeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      const result = await getSeniorCumulativeSummary(userId);
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

  if (data.total_sessions === 0) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div className="page-header">
            <div>
              <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6B7280", marginBottom: 8 }}>
                &larr; 돌아가기
              </button>
              <h1 style={{ margin: 0 }}>{data.user_name} - 선배 상담 누적 요약</h1>
            </div>
          </div>
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", background: "white", borderRadius: 8, border: "1px solid #E5E7EB" }}>
            아직 선배 상담 기록이 없습니다.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        {/* 헤더 */}
        <div className="page-header">
          <div>
            <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6B7280", marginBottom: 8 }}>
              &larr; 돌아가기
            </button>
            <h1 style={{ margin: 0 }}>
              {data.user_name} - 선배 상담 누적 요약
              <span style={{ marginLeft: 10, padding: "3px 10px", borderRadius: 4, fontSize: 13, color: "white", background: "#7C3AED" }}>
                총 {data.total_sessions}회 상담
              </span>
            </h1>
          </div>
        </div>

        {/* 세션 타임라인 */}
        <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, margin: "0 0 16px 0", color: "#374151" }}>세션별 타임라인</h3>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(data.sessions.length, 4)}, 1fr)`, gap: 12 }}>
            {data.sessions.map((s) => (
              <div key={s.session_number} style={{
                border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden",
                borderTop: `3px solid ${s.review_status === "reviewed" ? "#10B981" : s.review_status === "pending" ? "#F59E0B" : "#6B7280"}`,
              }}>
                <div style={{ padding: "10px 14px", background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#5B21B6" }}>{s.session_timing || `S${s.session_number}`}</span>
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 3,
                      background: s.review_status === "reviewed" ? "#D1FAE5" : "#FEF3C7",
                      color: s.review_status === "reviewed" ? "#065F46" : "#92400E",
                    }}>
                      {s.review_status === "reviewed" ? "검토완료" : s.review_status === "pending" ? "검토대기" : s.review_status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{s.consultation_date}</div>
                </div>
                <div style={{ padding: 14, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#6B7280" }}>핵심 주제</span>
                    <span style={{ fontWeight: 600 }}>{s.core_topics_covered}/{s.core_topics_count}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#6B7280" }}>선택 주제</span>
                    <span>{s.optional_topics_covered}개</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#6B7280" }}>실천 사항</span>
                    <span>{s.action_items_count}개</span>
                  </div>
                  {s.student_mood && (
                    <div style={{ marginTop: 8, padding: "4px 8px", borderRadius: 4, background: "#F9FAFB", display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: MOOD_COLORS[s.student_mood] || "#6B7280" }} />
                      <span style={{ fontSize: 11, color: "#6B7280" }}>{s.student_mood}</span>
                    </div>
                  )}
                  {s.key_content_summary.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "#6B7280", lineHeight: 1.5 }}>
                      {s.key_content_summary.map((kc, i) => (
                        <div key={i} style={{ marginBottom: 2 }}>· {kc.length > 40 ? kc.slice(0, 40) + "..." : kc}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 학생 상태 변화 추이 */}
        {(data.mood_trend.length > 1 || data.attitude_trend.length > 1) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {data.mood_trend.length > 1 && (
              <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
                <h3 style={{ fontSize: 14, margin: "0 0 12px 0", color: "#374151" }}>전반적 분위기 변화</h3>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 100 }}>
                  {data.mood_trend.map((m, i) => {
                    const moodOrder = ["무기력/의욕 없음", "불안/초조해 보임", "다소 지쳐 보임", "보통", "차분하고 안정적", "밝고 적극적"];
                    const level = moodOrder.indexOf(m.value);
                    const height = level >= 0 ? ((level + 1) / moodOrder.length) * 80 + 20 : 50;
                    return (
                      <div key={i} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{
                          height, background: MOOD_COLORS[m.value] || "#6B7280",
                          borderRadius: "4px 4px 0 0", opacity: 0.7, transition: "height 0.3s",
                        }} />
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{m.session}</div>
                        <div style={{ fontSize: 10, color: MOOD_COLORS[m.value] || "#6B7280", fontWeight: 600 }}>
                          {m.value.length > 6 ? m.value.slice(0, 6) + ".." : m.value}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {data.attitude_trend.length > 1 && (
              <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
                <h3 style={{ fontSize: 14, margin: "0 0 12px 0", color: "#374151" }}>공부 태도 변화</h3>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 100 }}>
                  {data.attitude_trend.map((a, i) => {
                    const attOrder = ["방향을 잃은 상태", "조금 느슨해진 상태", "보통", "꾸준히 노력 중", "매우 성실/열정적"];
                    const level = attOrder.indexOf(a.value);
                    const height = level >= 0 ? ((level + 1) / attOrder.length) * 80 + 20 : 50;
                    return (
                      <div key={i} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{
                          height, background: ATTITUDE_COLORS[a.value] || "#6B7280",
                          borderRadius: "4px 4px 0 0", opacity: 0.7, transition: "height 0.3s",
                        }} />
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{a.session}</div>
                        <div style={{ fontSize: 10, color: ATTITUDE_COLORS[a.value] || "#6B7280", fontWeight: 600 }}>
                          {a.value.length > 6 ? a.value.slice(0, 6) + ".." : a.value}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 주제 커버리지 */}
        {Object.keys(data.topic_coverage).length > 0 && (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 16px 0", color: "#374151" }}>핵심 주제 커버리지</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: "#6B7280", fontWeight: 600 }}>주제</th>
                    {data.sessions.map(s => (
                      <th key={s.session_number} style={{ textAlign: "center", padding: "8px 12px", color: "#6B7280", fontWeight: 600, minWidth: 80 }}>
                        {s.session_timing || `S${s.session_number}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.topic_coverage).map(([topic, sessions]) => (
                    <tr key={topic} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "8px 12px", maxWidth: 250 }}>
                        <div style={{ fontSize: 12, lineHeight: 1.4 }}>{topic.length > 30 ? topic.slice(0, 30) + "..." : topic}</div>
                      </td>
                      {data.sessions.map(s => {
                        const match = sessions.find(
                          ses => ses.session === (s.session_timing || `S${s.session_number}`)
                        );
                        const status = match?.status || "";
                        const colors = STATUS_COLORS[status] || { bg: "transparent", text: "transparent" };
                        return (
                          <td key={s.session_number} style={{ textAlign: "center", padding: "8px 12px" }}>
                            {status ? (
                              <span style={{
                                display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11,
                                background: colors.bg, color: colors.text, fontWeight: 500,
                              }}>
                                {status === "충분히 다룸" ? "O" : status === "간단히 다룸" ? "~" : status === "다루지 못함" ? "X" : "-"}
                              </span>
                            ) : (
                              <span style={{ color: "#D1D5DB" }}>-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "#9CA3AF" }}>
                {Object.entries(STATUS_COLORS).map(([label, colors]) => (
                  <span key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: colors.bg, border: "1px solid #E5E7EB" }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 실천 사항 추적 */}
        {data.action_items_tracking.length > 0 && (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 16px 0", color: "#374151" }}>실천 사항 이행 추적</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#6B7280", fontWeight: 600, width: 70 }}>세션</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", color: "#6B7280", fontWeight: 600, width: 50 }}>우선</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#6B7280", fontWeight: 600 }}>실천 사항</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", color: "#6B7280", fontWeight: 600, width: 90 }}>이행 여부</th>
                </tr>
              </thead>
              <tbody>
                {data.action_items_tracking.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 500 }}>{item.session}</td>
                    <td style={{ textAlign: "center", padding: "8px 12px" }}>
                      <span style={{
                        display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                        background: item.priority === "상" ? "#FEE2E2" : item.priority === "하" ? "#DBEAFE" : "#FEF3C7",
                        color: item.priority === "상" ? "#991B1B" : item.priority === "하" ? "#1E40AF" : "#92400E",
                      }}>
                        {item.priority}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px" }}>{item.action}</td>
                    <td style={{ textAlign: "center", padding: "8px 12px" }}>
                      {item.followed_up === null ? (
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>다음 세션 없음</span>
                      ) : item.followed_up ? (
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, background: "#D1FAE5", color: "#065F46" }}>확인됨</span>
                      ) : (
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, background: "#FEE2E2", color: "#991B1B" }}>미확인</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 전체 실천 사항 목록 */}
        {data.all_action_items.length > 0 && (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 16px 0", color: "#374151" }}>세션별 실천 사항 전체 목록</h3>
            {data.sessions.map((s) => {
              const sessionItems = data.all_action_items.filter(
                a => a.session === (s.session_timing || `S${s.session_number}`)
              );
              if (sessionItems.length === 0) return null;
              return (
                <div key={s.session_number} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#5B21B6", marginBottom: 6 }}>
                    {s.session_timing || `S${s.session_number}`} ({s.consultation_date})
                  </div>
                  {sessionItems.map((item, i) => (
                    <div key={i} style={{ fontSize: 13, padding: "4px 0 4px 16px", color: "#374151" }}>
                      <span style={{
                        display: "inline-block", width: 16, fontSize: 11, textAlign: "center", marginRight: 6,
                        color: item.priority === "상" ? "#EF4444" : item.priority === "하" ? "#3B82F6" : "#F59E0B",
                      }}>
                        {item.priority === "상" ? "!" : item.priority === "하" ? "-" : "·"}
                      </span>
                      {item.action}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
