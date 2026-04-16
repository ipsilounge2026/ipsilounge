"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSeniorNote, updateSeniorNoteReview } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface SeniorNoteDetail {
  id: string;
  user_id: string;
  senior_id: string | null;
  booking_id: string | null;
  session_number: number;
  session_timing: string | null;
  consultation_date: string;
  core_topics: { topic: string; progress_status?: string; student_reaction?: string; key_content?: string }[];
  optional_topics: { topic: string; covered?: boolean; note?: string }[];
  student_questions: string | null;
  senior_answers: string | null;
  student_mood: string | null;
  study_attitude: string | null;
  special_observations: string | null;
  action_items: { action: string; priority?: string }[];
  next_checkpoints: { checkpoint: string; status?: string }[];
  operator_notes: string | null;
  context_for_next: string | null;
  review_status: string;
  review_notes: string | null;
  sharing_settings: Record<string, boolean> | null;
  content_checklist: { label: string; checked: boolean }[] | null;
  is_visible_to_user: boolean;
  is_visible_to_next_senior: boolean;
  addenda: { content: string; author_name: string; created_at: string }[];
  prev_checkpoints: { checkpoint: string; status?: string }[] | null;
  created_at: string | null;
}

const DEFAULT_SHARING: Record<string, boolean> = {
  core_topics: true,
  optional_topics: true,
  student_questions: true,
  student_observation: true,
  action_items: true,
  next_checkpoints: true,
  context_for_next: true,
  operator_notes: false,
};

const SHARING_LABELS: Record<string, string> = {
  core_topics: "핵심 주제 진행 결과",
  optional_topics: "선택 주제 진행 결과",
  student_questions: "자유 질의응답",
  student_observation: "학생 상태 관찰",
  action_items: "실천 사항",
  next_checkpoints: "다음 상담 시 확인 필요 사항",
  context_for_next: "다음 상담사에게 전달할 맥락",
  operator_notes: "학원 운영자 공유 내용",
};

const DEFAULT_CONTENT_CHECKLIST = [
  { label: "특정 교사 실명 + 평가성 내용 없음", checked: false },
  { label: "특정 학생 실명 + 갈등 내용 없음", checked: false },
  { label: "가정사 구체 내용 없음", checked: false },
  { label: "부적절한 표현 없음", checked: false },
  { label: "프로그램 가이드라인 위반 없음", checked: false },
];

// ============================================================
// 민감정보 자동 탐지 (기획서 §7)
// D8: 심리/정신건강, F: 재정, G: 가족/가정사
// ============================================================
const D8_KEYWORDS = ["우울", "불안", "자해", "자살", "패닉", "공황", "번아웃", "상담센터", "정신과", "약물"];
const F_KEYWORDS = ["학원비", "등록금", "경제적", "가정 형편", "빚", "대출", "아르바이트로 학비"];
const G_KEYWORDS = ["이혼", "별거", "사별", "가정불화", "폭력", "학대", "입원"];

interface SensitiveCategoryConfig {
  key: "D8" | "F" | "G";
  label: string;
  description: string;
  keywords: string[];
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  markBg: string;
}

const SENSITIVE_CATEGORIES: SensitiveCategoryConfig[] = [
  {
    key: "D8",
    label: "D8 (심리/정신건강)",
    description: "심리 상태 관련",
    keywords: D8_KEYWORDS,
    badgeBg: "#FEE2E2",
    badgeBorder: "#FCA5A5",
    badgeText: "#991B1B",
    markBg: "#FCA5A5",
  },
  {
    key: "F",
    label: "F (재정)",
    description: "재정 관련",
    keywords: F_KEYWORDS,
    badgeBg: "#FED7AA",
    badgeBorder: "#FDBA74",
    badgeText: "#9A3412",
    markBg: "#FDBA74",
  },
  {
    key: "G",
    label: "G (가족)",
    description: "가족/가정사 관련",
    keywords: G_KEYWORDS,
    badgeBg: "#EDE9FE",
    badgeBorder: "#C4B5FD",
    badgeText: "#5B21B6",
    markBg: "#C4B5FD",
  },
];

function collectScanText(note: SeniorNoteDetail | null): string {
  if (!note) return "";
  const parts: string[] = [];
  if (note.special_observations) parts.push(note.special_observations);
  if (note.context_for_next) parts.push(note.context_for_next);
  if (note.operator_notes) parts.push(note.operator_notes);
  if (note.student_questions) parts.push(note.student_questions);
  if (note.senior_answers) parts.push(note.senior_answers);
  if (note.student_mood) parts.push(note.student_mood);
  if (note.study_attitude) parts.push(note.study_attitude);
  if (note.review_notes) parts.push(note.review_notes);
  (note.core_topics || []).forEach((t) => {
    if (t.key_content) parts.push(t.key_content);
    if (t.student_reaction) parts.push(t.student_reaction);
  });
  (note.optional_topics || []).forEach((t) => { if (t.note) parts.push(t.note); });
  (note.action_items || []).forEach((a) => { if (a.action) parts.push(a.action); });
  (note.next_checkpoints || []).forEach((c) => { if (c.checkpoint) parts.push(c.checkpoint); });
  (note.addenda || []).forEach((a) => { if (a.content) parts.push(a.content); });
  return parts.join("\n");
}

function detectKeywords(text: string, keywords: string[]): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const kw of keywords) {
    if (text.includes(kw) && !found.includes(kw)) {
      found.push(kw);
    }
  }
  return found;
}

// 본문 내 키워드를 <mark> 태그로 하이라이트 (React 엘리먼트 배열 반환)
function highlightKeywords(
  text: string | null | undefined,
  allMatches: { keyword: string; bg: string }[],
): React.ReactNode {
  if (!text) return text;
  if (allMatches.length === 0) return text;
  // 긴 키워드 우선 매칭
  const sorted = [...allMatches].sort((a, b) => b.keyword.length - a.keyword.length);
  const pattern = sorted.map((m) => m.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (!pattern) return text;
  const regex = new RegExp(`(${pattern})`, "g");
  const parts = text.split(regex);
  return parts.map((part, i) => {
    const match = sorted.find((m) => m.keyword === part);
    if (match) {
      return (
        <mark key={i} style={{ background: match.bg, padding: "1px 3px", borderRadius: 3 }}>
          {part}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function SeniorReviewDetailPage() {
  const router = useRouter();
  const params = useParams();
  const noteId = params.id as string;

  const [note, setNote] = useState<SeniorNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable state
  const [sharing, setSharing] = useState<Record<string, boolean>>(DEFAULT_SHARING);
  const [contentChecklist, setContentChecklist] = useState(DEFAULT_CONTENT_CHECKLIST);
  const [reviewNotes, setReviewNotes] = useState("");
  const [visibleToUser, setVisibleToUser] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadNote();
  }, [noteId]);

  const loadNote = async () => {
    try {
      const data = await getSeniorNote(noteId);
      setNote(data);
      setSharing(data.sharing_settings || DEFAULT_SHARING);
      setContentChecklist(data.content_checklist || DEFAULT_CONTENT_CHECKLIST);
      setReviewNotes(data.review_notes || "");
      setVisibleToUser(data.is_visible_to_user || false);
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReview = async (status: "reviewed" | "revision_requested") => {
    if (status === "reviewed") {
      const allChecked = contentChecklist.every(c => c.checked);
      if (!allChecked) {
        if (!confirm("내용 점검 항목이 모두 체크되지 않았습니다. 계속하시겠습니까?")) return;
      }
    }
    setSaving(true);
    try {
      await updateSeniorNoteReview(noteId, {
        review_status: status,
        review_notes: reviewNotes || undefined,
        sharing_settings: sharing,
        content_checklist: contentChecklist,
        is_visible_to_user: visibleToUser,
      });
      alert(status === "reviewed" ? "검토 완료 처리되었습니다." : "수정 요청을 보냈습니다.");
      router.push("/consultation/senior-review");
    } catch {
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const toggleSharing = (key: string) => {
    setSharing(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleChecklist = (idx: number) => {
    setContentChecklist(prev => prev.map((c, i) => i === idx ? { ...c, checked: !c.checked } : c));
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

  if (!note) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>기록을 찾을 수 없습니다</div>
        </main>
      </div>
    );
  }

  const sectionStyle = { background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20, marginBottom: 16 };
  const headerStyle = { fontSize: 14, fontWeight: 600 as const, color: "#374151", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 };

  // --- 민감정보 자동 탐지 ---
  const scanText = collectScanText(note);
  const detectionResults = SENSITIVE_CATEGORIES.map((cat) => ({
    ...cat,
    matches: detectKeywords(scanText, cat.keywords),
  }));
  const allMatchesForHighlight = detectionResults.flatMap((r) =>
    r.matches.map((kw) => ({ keyword: kw, bg: r.markBg }))
  );

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        {/* Header */}
        <div className="page-header">
          <div>
            <button onClick={() => router.push("/consultation/senior-review")} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6B7280", marginBottom: 8,
            }}>
              &larr; 검토 목록으로
            </button>
            <h1 style={{ margin: 0 }}>
              선배 상담 기록 검토
              <span style={{
                marginLeft: 10, padding: "3px 10px", borderRadius: 4, fontSize: 13, fontWeight: 400,
                color: note.review_status === "reviewed" ? "#065F46" : note.review_status === "revision_requested" ? "#991B1B" : "#92400E",
                background: note.review_status === "reviewed" ? "#D1FAE5" : note.review_status === "revision_requested" ? "#FEE2E2" : "#FEF3C7",
              }}>
                {note.review_status === "reviewed" ? "검토 완료" : note.review_status === "revision_requested" ? "수정 요청" : "검토 대기"}
              </span>
            </h1>
          </div>
        </div>

        {/* 기본 정보 */}
        <div style={sectionStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>세션</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{note.session_timing || `${note.session_number}회차`}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>상담일</div>
              <div style={{ fontSize: 14 }}>{note.consultation_date}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>작성일</div>
              <div style={{ fontSize: 14 }}>{note.created_at ? new Date(note.created_at).toLocaleString("ko-KR") : "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>상태</div>
              <div style={{ fontSize: 14 }}>{note.review_status}</div>
            </div>
          </div>
        </div>

        {/* 민감정보 자동 탐지 배지 (기획서 §7) */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            🔍 민감정보 자동 탐지
            <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 400 }}>
              (보조 도구입니다. 최종 판단은 검토자가 수행하세요)
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {detectionResults.map((r) => (
              <div
                key={r.key}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  background: r.matches.length > 0 ? r.badgeBg : "#F3F4F6",
                  border: `1px solid ${r.matches.length > 0 ? r.badgeBorder : "#E5E7EB"}`,
                  color: r.matches.length > 0 ? r.badgeText : "#6B7280",
                  fontWeight: r.matches.length > 0 ? 600 : 400,
                }}
              >
                {r.matches.length > 0 ? (
                  <>⚠️ {r.label} 의심 표현 감지: {r.matches.join(", ")}</>
                ) : (
                  <>✅ {r.label} 자동 감지 없음</>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          {/* Left: 기록 내용 */}
          <div>
            {/* 핵심 주제 */}
            {note.core_topics && note.core_topics.length > 0 && (
              <div style={sectionStyle}>
                <div style={headerStyle}>
                  <span style={{ color: sharing.core_topics ? "#10B981" : "#EF4444" }}>
                    {sharing.core_topics ? "●" : "○"}
                  </span>
                  핵심 주제 진행 결과
                </div>
                {note.core_topics.map((t, i) => (
                  <div key={i} style={{ padding: "8px 12px", background: "#F9FAFB", borderRadius: 6, marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {t.progress_status === "충분히 다룸" ? "✓" : t.progress_status === "간단히 다룸" ? "△" : "✗"}{" "}
                      {t.topic}: {t.progress_status || "미기록"}
                    </div>
                    {t.key_content && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>&quot;{t.key_content}&quot;</div>}
                    {t.student_reaction && <div style={{ fontSize: 12, color: "#6B7280" }}>학생 반응: {t.student_reaction}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* 선택 주제 */}
            {note.optional_topics && note.optional_topics.length > 0 && (
              <div style={sectionStyle}>
                <div style={headerStyle}>
                  <span style={{ color: sharing.optional_topics ? "#10B981" : "#EF4444" }}>
                    {sharing.optional_topics ? "●" : "○"}
                  </span>
                  선택 주제 진행 여부
                </div>
                {note.optional_topics.map((t, i) => (
                  <div key={i} style={{ padding: "6px 12px", background: "#F9FAFB", borderRadius: 6, marginBottom: 4, fontSize: 13 }}>
                    {t.covered ? "✓" : "✗"} {t.topic}
                    {t.note && <span style={{ color: "#6B7280" }}> — {t.note}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* 자유 질의응답 */}
            {(note.student_questions || note.senior_answers) && (
              <div style={sectionStyle}>
                <div style={headerStyle}>
                  <span style={{ color: sharing.student_questions ? "#10B981" : "#EF4444" }}>
                    {sharing.student_questions ? "●" : "○"}
                  </span>
                  자유 질의응답
                </div>
                {note.student_questions && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>학생 질문</div>
                    <div style={{ fontSize: 13, padding: "6px 0" }}>{note.student_questions}</div>
                  </div>
                )}
                {note.senior_answers && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>선배 답변</div>
                    <div style={{ fontSize: 13, padding: "6px 0" }}>{note.senior_answers}</div>
                  </div>
                )}
              </div>
            )}

            {/* 학생 상태 관찰 */}
            {(note.student_mood || note.study_attitude || note.special_observations) && (
              <div style={sectionStyle}>
                <div style={headerStyle}>
                  <span style={{ color: sharing.student_observation ? "#10B981" : "#EF4444" }}>
                    {sharing.student_observation ? "●" : "○"}
                  </span>
                  학생 상태 관찰
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  {note.student_mood && (
                    <div style={{ padding: "8px 12px", background: "#F9FAFB", borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>전반적 분위기</div>
                      <div style={{ fontSize: 14 }}>{note.student_mood}</div>
                    </div>
                  )}
                  {note.study_attitude && (
                    <div style={{ padding: "8px 12px", background: "#F9FAFB", borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>공부 태도</div>
                      <div style={{ fontSize: 14 }}>{note.study_attitude}</div>
                    </div>
                  )}
                </div>
                {note.special_observations && (
                  <div style={{ padding: "8px 12px", background: "#FEF3C7", borderRadius: 6, fontSize: 13 }}>
                    <strong>특이사항:</strong> {highlightKeywords(note.special_observations, allMatchesForHighlight)}
                  </div>
                )}
              </div>
            )}

            {/* 실천 사항 */}
            {note.action_items && note.action_items.length > 0 && (
              <div style={sectionStyle}>
                <div style={headerStyle}>
                  <span style={{ color: sharing.action_items ? "#10B981" : "#EF4444" }}>
                    {sharing.action_items ? "●" : "○"}
                  </span>
                  학생에게 제안한 실천 사항
                </div>
                {note.action_items.map((a, i) => (
                  <div key={i} style={{ padding: "6px 12px", background: "#F0FDF4", borderRadius: 6, marginBottom: 4, fontSize: 13 }}>
                    {i + 1}. {a.action}
                    {a.priority && <span style={{ marginLeft: 8, color: "#6B7280", fontSize: 11 }}>({a.priority})</span>}
                  </div>
                ))}
              </div>
            )}

            {/* 다음 상담 확인 사항 */}
            {note.next_checkpoints && note.next_checkpoints.length > 0 && (
              <div style={sectionStyle}>
                <div style={headerStyle}>
                  <span style={{ color: sharing.next_checkpoints ? "#10B981" : "#EF4444" }}>
                    {sharing.next_checkpoints ? "●" : "○"}
                  </span>
                  다음 상담 시 확인 필요 사항
                </div>
                {note.next_checkpoints.map((c, i) => (
                  <div key={i} style={{ padding: "6px 12px", background: "#F9FAFB", borderRadius: 6, marginBottom: 4, fontSize: 13 }}>
                    · {c.checkpoint}
                  </div>
                ))}
              </div>
            )}

            {/* 맥락 전달 */}
            {note.context_for_next && (
              <div style={sectionStyle}>
                <div style={headerStyle}>
                  <span style={{ color: sharing.context_for_next ? "#10B981" : "#EF4444" }}>
                    {sharing.context_for_next ? "●" : "○"}
                  </span>
                  다음 상담사에게 전달할 맥락
                </div>
                <div style={{ padding: 12, background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 13, lineHeight: 1.6 }}>
                  {highlightKeywords(note.context_for_next, allMatchesForHighlight)}
                </div>
              </div>
            )}

            {/* 운영자 메모 */}
            {note.operator_notes && (
              <div style={sectionStyle}>
                <div style={headerStyle}>
                  <span style={{ color: sharing.operator_notes ? "#10B981" : "#EF4444" }}>
                    {sharing.operator_notes ? "●" : "○"}
                  </span>
                  학원 운영자 공유 내용
                </div>
                <div style={{ padding: 12, background: "#FFF5F5", border: "1px solid #FCA5A5", borderRadius: 6, fontSize: 13 }}>
                  {highlightKeywords(note.operator_notes, allMatchesForHighlight)}
                </div>
              </div>
            )}

            {/* 추가 기록 */}
            {note.addenda && note.addenda.length > 0 && (
              <div style={sectionStyle}>
                <div style={headerStyle}>추가 기록</div>
                {note.addenda.map((a, i) => (
                  <div key={i} style={{ padding: 10, background: "#F9FAFB", borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
                    <div style={{ color: "#6B7280", fontSize: 11, marginBottom: 4 }}>{a.author_name} · {new Date(a.created_at).toLocaleString("ko-KR")}</div>
                    {a.content}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: 공유 설정 + 내용 점검 + 액션 */}
          <div>
            {/* 공유 범위 설정 */}
            <div style={{ ...sectionStyle, position: "sticky" as const, top: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 16 }}>공유 범위 설정</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
                체크된 항목은 상담사에게 공유됩니다.
              </div>
              {Object.entries(SHARING_LABELS).map(([key, label]) => (
                <label
                  key={key}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                    borderBottom: "1px solid #F3F4F6", cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sharing[key] ?? DEFAULT_SHARING[key]}
                    onChange={() => toggleSharing(key)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
                </label>
              ))}

              {/* 내용 점검 체크리스트 */}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: "2px solid #E5E7EB" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 12 }}>내용 점검</div>
                {contentChecklist.map((item, idx) => (
                  <label
                    key={idx}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                      borderBottom: "1px solid #F3F4F6", cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleChecklist(idx)}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 13, color: item.checked ? "#10B981" : "#374151" }}>
                      {item.checked ? "✓ " : ""}{item.label}
                    </span>
                  </label>
                ))}
              </div>

              {/* 학생 공개 설정 */}
              <div style={{ marginTop: 20, padding: 14, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={visibleToUser}
                    onChange={() => setVisibleToUser(!visibleToUser)}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#166534" }}>학생에게 공개</span>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                      체크 시 학생이 상담 기록 페이지에서 열람할 수 있습니다
                    </div>
                  </div>
                </label>
              </div>

              {/* 관리자 코멘트 */}
              <div style={{ marginTop: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                  관리자 코멘트 (선택)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="작성자에게 전달할 코멘트..."
                  style={{
                    width: "100%", minHeight: 80, padding: 10, border: "1px solid #D1D5DB",
                    borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit",
                  }}
                />
              </div>

              {/* 액션 버튼 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
                <button
                  onClick={() => handleSaveReview("reviewed")}
                  disabled={saving}
                  style={{
                    padding: "12px", borderRadius: 6, border: "none", width: "100%",
                    background: "#10B981", color: "white", fontSize: 14, fontWeight: 600,
                    cursor: "pointer", opacity: saving ? 0.5 : 1,
                  }}
                >
                  {saving ? "저장 중..." : "검토 완료"}
                </button>
                <button
                  onClick={() => handleSaveReview("revision_requested")}
                  disabled={saving}
                  style={{
                    padding: "12px", borderRadius: 6, border: "1px solid #EF4444", width: "100%",
                    background: "white", color: "#EF4444", fontSize: 14, fontWeight: 600,
                    cursor: "pointer", opacity: saving ? 0.5 : 1,
                  }}
                >
                  작성자에게 수정 요청
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
