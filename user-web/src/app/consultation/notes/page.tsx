"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getMyConsultationNotes, getMySeniorNotes, listMySurveys, getSurveyActionPlan, getSurveyRoadmap, getSurveyDelta, getChangeReport, getSubjectCompetitiveness, updateRoadmapProgress, updateActionPlanProgress } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

type PageTab = "notes" | "senior-notes" | "action-plan" | "roadmap" | "delta" | "competitiveness";

interface ConsultationNote {
  id: string;
  category: string;
  consultation_date: string;
  student_grade: string | null;
  goals: string | null;
  main_content: string;
  advice_given: string | null;
  next_steps: string | null;
  next_topic: string | null;
}

interface SeniorNote {
  id: string;
  session_number: number;
  session_timing: string | null;
  consultation_date: string | null;
  senior_name: string | null;
  core_topics: { topic: string; progress_status: string; key_content: string }[];
  optional_topics: { topic: string; covered: boolean }[];
  student_questions: string | null;
  senior_answers: string | null;
  student_mood: string | null;
  study_attitude: string | null;
  special_observations: string | null;
  action_items: { action: string; priority: string }[];
  next_checkpoints: { checkpoint: string }[];
  addenda: { content: string; created_at: string }[];
}

interface ActionItem {
  id: string;
  content: string;
  deadline: string | null;
  responsible: string | null;
  completed: boolean;
}

interface ActionPlan {
  items: ActionItem[];
  note?: string;
  updated_at?: string;
}

interface RoadmapPhase {
  phase: string;
  period: string;
  tracks: Record<string, string>;
}

const CATEGORY_LABEL: Record<string, string> = {
  학생부분석: "학생부분석", 입시전략: "입시전략", 학교생활: "학교생활",
  공부법: "공부법", 진로: "진로", 심리정서: "심리정서", 기타: "기타",
};

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  학생부분석: { bg: "#EFF6FF", color: "#2563EB" },
  입시전략: { bg: "#F3E8FF", color: "#7C3AED" },
  학교생활: { bg: "#F0FDF4", color: "#16A34A" },
  공부법: { bg: "#FEFCE8", color: "#CA8A04" },
  진로: { bg: "#FFF7ED", color: "#EA580C" },
  심리정서: { bg: "#FDF2F8", color: "#DB2777" },
  기타: { bg: "#F3F4F6", color: "#6B7280" },
};

const TIMING_LABEL: Record<string, string> = { T1: "고1-1학기", T2: "고1-2학기", T3: "고2-1학기", T4: "고2-2학기" };

const STUDY_METHOD_LABELS: Record<string, string> = {
  수업전예습: "수업 전 예습", 당일복습: "당일 복습", 교과서정독: "교과서 정독",
  필기요약정리: "필기·요약 정리", 인강수강: "인강 수강", 문제집반복: "문제집 반복",
  기출분석: "기출 분석", 개념서회독: "개념서 회독", 요약노트: "요약 노트", 기타: "기타",
};

const ENGAGEMENT_LABELS: Record<string, string> = {
  거의안들음: "거의 안 들음", 듣기만함: "듣기만 함", 필기하며: "필기하며 수업", 적극참여: "적극 참여",
};

const SATISFACTION_LABELS: Record<string, string> = {
  불만족: "불만족", 보통: "보통", 만족: "만족",
};

export default function ConsultationNotesPage() {
  const router = useRouter();
  const [pageTab, setPageTab] = useState<PageTab>("notes");
  const [notes, setNotes] = useState<ConsultationNote[]>([]);
  const [seniorNotes, setSeniorNotes] = useState<SeniorNote[]>([]);
  const [seniorLoading, setSeniorLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Action Plan state
  const [actionPlans, setActionPlans] = useState<{ surveyId: string; timing: string | null; plan: ActionPlan }[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Roadmap state
  const [roadmaps, setRoadmaps] = useState<{ surveyId: string; timing: string | null; phases: RoadmapPhase[]; tracks: string[]; progress: Record<string, Record<string, boolean>> }[]>([]);
  const [roadmapLoading, setRoadmapLoading] = useState(false);

  // Delta state
  const [deltas, setDeltas] = useState<{ surveyId: string; timing: string | null; delta: any }[]>([]);
  const [deltaLoading, setDeltaLoading] = useState(false);

  // Change Report state
  const [changeReports, setChangeReports] = useState<{ surveyId: string; timing: string | null; report: any }[]>([]);
  const [changeReportLoading, setChangeReportLoading] = useState(false);

  // Competitiveness state
  const [compData, setCompData] = useState<{ surveyId: string; timing: string | null; data: any }[]>([]);
  const [compLoading, setCompLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    getMyConsultationNotes()
      .then((data) => setNotes(Array.isArray(data) ? data : []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, []);

  // Load senior notes when tab switches
  useEffect(() => {
    if (pageTab === "senior-notes" && seniorNotes.length === 0 && !seniorLoading) {
      setSeniorLoading(true);
      getMySeniorNotes()
        .then((data) => setSeniorNotes(Array.isArray(data) ? data : []))
        .catch(() => setSeniorNotes([]))
        .finally(() => setSeniorLoading(false));
    }
  }, [pageTab]);

  // Load action plans when tab switches
  useEffect(() => {
    if (pageTab === "action-plan" && actionPlans.length === 0 && !actionLoading) {
      setActionLoading(true);
      listMySurveys({ status: "submitted" })
        .then(async (surveys: any[]) => {
          const plans = [];
          for (const s of surveys) {
            try {
              const plan = await getSurveyActionPlan(s.id);
              if (plan && plan.items && plan.items.length > 0) {
                plans.push({ surveyId: s.id, timing: s.timing, plan });
              }
            } catch { /* skip */ }
          }
          setActionPlans(plans);
        })
        .catch(() => setActionPlans([]))
        .finally(() => setActionLoading(false));
    }
  }, [pageTab]);

  // Load roadmaps when tab switches
  useEffect(() => {
    if (pageTab === "roadmap" && roadmaps.length === 0 && !roadmapLoading) {
      setRoadmapLoading(true);
      listMySurveys({ status: "submitted" })
        .then(async (surveys: any[]) => {
          const rms = [];
          for (const s of surveys) {
            try {
              const data = await getSurveyRoadmap(s.id);
              const rm = data.overrides || data.roadmap;
              if (rm && rm.phases && rm.phases.length > 0) {
                rms.push({
                  surveyId: s.id,
                  timing: s.timing,
                  phases: rm.phases,
                  tracks: rm.tracks || [],
                  progress: data.progress || {},
                });
              }
            } catch { /* skip */ }
          }
          setRoadmaps(rms);
        })
        .catch(() => setRoadmaps([]))
        .finally(() => setRoadmapLoading(false));
    }
  }, [pageTab]);

  // Load deltas when tab switches
  useEffect(() => {
    if (pageTab === "delta" && deltas.length === 0 && !deltaLoading) {
      setDeltaLoading(true);
      listMySurveys({ status: "submitted" })
        .then(async (surveys: any[]) => {
          const ds = [];
          for (const s of surveys) {
            try {
              const data = await getSurveyDelta(s.id);
              if (data && data.has_previous) {
                ds.push({ surveyId: s.id, timing: s.timing, delta: data });
              }
            } catch { /* skip */ }
          }
          setDeltas(ds);
        })
        .catch(() => setDeltas([]))
        .finally(() => setDeltaLoading(false));
    }

    // Also load change reports for the formatted view
    if (pageTab === "delta" && changeReports.length === 0 && !changeReportLoading) {
      setChangeReportLoading(true);
      listMySurveys({ status: "submitted" })
        .then(async (surveys: any[]) => {
          const reports = [];
          for (const s of surveys) {
            try {
              const data = await getChangeReport(s.id);
              if (data && data.has_previous) {
                reports.push({ surveyId: s.id, timing: s.timing, report: data });
              }
            } catch { /* skip */ }
          }
          setChangeReports(reports);
        })
        .catch(() => setChangeReports([]))
        .finally(() => setChangeReportLoading(false));
    }
  }, [pageTab]);

  // Load competitiveness when tab switches
  useEffect(() => {
    if (pageTab === "competitiveness" && compData.length === 0 && !compLoading) {
      setCompLoading(true);
      listMySurveys({ status: "submitted" })
        .then(async (surveys: any[]) => {
          const items = [];
          for (const s of surveys) {
            try {
              const data = await getSubjectCompetitiveness(s.id);
              if (data && data.subjects && Object.keys(data.subjects).length > 0) {
                items.push({ surveyId: s.id, timing: s.timing, data });
              }
            } catch { /* skip */ }
          }
          setCompData(items);
        })
        .catch(() => setCompData([]))
        .finally(() => setCompLoading(false));
    }
  }, [pageTab]);

  const handleActionPlanCheck = useCallback(async (surveyId: string, itemIndex: number, completed: boolean) => {
    // Optimistic update
    setActionPlans(prev => prev.map(ap => {
      if (ap.surveyId !== surveyId) return ap;
      const items = ap.plan.items.map((item, i) =>
        i === itemIndex ? { ...item, completed } : item
      );
      return { ...ap, plan: { ...ap.plan, items } };
    }));

    try {
      await updateActionPlanProgress(surveyId, itemIndex, completed);
    } catch {
      // Revert on error
      setActionPlans(prev => prev.map(ap => {
        if (ap.surveyId !== surveyId) return ap;
        const items = ap.plan.items.map((item, i) =>
          i === itemIndex ? { ...item, completed: !completed } : item
        );
        return { ...ap, plan: { ...ap.plan, items } };
      }));
    }
  }, []);

  const handleRoadmapCheck = useCallback(async (surveyId: string, phaseKey: string, trackKey: string, checked: boolean) => {
    // Optimistic update
    setRoadmaps(prev => prev.map(rm => {
      if (rm.surveyId !== surveyId) return rm;
      const progress = { ...rm.progress };
      if (!progress[phaseKey]) progress[phaseKey] = {};
      progress[phaseKey] = { ...progress[phaseKey], [trackKey]: checked };
      return { ...rm, progress };
    }));

    try {
      await updateRoadmapProgress(surveyId, { [phaseKey]: { [trackKey]: checked } });
    } catch {
      // Revert on error
      setRoadmaps(prev => prev.map(rm => {
        if (rm.surveyId !== surveyId) return rm;
        const progress = { ...rm.progress };
        if (progress[phaseKey]) {
          progress[phaseKey] = { ...progress[phaseKey], [trackKey]: !checked };
        }
        return { ...rm, progress };
      }));
    }
  }, []);

  const filtered = selectedCategory === "전체"
    ? notes
    : notes.filter((n) => n.category === selectedCategory);

  const categoryCounts = notes.reduce<Record<string, number>>((acc, n) => {
    acc[n.category] = (acc[n.category] ?? 0) + 1;
    return acc;
  }, {});

  const categories = ["전체", ...Object.keys(CATEGORY_LABEL)];

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="page-header">
          <div>
            <h1>상담 관리</h1>
            <p style={{ fontSize: 14, color: "var(--gray-500)", marginTop: 4 }}>
              상담 기록, 액션 플랜, 학습 로드맵을 확인하세요
            </p>
          </div>
          <button className="btn btn-outline" onClick={() => router.push("/consultation/my")}>
            내 예약 보기
          </button>
        </div>

        {/* 페이지 탭 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--gray-200)", overflowX: "auto" }}>
          {([
            { key: "notes" as PageTab, label: "상담 기록" },
            { key: "senior-notes" as PageTab, label: "선배 상담" },
            { key: "action-plan" as PageTab, label: "액션 플랜" },
            { key: "roadmap" as PageTab, label: "학습 로드맵" },
            { key: "delta" as PageTab, label: "변화 추적" },
            { key: "competitiveness" as PageTab, label: "과목 경쟁력" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setPageTab(t.key)}
              style={{
                padding: "10px 18px", fontSize: 14, whiteSpace: "nowrap",
                fontWeight: pageTab === t.key ? 600 : 400,
                color: pageTab === t.key ? "var(--primary)" : "var(--gray-500)",
                backgroundColor: "transparent", border: "none",
                borderBottom: pageTab === t.key ? "2px solid var(--primary)" : "2px solid transparent",
                cursor: "pointer", marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── 상담 기록 탭 ─── */}
        {pageTab === "notes" && (
          <>
            {notes.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {Object.entries(categoryCounts).map(([cat, cnt]) => {
                  const c = CATEGORY_COLORS[cat] || CATEGORY_COLORS["기타"];
                  return (
                    <span key={cat} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 12, backgroundColor: c.bg, color: c.color }}>
                      {CATEGORY_LABEL[cat] || cat} {cnt}회
                    </span>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 16 }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    whiteSpace: "nowrap", fontSize: 13, padding: "6px 14px", borderRadius: 20,
                    border: selectedCategory === cat ? "1px solid var(--primary)" : "1px solid var(--gray-200)",
                    backgroundColor: selectedCategory === cat ? "var(--primary)" : "white",
                    color: selectedCategory === cat ? "white" : "var(--gray-600)",
                    cursor: "pointer",
                  }}
                >
                  {cat === "전체" ? `전체 ${notes.length}` : `${CATEGORY_LABEL[cat]} ${categoryCounts[cat] ?? 0}`}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--gray-400)" }}>불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <p style={{ color: "var(--gray-500)", marginBottom: 4 }}>
                  {selectedCategory === "전체" ? "아직 공유된 상담 기록이 없습니다" : `${CATEGORY_LABEL[selectedCategory]} 기록이 없습니다`}
                </p>
                <p style={{ fontSize: 13, color: "var(--gray-400)" }}>상담 완료 후 선생님이 기록을 공유해드립니다</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filtered.map((note) => {
                  const isExpanded = expandedId === note.id;
                  const catColor = CATEGORY_COLORS[note.category] || CATEGORY_COLORS["기타"];
                  return (
                    <div key={note.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                      <div onClick={() => setExpandedId(isExpanded ? null : note.id)} style={{ padding: 16, cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 10, backgroundColor: catColor.bg, color: catColor.color, fontWeight: 600 }}>
                              {CATEGORY_LABEL[note.category] || note.category}
                            </span>
                            {note.student_grade && <span style={{ fontSize: 12, color: "var(--gray-400)" }}>{note.student_grade}</span>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, color: "var(--gray-400)" }}>{new Date(note.consultation_date).toLocaleDateString("ko-KR")}</span>
                            <span style={{ fontSize: 12, color: "var(--gray-400)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "0.2s" }}>▼</span>
                          </div>
                        </div>
                        {!isExpanded && (
                          <p style={{ fontSize: 14, color: "var(--gray-600)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {note.goals || note.main_content}
                          </p>
                        )}
                      </div>
                      {isExpanded && (
                        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--gray-100)" }}>
                          {note.goals && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-400)", marginBottom: 4 }}>상담 목표 / 요청사항</div>
                              <p style={{ fontSize: 14, color: "var(--gray-700)" }}>{note.goals}</p>
                            </div>
                          )}
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-400)", marginBottom: 4 }}>상담 내용</div>
                            <p style={{ fontSize: 14, color: "var(--gray-700)", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{note.main_content}</p>
                          </div>
                          {note.advice_given && (
                            <div style={{ marginTop: 12, padding: 12, backgroundColor: "#EFF6FF", borderRadius: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#2563EB", marginBottom: 4 }}>조언</div>
                              <p style={{ fontSize: 14, color: "#1E40AF", whiteSpace: "pre-wrap" }}>{note.advice_given}</p>
                            </div>
                          )}
                          {note.next_steps && (
                            <div style={{ marginTop: 12, padding: 12, backgroundColor: "#F0FDF4", borderRadius: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#16A34A", marginBottom: 4 }}>실행 계획</div>
                              <p style={{ fontSize: 14, color: "#166534", whiteSpace: "pre-wrap" }}>{note.next_steps}</p>
                            </div>
                          )}
                          {note.next_topic && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--gray-100)" }}>
                              <span style={{ fontSize: 12, color: "var(--gray-400)" }}>다음 상담 주제</span>
                              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--gray-700)", marginTop: 2 }}>{note.next_topic}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── 선배 상담 기록 탭 ─── */}
        {pageTab === "senior-notes" && (
          <>
            {seniorLoading ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--gray-400)" }}>불러오는 중...</div>
            ) : seniorNotes.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎓</div>
                <p style={{ color: "var(--gray-500)", marginBottom: 4 }}>아직 공개된 선배 상담 기록이 없습니다</p>
                <p style={{ fontSize: 13, color: "var(--gray-400)" }}>선배 상담 완료 후 검토를 거쳐 공개됩니다</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {seniorNotes.map((sn) => (
                  <div key={sn.id} className="card" style={{ overflow: "hidden" }}>
                    {/* 헤더 */}
                    <div style={{
                      padding: "14px 20px", background: "linear-gradient(135deg, #F5F3FF, #EDE9FE)",
                      borderBottom: "1px solid #DDD6FE",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <div>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 20,
                          background: "#7C3AED", color: "white", fontSize: 12, fontWeight: 700, marginRight: 8,
                        }}>
                          {sn.session_timing || `S${sn.session_number}`}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#5B21B6" }}>선배 상담</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                        {sn.consultation_date} {sn.senior_name && `· ${sn.senior_name} 선배`}
                      </div>
                    </div>

                    <div style={{ padding: 20 }}>
                      {/* 핵심 주제 */}
                      {sn.core_topics && sn.core_topics.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)", marginBottom: 10 }}>
                            다룬 주제
                          </h4>
                          {sn.core_topics.map((t, i) => (
                            <div key={i} style={{
                              padding: "10px 14px", marginBottom: 6,
                              background: t.progress_status === "충분히 다룸" ? "#F0FDF4" : t.progress_status === "간단히 다룸" ? "#FFFBEB" : "#F9FAFB",
                              borderRadius: 8, borderLeft: `3px solid ${t.progress_status === "충분히 다룸" ? "#10B981" : t.progress_status === "간단히 다룸" ? "#F59E0B" : "#D1D5DB"}`,
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: t.key_content ? 6 : 0 }}>
                                <span style={{ fontSize: 13, fontWeight: 500 }}>{t.topic}</span>
                                <span style={{
                                  fontSize: 11, padding: "2px 8px", borderRadius: 10,
                                  background: t.progress_status === "충분히 다룸" ? "#D1FAE5" : t.progress_status === "간단히 다룸" ? "#FEF3C7" : "#F3F4F6",
                                  color: t.progress_status === "충분히 다룸" ? "#065F46" : t.progress_status === "간단히 다룸" ? "#92400E" : "#6B7280",
                                }}>
                                  {t.progress_status}
                                </span>
                              </div>
                              {t.key_content && (
                                <div style={{ fontSize: 13, color: "var(--gray-600)", lineHeight: 1.6 }}>{t.key_content}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 자유 질의응답 */}
                      {sn.student_questions && (
                        <div style={{ marginBottom: 20 }}>
                          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)", marginBottom: 10 }}>
                            질의응답
                          </h4>
                          <div style={{ padding: 14, background: "#F9FAFB", borderRadius: 8 }}>
                            <div style={{ fontSize: 13, color: "var(--gray-700)", marginBottom: 8 }}>
                              <strong>내 질문:</strong> {sn.student_questions}
                            </div>
                            {sn.senior_answers && (
                              <div style={{ fontSize: 13, color: "var(--gray-600)", paddingTop: 8, borderTop: "1px solid #E5E7EB" }}>
                                <strong>선배 답변:</strong> {sn.senior_answers}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 실천 사항 */}
                      {sn.action_items && sn.action_items.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)", marginBottom: 10 }}>
                            선배가 제안한 실천 사항
                          </h4>
                          {sn.action_items.map((a, i) => (
                            <div key={i} style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                              borderBottom: i < sn.action_items.length - 1 ? "1px solid #F3F4F6" : "none",
                            }}>
                              <span style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                width: 22, height: 22, borderRadius: "50%", fontSize: 11, fontWeight: 700,
                                background: a.priority === "상" ? "#FEE2E2" : a.priority === "하" ? "#DBEAFE" : "#FEF3C7",
                                color: a.priority === "상" ? "#991B1B" : a.priority === "하" ? "#1E40AF" : "#92400E",
                              }}>
                                {a.priority}
                              </span>
                              <span style={{ fontSize: 13 }}>{a.action}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 다음 확인 사항 */}
                      {sn.next_checkpoints && sn.next_checkpoints.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)", marginBottom: 10 }}>
                            다음에 확인할 사항
                          </h4>
                          {sn.next_checkpoints.map((c, i) => (
                            <div key={i} style={{ fontSize: 13, padding: "6px 0", color: "var(--gray-600)" }}>
                              · {c.checkpoint}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 학생 상태 (공개된 경우만) */}
                      {(sn.student_mood || sn.study_attitude) && (
                        <div style={{ padding: 12, background: "#F0FDF4", borderRadius: 8, marginBottom: 20 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#166534", marginBottom: 6 }}>상담 시 나의 상태</div>
                          <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#374151" }}>
                            {sn.student_mood && <span>분위기: {sn.student_mood}</span>}
                            {sn.study_attitude && <span>공부 태도: {sn.study_attitude}</span>}
                          </div>
                        </div>
                      )}

                      {/* 추가 기록 */}
                      {sn.addenda && sn.addenda.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)", marginBottom: 10 }}>
                            추가 기록
                          </h4>
                          {sn.addenda.map((ad, i) => (
                            <div key={i} style={{ padding: "8px 12px", background: "#FFFBEB", borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
                              {ad.content}
                              <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 4 }}>{ad.created_at}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── 액션 플랜 탭 ─── */}
        {pageTab === "action-plan" && (
          <>
            {actionLoading ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--gray-400)" }}>불러오는 중...</div>
            ) : actionPlans.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
                <p style={{ color: "var(--gray-500)", marginBottom: 4 }}>아직 액션 플랜이 없습니다</p>
                <p style={{ fontSize: 13, color: "var(--gray-400)" }}>상담 후 선생님이 액션 플랜을 작성해드립니다</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {actionPlans.map((ap) => {
                  const completed = ap.plan.items.filter((i) => i.completed).length;
                  const total = ap.plan.items.length;
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                  return (
                    <div key={ap.surveyId} className="card" style={{ padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)" }}>
                          {ap.timing ? TIMING_LABEL[ap.timing] || ap.timing : "상담"} 액션 플랜
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: pct === 100 ? "#16A34A" : "var(--primary)" }}>
                          {completed}/{total} 완료 ({pct}%)
                        </span>
                      </div>
                      <div style={{ height: 6, backgroundColor: "var(--gray-100)", borderRadius: 3, marginBottom: 14 }}>
                        <div style={{ height: 6, backgroundColor: pct === 100 ? "#16A34A" : "var(--primary)", borderRadius: 3, width: `${pct}%`, transition: "width 0.3s" }} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {ap.plan.items.map((item, itemIndex) => (
                          <div key={item.id} onClick={() => handleActionPlanCheck(ap.surveyId, itemIndex, !item.completed)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", backgroundColor: item.completed ? "#F0FDF4" : "#FAFAFA", borderRadius: 8, border: `1px solid ${item.completed ? "#BBF7D0" : "var(--gray-100)"}`, cursor: "pointer" }}>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", border: item.completed ? "none" : "2px solid var(--gray-300)", backgroundColor: item.completed ? "#16A34A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                              {item.completed && <span style={{ color: "white", fontSize: 12 }}>✓</span>}
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 14, color: item.completed ? "var(--gray-500)" : "var(--gray-700)", margin: 0, textDecoration: item.completed ? "line-through" : "none" }}>
                                {item.content}
                              </p>
                              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                                {item.deadline && <span style={{ fontSize: 11, color: "var(--gray-400)" }}>기한: {item.deadline}</span>}
                                {item.responsible && <span style={{ fontSize: 11, color: "var(--gray-400)" }}>담당: {item.responsible}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {ap.plan.note && (
                        <div style={{ marginTop: 10, padding: 10, backgroundColor: "#FFFBEB", borderRadius: 6, fontSize: 13, color: "#92400E" }}>
                          {ap.plan.note}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── 학습 로드맵 탭 ─── */}
        {pageTab === "roadmap" && (
          <>
            {roadmapLoading ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--gray-400)" }}>불러오는 중...</div>
            ) : roadmaps.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
                <p style={{ color: "var(--gray-500)", marginBottom: 4 }}>아직 학습 로드맵이 없습니다</p>
                <p style={{ fontSize: 13, color: "var(--gray-400)" }}>상담 후 맞춤 로드맵이 제공됩니다</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {roadmaps.map((rm) => {
                  const trackColors = ["#2563EB", "#16A34A", "#EA580C", "#7C3AED"];
                  // Calculate overall progress
                  const totalItems = rm.phases.reduce((sum, p) => sum + Object.keys(p.tracks || {}).length, 0);
                  const checkedItems = Object.values(rm.progress || {}).reduce(
                    (sum, tracks) => sum + Object.values(tracks).filter(Boolean).length, 0
                  );
                  const progressPct = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

                  return (
                    <div key={rm.surveyId} className="card" style={{ padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)" }}>
                          {rm.timing ? TIMING_LABEL[rm.timing] || rm.timing : "상담"} 학습 로드맵
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: progressPct === 100 ? "#16A34A" : "var(--primary)" }}>
                          달성 {progressPct}%
                        </span>
                      </div>

                      {/* 진행률 바 */}
                      <div style={{ height: 4, backgroundColor: "var(--gray-100)", borderRadius: 2, marginBottom: 14 }}>
                        <div style={{ height: 4, backgroundColor: progressPct === 100 ? "#16A34A" : "var(--primary)", borderRadius: 2, width: `${progressPct}%`, transition: "width 0.3s" }} />
                      </div>

                      {rm.tracks.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                          {rm.tracks.map((tr, i) => (
                            <span key={tr} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, backgroundColor: trackColors[i % trackColors.length] + "15", color: trackColors[i % trackColors.length], fontWeight: 600 }}>
                              {tr}
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {rm.phases.map((phase, pi) => {
                          const phaseKey = `p${pi}`;
                          return (
                            <div key={pi} style={{ padding: 12, borderRadius: 8, border: "1px solid var(--gray-100)", backgroundColor: "#FAFAFA" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)" }}>{phase.phase}</span>
                                <span style={{ fontSize: 11, color: "var(--gray-400)" }}>{phase.period}</span>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {Object.entries(phase.tracks || {}).map(([trackName, task], ti) => {
                                  const isChecked = rm.progress?.[phaseKey]?.[trackName] === true;
                                  return (
                                    <div
                                      key={trackName}
                                      onClick={() => handleRoadmapCheck(rm.surveyId, phaseKey, trackName, !isChecked)}
                                      style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}
                                    >
                                      <div style={{
                                        width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                                        border: isChecked ? "none" : "2px solid var(--gray-300)",
                                        backgroundColor: isChecked ? "#16A34A" : "transparent",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                      }}>
                                        {isChecked && <span style={{ color: "white", fontSize: 11, fontWeight: 700 }}>✓</span>}
                                      </div>
                                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: trackColors[rm.tracks.indexOf(trackName) % trackColors.length], flexShrink: 0, marginTop: 5 }} />
                                      <span style={{ color: "var(--gray-500)", fontSize: 11, minWidth: 50 }}>{trackName}</span>
                                      <span style={{ color: isChecked ? "var(--gray-400)" : "var(--gray-700)", textDecoration: isChecked ? "line-through" : "none" }}>{task as string}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── 변화 추적 탭 ─── */}
        {pageTab === "delta" && (
          <>
            {deltaLoading ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--gray-400)" }}>불러오는 중...</div>
            ) : deltas.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <p style={{ color: "var(--gray-500)", marginBottom: 4 }}>변화 추적 데이터가 없습니다</p>
                <p style={{ fontSize: 13, color: "var(--gray-400)" }}>2회 이상 설문 제출 시 이전 대비 변화를 확인할 수 있습니다</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {deltas.map((d) => {
                  const delta = d.delta;
                  const diff = delta.diff || {};
                  const studyChanges = delta.study_method_changes;

                  return (
                    <div key={d.surveyId}>
                      {/* 요약 카드 */}
                      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)" }}>
                            {d.timing ? TIMING_LABEL[d.timing] || d.timing : "상담"} 변화 추적
                          </span>
                          <span style={{ fontSize: 12, color: "var(--gray-400)" }}>
                            이전: {delta.previous_timing ? TIMING_LABEL[delta.previous_timing] || delta.previous_timing : "-"}
                          </span>
                        </div>
                        <div style={{ padding: 10, backgroundColor: "#EFF6FF", borderRadius: 8, fontSize: 13, color: "#1E40AF" }}>
                          {delta.summary}
                        </div>
                      </div>

                      {/* 카테고리별 변경사항 */}
                      {Object.keys(diff).length > 0 && (
                        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 10 }}>카테고리별 변경 내역</div>
                          {Object.entries(diff).map(([catId, questions]: [string, any]) => (
                            <div key={catId} style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)", marginBottom: 6, padding: "2px 8px", backgroundColor: "#EFF6FF", borderRadius: 4, display: "inline-block" }}>
                                {catId}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 8 }}>
                                {Object.entries(questions).map(([qId, change]: [string, any]) => (
                                  <div key={qId} style={{ fontSize: 12, padding: "6px 8px", backgroundColor: "#FAFAFA", borderRadius: 6, border: "1px solid var(--gray-100)" }}>
                                    <span style={{ fontWeight: 600, color: "var(--gray-600)" }}>{qId}</span>
                                    <span style={{ margin: "0 6px", color: "var(--gray-300)" }}>|</span>
                                    <span style={{
                                      fontSize: 11, padding: "1px 6px", borderRadius: 4,
                                      backgroundColor: change.change_type === "added" ? "#F0FDF4" : change.change_type === "removed" ? "#FEF2F2" : "#FEF3C7",
                                      color: change.change_type === "added" ? "#16A34A" : change.change_type === "removed" ? "#DC2626" : "#D97706",
                                    }}>
                                      {change.change_type === "added" ? "신규" : change.change_type === "removed" ? "삭제" : change.change_type === "increased" ? "증가" : change.change_type === "decreased" ? "감소" : "변경"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* D7 학습법 변화 */}
                      {studyChanges && studyChanges.subject_changes && studyChanges.subject_changes.length > 0 && (
                        <div className="card" style={{ padding: 16 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 4 }}>과목별 학습법 변화</div>
                          <p style={{ fontSize: 12, color: "var(--gray-400)", marginBottom: 12 }}>
                            {studyChanges.total_subjects_changed}개 과목에서 학습법이 변경되었습니다
                          </p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {studyChanges.subject_changes.map((sc: any) => (
                              <div key={sc.subject} style={{ padding: 12, borderRadius: 8, border: "1px solid var(--gray-100)", backgroundColor: "#FAFAFA" }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-800)", marginBottom: 8 }}>{sc.subject}</div>
                                {sc.changes.study_method && (
                                  <div style={{ marginBottom: 6 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gray-500)", marginBottom: 4 }}>학습법 변경</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {sc.changes.study_method.added?.map((m: string) => (
                                        <span key={m} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, backgroundColor: "#F0FDF4", color: "#16A34A" }}>
                                          + {STUDY_METHOD_LABELS[m] || m}
                                        </span>
                                      ))}
                                      {sc.changes.study_method.removed?.map((m: string) => (
                                        <span key={m} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                                          - {STUDY_METHOD_LABELS[m] || m}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {sc.changes.class_engagement && (
                                  <div style={{ fontSize: 12, color: "var(--gray-600)", marginBottom: 4 }}>
                                    수업 참여: <span style={{ color: "var(--gray-400)" }}>{ENGAGEMENT_LABELS[sc.changes.class_engagement.prev] || sc.changes.class_engagement.prev || "-"}</span>
                                    {" → "}
                                    <span style={{ fontWeight: 600, color: "var(--gray-700)" }}>{ENGAGEMENT_LABELS[sc.changes.class_engagement.curr] || sc.changes.class_engagement.curr || "-"}</span>
                                  </div>
                                )}
                                {sc.changes.satisfaction && (
                                  <div style={{ fontSize: 12, color: "var(--gray-600)", marginBottom: 4 }}>
                                    만족도: <span style={{ color: "var(--gray-400)" }}>{SATISFACTION_LABELS[sc.changes.satisfaction.prev] || sc.changes.satisfaction.prev || "-"}</span>
                                    {" → "}
                                    <span style={{ fontWeight: 600, color: "var(--gray-700)" }}>{SATISFACTION_LABELS[sc.changes.satisfaction.curr] || sc.changes.satisfaction.curr || "-"}</span>
                                  </div>
                                )}
                                {sc.changes.main_textbook && (
                                  <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
                                    교재: <span style={{ color: "var(--gray-400)" }}>{sc.changes.main_textbook.prev || "-"}</span>
                                    {" → "}
                                    <span style={{ fontWeight: 600, color: "var(--gray-700)" }}>{sc.changes.main_textbook.curr || "-"}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ─── 종합 변화 리포트 ─── */}
            {changeReportLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--gray-400)", marginTop: 16 }}>리포트 생성 중...</div>
            ) : changeReports.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--gray-800)", marginBottom: 16, paddingBottom: 8, borderBottom: "2px solid var(--primary)" }}>
                  종합 변화 리포트
                </div>
                {changeReports.map((cr) => {
                  const report = cr.report;
                  const summary = report.summary;
                  const grades = report.grades;
                  const studyMethods = report.study_methods;
                  const psych = report.psychology;
                  const goals = report.goals;

                  const directionStyle = (dir: string) => {
                    if (dir === "개선") return { color: "#16A34A", bg: "#F0FDF4", icon: "\u25B2" };
                    if (dir === "하락") return { color: "#DC2626", bg: "#FEF2F2", icon: "\u25BC" };
                    if (dir === "혼재") return { color: "#D97706", bg: "#FEF3C7", icon: "\u25AC" };
                    return { color: "#6B7280", bg: "#F3F4F6", icon: "\u25AC" };
                  };

                  const timingLabel = cr.timing ? TIMING_LABEL[cr.timing] || cr.timing : "현재";
                  const prevTimingLabel = report.previous_timing ? TIMING_LABEL[report.previous_timing] || report.previous_timing : "이전";

                  return (
                    <div key={cr.surveyId} style={{ marginBottom: 32 }}>
                      {/* 종합 요약 */}
                      {summary && (
                        <div className="card" style={{ padding: 20, marginBottom: 16, border: `2px solid ${directionStyle(summary.overall_direction).color}20` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                            <span style={{ fontSize: 24 }}>
                              {summary.icon === "up" ? "\uD83D\uDCC8" : summary.icon === "down" ? "\uD83D\uDCC9" : summary.icon === "mixed" ? "\uD83D\uDD04" : "\u2796"}
                            </span>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--gray-800)" }}>
                                {prevTimingLabel} → {timingLabel} 종합 변화
                              </div>
                              <div style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 2 }}>{summary.summary}</div>
                            </div>
                            <span style={{
                              marginLeft: "auto", fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 20,
                              backgroundColor: directionStyle(summary.overall_direction).bg,
                              color: directionStyle(summary.overall_direction).color,
                            }}>
                              {directionStyle(summary.overall_direction).icon} {summary.overall_direction}
                            </span>
                          </div>
                          {summary.section_directions && (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {Object.entries(summary.section_directions).map(([name, dir]: [string, any]) => {
                                const ds = directionStyle(dir);
                                return (
                                  <span key={name} style={{
                                    fontSize: 12, padding: "3px 10px", borderRadius: 12,
                                    backgroundColor: ds.bg, color: ds.color, fontWeight: 500,
                                  }}>
                                    {name} {ds.icon} {dir}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 성적 변화 */}
                      {grades && grades.changes && grades.changes.length > 0 && (
                        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 18 }}>{"\uD83D\uDCCA"}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)" }}>성적 변화</span>
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 10, marginLeft: "auto",
                              backgroundColor: directionStyle(grades.direction).bg,
                              color: directionStyle(grades.direction).color, fontWeight: 500,
                            }}>
                              {directionStyle(grades.direction).icon} {grades.direction}
                            </span>
                          </div>
                          <p style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 10 }}>{grades.summary}</p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 4, fontSize: 11 }}>
                            <div style={{ fontWeight: 600, color: "var(--gray-500)", padding: "4px 6px" }}>학기</div>
                            <div style={{ fontWeight: 600, color: "var(--gray-500)", padding: "4px 6px" }}>과목</div>
                            <div style={{ fontWeight: 600, color: "var(--gray-500)", padding: "4px 6px", textAlign: "center" }}>이전</div>
                            <div style={{ fontWeight: 600, color: "var(--gray-500)", padding: "4px 6px", textAlign: "center" }}>현재</div>
                            <div style={{ fontWeight: 600, color: "var(--gray-500)", padding: "4px 6px", textAlign: "center" }}>변화</div>
                            {grades.changes.map((g: any, i: number) => {
                              const ds = directionStyle(g.direction);
                              return [
                                <div key={`${i}-sem`} style={{ padding: "4px 6px", color: "var(--gray-600)", borderTop: "1px solid var(--gray-100)" }}>{g.semester}</div>,
                                <div key={`${i}-sub`} style={{ padding: "4px 6px", color: "var(--gray-700)", fontWeight: 500, borderTop: "1px solid var(--gray-100)" }}>{g.subject}</div>,
                                <div key={`${i}-prev`} style={{ padding: "4px 6px", textAlign: "center", color: "var(--gray-500)", borderTop: "1px solid var(--gray-100)" }}>
                                  {g.prev_grade ?? "-"}{g.prev_score != null ? ` (${g.prev_score})` : ""}
                                </div>,
                                <div key={`${i}-curr`} style={{ padding: "4px 6px", textAlign: "center", color: "var(--gray-700)", fontWeight: 600, borderTop: "1px solid var(--gray-100)" }}>
                                  {g.curr_grade ?? "-"}{g.curr_score != null ? ` (${g.curr_score})` : ""}
                                </div>,
                                <div key={`${i}-dir`} style={{ padding: "4px 6px", textAlign: "center", borderTop: "1px solid var(--gray-100)" }}>
                                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, backgroundColor: ds.bg, color: ds.color }}>
                                    {ds.icon}
                                  </span>
                                </div>,
                              ];
                            })}
                          </div>
                        </div>
                      )}

                      {/* 학습법 변화 */}
                      {studyMethods && studyMethods.subjects && studyMethods.subjects.length > 0 && (
                        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 18 }}>{"\uD83D\uDCDD"}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)" }}>학습 방법 변화</span>
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 10, marginLeft: "auto",
                              backgroundColor: directionStyle(studyMethods.direction).bg,
                              color: directionStyle(studyMethods.direction).color, fontWeight: 500,
                            }}>
                              {directionStyle(studyMethods.direction).icon} {studyMethods.direction}
                            </span>
                          </div>
                          <p style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 10 }}>{studyMethods.summary}</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {studyMethods.subjects.map((subj: any) => (
                              <div key={subj.subject} style={{ padding: 12, borderRadius: 8, border: "1px solid var(--gray-100)", backgroundColor: "#FAFAFA" }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-800)", marginBottom: 8 }}>{subj.subject}</div>
                                {(subj.method_added.length > 0 || subj.method_removed.length > 0) && (
                                  <div style={{ marginBottom: 6 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gray-500)", marginBottom: 4 }}>학습법</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {subj.method_added.map((m: string) => (
                                        <span key={m} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, backgroundColor: "#F0FDF4", color: "#16A34A" }}>+ {m}</span>
                                      ))}
                                      {subj.method_removed.map((m: string) => (
                                        <span key={m} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, backgroundColor: "#FEF2F2", color: "#DC2626" }}>- {m}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {subj.engagement && (
                                  <div style={{ fontSize: 12, color: "var(--gray-600)", marginBottom: 4 }}>
                                    수업 참여: <span style={{ color: "var(--gray-400)" }}>{subj.engagement.prev || "-"}</span>
                                    {" → "}
                                    <span style={{ fontWeight: 600, color: directionStyle(subj.engagement.direction || "유지").color }}>{subj.engagement.curr || "-"}</span>
                                    {subj.engagement.direction && subj.engagement.direction !== "유지" && (
                                      <span style={{ fontSize: 10, marginLeft: 4, color: directionStyle(subj.engagement.direction).color }}>
                                        {directionStyle(subj.engagement.direction).icon}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {subj.satisfaction && (
                                  <div style={{ fontSize: 12, color: "var(--gray-600)", marginBottom: 4 }}>
                                    만족도: <span style={{ color: "var(--gray-400)" }}>{subj.satisfaction.prev || "-"}</span>
                                    {" → "}
                                    <span style={{ fontWeight: 600, color: directionStyle(subj.satisfaction.direction || "유지").color }}>{subj.satisfaction.curr || "-"}</span>
                                    {subj.satisfaction.direction && subj.satisfaction.direction !== "유지" && (
                                      <span style={{ fontSize: 10, marginLeft: 4, color: directionStyle(subj.satisfaction.direction).color }}>
                                        {directionStyle(subj.satisfaction.direction).icon}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {subj.textbook && (
                                  <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
                                    교재: <span style={{ color: "var(--gray-400)" }}>{subj.textbook.prev || "-"}</span>
                                    {" → "}
                                    <span style={{ fontWeight: 600, color: "var(--gray-700)" }}>{subj.textbook.curr || "-"}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 심리 컨디션 변화 */}
                      {psych && psych.items && psych.items.length > 0 && (
                        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 18 }}>{"\uD83E\uDDE0"}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)" }}>심리 · 컨디션 변화</span>
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 10, marginLeft: "auto",
                              backgroundColor: directionStyle(psych.direction).bg,
                              color: directionStyle(psych.direction).color, fontWeight: 500,
                            }}>
                              {directionStyle(psych.direction).icon} {psych.direction}
                            </span>
                          </div>
                          <p style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 10 }}>{psych.summary}</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {psych.items.map((item: any) => {
                              const ds = directionStyle(item.direction);
                              return (
                                <div key={item.field} style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 8, backgroundColor: "#FAFAFA", border: "1px solid var(--gray-100)" }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-600)", minWidth: 90 }}>{item.label}</span>
                                  <span style={{ fontSize: 12, color: "var(--gray-400)", flex: 1 }}>
                                    {item.prev ?? "-"} → <span style={{ fontWeight: 600, color: ds.color }}>{item.curr ?? "-"}</span>
                                  </span>
                                  <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 8, backgroundColor: ds.bg, color: ds.color, fontWeight: 500 }}>
                                    {ds.icon} {item.direction}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 목표 변화 */}
                      {goals && goals.items && goals.items.length > 0 && (
                        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 18 }}>{"\uD83C\uDFAF"}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)" }}>목표 · 진로 변화</span>
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 10, marginLeft: "auto",
                              backgroundColor: directionStyle(goals.direction).bg,
                              color: directionStyle(goals.direction).color, fontWeight: 500,
                            }}>
                              {directionStyle(goals.direction).icon} {goals.direction}
                            </span>
                          </div>
                          <p style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 10 }}>{goals.summary}</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {goals.items.map((item: any) => (
                              <div key={item.field} style={{ padding: "8px 10px", borderRadius: 8, backgroundColor: "#FAFAFA", border: "1px solid var(--gray-100)" }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-600)", marginBottom: 4 }}>{item.label}</div>
                                <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                                  {typeof item.prev === "object" ? JSON.stringify(item.prev) : (item.prev ?? "-")}
                                  {" → "}
                                  <span style={{ fontWeight: 600, color: "var(--gray-700)" }}>
                                    {typeof item.curr === "object" ? JSON.stringify(item.curr) : (item.curr ?? "-")}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        {/* --- 과목 경쟁력 탭 --- */}
        {pageTab === "competitiveness" && (
          <>
            {compLoading ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--gray-400)" }}>불러오는 중...</div>
            ) : compData.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <p style={{ color: "var(--gray-500)", marginBottom: 4 }}>과목별 경쟁력 데이터가 없습니다</p>
                <p style={{ fontSize: 13, color: "var(--gray-400)" }}>설문에서 내신 성적과 모의고사 데이터를 입력하면 분석됩니다</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {compData.map((cd) => {
                  const d = cd.data;
                  const subjects = d.subjects || {};
                  const strategy = d.strategy || {};
                  const subjectEntries = Object.entries(subjects) as [string, any][];

                  // Grade color helper
                  const gradeColor = (gap: number | null) => {
                    if (gap === null) return { bar: "#94A3B8", bg: "#F1F5F9", label: "var(--gray-500)" };
                    if (gap <= 0) return { bar: "#16A34A", bg: "#F0FDF4", label: "#166534" };
                    if (gap <= 1) return { bar: "#EAB308", bg: "#FEFCE8", label: "#A16207" };
                    return { bar: "#DC2626", bg: "#FEF2F2", label: "#991B1B" };
                  };

                  const trendIcon = (trend: string) => {
                    if (trend === "improving") return { symbol: "↑", color: "#16A34A" };
                    if (trend === "declining") return { symbol: "↓", color: "#DC2626" };
                    if (trend === "stable") return { symbol: "→", color: "#6B7280" };
                    return { symbol: "-", color: "#9CA3AF" };
                  };

                  // Max grade for bar width calculation (5 grade system)
                  const maxGrade = 5;

                  return (
                    <div key={cd.surveyId}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)", marginBottom: 12 }}>
                        {cd.timing ? TIMING_LABEL[cd.timing] || cd.timing : "설문"} 과목별 경쟁력 분석
                      </div>

                      {/* 목표 정보 */}
                      {d.target_level && (
                        <div style={{ padding: "8px 12px", backgroundColor: "#EFF6FF", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#1E40AF" }}>
                          목표: {d.target_level} (환산 목표등급 {d.target_grade}등급)
                        </div>
                      )}

                      {/* 과목별 경쟁력 차트 */}
                      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 12 }}>
                          과목별 내신 등급
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {subjectEntries.map(([key, subj]) => {
                            if (!subj.current_grade) return null;
                            const gc = gradeColor(subj.gap);
                            const ti = trendIcon(subj.trend);
                            const barWidthPct = Math.max(5, ((maxGrade - subj.current_grade + 1) / maxGrade) * 100);
                            const targetPct = d.target_grade ? ((maxGrade - d.target_grade + 1) / maxGrade) * 100 : null;

                            return (
                              <div key={key}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--gray-700)", minWidth: 40 }}>{subj.name}</span>
                                    <span style={{ fontSize: 11, color: ti.color, fontWeight: 600 }}>{ti.symbol}</span>
                                    {subj.within_plus_minus_1 && (
                                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, backgroundColor: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
                                        +-1
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                    <span style={{ fontWeight: 600, color: gc.label }}>{subj.current_grade}등급</span>
                                    {subj.gap !== null && (
                                      <span style={{ color: "var(--gray-400)" }}>
                                        ({subj.gap > 0 ? "+" : ""}{subj.gap})
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {/* Bar chart */}
                                <div style={{ position: "relative", height: 20, backgroundColor: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${barWidthPct}%`, backgroundColor: gc.bar, borderRadius: 4, transition: "width 0.4s" }} />
                                  {targetPct !== null && (
                                    <div style={{ position: "absolute", top: 0, left: `${targetPct}%`, width: 2, height: "100%", backgroundColor: "#1E293B", opacity: 0.6 }} />
                                  )}
                                </div>
                                {/* Mock grade comparison */}
                                {subj.mock_current != null && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                    <span style={{ fontSize: 11, color: "var(--gray-400)" }}>모의: {subj.mock_current}등급</span>
                                    {subj.current_grade != null && (
                                      <span style={{ fontSize: 11, color: subj.mock_current < subj.current_grade ? "#16A34A" : subj.mock_current > subj.current_grade ? "#DC2626" : "#6B7280" }}>
                                        (내신 대비 {subj.mock_current < subj.current_grade ? "우위" : subj.mock_current > subj.current_grade ? "열위" : "동일"})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {d.target_grade && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--gray-100)" }}>
                            <div style={{ width: 16, height: 2, backgroundColor: "#1E293B", opacity: 0.6 }} />
                            <span style={{ fontSize: 11, color: "var(--gray-400)" }}>목표 등급 ({d.target_grade})</span>
                            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                              <span style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "#16A34A", display: "inline-block" }} /> 목표 달성</span>
                              <span style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "#EAB308", display: "inline-block" }} /> +-1 이내</span>
                              <span style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "#DC2626", display: "inline-block" }} /> 미달</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* C2 취약 유형 */}
                      {d.weakness_types && Object.keys(d.weakness_types).length > 0 && (
                        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 10 }}>
                            모의고사 취약 유형 (C2)
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {Object.entries(d.weakness_types).map(([subKey, types]: [string, any]) => {
                              const name = subjects[subKey]?.name || subKey;
                              return (
                                <div key={subKey} style={{ padding: "8px 12px", backgroundColor: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: "#991B1B", marginBottom: 4 }}>{name}</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                    {(types as string[]).map((t: string) => (
                                      <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, backgroundColor: "#FEE2E2", color: "#B91C1C" }}>{t}</span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* D6 학습 고민 */}
                      {(d.weakest_subjects?.length > 0 || d.strongest_subjects?.length > 0) && (
                        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 10 }}>
                            자가 진단
                          </div>
                          {d.weakest_subjects?.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <span style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>가장 어려운 과목: </span>
                              {d.weakest_subjects.map((s: string) => (
                                <span key={s} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, backgroundColor: "#FEF2F2", color: "#B91C1C", marginRight: 4 }}>{s}</span>
                              ))}
                              {d.weakest_reasons?.length > 0 && (
                                <div style={{ marginTop: 4, fontSize: 12, color: "var(--gray-500)" }}>
                                  이유: {d.weakest_reasons.map((r: string) => {
                                    const labels: Record<string, string> = {
                                      "개념이해부족": "개념 이해 부족", "풀이시간부족": "풀이 시간 부족",
                                      "응용심화": "응용/심화", "시험유형적응": "시험 유형 적응",
                                      "학습방법모름": "학습 방법 모름", "흥미부족": "흥미 부족",
                                    };
                                    return labels[r] || r;
                                  }).join(", ")}
                                </div>
                              )}
                            </div>
                          )}
                          {d.strongest_subjects?.length > 0 && (
                            <div>
                              <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 600 }}>가장 자신있는 과목: </span>
                              {d.strongest_subjects.map((s: string) => (
                                <span key={s} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, backgroundColor: "#F0FDF4", color: "#166534", marginRight: 4 }}>{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 전략 과목 카드 */}
                      {(strategy.focus?.length > 0 || strategy.maintain?.length > 0 || strategy.consider?.length > 0) && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          {/* 집중 공략 */}
                          {strategy.focus?.length > 0 && (
                            <div className="card" style={{ padding: 16, borderLeft: "4px solid #2563EB" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#2563EB", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 16 }}>🎯</span> 집중 공략 과목
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {strategy.focus.map((item: any) => (
                                  <div key={item.key} style={{ padding: 10, backgroundColor: "#EFF6FF", borderRadius: 8 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1E40AF" }}>{item.name}</span>
                                      <span style={{ fontSize: 12, color: "#3B82F6" }}>
                                        {item.current_grade}등급 → 목표 {item.target_grade}등급 (차이: {item.gap > 0 ? "+" : ""}{item.gap})
                                      </span>
                                    </div>
                                    {item.tip && <p style={{ fontSize: 12, color: "#1E40AF", margin: 0, lineHeight: 1.5 }}>{item.tip}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 유지 관리 */}
                          {strategy.maintain?.length > 0 && (
                            <div className="card" style={{ padding: 16, borderLeft: "4px solid #16A34A" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#16A34A", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 16 }}>✅</span> 유지 관리 과목
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {strategy.maintain.map((item: any) => (
                                  <div key={item.key} style={{ padding: 10, backgroundColor: "#F0FDF4", borderRadius: 8 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: "#166534" }}>{item.name}</span>
                                      <span style={{ fontSize: 12, color: "#16A34A" }}>{item.current_grade}등급</span>
                                    </div>
                                    {item.tip && <p style={{ fontSize: 12, color: "#166534", margin: 0, lineHeight: 1.5 }}>{item.tip}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 전략적 포기 고려 */}
                          {strategy.consider?.length > 0 && (
                            <div className="card" style={{ padding: 16, borderLeft: "4px solid #9CA3AF" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#6B7280", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 16 }}>⚖️</span> 전략적 시간 배분 고려
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {strategy.consider.map((item: any) => (
                                  <div key={item.key} style={{ padding: 10, backgroundColor: "#F9FAFB", borderRadius: 8, border: "1px solid var(--gray-200)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: "#6B7280" }}>{item.name}</span>
                                      <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                                        {item.current_grade}등급 → 목표 {item.target_grade}등급 (차이: +{item.gap})
                                      </span>
                                    </div>
                                    {item.tip && <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>{item.tip}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </>
  );
}
