"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getMyConsultationNotes, listMySurveys, getSurveyActionPlan, getSurveyRoadmap } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

type PageTab = "notes" | "action-plan" | "roadmap";

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

export default function ConsultationNotesPage() {
  const router = useRouter();
  const [pageTab, setPageTab] = useState<PageTab>("notes");
  const [notes, setNotes] = useState<ConsultationNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Action Plan state
  const [actionPlans, setActionPlans] = useState<{ surveyId: string; timing: string | null; plan: ActionPlan }[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Roadmap state
  const [roadmaps, setRoadmaps] = useState<{ surveyId: string; timing: string | null; phases: RoadmapPhase[]; tracks: string[] }[]>([]);
  const [roadmapLoading, setRoadmapLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    getMyConsultationNotes()
      .then((data) => setNotes(Array.isArray(data) ? data : []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, []);

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
            } catch { /* skip surveys without action plans */ }
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
                rms.push({ surveyId: s.id, timing: s.timing, phases: rm.phases, tracks: rm.tracks || [] });
              }
            } catch { /* skip */ }
          }
          setRoadmaps(rms);
        })
        .catch(() => setRoadmaps([]))
        .finally(() => setRoadmapLoading(false));
    }
  }, [pageTab]);

  const filtered = selectedCategory === "전체"
    ? notes
    : notes.filter((n) => n.category === selectedCategory);

  const categoryCounts = notes.reduce<Record<string, number>>((acc, n) => {
    acc[n.category] = (acc[n.category] ?? 0) + 1;
    return acc;
  }, {});

  const categories = ["전체", ...Object.keys(CATEGORY_LABEL)];

  const TIMING_LABEL: Record<string, string> = { T1: "고1-1학기", T2: "고1-2학기", T3: "고2-1학기", T4: "고2-2학기" };

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
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--gray-200)" }}>
          {([
            { key: "notes" as PageTab, label: "상담 기록" },
            { key: "action-plan" as PageTab, label: "액션 플랜" },
            { key: "roadmap" as PageTab, label: "학습 로드맵" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setPageTab(t.key)}
              style={{
                padding: "10px 18px", fontSize: 14,
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
            {/* 카테고리 통계 */}
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

            {/* 카테고리 필터 */}
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

            {/* 기록 목록 */}
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

                      {/* 진행률 바 */}
                      <div style={{ height: 6, backgroundColor: "var(--gray-100)", borderRadius: 3, marginBottom: 14 }}>
                        <div style={{ height: 6, backgroundColor: pct === 100 ? "#16A34A" : "var(--primary)", borderRadius: 3, width: `${pct}%`, transition: "width 0.3s" }} />
                      </div>

                      {/* 항목 리스트 */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {ap.plan.items.map((item) => (
                          <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", backgroundColor: item.completed ? "#F0FDF4" : "#FAFAFA", borderRadius: 8, border: `1px solid ${item.completed ? "#BBF7D0" : "var(--gray-100)"}` }}>
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
                  return (
                    <div key={rm.surveyId} className="card" style={{ padding: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-700)", marginBottom: 12 }}>
                        {rm.timing ? TIMING_LABEL[rm.timing] || rm.timing : "상담"} 학습 로드맵
                      </div>

                      {/* 트랙 범례 */}
                      {rm.tracks.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                          {rm.tracks.map((tr, i) => (
                            <span key={tr} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, backgroundColor: trackColors[i % trackColors.length] + "15", color: trackColors[i % trackColors.length], fontWeight: 600 }}>
                              {tr}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Phase 카드 */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {rm.phases.map((phase, pi) => (
                          <div key={pi} style={{ padding: 12, borderRadius: 8, border: "1px solid var(--gray-100)", backgroundColor: "#FAFAFA" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)" }}>{phase.phase}</span>
                              <span style={{ fontSize: 11, color: "var(--gray-400)" }}>{phase.period}</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {Object.entries(phase.tracks || {}).map(([trackName, task], ti) => (
                                <div key={trackName} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: trackColors[rm.tracks.indexOf(trackName) % trackColors.length], flexShrink: 0 }} />
                                  <span style={{ color: "var(--gray-500)", fontSize: 11, minWidth: 50 }}>{trackName}</span>
                                  <span style={{ color: "var(--gray-700)" }}>{task as string}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
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
