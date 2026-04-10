"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSurveyDetail, getSurveyDelta, updateSurveyMemo, deleteSurveyMemo } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface SurveyDetail {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone: string;
  survey_type: string;
  timing: string | null;
  mode: string;
  status: string;
  answers: Record<string, Record<string, any>>;
  category_status: Record<string, string>;
  last_category: string | null;
  last_question: string | null;
  started_platform: string;
  last_edited_platform: string;
  schema_version: string;
  booking_id: string | null;
  note: string | null;
  admin_memo: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  schema: SurveySchema | null;
  computed: ComputedStats | null;
}

interface SurveySchema {
  survey_type: string;
  categories: Category[];
}

interface Category {
  id: string;
  title: string;
  description?: string;
  respondent?: string;
  questions: Question[];
}

interface Question {
  id: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
  rows?: { key: string; label: string }[];
  columns?: { key: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  children?: Question[];
  condition?: { question: string; value: any };
}

interface ComputedStats {
  grade_trend?: {
    data: { semester: string; avg_grade?: number; avg_score?: number; subject_count: number }[];
    trend_badge: string;
    subject_trends: Record<string, { semester: string; grade?: number; raw_score?: number; subject_avg?: number; diff?: number }[]>;
    grade_distribution?: { semester: string; [key: string]: any }[];
  };
  mock_trend?: {
    avg_trend: { session: string; avg_rank: number }[];
    trend_badge: string;
    area_trends: Record<string, { session: string; rank: number }[]>;
    weak_areas: { area: string; avg_rank: number; gap: number }[];
  };
  study_analysis?: {
    total_weekly_hours: number;
    by_subject: Record<string, number>;
    by_type: Record<string, number>;
    self_study_ratio: number;
    subject_balance: number;
  };
}

interface DeltaResult {
  has_previous: boolean;
  previous_id?: string;
  previous_timing?: string;
  previous_submitted_at?: string;
  diff: Record<string, Record<string, { prev: any; curr: any; change_type: string }>>;
  summary: string;
}

const typeLabel: Record<string, string> = {
  preheigh1: "예비고1",
  high: "고등학생",
};

const statusLabel: Record<string, string> = {
  draft: "작성 중",
  submitted: "제출 완료",
};

const catStatusLabel: Record<string, string> = {
  completed: "완료",
  in_progress: "작성 중",
  skipped: "건너뜀",
  not_started: "미시작",
};

const catStatusColor: Record<string, string> = {
  completed: "#10B981",
  in_progress: "#F59E0B",
  skipped: "#9CA3AF",
  not_started: "#D1D5DB",
};

const trendBadgeColor: Record<string, string> = {
  상승: "#10B981",
  하락: "#EF4444",
  유지: "#6B7280",
  등락: "#F59E0B",
  V자반등: "#3B82F6",
  역V자: "#F97316",
  데이터부족: "#D1D5DB",
};

const changeTypeLabel: Record<string, string> = {
  added: "신규",
  removed: "삭제",
  modified: "수정",
  increased: "증가",
  decreased: "감소",
};

const changeTypeColor: Record<string, string> = {
  added: "#10B981",
  removed: "#EF4444",
  modified: "#3B82F6",
  increased: "#10B981",
  decreased: "#EF4444",
};

type TabType = "answers" | "computed" | "delta" | "memo";

export default function SurveyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabType>("answers");

  // Memo state
  const [memoText, setMemoText] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);

  // Delta state
  const [delta, setDelta] = useState<DeltaResult | null>(null);
  const [deltaLoading, setDeltaLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    loadSurvey();
  }, [id]);

  const loadSurvey = async () => {
    try {
      const data = await getSurveyDetail(id);
      setSurvey(data);
      setMemoText(data.admin_memo || "");
      const withAnswers = new Set<string>();
      if (data.answers) {
        for (const catId of Object.keys(data.answers)) {
          if (Object.keys(data.answers[catId] || {}).length > 0) {
            withAnswers.add(catId);
          }
        }
      }
      setExpandedCats(withAnswers);
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  };

  const loadDelta = async () => {
    if (delta) return;
    setDeltaLoading(true);
    try {
      const data = await getSurveyDelta(id);
      setDelta(data);
    } catch {
      setDelta({ has_previous: false, diff: {}, summary: "Delta 조회에 실패했습니다." });
    } finally {
      setDeltaLoading(false);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === "delta" && !delta) {
      loadDelta();
    }
  };

  const handleSaveMemo = async () => {
    setMemoSaving(true);
    try {
      await updateSurveyMemo(id, memoText);
      setSurvey((prev) => prev ? { ...prev, admin_memo: memoText } : prev);
    } catch {
      alert("메모 저장에 실패했습니다.");
    } finally {
      setMemoSaving(false);
    }
  };

  const handleDeleteMemo = async () => {
    if (!confirm("메모를 삭제하시겠습니까?")) return;
    setMemoSaving(true);
    try {
      await deleteSurveyMemo(id);
      setMemoText("");
      setSurvey((prev) => prev ? { ...prev, admin_memo: null } : prev);
    } catch {
      alert("메모 삭제에 실패했습니다.");
    } finally {
      setMemoSaving(false);
    }
  };

  const toggleCat = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const renderAnswer = (question: Question, answer: any): string => {
    if (answer === null || answer === undefined || answer === "") return "-";

    if (question.type === "radio" || question.type === "select") {
      const opt = question.options?.find((o) => o.value === answer);
      return opt ? opt.label : String(answer);
    }
    if (question.type === "checkbox" && Array.isArray(answer)) {
      return answer
        .map((v: string) => {
          const opt = question.options?.find((o) => o.value === v);
          return opt ? opt.label : v;
        })
        .join(", ") || "-";
    }
    if (question.type === "grid" && question.rows && typeof answer === "object") {
      return question.rows
        .map((r) => {
          const val = answer[r.key];
          if (!val) return null;
          const col = question.columns?.find((c) => c.key === val);
          return `${r.label}: ${col ? col.label : val}`;
        })
        .filter(Boolean)
        .join(" / ") || "-";
    }
    return String(answer);
  };

  const renderQuestions = (questions: Question[], answers: Record<string, any>) => {
    return questions.map((q) => {
      if (q.condition) {
        const condVal = answers[q.condition.question];
        if (Array.isArray(q.condition.value)) {
          if (!q.condition.value.includes(condVal)) return null;
        } else if (condVal !== q.condition.value) {
          return null;
        }
      }

      const answer = answers[q.id];

      if (q.type === "group" && q.children) {
        return (
          <div key={q.id} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "#374151" }}>
              {q.label}
            </div>
            <div style={{ paddingLeft: 16, borderLeft: "2px solid #E5E7EB" }}>
              {renderQuestions(q.children, answers)}
            </div>
          </div>
        );
      }

      return (
        <div key={q.id} style={{ marginBottom: 12, display: "flex", gap: 12 }}>
          <div style={{ minWidth: 200, maxWidth: 300, fontSize: 13, color: "#6B7280", flexShrink: 0 }}>
            {q.label}
            {q.required && <span style={{ color: "#EF4444" }}> *</span>}
          </div>
          <div style={{ fontSize: 13, color: "#111827", flex: 1, whiteSpace: "pre-wrap" }}>
            {renderAnswer(q, answer)}
          </div>
        </div>
      );
    });
  };

  // ── Computed Stats Renderers ──

  const renderBarChart = (data: { label: string; value: number }[], maxValue: number, color: string, suffix = "") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ minWidth: 60, fontSize: 12, color: "#6B7280", textAlign: "right" }}>{d.label}</div>
          <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 4, height: 20, position: "relative" }}>
            <div style={{
              width: `${Math.min(100, (d.value / maxValue) * 100)}%`,
              background: color, borderRadius: 4, height: "100%", minWidth: 2,
            }} />
          </div>
          <div style={{ minWidth: 50, fontSize: 12, fontWeight: 600, textAlign: "right" }}>
            {d.value}{suffix}
          </div>
        </div>
      ))}
    </div>
  );

  const renderTrendBadge = (badge: string) => (
    <span style={{
      padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
      color: "white", background: trendBadgeColor[badge] || "#6B7280",
    }}>
      {badge}
    </span>
  );

  const renderGradeTrend = () => {
    const gt = survey?.computed?.grade_trend;
    if (!gt || !gt.data.length) return <div style={{ color: "#9CA3AF", fontSize: 13 }}>성적 데이터가 없습니다</div>;

    const isHighSchool = survey?.survey_type === "high";
    const valueKey = isHighSchool ? "avg_grade" : "avg_score";
    const maxVal = isHighSchool ? 5 : 100;
    const suffix = isHighSchool ? "등급" : "점";

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>{isHighSchool ? "내신 등급 추이" : "성적 추이"}</h3>
          {renderTrendBadge(gt.trend_badge)}
        </div>

        {/* 평균 추이 차트 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>학기별 평균</div>
          {renderBarChart(
            gt.data.map((d) => ({ label: d.semester, value: (d as any)[valueKey] })),
            maxVal, "#4472C4", isHighSchool ? "등급" : "점"
          )}
        </div>

        {/* 과목별 추이 테이블 */}
        {Object.keys(gt.subject_trends).length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>과목별 상세</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#6B7280" }}>과목</th>
                    {gt.data.map((d) => (
                      <th key={d.semester} style={{ textAlign: "center", padding: "6px 8px", color: "#6B7280" }}>{d.semester}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(gt.subject_trends).map(([subj, data]) => (
                    <tr key={subj} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{subj}</td>
                      {gt.data.map((semData) => {
                        const found = data.find((d) => d.semester === semData.semester);
                        const val = found ? (isHighSchool ? found.grade : found.raw_score) : null;
                        return (
                          <td key={semData.semester} style={{ textAlign: "center", padding: "6px 8px" }}>
                            {val != null ? (
                              <span>
                                {val}{suffix}
                                {!isHighSchool && found?.diff != null && (
                                  <span style={{ fontSize: 10, marginLeft: 4, color: (found.diff ?? 0) >= 0 ? "#10B981" : "#EF4444" }}>
                                    {(found.diff ?? 0) >= 0 ? "+" : ""}{found.diff}
                                  </span>
                                )}
                              </span>
                            ) : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 등급 분포 (고등학생) */}
        {isHighSchool && gt.grade_distribution && gt.grade_distribution.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>등급 분포</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#6B7280" }}>학기</th>
                    {[1, 2, 3, 4, 5].map((g) => (
                      <th key={g} style={{ textAlign: "center", padding: "6px 8px", color: "#6B7280" }}>{g}등급</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gt.grade_distribution.map((row) => (
                    <tr key={row.semester} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{row.semester}</td>
                      {[1, 2, 3, 4, 5].map((g) => (
                        <td key={g} style={{ textAlign: "center", padding: "6px 8px" }}>
                          {row[g] || 0}과목
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMockTrend = () => {
    const mt = survey?.computed?.mock_trend;
    if (!mt || !mt.avg_trend.length) return null;

    return (
      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>모의고사 추이</h3>
          {renderTrendBadge(mt.trend_badge)}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>회차별 평균 등급</div>
          {renderBarChart(
            mt.avg_trend.map((d) => ({ label: d.session, value: d.avg_rank })),
            9, "#7C3AED", "등급"
          )}
        </div>

        {/* 영역별 추이 */}
        {Object.keys(mt.area_trends).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>영역별 상세</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#6B7280" }}>영역</th>
                    {mt.avg_trend.map((d) => (
                      <th key={d.session} style={{ textAlign: "center", padding: "6px 8px", color: "#6B7280" }}>{d.session}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(mt.area_trends).map(([area, data]) => (
                    <tr key={area} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{area}</td>
                      {mt.avg_trend.map((semData) => {
                        const found = data.find((d) => d.session === semData.session);
                        return (
                          <td key={semData.session} style={{ textAlign: "center", padding: "6px 8px" }}>
                            {found ? `${found.rank}등급` : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 취약 영역 */}
        {mt.weak_areas.length > 0 && (
          <div style={{ padding: 12, background: "#FEF2F2", borderRadius: 6 }}>
            <div style={{ fontSize: 12, color: "#991B1B", fontWeight: 600, marginBottom: 6 }}>취약 영역</div>
            {mt.weak_areas.map((w) => (
              <div key={w.area} style={{ fontSize: 12, color: "#7F1D1D" }}>
                {w.area}: 평균 {w.avg_rank}등급 (전체 평균 대비 +{w.gap})
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderStudyAnalysis = () => {
    const sa = survey?.computed?.study_analysis;
    if (!sa || !sa.total_weekly_hours) return null;

    const maxSubjHours = Math.max(...Object.values(sa.by_subject), 1);

    return (
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 16 }}>학습 시간 분석</h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div style={{ padding: 12, background: "#EFF6FF", borderRadius: 6, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#3B82F6" }}>주간 총 학습시간</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1E40AF" }}>{sa.total_weekly_hours}h</div>
          </div>
          <div style={{ padding: 12, background: "#F0FDF4", borderRadius: 6, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#10B981" }}>자기주도 비율</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#166534" }}>{sa.self_study_ratio}%</div>
          </div>
          <div style={{ padding: 12, background: "#FDF4FF", borderRadius: 6, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#A855F7" }}>과목 밸런스</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#7C3AED" }}>{sa.subject_balance}</div>
          </div>
        </div>

        {/* 과목별 시간 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>과목별 학습 시간</div>
          {renderBarChart(
            Object.entries(sa.by_subject).map(([k, v]) => ({ label: k, value: v })),
            maxSubjHours, "#4472C4", "h"
          )}
        </div>

        {/* 유형별 시간 */}
        <div>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>유형별 학습 시간</div>
          <div style={{ display: "flex", gap: 16 }}>
            {Object.entries(sa.by_type).map(([type, hours]) => (
              <div key={type} style={{ fontSize: 13 }}>
                <span style={{ color: "#6B7280" }}>{type}: </span>
                <span style={{ fontWeight: 600 }}>{hours}h</span>
                <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 4 }}>
                  ({Math.round((hours / sa.total_weekly_hours) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── Delta Diff Renderer ──

  const renderDelta = () => {
    if (deltaLoading) return <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>Delta 분석 로딩 중...</div>;
    if (!delta) return null;

    if (!delta.has_previous) {
      return (
        <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
          <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center" }}>이전 설문이 없어 비교할 수 없습니다.</div>
        </div>
      );
    }

    const schema = survey?.schema;

    const getCatTitle = (catId: string) => {
      if (schema) {
        const cat = schema.categories.find((c) => c.id === catId);
        if (cat) return cat.title;
      }
      return catId;
    };

    const getQuestionLabel = (catId: string, qId: string) => {
      if (schema) {
        const cat = schema.categories.find((c) => c.id === catId);
        if (cat) {
          const findQ = (questions: Question[]): string | null => {
            for (const q of questions) {
              if (q.id === qId) return q.label;
              if (q.children) {
                const found = findQ(q.children);
                if (found) return found;
              }
            }
            return null;
          };
          const label = findQ(cat.questions);
          if (label) return label;
        }
      }
      return qId;
    };

    const formatValue = (val: any): string => {
      if (val === null || val === undefined) return "(없음)";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    };

    const totalChanges = Object.values(delta.diff).reduce((sum, cat) => sum + Object.keys(cat).length, 0);

    return (
      <div>
        {/* 요약 */}
        <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1E40AF", marginBottom: 4 }}>변경 요약</div>
          <div style={{ fontSize: 13, color: "#1E3A5F" }}>{delta.summary}</div>
          {delta.previous_submitted_at && (
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
              이전 설문: {delta.previous_timing || ""} ({new Date(delta.previous_submitted_at).toLocaleDateString("ko-KR")})
            </div>
          )}
        </div>

        {/* 변경 카테고리별 */}
        {totalChanges === 0 ? (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
            변경 사항이 없습니다.
          </div>
        ) : (
          Object.entries(delta.diff).map(([catId, questions]) => (
            <div key={catId} style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 20px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 14 }}>
                {getCatTitle(catId)} <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>({Object.keys(questions).length}개 변경)</span>
              </div>
              <div style={{ padding: "12px 20px" }}>
                {Object.entries(questions).map(([qId, change]) => (
                  <div key={qId} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #F3F4F6" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{getQuestionLabel(catId, qId)}</span>
                      <span style={{
                        padding: "1px 6px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                        color: "white", background: changeTypeColor[change.change_type] || "#6B7280",
                      }}>
                        {changeTypeLabel[change.change_type] || change.change_type}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                      {change.change_type !== "added" && (
                        <div style={{ flex: 1, padding: 8, background: "#FEF2F2", borderRadius: 4 }}>
                          <div style={{ color: "#991B1B", fontSize: 11, marginBottom: 2 }}>이전</div>
                          <div style={{ color: "#7F1D1D", whiteSpace: "pre-wrap" }}>{formatValue(change.prev)}</div>
                        </div>
                      )}
                      {change.change_type !== "removed" && (
                        <div style={{ flex: 1, padding: 8, background: "#F0FDF4", borderRadius: 4 }}>
                          <div style={{ color: "#166534", fontSize: 11, marginBottom: 2 }}>현재</div>
                          <div style={{ color: "#14532D", whiteSpace: "pre-wrap" }}>{formatValue(change.curr)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  // ── Memo Renderer ──

  const renderMemo = () => (
    <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 12px 0" }}>상담사 메모</h3>
      <textarea
        value={memoText}
        onChange={(e) => setMemoText(e.target.value)}
        placeholder="이 설문에 대한 메모를 작성하세요..."
        style={{
          width: "100%", minHeight: 200, padding: 12, border: "1px solid #D1D5DB", borderRadius: 6,
          fontSize: 14, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        {survey?.admin_memo && (
          <button
            onClick={handleDeleteMemo}
            disabled={memoSaving}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2",
              color: "#DC2626", fontSize: 13, cursor: "pointer",
            }}
          >
            삭제
          </button>
        )}
        <button
          onClick={handleSaveMemo}
          disabled={memoSaving || memoText === (survey?.admin_memo || "")}
          style={{
            padding: "8px 24px", borderRadius: 6, border: "none", background: "#3B82F6",
            color: "white", fontSize: 13, cursor: "pointer",
            opacity: memoSaving || memoText === (survey?.admin_memo || "") ? 0.5 : 1,
          }}
        >
          {memoSaving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>로딩 중...</div>
        </main>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>설문을 찾을 수 없습니다</div>
        </main>
      </div>
    );
  }

  const schema = survey.schema;

  const tabs: { key: TabType; label: string }[] = [
    { key: "answers", label: "답변 보기" },
    { key: "computed", label: "자동 분석" },
    { key: "delta", label: "변경 비교" },
    { key: "memo", label: `메모${survey.admin_memo ? " *" : ""}` },
  ];

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <div>
            <button onClick={() => router.push("/surveys")} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6B7280", marginBottom: 8,
            }}>
              &larr; 목록으로
            </button>
            <h1 style={{ margin: 0 }}>
              {survey.user_name}님의 설문
              <span style={{
                marginLeft: 10, padding: "3px 10px", borderRadius: 4, fontSize: 13,
                color: "white", background: survey.status === "submitted" ? "#10B981" : "#F59E0B",
              }}>
                {statusLabel[survey.status] || survey.status}
              </span>
            </h1>
          </div>
        </div>

        {/* 기본 정보 카드 */}
        <div style={{
          background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20, marginBottom: 20,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>학생</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{survey.user_name}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{survey.user_email}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>연락처</div>
              <div style={{ fontSize: 14 }}>{survey.user_phone || "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>유형</div>
              <div style={{ fontSize: 14 }}>{typeLabel[survey.survey_type] || survey.survey_type}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>시점</div>
              <div style={{ fontSize: 14 }}>{survey.timing || "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>모드</div>
              <div style={{ fontSize: 14 }}>{survey.mode === "delta" ? "변경분" : "전체"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>플랫폼</div>
              <div style={{ fontSize: 14 }}>{survey.started_platform} → {survey.last_edited_platform}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>생성일</div>
              <div style={{ fontSize: 14 }}>{new Date(survey.created_at).toLocaleString("ko-KR")}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>제출일</div>
              <div style={{ fontSize: 14 }}>
                {survey.submitted_at ? new Date(survey.submitted_at).toLocaleString("ko-KR") : "-"}
              </div>
            </div>
          </div>
          {survey.note && (
            <div style={{ marginTop: 16, padding: 12, background: "#FFFBEB", borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: "#92400E", marginBottom: 4 }}>학생 메모</div>
              <div style={{ fontSize: 13, color: "#78350F", whiteSpace: "pre-wrap" }}>{survey.note}</div>
            </div>
          )}
        </div>

        {/* 탭 네비게이션 */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #E5E7EB" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              style={{
                padding: "10px 20px", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
                background: "none", color: activeTab === tab.key ? "#3B82F6" : "#6B7280",
                borderBottom: activeTab === tab.key ? "2px solid #3B82F6" : "2px solid transparent",
                marginBottom: -2,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        {activeTab === "answers" && (
          <>
            {schema ? (
              schema.categories.map((cat) => {
                const catAnswers = survey.answers[cat.id] || {};
                const catSt = survey.category_status[cat.id] || "not_started";
                const isExpanded = expandedCats.has(cat.id);
                const answerCount = Object.keys(catAnswers).length;
                const questionCount = cat.questions.length;

                return (
                  <div key={cat.id} style={{
                    background: "white", border: "1px solid #E5E7EB", borderRadius: 8, marginBottom: 12, overflow: "hidden",
                  }}>
                    <div
                      onClick={() => toggleCat(cat.id)}
                      style={{
                        padding: "14px 20px", cursor: "pointer", display: "flex", alignItems: "center",
                        justifyContent: "space-between", background: isExpanded ? "#F9FAFB" : "white",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, color: "#9CA3AF" }}>{cat.id}</span>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{cat.title}</span>
                        {cat.respondent === "parent" && (
                          <span style={{
                            padding: "1px 6px", borderRadius: 3, fontSize: 11,
                            background: "#F3E8FF", color: "#7C3AED",
                          }}>
                            학부모
                          </span>
                        )}
                        <span style={{
                          padding: "1px 6px", borderRadius: 3, fontSize: 11,
                          background: catStatusColor[catSt] || "#D1D5DB", color: "white",
                        }}>
                          {catStatusLabel[catSt] || catSt}
                        </span>
                        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                          {answerCount}/{questionCount}
                        </span>
                      </div>
                      <span style={{ fontSize: 14, color: "#9CA3AF" }}>{isExpanded ? "▲" : "▼"}</span>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: "16px 20px", borderTop: "1px solid #E5E7EB" }}>
                        {cat.description && (
                          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>{cat.description}</div>
                        )}
                        {answerCount === 0 ? (
                          <div style={{ padding: 20, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                            아직 작성된 답변이 없습니다
                          </div>
                        ) : (
                          renderQuestions(cat.questions, catAnswers)
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{
                background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20,
              }}>
                <h3 style={{ fontSize: 14, marginBottom: 12 }}>답변 데이터 (Raw)</h3>
                <pre style={{ fontSize: 12, overflow: "auto", maxHeight: 600 }}>
                  {JSON.stringify(survey.answers, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}

        {activeTab === "computed" && (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
            {survey.computed && (survey.computed.grade_trend || survey.computed.mock_trend || survey.computed.study_analysis) ? (
              <>
                {renderGradeTrend()}
                {renderMockTrend()}
                {renderStudyAnalysis()}
              </>
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                자동 분석할 데이터가 없습니다. 학생이 성적/학습시간 관련 항목을 작성하면 자동으로 분석됩니다.
              </div>
            )}
          </div>
        )}

        {activeTab === "delta" && renderDelta()}

        {activeTab === "memo" && renderMemo()}
      </main>
    </div>
  );
}
