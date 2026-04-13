"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSurveyDetail, getSurveyDelta, updateSurveyMemo, deleteSurveyMemo, downloadSurveyReport, getSurveyActionPlan, updateSurveyActionPlan, updateSurveyOverrides, deleteSurveyOverrides, updateSurveyChecklist, deleteSurveyChecklist, convertPreheigh1ToHigh, getSuneungMinimumSimulation } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";
import { GradeTrendChart, MockTrendChart, StudyAnalysisChart, RadarScoreChart, RadarDetailTable } from "@/components/SurveyCharts";

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
  counselor_overrides: Record<string, any> | null;
  counselor_checklist: { items: { content: string; checked: boolean }[]; updated_at?: string } | null;
  source_survey_id: string | null;
  preserved_data: Record<string, any> | null;
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
  c4_type?: {
    type: string;
    recommended_admission: string;
    naesin_avg: number;
    mock_pct_avg: number;
    susi_reachable_tier: number;
    susi_reachable_label: string;
    susi_sample_univs: string[];
    jeongsi_reachable_tier: number;
    jeongsi_reachable_label: string;
    jeongsi_sample_univs: string[];
    comparison_table: { subject: string; naesin_grade: number | null; mock_rank: string | null; mock_percentile: number | null; mock_raw_score: number | null }[];
    reasoning: string;
  };
  auto_comments?: Record<string, string>;
  roadmap?: {
    items: { area: string; area_key: string; priority: string; title: string; description: string; period: string; current_score: number; current_grade: string }[];
    matrix: {
      phases: string[];
      tracks: string[];
      cells: Record<string, Record<string, string>>;
    };
    summary: string;
  };
  radar_scores?: Record<string, any>;
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

interface ActionItem {
  id: string;
  content: string;
  deadline: string | null;
  responsible: string | null;
  completed: boolean;
}

interface ActionPlan {
  items: ActionItem[];
  note: string | null;
  updated_at?: string;
}

type TabType = "answers" | "computed" | "delta" | "memo" | "checklist" | "action_plan" | "suneung";

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

  // PDF download state
  const [pdfDownloading, setPdfDownloading] = useState(false);

  // Action plan state
  const [actionPlan, setActionPlan] = useState<ActionPlan>({ items: [], note: null });
  const [actionPlanLoaded, setActionPlanLoaded] = useState(false);
  const [actionPlanSaving, setActionPlanSaving] = useState(false);

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<{ content: string; checked: boolean }[]>([]);
  const [checklistSaving, setChecklistSaving] = useState(false);

  // Override state
  const [overrideSaving, setOverrideSaving] = useState(false);

  // Convert state
  const [converting, setConverting] = useState(false);

  // Suneung minimum simulation state
  const [suneungSim, setSuneungSim] = useState<any>(null);
  const [suneungLoading, setSuneungLoading] = useState(false);

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
      if (data.counselor_checklist?.items) {
        setChecklistItems(data.counselor_checklist.items);
      }
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

  const loadSuneungSim = async () => {
    if (suneungSim) return;
    setSuneungLoading(true);
    try {
      const data = await getSuneungMinimumSimulation(id);
      setSuneungSim(data);
    } catch {
      setSuneungSim({ error: "수능 최저 시뮬레이션 조회에 실패했습니다.", simulations: [] });
    } finally {
      setSuneungLoading(false);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === "delta" && !delta) {
      loadDelta();
    }
    if (tab === "action_plan" && !actionPlanLoaded) {
      loadActionPlan();
    }
    if (tab === "suneung" && !suneungSim) {
      loadSuneungSim();
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

  const handleDownloadPdf = async () => {
    setPdfDownloading(true);
    try {
      await downloadSurveyReport(id);
    } catch {
      alert("PDF 리포트 생성에 실패했습니다.");
    } finally {
      setPdfDownloading(false);
    }
  };

  const loadActionPlan = async () => {
    if (actionPlanLoaded) return;
    try {
      const data = await getSurveyActionPlan(id);
      if (data && data.items) {
        setActionPlan(data);
      }
    } catch {
      // empty plan
    }
    setActionPlanLoaded(true);
  };

  const handleAddActionItem = () => {
    setActionPlan((prev) => ({
      ...prev,
      items: [...prev.items, { id: `ap_${Date.now()}`, content: "", deadline: null, responsible: null, completed: false }],
    }));
  };

  const handleRemoveActionItem = (idx: number) => {
    setActionPlan((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const handleUpdateActionItem = (idx: number, field: string, value: any) => {
    setActionPlan((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }));
  };

  const handleSaveActionPlan = async () => {
    setActionPlanSaving(true);
    try {
      const result = await updateSurveyActionPlan(id, {
        items: actionPlan.items.filter((i) => i.content.trim()),
        note: actionPlan.note || undefined,
      });
      setActionPlan(result);
    } catch {
      alert("액션 플랜 저장에 실패했습니다.");
    } finally {
      setActionPlanSaving(false);
    }
  };

  // ── 체크리스트 핸들러 ──

  const handleAddChecklistItem = () => {
    setChecklistItems((prev) => [...prev, { content: "", checked: false }]);
  };

  const handleRemoveChecklistItem = (idx: number) => {
    setChecklistItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveChecklist = async () => {
    setChecklistSaving(true);
    try {
      const result = await updateSurveyChecklist(id, checklistItems.filter((i) => i.content.trim()));
      setSurvey((prev) => prev ? { ...prev, counselor_checklist: result.counselor_checklist } : prev);
    } catch {
      alert("체크리스트 저장에 실패했습니다.");
    } finally {
      setChecklistSaving(false);
    }
  };

  const handleDeleteChecklist = async () => {
    if (!confirm("체크리스트를 삭제하시겠습니까?")) return;
    setChecklistSaving(true);
    try {
      await deleteSurveyChecklist(id);
      setChecklistItems([]);
      setSurvey((prev) => prev ? { ...prev, counselor_checklist: null } : prev);
    } catch {
      alert("체크리스트 삭제에 실패했습니다.");
    } finally {
      setChecklistSaving(false);
    }
  };

  // ── Override 핸들러 ──

  const handleSaveOverride = async (key: string, value: any) => {
    setOverrideSaving(true);
    try {
      const result = await updateSurveyOverrides(id, { [key]: value });
      setSurvey((prev) => prev ? { ...prev, counselor_overrides: result.counselor_overrides } : prev);
      loadSurvey(); // computed 재로드
    } catch {
      alert("수정 저장에 실패했습니다.");
    } finally {
      setOverrideSaving(false);
    }
  };

  const handleResetOverrides = async () => {
    if (!confirm("상담사 수정 내용을 모두 초기화하고 자동 분석 원본으로 복원하시겠습니까?")) return;
    setOverrideSaving(true);
    try {
      await deleteSurveyOverrides(id);
      setSurvey((prev) => prev ? { ...prev, counselor_overrides: null } : prev);
      loadSurvey();
    } catch {
      alert("초기화에 실패했습니다.");
    } finally {
      setOverrideSaving(false);
    }
  };

  // ── 고1 전환 핸들러 ──

  const handleConvertToHigh = async () => {
    if (!confirm("이 예비고1 설문을 고등학교 T1 설문으로 전환하시겠습니까?\n\n• 매핑 가능한 카테고리는 자동 사전 입력됩니다\n• 예비고1 E영역(과목별 역량 진단)은 비교 데이터로 보존됩니다\n• 학생이 추가 입력을 진행해야 합니다")) return;
    setConverting(true);
    try {
      const result = await convertPreheigh1ToHigh(id);
      alert(`전환 완료! 새 고등학교 T1 설문이 생성되었습니다.\n\n매핑된 카테고리: ${result.mapped_categories.join(", ")}\n보존된 카테고리: ${result.preserved_categories.join(", ")}`);
      router.push(`/surveys/${result.new_survey_id}`);
    } catch (e: any) {
      const msg = e?.detail || "전환에 실패했습니다.";
      alert(msg);
    } finally {
      setConverting(false);
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
    ...(survey.survey_type === "high" ? [{ key: "suneung" as TabType, label: "수능최저 시뮬레이션" }] : []),
    { key: "memo", label: `메모${survey.admin_memo ? " *" : ""}` },
    { key: "checklist", label: `체크리스트${survey.counselor_checklist?.items?.length ? " *" : ""}` },
    { key: "action_plan", label: "액션 플랜" },
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
          <button
            onClick={handleDownloadPdf}
            disabled={pdfDownloading}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "1px solid #3B82F6",
              background: pdfDownloading ? "#93C5FD" : "#3B82F6", color: "white",
              fontSize: 13, cursor: pdfDownloading ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {pdfDownloading ? "생성 중..." : "PDF 리포트 다운로드"}
          </button>
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
          {survey.source_survey_id && (
            <div style={{ marginTop: 16, padding: 12, background: "#EFF6FF", borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: "#1E40AF", marginBottom: 4 }}>예비고1에서 전환됨</div>
              <div style={{ fontSize: 13, color: "#1E3A5F" }}>
                원본 설문: <button onClick={() => router.push(`/surveys/${survey.source_survey_id}`)} style={{ color: "#3B82F6", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>{survey.source_survey_id}</button>
              </div>
            </div>
          )}
          {/* 예비고1 → 고1 전환 버튼 */}
          {survey.survey_type === "preheigh1" && survey.status === "submitted" && (
            <div style={{ marginTop: 16, padding: 12, background: "#F0FDF4", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#166534" }}>고1 전환</div>
                <div style={{ fontSize: 12, color: "#15803D" }}>이 예비고1 설문을 고등학교 T1 설문으로 전환합니다</div>
              </div>
              <button
                onClick={handleConvertToHigh}
                disabled={converting}
                style={{
                  padding: "8px 20px", borderRadius: 6, border: "none",
                  background: converting ? "#86EFAC" : "#22C55E", color: "white",
                  fontSize: 13, fontWeight: 600, cursor: converting ? "default" : "pointer",
                }}
              >
                {converting ? "전환 중..." : "고1 전환"}
              </button>
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
          <div>
            {/* 상담사 수정 상태 배너 */}
            {(survey.computed as any)?.has_overrides && (
              <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 8, padding: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>상담사 수정 적용됨</span>
                  <span style={{ fontSize: 12, color: "#A16207", marginLeft: 8 }}>
                    자동 분석 초안이 상담사에 의해 수정되었습니다
                    {(survey.computed as any)?.override_updated_at && ` (${new Date((survey.computed as any).override_updated_at).toLocaleString("ko-KR")})`}
                  </span>
                </div>
                <button
                  onClick={handleResetOverrides}
                  disabled={overrideSaving}
                  style={{
                    padding: "6px 14px", borderRadius: 6, border: "1px solid #FCA5A5",
                    background: "#FEF2F2", color: "#DC2626", fontSize: 12, cursor: "pointer",
                  }}
                >
                  원본 복원
                </button>
              </div>
            )}

            {/* 보존 데이터 (예비고1에서 전환된 경우) */}
            {survey.preserved_data?.preheigh1_E && (
              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1E40AF", marginBottom: 8 }}>예비고1 과목별 역량 진단 (비교 데이터)</div>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>중학교 때 자가진단한 과목별 자신감/흥미 데이터입니다. 고등학교 실제 성적과 비교하여 상담에 활용하세요.</div>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "#3B82F6" }}>상세 데이터 보기</summary>
                  <pre style={{ fontSize: 11, marginTop: 8, overflow: "auto", maxHeight: 300, background: "#F8FAFC", padding: 12, borderRadius: 4 }}>
                    {JSON.stringify(survey.preserved_data.preheigh1_E, null, 2)}
                  </pre>
                </details>
              </div>
            )}

            {/* 4각형 레이더 — 종합 진단 (고등학생만) */}
            {survey.survey_type === "high" && survey.computed?.radar_scores && (
              <>
                <RadarScoreChart computed={survey.computed} />
                <div style={{ marginBottom: 20 }}>
                  <RadarDetailTable computed={survey.computed} />
                </div>
              </>
            )}

            <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
              {survey.computed && (survey.computed.grade_trend || survey.computed.mock_trend || survey.computed.study_analysis) ? (
                <>
                  <GradeTrendChart computed={survey.computed} surveyType={survey.survey_type} />
                  <MockTrendChart computed={survey.computed} />
                  <StudyAnalysisChart computed={survey.computed} />

                  {/* C4 유형 판정 (입결 기반) */}
                  {survey.survey_type === "high" && (survey.computed as any)?.c4_type && (
                    <div style={{ marginTop: 24, borderTop: "2px solid #E5E7EB", paddingTop: 20 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📊 C4. 내신 vs 모의고사 비교 — 유형 ���정</h4>
                      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>입결 DB 기반으로 수시/정시 가능 대학 라인을 비교하여 자동 판정된 결과입니다. 상담사가 검토 후 수정할 수 있습니다.</div>

                      {/* 수시 vs 정시 가능 대학 라인 비교 */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                        <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#1E40AF", marginBottom: 6 }}>수시 가능 라인 (내신 {(survey.computed as any).c4_type.naesin_avg}등급 기준)</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#1D4ED8" }}>{(survey.computed as any).c4_type.susi_reachable_label}</div>
                          {(survey.computed as any).c4_type.susi_sample_univs?.length > 0 && (
                            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>예시: {(survey.computed as any).c4_type.susi_sample_univs.join(", ")}</div>
                          )}
                        </div>
                        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#166534", marginBottom: 6 }}>정시 가능 라인 (백분�� {(survey.computed as any).c4_type.mock_pct_avg}% 기준)</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#15803D" }}>{(survey.computed as any).c4_type.jeongsi_reachable_label}</div>
                          {(survey.computed as any).c4_type.jeongsi_sample_univs?.length > 0 && (
                            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>예시: {(survey.computed as any).c4_type.jeongsi_sample_univs.join(", ")}</div>
                          )}
                        </div>
                      </div>

                      {/* 과목별 비교 테이블 */}
                      {(survey.computed as any).c4_type.comparison_table?.length > 0 && (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 16 }}>
                          <thead>
                            <tr style={{ background: "#F9FAFB" }}>
                              <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "2px solid #E5E7EB" }}>과목</th>
                              <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "2px solid #E5E7EB" }}>내신 등급</th>
                              <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "2px solid #E5E7EB" }}>모의 ��급</th>
                              <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "2px solid #E5E7EB" }}>모의 백분위</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(survey.computed as any).c4_type.comparison_table.map((row: any, i: number) => (
                              <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                                <td style={{ padding: "8px 12px" }}>{row.subject}</td>
                                <td style={{ padding: "8px 12px", textAlign: "center" }}>{row.naesin_grade != null ? `${row.naesin_grade}등급` : "-"}</td>
                                <td style={{ padding: "8px 12px", textAlign: "center" }}>{row.mock_rank != null ? `${row.mock_rank}등급` : "-"}</td>
                                <td style={{ padding: "8px 12px", textAlign: "center" }}>{row.mock_percentile != null ? `${row.mock_percentile}%` : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* 유형 판정 + 상담사 편집 */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>유형 판정</label>
                          <select
                            defaultValue={(survey.counselor_overrides as any)?.c4_type_override || (survey.computed as any).c4_type.type}
                            onChange={(e) => handleSaveOverride("c4_type_override", e.target.value)}
                            style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, background: "white" }}
                          >
                            <option value="내신형">내신형</option>
                            <option value="균형형">균형��</option>
                            <option value="수능형">���능형</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>추천 전형 방향</label>
                          <select
                            defaultValue={(survey.counselor_overrides as any)?.c4_recommended_override || (survey.computed as any).c4_type.recommended_admission}
                            onChange={(e) => handleSaveOverride("c4_recommended_override", e.target.value)}
                            style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, background: "white" }}
                          >
                            <option value="수시">수시</option>
                            <option value="정시">정시</option>
                          </select>
                        </div>
                      </div>
                      <textarea
                        defaultValue={(survey.counselor_overrides as any)?.c4_reasoning_override || (survey.computed as any).c4_type.reasoning || ""}
                        placeholder="판정 근거 메모..."
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          const prev = (survey.counselor_overrides as any)?.c4_reasoning_override || (survey.computed as any)?.c4_type?.reasoning || "";
                          if (val !== prev) handleSaveOverride("c4_reasoning_override", val);
                        }}
                        style={{ width: "100%", minHeight: 80, padding: 12, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                  )}

                  {/* 6개 영역 상담사 분석 코멘트 */}
                  <div style={{ marginTop: 24, borderTop: "2px solid #E5E7EB", paddingTop: 20 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>✏️ 상담사 분석 코멘트</h4>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>자동 생성된 초안을 검토하고 필요 시 수정하세요. 이 내용은 리포트에 반���됩니다.</div>

                    {[
                      { key: "grade_trend_comment", label: "내신 등급 추이 분석", icon: "📈" },
                      { key: "mock_trend_comment", label: "모��고사 추이 분석", icon: "📊" },
                      { key: "comparison_comment", label: "내신 vs 모의고사 비교 분석", icon: "⚖️" },
                      { key: "subject_competitiveness_comment", label: "과목별 경쟁력 분석", icon: "📚" },
                      { key: "study_method_comment", label: "학습 방법 진단", icon: "🎯" },
                    ].map(({ key, label, icon }) => (
                      <div key={key} style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>{icon} {label}</label>
                        <textarea
                          defaultValue={
                            (survey.counselor_overrides as any)?.[key]
                            || (survey.computed as any)?.auto_comments?.[key]
                            || ""
                          }
                          placeholder={`${label} 코멘트...`}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            const prev = (survey.counselor_overrides as any)?.[key]
                              || (survey.computed as any)?.auto_comments?.[key] || "";
                            if (val !== prev) handleSaveOverride(key, val);
                          }}
                          style={{
                            width: "100%", minHeight: 80, padding: 12, border: "1px solid #D1D5DB",
                            borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit",
                            background: (survey.counselor_overrides as any)?.[key] ? "#FFFBEB" : "#F9FAFB",
                          }}
                        />
                        {(survey.counselor_overrides as any)?.[key] && (
                          <div style={{ fontSize: 11, color: "#D97706", marginTop: 2 }}>상담사 수정됨</div>
                        )}
                      </div>
                    ))}
                    {overrideSaving && <div style={{ fontSize: 12, color: "#3B82F6", marginTop: 8 }}>저장 중...</div>}
                  </div>

                  {/* 맞춤 전략 로드맵 (Phase × 4트랙) */}
                  {survey.survey_type === "high" && (survey.computed as any)?.roadmap?.matrix && (
                    <div style={{ marginTop: 24, borderTop: "2px solid #E5E7EB", paddingTop: 20 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🗺️ 맞춤 전략 로드맵</h4>
                      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
                        자동 생성된 로드맵 초안입니다. 각 셀을 클릭하여 내용을 수정할 수 있습니다.
                        {(survey.computed as any).roadmap.summary && (
                          <span style={{ display: "block", marginTop: 4, fontStyle: "italic" }}>{(survey.computed as any).roadmap.summary}</span>
                        )}
                      </div>

                      {/* 우선순위 항��� */}
                      {(survey.computed as any).roadmap.items?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>핵심 개선 항목</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {(survey.computed as any).roadmap.items.slice(0, 6).map((item: any, i: number) => (
                              <div key={i} style={{
                                background: item.priority === "상" ? "#FEF2F2" : item.priority === "중" ? "#FEF3C7" : "#F0FDF4",
                                border: `1px solid ${item.priority === "상" ? "#FECACA" : item.priority === "중" ? "#FDE68A" : "#BBF7D0"}`,
                                borderRadius: 8, padding: "8px 12px", fontSize: 12, flex: "1 1 auto", minWidth: 200,
                              }}>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                                  <span style={{ color: item.priority === "상" ? "#DC2626" : item.priority === "��" ? "#D97706" : "#16A34A" }}>
                                    [{item.priority}]
                                  </span>{" "}
                                  {item.title}
                                </div>
                                <div style={{ color: "#6B7280", fontSize: 11 }}>{item.description}</div>
                                <div style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>{item.area} · {item.current_grade}등급 ({item.current_score}점)</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Phase × Track 매트릭스 */}
                      {(() => {
                        const matrix = (survey.computed as any).roadmap.matrix;
                        const phases = matrix?.phases || [];
                        const tracks = matrix?.tracks || [];
                        const cells = matrix?.cells || {};
                        if (phases.length === 0 || tracks.length === 0) return null;

                        return (
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr>
                                  <th style={{ padding: "8px 10px", background: "#4472C4", color: "white", borderRight: "1px solid #3B5EA6", textAlign: "left", minWidth: 100 }}>트랙 \\ Phase</th>
                                  {phases.map((phase: string) => (
                                    <th key={phase} style={{ padding: "8px 10px", background: "#4472C4", color: "white", borderRight: "1px solid #3B5EA6", textAlign: "center", minWidth: 160 }}>{phase}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {tracks.map((track: string, ti: number) => (
                                  <tr key={track} style={{ background: ti % 2 === 0 ? "#F9FAFB" : "white" }}>
                                    <td style={{ padding: "8px 10px", fontWeight: 600, borderRight: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{track}</td>
                                    {phases.map((phase: string) => {
                                      const cellKey = `${track}__${phase}`;
                                      const overrideKey = `roadmap_cell_${ti}_${phases.indexOf(phase)}`;
                                      const autoVal = cells?.[track]?.[phase] || "";
                                      const overrideVal = (survey.counselor_overrides as any)?.[overrideKey];
                                      const displayVal = overrideVal ?? autoVal;

                                      return (
                                        <td key={cellKey} style={{ padding: 4, borderRight: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB", verticalAlign: "top" }}>
                                          <textarea
                                            defaultValue={displayVal}
                                            onBlur={(e) => {
                                              const val = e.target.value.trim();
                                              if (val !== (overrideVal ?? autoVal)) handleSaveOverride(overrideKey, val);
                                            }}
                                            style={{
                                              width: "100%", minHeight: 60, padding: 6, border: "1px solid transparent",
                                              borderRadius: 4, fontSize: 11, resize: "vertical", fontFamily: "inherit",
                                              background: overrideVal != null ? "#FFFBEB" : "transparent",
                                            }}
                                            onFocus={(e) => { e.target.style.borderColor = "#3B82F6"; }}
                                            onBlurCapture={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "transparent"; }}
                                          />
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* 상담사 메모 (리포트 미반���) */}
                  <div style={{ marginTop: 24, borderTop: "2px solid #E5E7EB", paddingTop: 20 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📝 상담사 메모 <span style={{ fontWeight: 400, fontSize: 12, color: "#9CA3AF" }}>(리포트 미반영)</span></h4>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>상담 시 확인할 포인트, 주의사항 등을 메모합니다. 학생/학부모에게 전달되지 않습니다.</div>
                    <textarea
                      defaultValue={(survey.counselor_overrides as any)?.counselor_private_memo || ""}
                      placeholder="상담 전 메모, 이 학생 상담 시 주의사항..."
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        const prev = (survey.counselor_overrides as any)?.counselor_private_memo || "";
                        if (val !== prev) handleSaveOverride("counselor_private_memo", val);
                      }}
                      style={{
                        width: "100%", minHeight: 80, padding: 12, border: "1px dashed #D1D5DB",
                        borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit",
                        background: "#FAFAFA",
                      }}
                    />
                  </div>
                </>
              ) : (
                <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                  자동 분석할 데이터가 없습니다. 학생이 성적/학습시간 관련 항목을 작성하면 자동으로 분석됩니다.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "delta" && renderDelta()}

        {activeTab === "memo" && renderMemo()}

        {activeTab === "checklist" && (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 15, margin: 0 }}>상담 전 체크리스트</h3>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>상담 시 확인할 포인트를 미리 정리합니다. 리포트에는 포함되지 않습니다.</div>
              </div>
              <button
                onClick={handleAddChecklistItem}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "1px solid #3B82F6",
                  background: "#EFF6FF", color: "#3B82F6", fontSize: 13, cursor: "pointer",
                }}
              >
                + 항목 추가
              </button>
            </div>

            {checklistItems.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                아직 등록된 체크리스트가 없습니다. &quot;+ 항목 추가&quot;를 클릭하세요.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {checklistItems.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => {
                        setChecklistItems((prev) => prev.map((it, i) => i === idx ? { ...it, checked: e.target.checked } : it));
                      }}
                      style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }}
                    />
                    <input
                      type="text"
                      value={item.content}
                      onChange={(e) => {
                        setChecklistItems((prev) => prev.map((it, i) => i === idx ? { ...it, content: e.target.value } : it));
                      }}
                      placeholder="확인할 내용을 입력하세요"
                      style={{
                        flex: 1, padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 14,
                        textDecoration: item.checked ? "line-through" : "none",
                        color: item.checked ? "#9CA3AF" : "#111827",
                      }}
                    />
                    <button
                      onClick={() => handleRemoveChecklistItem(idx)}
                      style={{ padding: "4px 8px", border: "none", background: "none", color: "#EF4444", cursor: "pointer", fontSize: 16 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              {survey.counselor_checklist && (
                <button
                  onClick={handleDeleteChecklist}
                  disabled={checklistSaving}
                  style={{
                    padding: "8px 16px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2",
                    color: "#DC2626", fontSize: 13, cursor: "pointer",
                  }}
                >
                  삭제
                </button>
              )}
              <button
                onClick={handleSaveChecklist}
                disabled={checklistSaving}
                style={{
                  padding: "8px 24px", borderRadius: 6, border: "none", background: "#3B82F6",
                  color: "white", fontSize: 13, cursor: "pointer", opacity: checklistSaving ? 0.5 : 1,
                }}
              >
                {checklistSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "suneung" && (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: 15, margin: 0, marginBottom: 16 }}>수능 최저학력기준 충족 시뮬레이션</h3>
            {suneungLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>로딩 중...</div>
            ) : suneungSim?.error && !suneungSim?.simulations?.length ? (
              <div style={{ padding: 40, textAlign: "center", color: "#EF4444", fontSize: 13 }}>
                {suneungSim.error}
              </div>
            ) : suneungSim ? (
              <AdminSuneungSimulation data={suneungSim} />
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                데이터가 없습니다.
              </div>
            )}
          </div>
        )}

        {activeTab === "action_plan" && (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, margin: 0 }}>액션 플랜</h3>
              <button
                onClick={handleAddActionItem}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "1px solid #3B82F6",
                  background: "#EFF6FF", color: "#3B82F6", fontSize: 13, cursor: "pointer",
                }}
              >
                + 항목 추가
              </button>
            </div>

            {actionPlan.items.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                아직 등록된 액션 플랜이 없습니다. &quot;+ 항목 추가&quot;를 클릭하세요.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {actionPlan.items.map((item, idx) => (
                  <div key={item.id || idx} style={{
                    padding: 16, border: "1px solid #E5E7EB", borderRadius: 8,
                    background: item.completed ? "#F0FDF4" : "#FAFAFA",
                  }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={(e) => handleUpdateActionItem(idx, "completed", e.target.checked)}
                        style={{ marginTop: 4, width: 18, height: 18, cursor: "pointer" }}
                      />
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={item.content}
                          onChange={(e) => handleUpdateActionItem(idx, "content", e.target.value)}
                          placeholder="실행 과제 내용을 입력하세요"
                          style={{
                            width: "100%", padding: "6px 10px", border: "1px solid #D1D5DB",
                            borderRadius: 4, fontSize: 14, marginBottom: 8,
                            textDecoration: item.completed ? "line-through" : "none",
                            color: item.completed ? "#9CA3AF" : "#111827",
                          }}
                        />
                        <div style={{ display: "flex", gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 11, color: "#6B7280" }}>기한</label>
                            <input
                              type="date"
                              value={item.deadline || ""}
                              onChange={(e) => handleUpdateActionItem(idx, "deadline", e.target.value || null)}
                              style={{
                                width: "100%", padding: "4px 8px", border: "1px solid #D1D5DB",
                                borderRadius: 4, fontSize: 13,
                              }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 11, color: "#6B7280" }}>담당</label>
                            <select
                              value={item.responsible || ""}
                              onChange={(e) => handleUpdateActionItem(idx, "responsible", e.target.value || null)}
                              style={{
                                width: "100%", padding: "4px 8px", border: "1px solid #D1D5DB",
                                borderRadius: 4, fontSize: 13,
                              }}
                            >
                              <option value="">선택</option>
                              <option value="student">학생</option>
                              <option value="parent">학부모</option>
                              <option value="counselor">상담사</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveActionItem(idx)}
                        style={{
                          padding: "4px 8px", border: "none", background: "none",
                          color: "#EF4444", cursor: "pointer", fontSize: 16,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 메모 */}
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 12, color: "#6B7280" }}>액션 플랜 메모</label>
              <textarea
                value={actionPlan.note || ""}
                onChange={(e) => setActionPlan((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="추가 메모..."
                style={{
                  width: "100%", minHeight: 80, padding: 10, border: "1px solid #D1D5DB",
                  borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit", marginTop: 4,
                }}
              />
            </div>

            {/* 저장 버튼 */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              {actionPlan.updated_at && (
                <span style={{ fontSize: 12, color: "#9CA3AF", marginRight: "auto", lineHeight: "32px" }}>
                  마지막 저장: {new Date(actionPlan.updated_at).toLocaleString("ko-KR")}
                </span>
              )}
              <button
                onClick={handleSaveActionPlan}
                disabled={actionPlanSaving}
                style={{
                  padding: "8px 24px", borderRadius: 6, border: "none", background: "#3B82F6",
                  color: "white", fontSize: 13, cursor: "pointer",
                  opacity: actionPlanSaving ? 0.5 : 1,
                }}
              >
                {actionPlanSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── 수능 최저학력기준 시뮬레이션 (관리자용) ──

function AdminSuneungSimulation({ data }: { data: any }) {
  const grades = data.student_mock_grades || {};
  const simulations: any[] = data.simulations || [];
  const summary = data.summary || {};

  const gradeLabel: Record<string, string> = {
    korean: "국어", math: "수학", english: "영어",
    inquiry1: "탐구1", inquiry2: "탐구2",
  };

  const resultStyle = (result: string, margin?: number) => {
    if (result === "충족") return { bg: "#ECFDF5", color: "#059669" };
    if (result === "미충족" && margin != null && margin >= -2) return { bg: "#FFFBEB", color: "#D97706" };
    if (result === "미충족") return { bg: "#FEF2F2", color: "#DC2626" };
    return { bg: "#F3F4F6", color: "#6B7280" };
  };

  const resultText = (result: string, margin?: number) => {
    if (result === "충족") return "충족";
    if (result === "미충족" && margin != null && margin >= -2) return "근접";
    if (result === "미충족") return "미충족";
    if (result === "해당없음") return "없음";
    return result;
  };

  // Group by university
  const grouped: Record<string, any[]> = {};
  for (const sim of simulations) {
    const key = sim.university;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(sim);
  }

  return (
    <div>
      {/* Student mock grades */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        {(["korean", "math", "english", "inquiry1", "inquiry2"] as const).map((key) => (
          <div key={key} style={{
            background: "#F8FAFC", borderRadius: 8, padding: "6px 16px", textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: "#6B7280" }}>{gradeLabel[key] || key}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {grades[key] != null ? grades[key] : "-"}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", fontSize: 12, color: "#6B7280" }}>
          {data.track && <span>계열: {data.track}</span>}
          {data.target_level && <span style={{ marginLeft: 12 }}>목표: {data.target_level}</span>}
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <span style={{ padding: "4px 12px", borderRadius: 6, background: "#ECFDF5", color: "#059669", fontSize: 13, fontWeight: 600 }}>
          충족 {summary.met || 0}
        </span>
        <span style={{ padding: "4px 12px", borderRadius: 6, background: "#FFFBEB", color: "#D97706", fontSize: 13, fontWeight: 600 }}>
          근접 {summary.close || 0}
        </span>
        <span style={{ padding: "4px 12px", borderRadius: 6, background: "#FEF2F2", color: "#DC2626", fontSize: 13, fontWeight: 600 }}>
          미충족 {summary.not_met || 0}
        </span>
        <span style={{ padding: "4px 12px", borderRadius: 6, background: "#F3F4F6", color: "#6B7280", fontSize: 13 }}>
          전체 {summary.total_checked || 0}건
        </span>
      </div>

      {/* Results table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
            <th style={{ padding: "8px 10px", textAlign: "left" }}>대학</th>
            <th style={{ padding: "8px 10px", textAlign: "left" }}>전형</th>
            <th style={{ padding: "8px 10px", textAlign: "left" }}>수능최저 조건</th>
            <th style={{ padding: "8px 10px", textAlign: "center" }}>결과</th>
            <th style={{ padding: "8px 10px", textAlign: "left" }}>상세</th>
          </tr>
        </thead>
        <tbody>
          {simulations.map((sim, i) => {
            const rs = resultStyle(sim.result, sim.margin);
            return (
              <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                <td style={{ padding: "8px 10px", fontWeight: 600 }}>{sim.university}</td>
                <td style={{ padding: "8px 10px" }}>
                  {sim.admission_type}
                  {sim.requirement_label !== "전체" && (
                    <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 4 }}>{sim.requirement_label}</span>
                  )}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, color: "#6B7280", whiteSpace: "pre-line", maxWidth: 200 }}>
                  {sim.requirement_text?.replace(/\n/g, " / ")}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "center" }}>
                  <span style={{
                    display: "inline-block", padding: "2px 10px", borderRadius: 6,
                    fontSize: 12, fontWeight: 700, background: rs.bg, color: rs.color,
                  }}>
                    {resultText(sim.result, sim.margin)}
                  </span>
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>
                  {sim.detail}
                  {sim.failures?.length > 0 && (
                    <div style={{ color: "#DC2626", fontSize: 11, marginTop: 2 }}>
                      {sim.failures.join(", ")}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 12, lineHeight: 1.5 }}>
        * 최신 모의고사 등급 기준 시뮬레이션 결과이며, 실제 수능 성적과 다를 수 있습니다.
      </div>
    </div>
  );
}
