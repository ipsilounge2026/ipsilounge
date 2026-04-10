"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { getConsultationNotes, createConsultationNote, addConsultationNoteAddendum, toggleConsultationNoteVisibility, getUsers } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

// =============================================
// 카테고리 · 학년 · 시점 · 주제 정의
// =============================================

const CATEGORIES: Record<string, string> = {
  academic: "학업 상담",
  record: "학생부 상담",
  admission: "학종 상담",
  mental: "심리 상담",
  other: "기타 상담",
};

const GRADES: Record<string, string> = {
  pre_high1: "예비고1",
  grade1: "고1",
  grade2: "고2",
  grade3: "고3",
  reexam: "재수생",
  other: "기타",
};

const TIMINGS: Record<string, string> = {
  T1: "고1-1학기 말 (7월)",
  T2: "고1-2학기 말 (2월)",
  T3: "고2-1학기 말 (7월)",
  T4: "고2-2학기 말 (2월)",
};

// 학년→시점 자동 매핑 (선택 가능한 시점 제한)
const GRADE_TIMINGS: Record<string, string[]> = {
  grade1: ["T1", "T2"],
  grade2: ["T3", "T4"],
};

// =============================================
// 카테고리별 주제 정의 (기획서 기반)
// =============================================

interface TopicDef {
  key: string;
  label: string;
  placeholder: string;
  rows?: number;
}

// --- 학업 상담: 시점별 핵심 주제 (고등학교 기획서 Section 3) ---
const ACADEMIC_TOPICS: Record<string, TopicDef[]> = {
  T1: [
    { key: "diagnosis", label: "1. 첫 학기 종합 진단 (내신 + 모의고사)", placeholder: "첫 내신 결과 해석, 내신 vs 모의고사 비교, 예상과 실제의 차이 및 원인 분석", rows: 4 },
    { key: "study_method", label: "2. 학습 방법 전환 진단 ★", placeholder: "중학교식 공부법 잔존 여부, 예습·복습·수업 활용도, 과목별 학습법 적절성, 성적 원인 분석", rows: 4 },
    { key: "weakness", label: "3. 과목별 취약 유형 진단", placeholder: "국어(문학/비문학), 수학(계산실수/고난도/단원), 영어(어휘/독해/시간), 구체적 처방", rows: 4 },
    { key: "condition", label: "4. 컨디션·심리 점검 + 여름방학 전략", placeholder: "심리·컨디션 상태, 번아웃 여부, 수면 패턴, 여름방학 학습 계획", rows: 3 },
  ],
  T2: [
    { key: "yearly_analysis", label: "1. 1년치 성적 종합 분석", placeholder: "1학기→2학기 내신 추이, 모의고사 4회 추이, 내신-모의 Gap 변화, 1년간 패턴 해석", rows: 4 },
    { key: "elective_prep", label: "2. 선택과목 학습 준비도 점검 ★", placeholder: "확정된 선택과목 목록, 각 과목 준비 수준, 진로·대학 권장과목 정합성, 내신 유불리 시뮬", rows: 4 },
    { key: "study_optimize", label: "3. 과목별 학습법 최적화", placeholder: "T1 조정 학습법 효과 검증, 안 바뀐 습관, 학습법 재조정, 만족도와 실제 성적 매칭", rows: 4 },
    { key: "admission_explore", label: "4. 전형 방향 초기 탐색", placeholder: "수시·정시 가능성 탐색, 내신형/수능형/균형형 판단, 주력 전형 정합성", rows: 3 },
    { key: "winter_plan", label: "5. 겨울방학 로드맵 + 고2 진입 전략", placeholder: "선택과목 선행 계획, 수능 기초 시작 여부, 누적 피로 관리, 고2 진입 체크리스트", rows: 3 },
  ],
  T3: [
    { key: "elective_result", label: "1. 선택과목 첫 성적 분석", placeholder: "예상 vs 실제 차이, 선택과목별 경쟁 강도, 변경 가능성 검토, 목표 대학 영향", rows: 4 },
    { key: "admission_direction", label: "2. 수시 vs 정시 방향 탐색 ★", placeholder: "1.5년치 내신+모의 비교, 내신형/수능형/균형형 판단, 방향 탐색 (확정 아님)", rows: 4 },
    { key: "csat_minimum", label: "3. 수능 최저 시뮬레이션", placeholder: "목표 대학 수능 최저 기준, 충족 가능성, 부족 영역 식별", rows: 3 },
    { key: "study_final", label: "4. 과목별 학습법 최종 조정", placeholder: "학습법 재검증, 시험 전략 점검, 내신·수능 비율 재조정", rows: 3 },
    { key: "summer_plan", label: "5. 여름방학 집중 전략", placeholder: "방향에 맞춘 여름방학 계획, 취약 영역 보강, 체력·멘탈 관리", rows: 3 },
  ],
  T4: [
    { key: "two_year_diagnosis", label: "1. 2년치 종합 진단 ★", placeholder: "2년간 내신 패턴, 모의고사 영역별 추이, 내신형/수능형/균형형 확정, 학습법 안정화 여부", rows: 4 },
    { key: "admission_final", label: "2. 수시 vs 정시 최종 결정 ★", placeholder: "T3 탐색 방향을 확정, 2년치 데이터 기반 최종 판단, 학생 본인 의사 반영", rows: 4 },
    { key: "college_range", label: "3. 진학 가능성 확인", placeholder: "현실적 대학 수준 (라인 단위), 도전/안전 라인, 수능 최저 충족 시뮬", rows: 3 },
    { key: "g3_roadmap", label: "4. 고3 학습 로드맵 확정 ★", placeholder: "월 단위 학습 계획, 주간 시간 배분, 과목별 내신·수능 대비 방법, 모의고사 활용 전략", rows: 4 },
    { key: "health_mental", label: "5. 체력·멘탈 관리 + 겨울방학 전략", placeholder: "고3 체력 관리 계획, 번아웃 대비 루틴, 겨울방학 활용 전략, 생활 리듬 전환", rows: 3 },
  ],
};

// 예비고1 학업 상담 주제
const ACADEMIC_PRE_HIGH1: TopicDef[] = [
  { key: "school_strategy", label: "1. 고등학교 지원 전략", placeholder: "희망 고교 유형, 지원 전략, 선택 기준 분석", rows: 3 },
  { key: "middle_grades", label: "2. 중학교 성적 분석", placeholder: "과목별 성적 추이, 강점/약점 과목, 고등학교 대비 준비 수준", rows: 4 },
  { key: "study_habits", label: "3. 학습 습관 진단", placeholder: "주간 스케줄, 자기주도 학습 비율, 오답 관리, 집중 시간대", rows: 3 },
  { key: "subject_readiness", label: "4. 과목별 고등 준비율", placeholder: "수학(기초/진도), 영어(어휘/독해), 국어(문학/비문학), 과학 선행 상태", rows: 4 },
  { key: "career_direction", label: "5. 진로 & 대입 방향성", placeholder: "관심 진로·직업 분야, 대입 전형 이해도, 고등학교 준비 우선순위", rows: 3 },
];

// 고3/재수생 학업 상담 주제
const ACADEMIC_GRADE3: TopicDef[] = [
  { key: "grade_analysis", label: "1. 성적 현황 분석", placeholder: "내신·모의고사 현황, 영역별 강점/약점, 최근 추이", rows: 4 },
  { key: "admission_strategy", label: "2. 수시/정시 전략 점검", placeholder: "지원 전형·대학·학과, 수능 최저 충족 여부, 6장 카드 구성", rows: 4 },
  { key: "study_plan", label: "3. 학습 계획 점검", placeholder: "월간/주간 학습 계획, 과목별 시간 배분, 모의고사 활용", rows: 3 },
  { key: "weakness_plan", label: "4. 취약 영역 보완 전략", placeholder: "취약 과목/유형별 구체적 보완 방법, 실행 계획", rows: 3 },
  { key: "condition", label: "5. 컨디션·멘탈 관리", placeholder: "스트레스 수준, 수면·체력, 번아웃 대비, 시험 불안", rows: 3 },
];

// --- 학생부 상담 주제 ---
const RECORD_TOPICS: TopicDef[] = [
  { key: "grade_analysis", label: "1. 내신 성적 분석", placeholder: "학기별 등급 추이, 주요교과/전교과, 원점수·성취도 맥락, 교과 이수 충실도", rows: 4 },
  { key: "setuek", label: "2. 세특 분석", placeholder: "과목별 세특 평가, 탐구 동기·과정·결과, 교과연계성, 강점/보완점", rows: 4 },
  { key: "changche", label: "3. 창체 분석", placeholder: "자율/동아리/진로 활동 평가, 분량 활용도, 성장 추이, 강점/보완점", rows: 4 },
  { key: "haengtuk", label: "4. 행특 분석", placeholder: "학년별 행동특성 평가, 구체성, 성장 변화, 인성·공동체 역량", rows: 3 },
  { key: "comprehensive", label: "5. 종합 경쟁력 평가", placeholder: "종합등급, 영역 간 연계성, 성장 스토리, 핵심 강점/보완 영역", rows: 4 },
  { key: "strategy", label: "6. 보완 전략 및 실행 계획", placeholder: "역량별 보완법, 우선순위, 구체적 실행 항목, 다음 학기 목표", rows: 4 },
];

// --- 학종 상담 주제 ---
const ADMISSION_TOPICS: TopicDef[] = [
  { key: "type_analysis", label: "1. 전형 분석 및 전략", placeholder: "교과전형/학종/논술 적합도 분석, 주력 전형 선정 근거, 전형별 경쟁력", rows: 4 },
  { key: "university_review", label: "2. 지원 대학·학과 검토", placeholder: "지원 대학 리스트, 입결 비교, 안정/적정/소신 분류, 수능 최저 충족", rows: 4 },
  { key: "extracurricular", label: "3. 비교과 활동 전략", placeholder: "세특·창체 활용 전략, 활동 보완 필요 사항, 학년별 계획", rows: 4 },
  { key: "self_intro", label: "4. 자기소개서·면접 준비", placeholder: "자소서 방향, 핵심 소재, 면접 예상 질문, 준비 방법", rows: 3 },
  { key: "overall", label: "5. 종합 의견 및 실행 계획", placeholder: "전체 전략 요약, 시기별 실행 계획, 우선 과제", rows: 3 },
];

// --- 심리 상담 주제 ---
const MENTAL_TOPICS: TopicDef[] = [
  { key: "status", label: "1. 심리 상태 파악", placeholder: "전반적 정서 상태, 스트레스 수준, 수면·식사·체력 상태", rows: 3 },
  { key: "concern", label: "2. 주요 고민·스트레스 요인", placeholder: "학업 스트레스, 친구/가족 관계, 진로 불안, 시험 불안, 자존감 등", rows: 4 },
  { key: "session_content", label: "3. 상담 진행 내용", placeholder: "상담 과정에서 다룬 주요 내용, 학생 반응, 인사이트", rows: 4 },
  { key: "advice", label: "4. 조언 및 권장 조치", placeholder: "제공한 조언, 권장 활동, 전문 기관 연계 필요 여부", rows: 3 },
  { key: "followup", label: "5. 추적 관찰 사항", placeholder: "지속 관찰 필요 항목, 다음 상담 시 확인 사항, 위기 징후 여부", rows: 3 },
];

// 카테고리+학년+시점 → 주제 목록 반환
function getTopicsForContext(category: string, grade: string, timing: string): TopicDef[] {
  if (category === "record") return RECORD_TOPICS;
  if (category === "admission") return ADMISSION_TOPICS;
  if (category === "mental") return MENTAL_TOPICS;
  if (category === "other") return [];

  // 학업 상담
  if (grade === "pre_high1") return ACADEMIC_PRE_HIGH1;
  if (grade === "grade3" || grade === "reexam") return ACADEMIC_GRADE3;
  if (timing && ACADEMIC_TOPICS[timing]) return ACADEMIC_TOPICS[timing];
  return [];
}

// =============================================
// 인터페이스
// =============================================

interface Addendum { content: string; admin_id: string; admin_name: string; created_at: string; }
interface Note {
  id: string; user_id: string; booking_id: string | null; admin_id: string | null;
  category: string; consultation_date: string; student_grade: string | null;
  timing?: string | null; goals: string | null; main_content: string;
  advice_given: string | null; next_steps: string | null; next_topic: string | null;
  topic_notes?: Record<string, string> | null;
  admin_private_notes: string | null; is_visible_to_user: boolean;
  addenda: Addendum[]; created_at: string;
}
interface UserItem { id: string; name: string; email: string; }

// 레거시 카테고리 표시
const LEGACY_CATEGORIES: Record<string, string> = {
  analysis: "학생부분석", strategy: "입시전략", school_life: "학교생활",
  study_method: "공부법", career: "진로", mental: "심리정서", other: "기타",
};
function displayCategory(val: string): string {
  return CATEGORIES[val] || LEGACY_CATEGORIES[val] || val;
}
function displayGrade(val: string | null): string {
  return val ? (GRADES[val] || val) : "";
}

// =============================================
// 메인 컴포넌트
// =============================================

function ConsultationNotesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preUserId = searchParams.get("user_id") || "";
  const preBookingId = searchParams.get("booking_id") || "";
  const preUserName = searchParams.get("user_name") || "";
  const preDate = searchParams.get("date") || "";

  const [notes, setNotes] = useState<Note[]>([]);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(!!preUserId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addendumNoteId, setAddendumNoteId] = useState<string | null>(null);
  const [addendumContent, setAddendumContent] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserItem[]>([]);
  const [searching, setSearching] = useState(false);

  const [form, setForm] = useState({
    user_id: preUserId,
    user_name: preUserName,
    booking_id: preBookingId || "",
    category: "academic",
    consultation_date: preDate || new Date().toISOString().split("T")[0],
    student_grade: "",
    timing: "",
    goals: "",
    main_content: "",
    next_steps: "",
    next_topic: "",
    topic_notes: {} as Record<string, string>,
    admin_private_notes: "",
    is_visible_to_user: false,
  });

  // 현재 컨텍스트의 주제 목록
  const currentTopics = getTopicsForContext(form.category, form.student_grade, form.timing);
  // 학업 상담에서 시점 선택 필요 여부
  const needsTiming = form.category === "academic" && (form.student_grade === "grade1" || form.student_grade === "grade2");
  const availableTimings = GRADE_TIMINGS[form.student_grade] || [];

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadNotes();
  }, []);

  // 카테고리 변경 시 topic_notes 초기화
  useEffect(() => {
    setForm(prev => ({ ...prev, topic_notes: {} }));
  }, [form.category, form.student_grade, form.timing]);

  const loadNotes = async () => {
    try { const data = await getConsultationNotes(); setNotes(data); } catch {}
  };

  const handleUserSearch = async () => {
    if (!userSearch.trim()) return;
    setSearching(true);
    try {
      const res = await getUsers(1, userSearch.trim());
      setUserResults(res.items?.map((u: any) => ({ id: u.id, name: u.name, email: u.email })) || []);
    } catch { setUserResults([]); }
    setSearching(false);
  };

  const selectUser = (user: UserItem) => {
    setForm(prev => ({ ...prev, user_id: user.id, user_name: `${user.name} (${user.email})` }));
    setUserResults([]);
    setUserSearch("");
  };

  const resetForm = () => {
    setForm({
      user_id: "", user_name: "", booking_id: "", category: "academic",
      consultation_date: new Date().toISOString().split("T")[0],
      student_grade: "", timing: "", goals: "", main_content: "",
      next_steps: "", next_topic: "", topic_notes: {},
      admin_private_notes: "", is_visible_to_user: false,
    });
    setShowForm(false);
  };

  const updateTopicNote = (key: string, value: string) => {
    setForm(prev => ({
      ...prev,
      topic_notes: { ...prev.topic_notes, [key]: value },
    }));
  };

  const handleSubmit = async () => {
    if (!form.user_id) { setMessage("대상 학생을 선택해주세요"); return; }

    // 주제 기록 또는 자유 기록이 하나라도 있는지 확인
    const hasTopicNotes = Object.values(form.topic_notes).some(v => v.trim());
    const hasMainContent = form.main_content.trim();
    if (!hasTopicNotes && !hasMainContent) {
      setMessage("상담 내용을 하나 이상 작성해주세요");
      return;
    }

    try {
      const payload: any = {
        user_id: form.user_id,
        booking_id: form.booking_id || undefined,
        category: form.category,
        consultation_date: form.consultation_date,
        student_grade: form.student_grade || undefined,
        timing: form.timing || undefined,
        goals: form.goals || undefined,
        main_content: form.main_content || "",
        next_steps: form.next_steps || undefined,
        next_topic: form.next_topic || undefined,
        topic_notes: hasTopicNotes ? form.topic_notes : undefined,
        admin_private_notes: form.admin_private_notes || undefined,
        is_visible_to_user: form.is_visible_to_user,
      };

      await createConsultationNote(payload);
      setMessage("상담 기록이 작성되었습니다");
      resetForm();
      loadNotes();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleVisibilityToggle = async (note: Note) => {
    try {
      await toggleConsultationNoteVisibility(note.id);
      setMessage(note.is_visible_to_user ? "학생에게 비공개로 변경" : "학생에게 공개로 변경");
      loadNotes();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleAddAddendum = async (noteId: string) => {
    if (!addendumContent.trim()) { setMessage("추가 기록 내용을 입력하세요"); return; }
    try {
      await addConsultationNoteAddendum(noteId, addendumContent.trim());
      setMessage("추가 기록이 작성되었습니다");
      setAddendumNoteId(null);
      setAddendumContent("");
      loadNotes();
    } catch (err: any) { setMessage(err.message); }
  };

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch { return iso; }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>상담 기록 관리</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/consultation" className="btn btn-outline">상담 예약 관리</Link>
            <button className="btn btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}>
              {showForm ? "취소" : "새 기록 작성"}
            </button>
          </div>
        </div>

        {/* 상담 기록 불변 정책 안내 */}
        <div style={{ padding: "10px 16px", background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#92400e" }}>
          상담 기록은 작성 후 수정·삭제할 수 없습니다. 보충이 필요한 경우 &quot;추가 기록&quot;을 작성하세요. 모든 작성 이력이 보존됩니다.
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
            <button onClick={() => setMessage("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer" }}>x</button>
          </div>
        )}

        {/* ===== 기록 작성 폼 ===== */}
        {showForm && (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ marginBottom: 16 }}>상담 기록 작성</h3>

            {/* 학생 선택 */}
            {!form.user_id ? (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>대상 학생 검색</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="form-control" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleUserSearch()} placeholder="이름 또는 이메일" style={{ flex: 1 }} />
                  <button className="btn btn-primary" onClick={handleUserSearch} disabled={searching}>검색</button>
                </div>
                {userResults.length > 0 && (
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginTop: 8, overflow: "hidden" }}>
                    {userResults.map(u => (
                      <div key={u.id} onClick={() => selectUser(u)} style={{ padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                        onMouseOver={e => (e.currentTarget.style.background = "#eff6ff")}
                        onMouseOut={e => (e.currentTarget.style.background = "")}>
                        <strong>{u.name}</strong> <span style={{ color: "#6b7280", fontSize: 13 }}>{u.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 12, background: "#eff6ff", borderRadius: 8, marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
                <span><strong>대상:</strong> {form.user_name}</span>
                <button onClick={() => setForm(prev => ({ ...prev, user_id: "", user_name: "" }))}
                  style={{ fontSize: 13, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>변경</button>
              </div>
            )}

            {/* 카테고리 + 상담일 + 학년 */}
            <div style={{ display: "grid", gridTemplateColumns: needsTiming ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div className="form-group">
                <label>상담 카테고리 *</label>
                <select className="form-control" value={form.category}
                  onChange={e => setForm(prev => ({ ...prev, category: e.target.value, timing: "", topic_notes: {} }))}>
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>상담일</label>
                <input className="form-control" type="date" value={form.consultation_date}
                  onChange={e => setForm(prev => ({ ...prev, consultation_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>학년</label>
                <select className="form-control" value={form.student_grade}
                  onChange={e => setForm(prev => ({ ...prev, student_grade: e.target.value, timing: "", topic_notes: {} }))}>
                  <option value="">선택</option>
                  {Object.entries(GRADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {needsTiming && (
                <div className="form-group">
                  <label>상담 시점 *</label>
                  <select className="form-control" value={form.timing}
                    onChange={e => setForm(prev => ({ ...prev, timing: e.target.value, topic_notes: {} }))}>
                    <option value="">선택</option>
                    {availableTimings.map(t => <option key={t} value={t}>{TIMINGS[t]}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* 카테고리 안내 배너 */}
            {form.category === "academic" && !form.student_grade && (
              <div style={{ padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#1e40af" }}>
                학년을 선택하면 해당 시점에 맞는 상담 주제가 표시됩니다.
              </div>
            )}
            {needsTiming && !form.timing && (
              <div style={{ padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#1e40af" }}>
                상담 시점을 선택하면 기획서 기반 핵심 주제가 표시됩니다.
              </div>
            )}

            {/* 상담 목표/요청사항 */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>상담 목표/요청사항</label>
              <textarea className="form-control" rows={2} value={form.goals}
                onChange={e => setForm(prev => ({ ...prev, goals: e.target.value }))}
                placeholder="학생/학부모가 요청한 내용" />
            </div>

            {/* 주제별 기록 필드 */}
            {currentTopics.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1e40af", marginBottom: 8, paddingBottom: 8, borderBottom: "2px solid #3b82f6" }}>
                  {CATEGORIES[form.category]} — {form.timing ? TIMINGS[form.timing] : displayGrade(form.student_grade) || "주제별 기록"}
                </div>
                {currentTopics.map(topic => (
                  <div key={topic.key} className="form-group" style={{ marginBottom: 12 }}>
                    <label style={{ fontWeight: 600 }}>{topic.label}</label>
                    <textarea
                      className="form-control"
                      rows={topic.rows || 3}
                      value={form.topic_notes[topic.key] || ""}
                      onChange={e => updateTopicNote(topic.key, e.target.value)}
                      placeholder={topic.placeholder}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* 기타/자유 기록 */}
            {(form.category === "other" || currentTopics.length === 0) && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>상담 내용 *</label>
                <textarea className="form-control" rows={5} value={form.main_content}
                  onChange={e => setForm(prev => ({ ...prev, main_content: e.target.value }))}
                  placeholder="주요 상담 내용을 기록하세요" />
              </div>
            )}

            {/* 추가 메모 (자유 기록, 주제 외 내용) */}
            {currentTopics.length > 0 && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>추가 메모 (주제 외 내용)</label>
                <textarea className="form-control" rows={2} value={form.main_content}
                  onChange={e => setForm(prev => ({ ...prev, main_content: e.target.value }))}
                  placeholder="주제에 포함되지 않는 추가 내용이 있으면 기록하세요" />
              </div>
            )}

            {/* 실행 계획 + 다음 상담 주제 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div className="form-group">
                <label>실행 계획 (액션 플랜)</label>
                <textarea className="form-control" rows={2} value={form.next_steps}
                  onChange={e => setForm(prev => ({ ...prev, next_steps: e.target.value }))}
                  placeholder="학생이 실행할 구체적 과제" />
              </div>
              <div className="form-group">
                <label>다음 상담 주제</label>
                <textarea className="form-control" rows={2} value={form.next_topic}
                  onChange={e => setForm(prev => ({ ...prev, next_topic: e.target.value }))}
                  placeholder="다음 상담에서 다룰 주제" />
              </div>
            </div>

            {/* 관리자 메모 */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>관리자 메모 (학생 비공개)</label>
              <textarea className="form-control" rows={2} value={form.admin_private_notes}
                onChange={e => setForm(prev => ({ ...prev, admin_private_notes: e.target.value }))}
                placeholder="내부용 메모 (학생에게 보이지 않음)" />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={form.is_visible_to_user}
                  onChange={e => setForm(prev => ({ ...prev, is_visible_to_user: e.target.checked }))} />
                학생에게 공개
              </label>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>체크하면 학생의 &quot;상담 기록&quot; 페이지에서 볼 수 있습니다</span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSubmit}>기록 저장</button>
              <button className="btn btn-outline" onClick={resetForm}>취소</button>
            </div>
          </div>
        )}

        {/* ===== 기록 목록 ===== */}
        <div style={{ fontSize: 14, color: "var(--gray-600)", marginBottom: 12 }}>총 {notes.length}건의 상담 기록</div>
        {notes.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--gray-500)" }}>아직 작성된 상담 기록이 없습니다</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {notes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                expanded={expandedId === note.id}
                onToggle={() => setExpandedId(expandedId === note.id ? null : note.id)}
                onVisibilityToggle={() => handleVisibilityToggle(note)}
                addendumActive={addendumNoteId === note.id}
                addendumContent={addendumContent}
                onAddendumStart={() => { setAddendumNoteId(note.id); setAddendumContent(""); }}
                onAddendumCancel={() => { setAddendumNoteId(null); setAddendumContent(""); }}
                onAddendumChange={setAddendumContent}
                onAddendumSubmit={() => handleAddAddendum(note.id)}
                formatDateTime={formatDateTime}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// =============================================
// 기록 카드 컴포넌트
// =============================================

function NoteCard({ note, expanded, onToggle, onVisibilityToggle,
  addendumActive, addendumContent, onAddendumStart, onAddendumCancel, onAddendumChange, onAddendumSubmit,
  formatDateTime,
}: {
  note: Note; expanded: boolean; onToggle: () => void; onVisibilityToggle: () => void;
  addendumActive: boolean; addendumContent: string;
  onAddendumStart: () => void; onAddendumCancel: () => void;
  onAddendumChange: (v: string) => void; onAddendumSubmit: () => void;
  formatDateTime: (iso: string) => string;
}) {
  // 해당 기록의 주제 목록 복원 (표시용)
  const noteTopics = getTopicsForContext(note.category, note.student_grade || "", note.timing || "");

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
      {/* 요약 행 */}
      <div
        style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: expanded ? "#f9fafb" : "#fff" }}
        onClick={onToggle}
      >
        <span style={{ fontSize: 13, color: "#6b7280", minWidth: 90 }}>{note.consultation_date}</span>
        <span className="badge badge-processing" style={{ fontSize: 12 }}>{displayCategory(note.category)}</span>
        {displayGrade(note.student_grade) && <span style={{ fontSize: 12, color: "#6b7280" }}>{displayGrade(note.student_grade)}</span>}
        {note.timing && <span style={{ fontSize: 11, color: "#7c3aed", background: "#f5f3ff", padding: "2px 6px", borderRadius: 4 }}>{note.timing}</span>}
        <span style={{ flex: 1, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {/* 주제별 기록이 있으면 첫 번째 주제 미리보기, 없으면 main_content */}
          {note.topic_notes && Object.keys(note.topic_notes).length > 0
            ? Object.values(note.topic_notes).find(v => v)?.slice(0, 80) + "..."
            : (note.main_content?.slice(0, 80) || "") + (note.main_content && note.main_content.length > 80 ? "..." : "")
          }
        </span>
        {(note.addenda?.length || 0) > 0 && (
          <span style={{ fontSize: 11, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 10 }}>
            +{note.addenda.length}건 추가
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onVisibilityToggle(); }}
          className={`btn btn-sm ${note.is_visible_to_user ? "btn-success" : ""}`}
          style={note.is_visible_to_user ? {} : { background: "#f3f4f6", color: "#9ca3af" }}
        >
          {note.is_visible_to_user ? "공개" : "비공개"}
        </button>
        <span style={{ fontSize: 16, color: "#9ca3af" }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* 상세 내용 */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid #e5e7eb" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "16px 0" }}>
            {note.goals && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>상담 목표/요청사항</div>
                <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{note.goals}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>작성일시</div>
              <div style={{ fontSize: 14 }}>{formatDateTime(note.created_at)}</div>
            </div>
          </div>

          {/* 주제별 기록 표시 */}
          {note.topic_notes && Object.keys(note.topic_notes).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e40af", marginBottom: 8, paddingBottom: 6, borderBottom: "2px solid #93c5fd" }}>
                주제별 상담 기록
              </div>
              {noteTopics.length > 0 ? (
                noteTopics.map(topic => {
                  const content = note.topic_notes?.[topic.key];
                  if (!content) return null;
                  return (
                    <div key={topic.key} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>{topic.label}</div>
                      <div style={{ fontSize: 14, whiteSpace: "pre-wrap", background: "#fff", padding: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}>{content}</div>
                    </div>
                  );
                })
              ) : (
                /* 레거시 또는 주제 정의 불일치 시 raw 표시 */
                Object.entries(note.topic_notes).map(([key, val]) => (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>{key}</div>
                    <div style={{ fontSize: 14, whiteSpace: "pre-wrap", background: "#fff", padding: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}>{val as string}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 기존 main_content (레거시 또는 추가 메모) */}
          {note.main_content && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                {note.topic_notes && Object.keys(note.topic_notes).length > 0 ? "추가 메모" : "상담 내용"}
              </div>
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap", background: "#fff", padding: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}>{note.main_content}</div>
            </div>
          )}

          {/* 실행 계획 / 다음 상담 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {note.next_steps && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>실행 계획</div>
                <div style={{ fontSize: 14, whiteSpace: "pre-wrap", background: "#fff", padding: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}>{note.next_steps}</div>
              </div>
            )}
            {note.next_topic && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>다음 상담 주제</div>
                <div style={{ fontSize: 14, whiteSpace: "pre-wrap", background: "#fff", padding: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}>{note.next_topic}</div>
              </div>
            )}
          </div>

          {note.admin_private_notes && (
            <div style={{ marginBottom: 12, background: "#fdf2f8", padding: 12, borderRadius: 6, border: "1px solid #f9a8d4" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#9d174d", marginBottom: 4 }}>관리자 메모 (비공개)</div>
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap", color: "#831843" }}>{note.admin_private_notes}</div>
            </div>
          )}

          {/* 추가 기록 이력 */}
          {note.addenda && note.addenda.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8", marginBottom: 8 }}>추가 기록 ({note.addenda.length}건)</div>
              {note.addenda.map((a, i) => (
                <div key={i} style={{ background: "#eff6ff", padding: 12, borderRadius: 6, marginBottom: 6, borderLeft: "3px solid #3b82f6" }}>
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{a.admin_name} · {formatDateTime(a.created_at)}</div>
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{a.content}</div>
                </div>
              ))}
            </div>
          )}

          {/* 추가 기록 작성 */}
          {addendumActive ? (
            <div style={{ background: "#f0fdf4", padding: 12, borderRadius: 6, border: "1px solid #86efac" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#166534", marginBottom: 8 }}>추가 기록 작성</div>
              <textarea className="form-control" rows={3} value={addendumContent} onChange={e => onAddendumChange(e.target.value)}
                placeholder="보충할 내용을 작성하세요. 기존 기록은 수정되지 않고, 이 내용이 추가됩니다." style={{ marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={onAddendumSubmit}>추가 저장</button>
                <button className="btn btn-outline btn-sm" onClick={onAddendumCancel}>취소</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-outline btn-sm" onClick={onAddendumStart} style={{ color: "#2563eb", borderColor: "#93c5fd" }}>
              + 추가 기록 작성
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================
// 페이지
// =============================================

export default function ConsultationNotesPage() {
  return (
    <Suspense fallback={<div className="admin-layout"><Sidebar /><main className="admin-main"><p>로딩 중...</p></main></div>}>
      <ConsultationNotesInner />
    </Suspense>
  );
}
