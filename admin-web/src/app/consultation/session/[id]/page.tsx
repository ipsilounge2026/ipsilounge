"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { getBookingDetail, updateBookingStatus, createConsultationNote, getCounselorSummaryForSenior, getSeniorNotesForCounselor, getSurveyDelta, createSeniorNote, getSeniorPrevCheckpoints, getGuidebooks } from "@/lib/api";
import { isLoggedIn, getAdminInfo } from "@/lib/auth";
import { SENIOR_TIMING_TOPICS } from "@/lib/senior-topics";

interface BookingDetail {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone: string | null;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  admin_name: string | null;
  type: string;
  memo: string | null;
  status: string;
  surveys: {
    id: string;
    survey_type: string;
    timing: string | null;
    status: string;
    submitted_at: string | null;
    // V3 §4-8-1: 자동 분석 검증 상태 (pass/repaired/warn/blocked/null)
    analysis_status?: string | null;
  }[];
}

interface CheckItem {
  id: string;
  label: string;
  checked: boolean;
  category: string;
  isOptional?: boolean;
  detail?: string;
}

// ── 시점별 상담 주제 가이드 (T1~T4) ──

interface TopicGuideItem {
  id: string;
  label: string;
  category: string;
  isOptional?: boolean;
  detail?: string;
}

const COMMON_INTRO: TopicGuideItem[] = [
  { id: "intro1", label: "학생 기본 정보 확인 (이름, 학교, 학년)", category: "도입" },
  { id: "intro2", label: "상담 목표/요청사항 파악", category: "도입" },
  { id: "intro3", label: "설문 답변 리뷰 (주요 항목)", category: "도입" },
];

const COMMON_CLOSING: TopicGuideItem[] = [
  { id: "close1", label: "액션 플랜 수립 (과목별 + 습관 트랙)", category: "마무리" },
  { id: "close2", label: "다음 상담 일정 안내", category: "마무리" },
  { id: "close3", label: "상담 내용 요약/정리", category: "마무리" },
];

const TIMING_TOPICS: Record<string, TopicGuideItem[]> = {
  T1: [
    // 핵심 주제 4개
    { id: "t1c1", label: "첫 학기 종합 진단 (내신 + 모의고사 결합 분석)", category: "핵심 주제", detail: "첫 내신 결과를 목표 대비 해석, 내신 vs 모의 비교 (유형 판정), 예상과 실제 차이 원인 분석" },
    { id: "t1c2", label: "학습 방법 전환 진단 ★", category: "핵심 주제", detail: "중학교식 공부법 잔존 여부, 예습·복습·수업 활용도 점검, 과목별 학습법 적절성 평가" },
    { id: "t1c3", label: "과목별 취약 유형 정밀 진단", category: "핵심 주제", detail: "국어: 문학/비문학, 수학: 계산 실수/고난도/단원, 영어: 어휘·독해·시간, 구체적 처방 수준까지" },
    { id: "t1c4", label: "컨디션·심리 점검 + 여름방학 전략", category: "핵심 주제", detail: "D8 기반 심리·컨디션, 첫 학기 번아웃, 수면 패턴, 여름방학 학습 계획" },
    // 선택 주제 3개
    { id: "t1o1", label: "자기주도 비율 조정 (학원 의존도 높을 경우)", category: "선택 주제", isOptional: true },
    { id: "t1o2", label: "오답 관리 루틴 재설계", category: "선택 주제", isOptional: true },
    { id: "t1o3", label: "진로 탐색 심화 (미정 시)", category: "선택 주제", isOptional: true },
  ],
  T2: [
    // 핵심 주제 5개
    { id: "t2c1", label: "1년치 성적 데이터 종합 분석", category: "핵심 주제", detail: "1학기→2학기 내신 추이, 모의 4회 추이, 내신-모의 Gap 변화, 1년간의 패턴 해석" },
    { id: "t2c2", label: "확정된 선택과목 학습 준비도 점검 ★", category: "핵심 주제", detail: "선택과목 목록 확인, 준비 수준 점검, 진로·권장과목 정합성, 수능 선택과목 연계" },
    { id: "t2c3", label: "과목별 학습법 최적화 (1년 데이터 검증)", category: "핵심 주제", detail: "T1 학습법 효과 검증, 안 바뀐 습관 체크, D7 기반 재조정" },
    { id: "t2c4", label: "전형 방향 초기 탐색", category: "핵심 주제", detail: "수시·정시 가능성 탐색, 내신형/수능형/균형형 판단, E3 주력 전형 vs 실제 성적" },
    { id: "t2c5", label: "겨울방학 로드맵 + 고2 진입 전략", category: "핵심 주제", detail: "선택과목 선행 계획, 수능 기초 시작 여부, 피로 관리" },
    // 선택 주제 3개
    { id: "t2o1", label: "내신-모의 Gap 심화 분석", category: "선택 주제", isOptional: true },
    { id: "t2o2", label: "학부모 소통 방법 (갈등 시)", category: "선택 주제", isOptional: true },
    { id: "t2o3", label: "진로 구체화 심화 (방향 없을 경우)", category: "선택 주제", isOptional: true },
  ],
  T3: [
    // 핵심 주제 5개
    { id: "t3c1", label: "선택과목 첫 성적 분석", category: "핵심 주제", detail: "예상 vs 실제 차이, 경쟁 강도, 목표 대학 라인 영향" },
    { id: "t3c2", label: "수시 vs 정시 방향 탐색 ★", category: "핵심 주제", detail: "1.5년치 내신+모의 비교, 내신형/수능형/균형형 탐색 (확정 아닌 탐색 단계)" },
    { id: "t3c3", label: "수능 최저 정밀 시뮬레이션", category: "핵심 주제", detail: "목표 대학별 수능 최저 기준 대입, 충족 가능성, 부족 영역" },
    { id: "t3c4", label: "과목별 학습법 최종 조정", category: "핵심 주제", detail: "시험 전략 점검, 방향에 따라 내신·수능 학습 비율 재조정" },
    { id: "t3c5", label: "여름방학 집중 전략", category: "핵심 주제", detail: "탐색 방향에 맞춘 계획, 취약 보강, 체력·멘탈 관리" },
    // 선택 주제 3개
    { id: "t3o1", label: "모의고사 취약 유형 심화 분석", category: "선택 주제", isOptional: true },
    { id: "t3o2", label: "학습 습관 고착화 여부 재점검", category: "선택 주제", isOptional: true },
    { id: "t3o3", label: "진로 방향성 재검토", category: "선택 주제", isOptional: true },
  ],
  T4: [
    // 핵심 주제 5개
    { id: "t4c1", label: "2년치 종합 진단 — 나를 명확히 이해하기 ★", category: "핵심 주제", detail: "내신 패턴 확정, 모의 영역별 추이, 내신 vs 모의 최종 비교, 학습법 안정화" },
    { id: "t4c2", label: "수시 vs 정시 최종 결정 ★", category: "핵심 주제", detail: "T3 탐색 방향을 확정, 2년 데이터 기반 최종 판단, 학생 본인 의사 반영" },
    { id: "t4c3", label: "진학 가능성 확인 (대학 라인)", category: "핵심 주제", detail: "현실적 대학 수준 확인, 도전 vs 안전 라인, 수능 최저 충족 가능성" },
    { id: "t4c4", label: "고3 학습 로드맵 확정 ★", category: "핵심 주제", detail: "월 단위 계획 (3월~수능), 주간 시간 배분, 과목별 내신·수능 대비법 확정" },
    { id: "t4c5", label: "체력·멘탈 관리 + 겨울방학 집중 전략", category: "핵심 주제", detail: "D8 2년 추이, 고3 체력 관리, 번아웃 대비, 생활 리듬 전환" },
    // 선택 주제 3개
    { id: "t4o1", label: "학부모와의 소통 전략", category: "선택 주제", isOptional: true },
    { id: "t4o2", label: "지난 2년 복기 (성찰)", category: "선택 주제", isOptional: true },
    { id: "t4o3", label: "모의고사 시험 전략 최적화", category: "선택 주제", isOptional: true },
  ],
};

const TIMING_LABELS: Record<string, string> = {
  T1: "고1-1학기 말 (7월) — 학교 적응 진단",
  T2: "고1-2학기 말 (2월) — 고2 진입 전략",
  T3: "고2-1학기 말 (7월) — 수시/정시 방향 탐색",
  T4: "고2-2학기 말 (2월) — 최종 확정 + 고3 로드맵",
};

const TIMING_CORE_QUESTION: Record<string, string> = {
  T1: "내가 고등학교에 제대로 적응하고 있는가?",
  T2: "고2로 어떻게 진입할 것인가?",
  T3: "수시로 갈 것인가, 정시로 갈 것인가 — 방향을 정할 때",
  T4: "고3 1년을 어떤 방향으로, 어떻게 준비할 것인가?",
};

function getChecklistForTiming(timing: string | null): Omit<CheckItem, "checked">[] {
  const topics = timing && TIMING_TOPICS[timing] ? TIMING_TOPICS[timing] : [];
  if (topics.length === 0) {
    // fallback: generic
    return [
      { id: "c1", label: "학생 기본 정보 확인 (이름, 학교, 학년)", category: "도입" },
      { id: "c2", label: "상담 목표/요청사항 파악", category: "도입" },
      { id: "c3", label: "설문 답변 리뷰 (주요 항목)", category: "도입" },
      { id: "c4", label: "내신 성적 추이 분석 공유", category: "성적" },
      { id: "c5", label: "취약 과목/영역 확인", category: "성적" },
      { id: "c6", label: "학습 방법/시간 배분 점검", category: "학습" },
      { id: "c7", label: "자기주도 학습 비율 확인", category: "학습" },
      { id: "c8", label: "진로/전형 방향 상담", category: "진로" },
      { id: "c9", label: "목표 대학/학과 논의", category: "진로" },
      { id: "c10", label: "액션 플랜 수립", category: "마무리" },
      { id: "c11", label: "다음 상담 일정 안내", category: "마무리" },
      { id: "c12", label: "상담 내용 요약/정리", category: "마무리" },
    ];
  }
  return [...COMMON_INTRO, ...topics, ...COMMON_CLOSING];
}

// ── Delta 변화 추적 타입 ──

interface DeltaData {
  has_previous: boolean;
  previous_id?: string;
  previous_timing?: string;
  previous_submitted_at?: string;
  diff: Record<string, Record<string, { prev: unknown; curr: unknown; change_type: string }>>;
  summary: string;
}

const CONSULTATION_MINUTES = 50;

interface SeniorNoteForCounselor {
  id: string;
  session_number: number;
  session_timing: string | null;
  consultation_date: string;
  core_topics: { topic: string; progress_status?: string; key_content?: string }[];
  optional_topics: { topic: string; covered?: boolean; note?: string }[];
  student_questions: string | null;
  senior_answers: string | null;
  student_mood: string | null;
  study_attitude: string | null;
  special_observations: string | null;
  action_items: { action: string; priority?: string }[];
  next_checkpoints: { checkpoint: string; status?: string }[];
  context_for_next: string | null;
  // P3-①: 선배 판단으로 비공유 처리된 필드 목록 (원본에 값이 있었으나 공유 OFF)
  _redacted_fields?: string[];
}

/** P3-① 공용 "비공유" 배지 — 선배 판단으로 가려진 항목 표기 */
function RedactedBadge() {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "#7C2D12",
        background: "#FEF3C7",
        border: "1px solid #FCD34D",
        padding: "1px 6px",
        borderRadius: 4,
        marginLeft: 6,
      }}
      title="선배가 비공유로 설정한 항목입니다 (V1 §6 연계 검토)"
    >
      🔒 선배 비공유
    </span>
  );
}

/** 섹션 내용 대체 — 필드가 redact 되었고 실제 값이 없는 경우 */
function RedactedPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        background: "#FEF3C7",
        border: "1px dashed #FCD34D",
        borderRadius: 6,
        fontSize: 12,
        color: "#7C2D12",
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

type SessionTab = "checklist" | "notes" | "delta" | "senior-notes";

export default function ConsultationSessionPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Timer
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Checklist (will be updated once booking loads with timing)
  const [checklist, setChecklist] = useState<CheckItem[]>([]);
  const [currentTiming, setCurrentTiming] = useState<string | null>(null);

  // Delta 변화 추적
  const [deltaData, setDeltaData] = useState<DeltaData | null>(null);
  const [deltaLoading, setDeltaLoading] = useState(false);

  // Session tab
  const [sessionTab, setSessionTab] = useState<SessionTab>("checklist");

  // Notes
  const [noteGoals, setNoteGoals] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteAdvice, setNoteAdvice] = useState("");
  const [noteNextSteps, setNoteNextSteps] = useState("");
  const [noteNextTopic, setNoteNextTopic] = useState("");
  const [notePrivate, setNotePrivate] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // ── 선배 상담 기록 폼 상태 ──
  const [snCoreTopics, setSnCoreTopics] = useState<{ topicId: string; topic: string; progress_status: string; student_reaction: string; key_content: string }[]>([]);
  const [snOptionalTopics, setSnOptionalTopics] = useState<{ topicId: string; topic: string; covered: boolean; note: string }[]>([]);
  const [snStudentQuestions, setSnStudentQuestions] = useState("");
  const [snSeniorAnswers, setSnSeniorAnswers] = useState("");
  const [snStudentMood, setSnStudentMood] = useState("");
  const [snStudyAttitude, setSnStudyAttitude] = useState("");
  const [snSpecialObservations, setSnSpecialObservations] = useState("");
  const [snActionItems, setSnActionItems] = useState<{ action: string; priority: string }[]>([{ action: "", priority: "중" }]);
  const [snNextCheckpoints, setSnNextCheckpoints] = useState<{ checkpoint: string; status: string }[]>([{ checkpoint: "", status: "" }]);
  const [snOperatorNotes, setSnOperatorNotes] = useState("");
  const [snContextForNext, setSnContextForNext] = useState("");
  const [snSaving, setSnSaving] = useState(false);
  const [snSaved, setSnSaved] = useState(false);
  const [snPrevCheckpoints, setSnPrevCheckpoints] = useState<{ checkpoint: string; status?: string }[]>([]);
  const [snPrevActionItems, setSnPrevActionItems] = useState<{ action: string; priority?: string }[]>([]);
  const [snPrevChecked, setSnPrevChecked] = useState<Record<number, boolean>>({});

  // 선배용 상담사 요약
  const [counselorSummary, setCounselorSummary] = useState<Record<string, unknown> | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const isSenior = getAdminInfo()?.role === "senior";
  const isSuperAdmin = getAdminInfo()?.role === "super_admin";

  // 상담사용 선배 기록
  const [seniorNotes, setSeniorNotes] = useState<SeniorNoteForCounselor[]>([]);
  const [seniorNotesLoading, setSeniorNotesLoading] = useState(false);
  // V1 §7 "차기 상담 시작 시 자동 노출" — 상담 준비 패널용
  const [seniorPrepOpen, setSeniorPrepOpen] = useState(true);
  const [seniorPrepMeta, setSeniorPrepMeta] = useState<{
    pending_count: number;
    last_next_context: string | null;
    last_next_context_session: string | null;
  }>({ pending_count: 0, last_next_context: null, last_next_context_session: null });

  // 가이드북 (topic_id → content 맵)
  const [guidebookMap, setGuidebookMap] = useState<Record<string, string>>({});
  const [guideOpen, setGuideOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    loadBooking();
  }, [bookingId]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const loadBooking = async () => {
    try {
      const data = await getBookingDetail(bookingId);
      setBooking(data);

      // 시점 결정: 가장 최근 submitted 설문의 timing
      const submittedSurvey = data.surveys?.find((s: BookingDetail["surveys"][0]) => s.status === "submitted" && s.timing);
      const timing = submittedSurvey?.timing || null;
      setCurrentTiming(timing);

      // 시점별 체크리스트 설정
      const items = getChecklistForTiming(timing);
      setChecklist(items.map((c) => ({ ...c, checked: false })));

      // Delta 변화 추적 로드 (submitted 설문이 있을 때)
      if (submittedSurvey) {
        setDeltaLoading(true);
        try {
          const d = await getSurveyDelta(submittedSurvey.id);
          setDeltaData(d);
        } catch {
          // delta 없으면 무시
        } finally {
          setDeltaLoading(false);
        }
      }

      // 선배인 경우 상담사 요약 + 이전 체크포인트 + 주제 초기화
      if (isSenior && data?.user_id) {
        try {
          const summary = await getCounselorSummaryForSenior(data.user_id);
          setCounselorSummary(summary);
        } catch {
          // 상담사 설문 없으면 무시
        }

        // 시점에 맞는 핵심/선택 주제 초기화 (선배 상담용 주제 사용)
        if (timing && SENIOR_TIMING_TOPICS[timing]) {
          const seniorTopics = SENIOR_TIMING_TOPICS[timing];
          const coreItems = seniorTopics.filter(t => t.isCore);
          const optItems = seniorTopics.filter(t => !t.isCore);
          setSnCoreTopics(coreItems.map(t => ({ topicId: t.id, topic: t.label, progress_status: "미진행", student_reaction: "", key_content: "" })));
          setSnOptionalTopics(optItems.map(t => ({ topicId: t.id, topic: t.label, covered: false, note: "" })));
        }

        // 세션 번호 추정 (timing S1→1, S2→2 등, 없으면 1)
        const sessionNum = timing ? parseInt(timing.replace(/\D/g, "")) || 1 : 1;
        if (sessionNum > 1) {
          try {
            const prevData = await getSeniorPrevCheckpoints(data.user_id, sessionNum);
            setSnPrevCheckpoints(prevData.prev_checkpoints || []);
            setSnPrevActionItems(prevData.prev_action_items || []);
          } catch {
            // 이전 기록 없으면 무시
          }
        }

        // 가이드북 로드 (현재 시점에 해당하는 가이드만)
        if (timing) {
          try {
            const gbRes = await getGuidebooks(timing);
            const gbMap: Record<string, string> = {};
            for (const g of (gbRes.guidebooks || [])) {
              if (g.topic_id) gbMap[g.topic_id] = g.content;
            }
            setGuidebookMap(gbMap);
          } catch {
            // 가이드북 로드 실패 무시
          }
        }
      }
      // 상담사인 경우 선배 기록 로드
      if (!isSenior && data?.user_id) {
        setSeniorNotesLoading(true);
        try {
          const snData = await getSeniorNotesForCounselor(data.user_id);
          setSeniorNotes(snData.notes || []);
          // V1 §7 prep 메타 (context_for_next + 검토 대기 건수)
          setSeniorPrepMeta({
            pending_count: snData.pending_count || 0,
            last_next_context: snData.last_next_context || null,
            last_next_context_session: snData.last_next_context_session || null,
          });
        } catch {
          // 선배 기록 없으면 무시
        } finally {
          setSeniorNotesLoading(false);
        }
      }
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  };

  // V3 §4-8-1: 연결된 설문 중 하나라도 analysis_status === "blocked" 이면
  // 상담 시작 차단 (super_admin 은 디버깅 목적으로 우회 가능)
  const blockedSurvey = booking?.surveys?.find((s) => s.analysis_status === "blocked");
  const sessionBlocked = !!blockedSurvey && !isSuperAdmin;

  const startTimer = useCallback(() => {
    if (timerRunning) return;
    if (sessionBlocked) {
      alert("자동 분석 결과 검증에 실패하여 상담 시작이 잠겨 있습니다. 슈퍼관리자 점검 완료 후 가능합니다.");
      return;
    }
    setTimerRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }, [timerRunning, sessionBlocked]);

  const pauseTimer = useCallback(() => {
    setTimerRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    pauseTimer();
    setElapsedSeconds(0);
  }, [pauseTimer]);

  const toggleCheck = (id: string) => {
    setChecklist((prev) =>
      prev.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c))
    );
  };

  const handleCompleteSession = async () => {
    if (!booking) return;
    if (!confirm("상담을 완료 처리하시겠습니까?")) return;
    try {
      await updateBookingStatus(booking.id, "completed");
      setBooking((prev) => prev ? { ...prev, status: "completed" } : prev);
    } catch {
      alert("상태 변경에 실패했습니다.");
    }
  };

  const handleSaveNote = async () => {
    if (!booking || !noteContent.trim()) {
      alert("주요 상담 내용을 입력해주세요.");
      return;
    }
    setNoteSaving(true);
    try {
      await createConsultationNote({
        user_id: booking.user_id,
        booking_id: booking.id,
        category: booking.type === "학생부분석" ? "analysis"
          : booking.type === "입시전략" ? "strategy"
          : "study_method",
        consultation_date: booking.slot_date,
        goals: noteGoals || undefined,
        main_content: noteContent,
        advice_given: noteAdvice || undefined,
        next_steps: noteNextSteps || undefined,
        next_topic: noteNextTopic || undefined,
        admin_private_notes: notePrivate || undefined,
        is_visible_to_user: false,
      });
      setNoteSaved(true);
    } catch {
      alert("상담 기록 저장에 실패했습니다.");
    } finally {
      setNoteSaving(false);
    }
  };

  const handleSaveSeniorNote = async () => {
    if (!booking) return;
    const filledCore = snCoreTopics.filter(t => t.progress_status !== "미진행" || t.key_content.trim());
    if (filledCore.length === 0) {
      alert("최소 1개 이상의 핵심 주제 진행 결과를 입력해주세요.");
      return;
    }
    setSnSaving(true);
    try {
      const sessionNum = currentTiming ? parseInt(currentTiming.replace(/\D/g, "")) || 1 : 1;
      const seniorTiming = currentTiming ? `S${sessionNum}` : undefined;
      await createSeniorNote({
        user_id: booking.user_id,
        booking_id: booking.id,
        session_number: sessionNum,
        session_timing: seniorTiming,
        consultation_date: booking.slot_date,
        core_topics: snCoreTopics,
        optional_topics: snOptionalTopics.filter(t => t.covered),
        student_questions: snStudentQuestions || undefined,
        senior_answers: snSeniorAnswers || undefined,
        student_mood: snStudentMood || undefined,
        study_attitude: snStudyAttitude || undefined,
        special_observations: snSpecialObservations || undefined,
        action_items: snActionItems.filter(a => a.action.trim()),
        next_checkpoints: snNextCheckpoints.filter(c => c.checkpoint.trim()),
        operator_notes: snOperatorNotes || undefined,
        context_for_next: snContextForNext || undefined,
        is_visible_to_user: false,
      });
      setSnSaved(true);
    } catch {
      alert("선배 상담 기록 저장에 실패했습니다.");
    } finally {
      setSnSaving(false);
    }
  };

  // Format timer
  const totalMinutes = CONSULTATION_MINUTES;
  const remainingSeconds = Math.max(0, totalMinutes * 60 - elapsedSeconds);
  const isOvertime = elapsedSeconds > totalMinutes * 60;
  const displayMinutes = isOvertime
    ? Math.floor((elapsedSeconds - totalMinutes * 60) / 60)
    : Math.floor(remainingSeconds / 60);
  const displaySeconds = isOvertime
    ? (elapsedSeconds - totalMinutes * 60) % 60
    : remainingSeconds % 60;
  const progressPct = Math.min(100, (elapsedSeconds / (totalMinutes * 60)) * 100);

  const checkedCount = checklist.filter((c) => c.checked).length;
  const categories = [...new Set(checklist.map((c) => c.category))];

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

  if (!booking) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>예약을 찾을 수 없습니다</div>
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
            <button onClick={() => router.push("/consultation")} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6B7280", marginBottom: 8,
            }}>
              &larr; 예약 목록으로
            </button>
            <h1 style={{ margin: 0 }}>
              상담 진행: {booking.user_name}
              <span style={{
                marginLeft: 10, padding: "3px 10px", borderRadius: 4, fontSize: 13,
                color: "white", background: booking.status === "completed" ? "#10B981" : "#7C3AED",
              }}>
                {booking.status === "completed" ? "완료" : "진행 중"}
              </span>
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {isSenior && booking.user_id && (
              <Link
                href={`/consultation/senior-summary/${booking.user_id}`}
                style={{
                  padding: "8px 16px", borderRadius: 6, border: "1px solid #DDD6FE",
                  background: "#F5F3FF", color: "#7C3AED", fontSize: 13, textDecoration: "none",
                  display: "flex", alignItems: "center",
                }}
              >
                누적 요약
              </Link>
            )}
            {booking.status === "confirmed" && (
              <button
                onClick={handleCompleteSession}
                style={{
                  padding: "8px 20px", borderRadius: 6, border: "none",
                  background: "#10B981", color: "white", fontSize: 13, cursor: "pointer",
                }}
              >
                상담 완료
              </button>
            )}
          </div>
        </div>

        {/* V3 §4-8-1: 자동 분석 검증 차단 배너 */}
        {sessionBlocked && blockedSurvey && (
          <div style={{
            marginBottom: 20,
            padding: "14px 18px",
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: 8,
            color: "#991B1B",
            fontSize: 14,
            lineHeight: 1.6,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              🔒 상담 시작이 잠겨 있습니다 (자동 분석 검증 실패)
            </div>
            <div>
              사전 설문({blockedSurvey.timing || blockedSurvey.survey_type}) 자동 분석 결과에
              P1(필수) 오류가 잔존하여 상담 진행이 차단되었습니다.
              슈퍼관리자의 시스템 점검 완료 후 자동 해제됩니다.
            </div>
          </div>
        )}
        {/* super_admin 이 분석 차단 상태 설문에 들어왔을 때 알림 */}
        {!sessionBlocked && blockedSurvey && isSuperAdmin && (
          <div style={{
            marginBottom: 20,
            padding: "10px 14px",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 8,
            color: "#92400E",
            fontSize: 13,
          }}>
            ⚠️ 슈퍼관리자 모드: 이 상담에 연결된 설문의 자동 분석이 차단(blocked) 상태입니다.
            디버깅 목적으로 시작 버튼은 활성화되어 있으나, 해결 후 상담을 진행해 주세요.
          </div>
        )}

        {/* 학생 정보 + 타이머 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          {/* 학생 정보 카드 */}
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: 14, margin: "0 0 12px 0", color: "#6B7280" }}>학생 정보</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>이름</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{booking.user_name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>연락처</div>
                <div style={{ fontSize: 14 }}>{booking.user_phone || "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>상담 유형</div>
                <div style={{ fontSize: 14 }}>{booking.type}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>일시</div>
                <div style={{ fontSize: 14 }}>{booking.slot_date} {booking.slot_start_time}~{booking.slot_end_time}</div>
              </div>
            </div>
            {booking.memo && (
              <div style={{ marginTop: 12, padding: 10, background: "#FFFBEB", borderRadius: 6, fontSize: 13 }}>
                <strong>사전 메모:</strong> {booking.memo}
              </div>
            )}
            {/* 설문 링크 */}
            {booking.surveys && booking.surveys.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>관련 설문</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {booking.surveys.map((s) => (
                    <Link
                      key={s.id}
                      href={`/surveys/${s.id}`}
                      style={{
                        fontSize: 13, color: "#3B82F6", textDecoration: "none",
                        padding: "4px 8px", background: "#EFF6FF", borderRadius: 4,
                        display: "inline-flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {s.survey_type === "preheigh1" ? "예비고1" : "고등학생"}
                      {s.timing && ` (${s.timing})`}
                      <span style={{
                        fontSize: 11, padding: "1px 4px", borderRadius: 3,
                        background: s.status === "submitted" ? "#D1FAE5" : "#FEF3C7",
                        color: s.status === "submitted" ? "#065F46" : "#92400E",
                      }}>
                        {s.status === "submitted" ? "제출" : "작성중"}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 타이머 카드 */}
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: 14, margin: "0 0 12px 0", color: "#6B7280" }}>상담 타이머 ({CONSULTATION_MINUTES}분)</h3>
            <div style={{ textAlign: "center" }}>
              {/* 큰 타이머 표시 */}
              <div style={{
                fontSize: 48, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                color: isOvertime ? "#EF4444" : elapsedSeconds > totalMinutes * 60 * 0.8 ? "#F59E0B" : "#111827",
              }}>
                {isOvertime && "+"}
                {String(displayMinutes).padStart(2, "0")}:{String(displaySeconds).padStart(2, "0")}
              </div>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 12 }}>
                {isOvertime ? "초과 시간" : "남은 시간"}
              </div>

              {/* 프로그레스 바 */}
              <div style={{
                height: 8, background: "#E5E7EB", borderRadius: 4, overflow: "hidden", marginBottom: 16,
              }}>
                <div style={{
                  height: "100%", borderRadius: 4, transition: "width 1s linear",
                  width: `${progressPct}%`,
                  background: isOvertime ? "#EF4444" : progressPct > 80 ? "#F59E0B" : "#3B82F6",
                }} />
              </div>

              {/* 타이머 컨트롤 */}
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                {!timerRunning ? (
                  <button
                    onClick={startTimer}
                    disabled={sessionBlocked}
                    title={sessionBlocked ? "자동 분석 검증 실패로 상담 시작이 잠겨 있습니다" : ""}
                    style={{
                      padding: "10px 32px", borderRadius: 8, border: "none",
                      background: sessionBlocked ? "#9CA3AF" : "#3B82F6",
                      color: "white", fontSize: 15, fontWeight: 600,
                      cursor: sessionBlocked ? "not-allowed" : "pointer",
                      opacity: sessionBlocked ? 0.7 : 1,
                    }}
                  >
                    {elapsedSeconds > 0 ? "계속" : "시작"}
                  </button>
                ) : (
                  <button
                    onClick={pauseTimer}
                    style={{
                      padding: "10px 32px", borderRadius: 8, border: "none",
                      background: "#F59E0B", color: "white", fontSize: 15, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    일시정지
                  </button>
                )}
                <button
                  onClick={resetTimer}
                  style={{
                    padding: "10px 20px", borderRadius: 8, border: "1px solid #D1D5DB",
                    background: "white", color: "#6B7280", fontSize: 14, cursor: "pointer",
                  }}
                >
                  초기화
                </button>
              </div>

              {/* 경과 시간 */}
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 12 }}>
                경과: {Math.floor(elapsedSeconds / 60)}분 {elapsedSeconds % 60}초
              </div>
            </div>
          </div>
        </div>

        {/* 선배용: 이전 상담사 요약 */}
        {isSenior && counselorSummary && (
          <div style={{ marginBottom: 20, background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
            <button
              onClick={() => setSummaryOpen(!summaryOpen)}
              style={{
                width: "100%", padding: "14px 20px", border: "none", cursor: "pointer",
                background: "#F5F3FF", display: "flex", alignItems: "center", justifyContent: "space-between",
                fontSize: 14, fontWeight: 600, color: "#5B21B6",
              }}
            >
              <span>이전 상담사 설문 요약 (추상화)</span>
              <span style={{ fontSize: 12 }}>{summaryOpen ? "▲ 접기" : "▼ 펼치기"}</span>
            </button>
            {summaryOpen && (
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                {/* V1 §7-3 pending 경고: 상담사 측 검토 대기 건수 */}
                {(() => {
                  const pending = (counselorSummary as Record<string, unknown>).pending_count;
                  const pendingNum = typeof pending === "number" ? pending : 0;
                  if (pendingNum <= 0) return null;
                  return (
                    <div style={{
                      padding: "10px 14px",
                      background: "#FEF3C7",
                      border: "1px solid #FDE68A",
                      borderRadius: 6,
                      fontSize: 13,
                      color: "#92400E",
                    }}>
                      ⚠️ 관리자 검토 대기 중인 상담사 기록 {pendingNum}건 — 검토 완료 전까지 이 상담에 노출되지 않습니다 (V1 §7-3)
                    </div>
                  );
                })()}
                {/* 상담사가 남긴 "다음 선배에게 전달할 맥락" (V1 §5) */}
                {(() => {
                  const ctx = (counselorSummary as Record<string, unknown>).counselor_next_senior_context;
                  const date = (counselorSummary as Record<string, unknown>).counselor_note_date;
                  const category = (counselorSummary as Record<string, unknown>).counselor_note_category;
                  if (!ctx) return null;
                  return (
                    <div style={{ padding: 12, background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1E40AF", marginBottom: 4 }}>
                        상담사 전달 사항{category ? ` [${category}]` : ""}{date ? ` (${String(date).slice(0, 10)})` : ""}
                      </div>
                      <div style={{ fontSize: 13, color: "#1E3A8A", whiteSpace: "pre-wrap" }}>
                        {String(ctx)}
                      </div>
                    </div>
                  );
                })()}
                {/* 이전 선배 맥락 */}
                {(counselorSummary as Record<string, unknown>).prev_senior_context && (
                  <div style={{ padding: 12, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#92400E", marginBottom: 4 }}>
                      이전 선배 전달 사항 ({(counselorSummary as Record<string, unknown>).prev_senior_session || "?"})
                    </div>
                    <div style={{ fontSize: 13, color: "#78350F" }}>
                      {String((counselorSummary as Record<string, unknown>).prev_senior_context)}
                    </div>
                  </div>
                )}
                {/* 추상화 요약 */}
                {(() => {
                  const abs = (counselorSummary as Record<string, unknown>).abstracted_summary as Record<string, unknown> | undefined;
                  if (!abs) return null;
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {abs.naesin && (
                        <div style={{ padding: 12, background: "#F0FDF4", borderRadius: 6, border: "1px solid #BBF7D0" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#166534", marginBottom: 6 }}>내신</div>
                          <div style={{ fontSize: 13 }}>
                            최근: {((abs.naesin as Record<string, unknown>).latest_tier as string) || "-"} / 추이: {((abs.naesin as Record<string, unknown>).trend as string) || "-"}
                          </div>
                        </div>
                      )}
                      {abs.mock && (
                        <div style={{ padding: 12, background: "#EFF6FF", borderRadius: 6, border: "1px solid #BFDBFE" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#1E40AF", marginBottom: 6 }}>모의고사</div>
                          <div style={{ fontSize: 13 }}>
                            {((abs.mock as Record<string, unknown>).tier as string) || "-"}
                            {(abs.mock as Record<string, unknown>).type_hint && ` (${(abs.mock as Record<string, unknown>).type_hint})`}
                          </div>
                        </div>
                      )}
                      {abs.career_direction && (
                        <div style={{ padding: 12, background: "#FDF4FF", borderRadius: 6, border: "1px solid #E9D5FF" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#6B21A8", marginBottom: 6 }}>진로 방향</div>
                          <div style={{ fontSize: 13 }}>{String(abs.career_direction)}</div>
                        </div>
                      )}
                      {abs.target_level && (
                        <div style={{ padding: 12, background: "#FFF7ED", borderRadius: 6, border: "1px solid #FED7AA" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#9A3412", marginBottom: 6 }}>목표 수준</div>
                          <div style={{ fontSize: 13 }}>{String(abs.target_level)}</div>
                        </div>
                      )}
                      {abs.overall_grade && (
                        <div style={{ padding: 12, background: "#F9FAFB", borderRadius: 6, border: "1px solid #E5E7EB" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>종합 등급</div>
                          <div style={{ fontSize: 18, fontWeight: 700 }}>{String(abs.overall_grade)}</div>
                        </div>
                      )}
                      {abs.study_methods && (
                        <div style={{ padding: 12, background: "#F9FAFB", borderRadius: 6, border: "1px solid #E5E7EB" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>학습방법</div>
                          <div style={{ fontSize: 12 }}>
                            {Object.entries(abs.study_methods as Record<string, string[]>).map(([k, v]) => (
                              <div key={k}>{k}: {Array.isArray(v) ? v.join(", ") : String(v)}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "right" }}>
                  * 개인정보 보호를 위해 추상화된 요약입니다. 구체적 성적·대학명은 포함되지 않습니다.
                </div>
              </div>
            )}
          </div>
        )}

        {/* 상담사용: 상담 준비 — 선배 노트 요약 (V1 §7) */}
        {!isSenior && (seniorPrepMeta.last_next_context || seniorPrepMeta.pending_count > 0 || seniorNotes.length > 0) && (
          <div style={{ marginBottom: 20, background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
            <button
              onClick={() => setSeniorPrepOpen(!seniorPrepOpen)}
              style={{
                width: "100%", padding: "14px 20px", border: "none", cursor: "pointer",
                background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "space-between",
                fontSize: 14, fontWeight: 600, color: "#1E40AF",
              }}
            >
              <span>상담 준비 — 선배 기록 요약 {seniorNotes.length > 0 ? `(${seniorNotes.length}건 검토 완료)` : ""}</span>
              <span style={{ fontSize: 12 }}>{seniorPrepOpen ? "▲ 접기" : "▼ 펼치기"}</span>
            </button>
            {seniorPrepOpen && (
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                {/* pending 경고 배너 (V1 §7-3) */}
                {seniorPrepMeta.pending_count > 0 && (
                  <div style={{
                    padding: "10px 14px",
                    background: "#FEF3C7",
                    border: "1px solid #FDE68A",
                    borderRadius: 6,
                    fontSize: 13,
                    color: "#92400E",
                  }}>
                    ⚠️ 관리자 검토 대기 중인 선배 기록 {seniorPrepMeta.pending_count}건 — 검토 완료 전까지 이 상담에 노출되지 않습니다 (V1 §7-3)
                  </div>
                )}
                {/* 최신 선배의 "다음 상담자에게 전달할 맥락" (V1 §5) */}
                {seniorPrepMeta.last_next_context ? (
                  <div style={{ padding: 12, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#92400E", marginBottom: 4 }}>
                      이전 선배 전달 사항 {seniorPrepMeta.last_next_context_session ? `(${seniorPrepMeta.last_next_context_session})` : ""}
                    </div>
                    <div style={{ fontSize: 13, color: "#78350F", whiteSpace: "pre-wrap" }}>
                      {seniorPrepMeta.last_next_context}
                    </div>
                  </div>
                ) : (
                  seniorNotes.length > 0 && (
                    <div style={{ fontSize: 13, color: "#9CA3AF" }}>
                      이전 선배가 "다음 상담자에게 전달할 맥락"을 작성하지 않았습니다.
                    </div>
                  )
                )}
                <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "right" }}>
                  * 상세 선배 기록은 아래 "선배 기록" 탭에서 확인할 수 있습니다.
                </div>
              </div>
            )}
          </div>
        )}

        {/* 탭 바 */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid #E5E7EB" }}>
          {((() => {
            const tabs: SessionTab[] = ["checklist", "notes"];
            if (deltaData?.has_previous) tabs.push("delta");
            if (!isSenior && seniorNotes.length > 0) tabs.push("senior-notes");
            return tabs;
          })()).map((tab) => (
            <button
              key={tab}
              onClick={() => setSessionTab(tab)}
              style={{
                padding: "10px 20px", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
                background: "none",
                color: sessionTab === tab ? "#7C3AED" : "#6B7280",
                borderBottom: sessionTab === tab ? "2px solid #7C3AED" : "2px solid transparent",
                marginBottom: -2,
              }}
            >
              {tab === "checklist" ? `주제 가이드 (${checkedCount}/${checklist.length})`
                : tab === "notes" ? "상담 기록"
                : tab === "delta" ? "변화 추적"
                : `선배 기록 (${seniorNotes.length})`}
            </button>
          ))}
        </div>

        {/* 주제 가이드 (체크리스트) */}
        {sessionTab === "checklist" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* 시점 정보 배너 */}
            {currentTiming && TIMING_LABELS[currentTiming] && (
              <div style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ background: "#7C3AED", color: "white", padding: "2px 10px", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>{currentTiming}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#5B21B6" }}>{TIMING_LABELS[currentTiming]}</span>
                </div>
                <div style={{ fontSize: 13, color: "#6D28D9", fontStyle: "italic" }}>
                  핵심 질문: &quot;{TIMING_CORE_QUESTION[currentTiming]}&quot;
                </div>
              </div>
            )}

            {categories.map((cat) => {
              const catItems = checklist.filter((c) => c.category === cat);
              const isOptionalCat = cat === "선택 주제";
              return (
                <div key={cat} style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{
                    padding: "10px 20px",
                    background: cat === "핵심 주제" ? "#EFF6FF" : cat === "선택 주제" ? "#FFFBEB" : "#F9FAFB",
                    borderBottom: "1px solid #E5E7EB",
                    fontSize: 13, fontWeight: 600,
                    color: cat === "핵심 주제" ? "#1E40AF" : cat === "선택 주제" ? "#92400E" : "#374151",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    {cat === "핵심 주제" && "🎯 "}{cat === "선택 주제" && "⭐ "}{cat}
                    <span style={{ fontSize: 11, fontWeight: 400, color: "#9CA3AF" }}>
                      ({catItems.filter(c => c.checked).length}/{catItems.length})
                    </span>
                    {isOptionalCat && <span style={{ fontSize: 11, color: "#D97706" }}> (시간 여유 시 진행)</span>}
                  </div>
                  <div style={{ padding: "4px 20px" }}>
                    {catItems.map((item) => (
                      <div key={item.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        <label
                          style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => toggleCheck(item.id)}
                            style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }}
                          />
                          <div style={{ flex: 1 }}>
                            <span style={{
                              fontSize: 14,
                              textDecoration: item.checked ? "line-through" : "none",
                              color: item.checked ? "#9CA3AF" : "#374151",
                              fontWeight: item.isOptional ? 400 : 500,
                            }}>
                              {item.label}
                            </span>
                            {item.detail && (
                              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3, lineHeight: 1.5 }}>
                                {item.detail}
                              </div>
                            )}
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 상담 기록 */}
        {sessionTab === "notes" && !isSenior && (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20 }}>
            {noteSaved ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>&#10003;</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#10B981", marginBottom: 8 }}>상담 기록이 저장되었습니다</div>
                <Link
                  href={`/consultation/notes?user_id=${booking.user_id}`}
                  style={{ fontSize: 13, color: "#3B82F6" }}
                >
                  상담 기록 목록 보기
                </Link>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>상담 목표/요청사항</label>
                    <textarea
                      value={noteGoals}
                      onChange={(e) => setNoteGoals(e.target.value)}
                      placeholder="학생이 요청한 상담 목표..."
                      style={{ width: "100%", minHeight: 60, padding: 10, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                      주요 상담 내용 <span style={{ color: "#EF4444" }}>*</span>
                    </label>
                    <textarea
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="상담에서 다룬 주요 내용..."
                      style={{ width: "100%", minHeight: 120, padding: 10, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>제공한 조언</label>
                    <textarea
                      value={noteAdvice}
                      onChange={(e) => setNoteAdvice(e.target.value)}
                      placeholder="학생에게 제공한 조언..."
                      style={{ width: "100%", minHeight: 80, padding: 10, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>다음 실행 계획</label>
                      <textarea
                        value={noteNextSteps}
                        onChange={(e) => setNoteNextSteps(e.target.value)}
                        placeholder="학생이 다음에 해야 할 것..."
                        style={{ width: "100%", minHeight: 80, padding: 10, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>다음 상담 주제</label>
                      <textarea
                        value={noteNextTopic}
                        onChange={(e) => setNoteNextTopic(e.target.value)}
                        placeholder="다음 상담에서 다룰 주제..."
                        style={{ width: "100%", minHeight: 80, padding: 10, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>비공개 메모 (상담사 전용)</label>
                    <textarea
                      value={notePrivate}
                      onChange={(e) => setNotePrivate(e.target.value)}
                      placeholder="학생에게 공개되지 않는 메모..."
                      style={{ width: "100%", minHeight: 60, padding: 10, border: "1px solid #FCA5A5", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit", background: "#FFF5F5" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                  <button
                    onClick={handleSaveNote}
                    disabled={noteSaving || !noteContent.trim()}
                    style={{
                      padding: "10px 28px", borderRadius: 6, border: "none",
                      background: "#7C3AED", color: "white", fontSize: 14, fontWeight: 600,
                      cursor: "pointer", opacity: noteSaving || !noteContent.trim() ? 0.5 : 1,
                    }}
                  >
                    {noteSaving ? "저장 중..." : "상담 기록 저장"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 선배 상담 기록 작성 폼 (10개 섹션) ── */}
        {sessionTab === "notes" && isSenior && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {snSaved ? (
              <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>&#10003;</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#10B981", marginBottom: 8 }}>선배 상담 기록이 저장되었습니다</div>
                <div style={{ fontSize: 13, color: "#6B7280" }}>관리자 리뷰 후 상담사에게 공유됩니다.</div>
              </div>
            ) : (
              <>
                {/* 섹션 3: 이전 상담 체크포인트 확인 */}
                {(snPrevCheckpoints.length > 0 || snPrevActionItems.length > 0) && (
                  <div style={{ background: "white", border: "1px solid #FDE68A", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ padding: "12px 20px", background: "#FFFBEB", borderBottom: "1px solid #FDE68A", fontSize: 14, fontWeight: 600, color: "#92400E" }}>
                      3. 이전 상담 체크포인트 확인
                    </div>
                    <div style={{ padding: 20 }}>
                      {snPrevCheckpoints.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>이전 세션 확인 사항</div>
                          {snPrevCheckpoints.map((cp, i) => (
                            <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={!!snPrevChecked[i]}
                                onChange={() => setSnPrevChecked(prev => ({ ...prev, [i]: !prev[i] }))}
                                style={{ width: 16, height: 16 }}
                              />
                              <span style={{ fontSize: 13, color: snPrevChecked[i] ? "#9CA3AF" : "#374151", textDecoration: snPrevChecked[i] ? "line-through" : "none" }}>
                                {cp.checkpoint}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                      {snPrevActionItems.length > 0 && (
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>이전 세션 실천 사항</div>
                          {snPrevActionItems.map((ai, i) => (
                            <div key={i} style={{ fontSize: 13, padding: "4px 0", color: "#6B7280" }}>
                              <span style={{
                                display: "inline-block", width: 18, height: 18, borderRadius: 3, fontSize: 11,
                                textAlign: "center", lineHeight: "18px", marginRight: 8,
                                background: ai.priority === "상" ? "#FEE2E2" : ai.priority === "하" ? "#DBEAFE" : "#FEF3C7",
                                color: ai.priority === "상" ? "#991B1B" : ai.priority === "하" ? "#1E40AF" : "#92400E",
                              }}>
                                {ai.priority === "상" ? "!" : ai.priority === "하" ? "-" : "·"}
                              </span>
                              {ai.action}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 섹션 4: 핵심 주제별 진행 결과 */}
                <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "12px 20px", background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", fontSize: 14, fontWeight: 600, color: "#1E40AF" }}>
                    4. 핵심 주제별 진행 결과 <span style={{ color: "#EF4444" }}>*</span>
                  </div>
                  <div style={{ padding: 20 }}>
                    {snCoreTopics.length === 0 ? (
                      <div style={{ color: "#9CA3AF", fontSize: 13 }}>시점(T1~T4) 정보가 없어 핵심 주제를 불러올 수 없습니다.</div>
                    ) : (
                      snCoreTopics.map((topic, i) => (
                        <div key={i} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: i < snCoreTopics.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span>{i + 1}. {topic.topic}</span>
                            {guidebookMap[topic.topicId] && (
                              <button
                                onClick={() => setGuideOpen(prev => ({ ...prev, [topic.topicId]: !prev[topic.topicId] }))}
                                style={{
                                  padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500,
                                  border: "1px solid #DDD6FE", background: guideOpen[topic.topicId] ? "#7C3AED" : "#F5F3FF",
                                  color: guideOpen[topic.topicId] ? "#FFF" : "#7C3AED", cursor: "pointer",
                                }}
                              >
                                {guideOpen[topic.topicId] ? "가이드 닫기" : "가이드 보기"}
                              </button>
                            )}
                          </div>
                          {guideOpen[topic.topicId] && guidebookMap[topic.topicId] && (
                            <div style={{ padding: "10px 14px", background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 8, marginBottom: 10, fontSize: 13, color: "#5B21B6", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                              {guidebookMap[topic.topicId]}
                            </div>
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
                            <div>
                              <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>진행 상태</label>
                              <select
                                value={topic.progress_status}
                                onChange={(e) => {
                                  const updated = [...snCoreTopics];
                                  updated[i] = { ...updated[i], progress_status: e.target.value };
                                  setSnCoreTopics(updated);
                                }}
                                style={{ width: "100%", padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13 }}
                              >
                                <option value="미진행">미진행</option>
                                <option value="충분히 다룸">충분히 다룸</option>
                                <option value="간단히 다룸">간단히 다룸</option>
                                <option value="다루지 못함">다루지 못함</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>학생 반응</label>
                              <select
                                value={topic.student_reaction}
                                onChange={(e) => {
                                  const updated = [...snCoreTopics];
                                  updated[i] = { ...updated[i], student_reaction: e.target.value };
                                  setSnCoreTopics(updated);
                                }}
                                style={{ width: "100%", padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13 }}
                              >
                                <option value="">선택</option>
                                <option value="적극적 관심">적극적 관심</option>
                                <option value="보통">보통</option>
                                <option value="무관심/소극적">무관심/소극적</option>
                                <option value="혼란/어려워함">혼란/어려워함</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>핵심 내용 메모</label>
                            <textarea
                              value={topic.key_content}
                              onChange={(e) => {
                                const updated = [...snCoreTopics];
                                updated[i] = { ...updated[i], key_content: e.target.value };
                                setSnCoreTopics(updated);
                              }}
                              placeholder="이 주제에서 다룬 핵심 내용..."
                              style={{ width: "100%", minHeight: 60, padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 섹션 5: 선택 주제 진행 여부 */}
                {snOptionalTopics.length > 0 && (
                  <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ padding: "12px 20px", background: "#FFFBEB", borderBottom: "1px solid #FDE68A", fontSize: 14, fontWeight: 600, color: "#92400E" }}>
                      5. 선택 주제 진행 여부
                    </div>
                    <div style={{ padding: 20 }}>
                      {snOptionalTopics.map((topic, i) => (
                        <div key={i} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={topic.covered}
                                onChange={() => {
                                  const updated = [...snOptionalTopics];
                                  updated[i] = { ...updated[i], covered: !updated[i].covered };
                                  setSnOptionalTopics(updated);
                                }}
                                style={{ width: 16, height: 16 }}
                              />
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{topic.topic}</span>
                            </label>
                            {guidebookMap[topic.topicId] && (
                              <button
                                onClick={() => setGuideOpen(prev => ({ ...prev, [topic.topicId]: !prev[topic.topicId] }))}
                                style={{
                                  padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500,
                                  border: "1px solid #FDE68A", background: guideOpen[topic.topicId] ? "#F59E0B" : "#FFFBEB",
                                  color: guideOpen[topic.topicId] ? "#FFF" : "#92400E", cursor: "pointer",
                                }}
                              >
                                {guideOpen[topic.topicId] ? "가이드 닫기" : "가이드 보기"}
                              </button>
                            )}
                          </div>
                          {guideOpen[topic.topicId] && guidebookMap[topic.topicId] && (
                            <div style={{ padding: "10px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, marginBottom: 6, marginLeft: 26, fontSize: 13, color: "#92400E", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                              {guidebookMap[topic.topicId]}
                            </div>
                          )}
                          {topic.covered && (
                            <textarea
                              value={topic.note}
                              onChange={(e) => {
                                const updated = [...snOptionalTopics];
                                updated[i] = { ...updated[i], note: e.target.value };
                                setSnOptionalTopics(updated);
                              }}
                              placeholder="간단한 메모..."
                              style={{ width: "100%", minHeight: 40, padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, resize: "vertical", fontFamily: "inherit", marginLeft: 26 }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 섹션 6: 자유 질의응답 */}
                <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "12px 20px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", fontSize: 14, fontWeight: 600, color: "#374151" }}>
                    6. 자유 질의응답
                  </div>
                  <div style={{ padding: 20, display: "grid", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>학생 질문</label>
                      <textarea
                        value={snStudentQuestions}
                        onChange={(e) => setSnStudentQuestions(e.target.value)}
                        placeholder="학생이 한 질문들..."
                        style={{ width: "100%", minHeight: 60, padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>선배 답변/조언</label>
                      <textarea
                        value={snSeniorAnswers}
                        onChange={(e) => setSnSeniorAnswers(e.target.value)}
                        placeholder="내가 답변한 내용..."
                        style={{ width: "100%", minHeight: 60, padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                  </div>
                </div>

                {/* 섹션 7: 학생 상태 관찰 */}
                <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "12px 20px", background: "#F0FDF4", borderBottom: "1px solid #BBF7D0", fontSize: 14, fontWeight: 600, color: "#166534" }}>
                    7. 학생 상태 관찰
                  </div>
                  <div style={{ padding: 20 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>전반적 분위기</label>
                        <select
                          value={snStudentMood}
                          onChange={(e) => setSnStudentMood(e.target.value)}
                          style={{ width: "100%", padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13 }}
                        >
                          <option value="">선택</option>
                          <option value="밝고 적극적">밝고 적극적</option>
                          <option value="차분하고 안정적">차분하고 안정적</option>
                          <option value="보통">보통</option>
                          <option value="다소 지쳐 보임">다소 지쳐 보임</option>
                          <option value="불안/초조해 보임">불안/초조해 보임</option>
                          <option value="무기력/의욕 없음">무기력/의욕 없음</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>공부 태도</label>
                        <select
                          value={snStudyAttitude}
                          onChange={(e) => setSnStudyAttitude(e.target.value)}
                          style={{ width: "100%", padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13 }}
                        >
                          <option value="">선택</option>
                          <option value="매우 성실/열정적">매우 성실/열정적</option>
                          <option value="꾸준히 노력 중">꾸준히 노력 중</option>
                          <option value="보통">보통</option>
                          <option value="조금 느슨해진 상태">조금 느슨해진 상태</option>
                          <option value="방향을 잃은 상태">방향을 잃은 상태</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>특이사항 / 추가 관찰</label>
                      <textarea
                        value={snSpecialObservations}
                        onChange={(e) => setSnSpecialObservations(e.target.value)}
                        placeholder="학생에 대해 특별히 관찰한 점 (걱정되는 부분, 긍정적 변화 등)..."
                        style={{ width: "100%", minHeight: 60, padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                  </div>
                </div>

                {/* 섹션 8: 실천 사항 제안 */}
                <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "12px 20px", background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", fontSize: 14, fontWeight: 600, color: "#1E40AF" }}>
                    8. 실천 사항 제안
                  </div>
                  <div style={{ padding: 20 }}>
                    {snActionItems.map((item, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                        <select
                          value={item.priority}
                          onChange={(e) => {
                            const updated = [...snActionItems];
                            updated[i] = { ...updated[i], priority: e.target.value };
                            setSnActionItems(updated);
                          }}
                          style={{ width: 70, padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12 }}
                        >
                          <option value="상">상</option>
                          <option value="중">중</option>
                          <option value="하">하</option>
                        </select>
                        <input
                          value={item.action}
                          onChange={(e) => {
                            const updated = [...snActionItems];
                            updated[i] = { ...updated[i], action: e.target.value };
                            setSnActionItems(updated);
                          }}
                          placeholder="실천 사항..."
                          style={{ flex: 1, padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13 }}
                        />
                        {snActionItems.length > 1 && (
                          <button
                            onClick={() => setSnActionItems(snActionItems.filter((_, j) => j !== i))}
                            style={{ padding: "4px 8px", border: "1px solid #FCA5A5", borderRadius: 4, background: "#FEF2F2", color: "#EF4444", cursor: "pointer", fontSize: 12 }}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setSnActionItems([...snActionItems, { action: "", priority: "중" }])}
                      style={{ padding: "6px 12px", border: "1px dashed #D1D5DB", borderRadius: 6, background: "none", color: "#6B7280", cursor: "pointer", fontSize: 12 }}
                    >
                      + 실천 사항 추가
                    </button>
                  </div>
                </div>

                {/* 섹션 9: 다음 상담 확인 사항 */}
                <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "12px 20px", background: "#F5F3FF", borderBottom: "1px solid #DDD6FE", fontSize: 14, fontWeight: 600, color: "#5B21B6" }}>
                    9. 다음 상담 확인 사항
                  </div>
                  <div style={{ padding: 20 }}>
                    {snNextCheckpoints.map((cp, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                        <input
                          value={cp.checkpoint}
                          onChange={(e) => {
                            const updated = [...snNextCheckpoints];
                            updated[i] = { ...updated[i], checkpoint: e.target.value };
                            setSnNextCheckpoints(updated);
                          }}
                          placeholder="다음 상담에서 꼭 확인할 사항..."
                          style={{ flex: 1, padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13 }}
                        />
                        {snNextCheckpoints.length > 1 && (
                          <button
                            onClick={() => setSnNextCheckpoints(snNextCheckpoints.filter((_, j) => j !== i))}
                            style={{ padding: "4px 8px", border: "1px solid #FCA5A5", borderRadius: 4, background: "#FEF2F2", color: "#EF4444", cursor: "pointer", fontSize: 12 }}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setSnNextCheckpoints([...snNextCheckpoints, { checkpoint: "", status: "" }])}
                      style={{ padding: "6px 12px", border: "1px dashed #D1D5DB", borderRadius: 6, background: "none", color: "#6B7280", cursor: "pointer", fontSize: 12 }}
                    >
                      + 확인 사항 추가
                    </button>
                  </div>
                </div>

                {/* 섹션 10: 운영자 공유 내용 + 상담사 전달 맥락 */}
                <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "12px 20px", background: "#FEF2F2", borderBottom: "1px solid #FECACA", fontSize: 14, fontWeight: 600, color: "#991B1B" }}>
                    10. 운영자/상담사 전달 사항
                  </div>
                  <div style={{ padding: 20, display: "grid", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>운영자에게 공유할 내용</label>
                      <textarea
                        value={snOperatorNotes}
                        onChange={(e) => setSnOperatorNotes(e.target.value)}
                        placeholder="운영팀에 알려야 할 사항 (서비스 불만, 추가 요청 등)..."
                        style={{ width: "100%", minHeight: 60, padding: 8, border: "1px solid #FCA5A5", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit", background: "#FFF5F5" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>상담사에게 전달할 맥락</label>
                      <textarea
                        value={snContextForNext}
                        onChange={(e) => setSnContextForNext(e.target.value)}
                        placeholder="다음 상담사(또는 다음 세션 선배)가 알아야 할 학생 맥락..."
                        style={{ width: "100%", minHeight: 60, padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                  </div>
                </div>

                {/* 저장 버튼 */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                  <button
                    onClick={handleSaveSeniorNote}
                    disabled={snSaving}
                    style={{
                      padding: "12px 32px", borderRadius: 8, border: "none",
                      background: "#7C3AED", color: "white", fontSize: 15, fontWeight: 600,
                      cursor: "pointer", opacity: snSaving ? 0.5 : 1,
                    }}
                  >
                    {snSaving ? "저장 중..." : "선배 상담 기록 저장"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 변화 추적 탭 */}
        {sessionTab === "delta" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {deltaLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>변화 추적 데이터 로딩 중...</div>
            ) : !deltaData || !deltaData.has_previous ? (
              <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                이전 설문이 없어 비교할 수 없습니다.
              </div>
            ) : (
              <>
                {/* 변경 요약 */}
                <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1E40AF", marginBottom: 6 }}>이전 상담 대비 변화 요약</div>
                  <div style={{ fontSize: 14, color: "#1E3A5F", marginBottom: 8 }}>{deltaData.summary}</div>
                  {deltaData.previous_timing && (
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                      이전 설문: {deltaData.previous_timing}
                      {deltaData.previous_submitted_at && ` (${new Date(deltaData.previous_submitted_at).toLocaleDateString("ko-KR")})`}
                      {currentTiming && ` → 현재: ${currentTiming}`}
                    </div>
                  )}
                </div>

                {/* 카테고리별 변경 상세 */}
                {Object.keys(deltaData.diff).length === 0 ? (
                  <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                    변경 사항이 없습니다.
                  </div>
                ) : (
                  Object.entries(deltaData.diff).map(([catId, questions]) => {
                    const changeCount = Object.keys(questions).length;
                    return (
                      <div key={catId} style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ padding: "12px 20px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                          {catId}
                          <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>({changeCount}개 변경)</span>
                        </div>
                        <div style={{ padding: "12px 20px" }}>
                          {Object.entries(questions).map(([qId, change]) => {
                            const typeColors: Record<string, string> = {
                              added: "#10B981", removed: "#EF4444", modified: "#F59E0B",
                              increased: "#3B82F6", decreased: "#EF4444",
                            };
                            const typeLabels: Record<string, string> = {
                              added: "신규", removed: "삭제", modified: "수정",
                              increased: "증가", decreased: "감소",
                            };
                            const formatVal = (v: unknown) => {
                              if (v === null || v === undefined) return "(없음)";
                              if (typeof v === "object") return JSON.stringify(v);
                              return String(v);
                            };
                            return (
                              <div key={qId} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #F3F4F6" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{qId}</span>
                                  <span style={{
                                    padding: "1px 8px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                                    color: "white", background: typeColors[change.change_type] || "#6B7280",
                                  }}>
                                    {typeLabels[change.change_type] || change.change_type}
                                  </span>
                                </div>
                                <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
                                  {change.change_type !== "added" && (
                                    <div style={{ flex: 1, padding: 10, background: "#FEF2F2", borderRadius: 6 }}>
                                      <div style={{ color: "#991B1B", fontSize: 11, marginBottom: 3, fontWeight: 600 }}>이전</div>
                                      <div style={{ color: "#7F1D1D", whiteSpace: "pre-wrap" }}>{formatVal(change.prev)}</div>
                                    </div>
                                  )}
                                  {change.change_type !== "removed" && (
                                    <div style={{ flex: 1, padding: 10, background: "#F0FDF4", borderRadius: 6 }}>
                                      <div style={{ color: "#166534", fontSize: 11, marginBottom: 3, fontWeight: 600 }}>현재</div>
                                      <div style={{ color: "#14532D", whiteSpace: "pre-wrap" }}>{formatVal(change.curr)}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* 주요 추적 포인트 안내 */}
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#92400E", marginBottom: 8 }}>상담 시 확인 포인트</div>
                  <div style={{ fontSize: 12, color: "#78350F", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div>· 성적 변화: 내신·모의고사 등급 변화가 있는지 확인</div>
                    <div>· 학습법 변화: D7 학습 방법을 변경했는지, 효과가 있었는지 확인</div>
                    <div>· 심리 변화: D8 심리·컨디션 상태의 호전/악화 확인</div>
                    <div>· 이전 로드맵 진행도: 지난 상담에서 세운 계획의 실행 여부 점검</div>
                    <div>· 목표 변화: 진로·전형 방향의 변경 여부 확인</div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 선배 기록 탭 */}
        {sessionTab === "senior-notes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {seniorNotesLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>로딩 중...</div>
            ) : seniorNotes.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>선배 상담 기록이 없습니다</div>
            ) : (
              seniorNotes.map((sn) => {
                const redacted = new Set(sn._redacted_fields || []);
                const isRed = (f: string) => redacted.has(f);
                // 섹션별 redact 판정 (해당 섹션에 속한 필드 중 하나라도 redacted)
                const redSection = {
                  core_topics: isRed("core_topics"),
                  student_questions:
                    isRed("student_questions") || isRed("senior_answers"),
                  student_observation:
                    isRed("student_mood") ||
                    isRed("study_attitude") ||
                    isRed("special_observations"),
                  action_items: isRed("action_items"),
                  next_checkpoints: isRed("next_checkpoints"),
                  context_for_next: isRed("context_for_next"),
                };
                const hasAnyRedacted =
                  (sn._redacted_fields && sn._redacted_fields.length > 0) ||
                  false;

                return (
                <div key={sn.id} style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                  {/* 헤더 */}
                  <div style={{
                    padding: "12px 20px", background: "#F5F3FF", borderBottom: "1px solid #E5E7EB",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#5B21B6" }}>
                      {sn.session_timing || `${sn.session_number}회차`} 선배 상담
                      {hasAnyRedacted && <RedactedBadge />}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>{sn.consultation_date}</div>
                  </div>

                  <div style={{ padding: 20 }}>
                    {hasAnyRedacted && (
                      <div style={{
                        padding: "8px 12px",
                        background: "#FFFBEB",
                        border: "1px solid #FDE68A",
                        borderRadius: 6,
                        fontSize: 12,
                        color: "#92400E",
                        marginBottom: 14,
                        lineHeight: 1.5,
                      }}>
                        ℹ️ 이 기록에는 선배가 비공유로 설정한 항목이 있습니다. 해당 섹션은
                        🔒 배지로 표시되며, 원본이 아닌 비공유 안내가 노출됩니다 (V1 §6).
                      </div>
                    )}

                    {/* 핵심 주제 */}
                    {(sn.core_topics?.length > 0 || redSection.core_topics) && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                          ■ 핵심 주제 진행 결과
                          {redSection.core_topics && <RedactedBadge />}
                        </div>
                        {sn.core_topics && sn.core_topics.length > 0 ? (
                          sn.core_topics.map((t, i) => (
                            <div key={i} style={{ padding: "6px 0", fontSize: 13, borderBottom: "1px solid #F3F4F6" }}>
                              <span>{t.progress_status === "충분히 다룸" ? "✓" : t.progress_status === "간단히 다룸" ? "△" : "✗"}</span>{" "}
                              <strong>{t.topic}</strong>: {t.progress_status || "미기록"}
                              {t.key_content && (
                                <div style={{ color: "#6B7280", marginTop: 2, paddingLeft: 16 }}>
                                  &quot;{t.key_content}&quot;
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <RedactedPlaceholder>
                            핵심 주제는 선배가 비공유로 설정해 이 화면에 노출되지 않습니다.
                          </RedactedPlaceholder>
                        )}
                      </div>
                    )}

                    {/* 자유 질의 */}
                    {(sn.student_questions || redSection.student_questions) && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                          ■ 자유 질의 핵심
                          {redSection.student_questions && <RedactedBadge />}
                        </div>
                        {sn.student_questions ? (
                          <div style={{ fontSize: 13, padding: "8px 12px", background: "#F9FAFB", borderRadius: 6 }}>
                            &quot;{sn.student_questions}&quot;
                            {sn.senior_answers && (
                              <div style={{ marginTop: 6, color: "#6B7280" }}>
                                &rarr; {sn.senior_answers}
                              </div>
                            )}
                          </div>
                        ) : (
                          <RedactedPlaceholder>
                            자유 질의 내용은 선배가 비공유로 설정해 노출되지 않습니다.
                          </RedactedPlaceholder>
                        )}
                      </div>
                    )}

                    {/* 학생 상태 */}
                    {(sn.student_mood || sn.study_attitude || sn.special_observations || redSection.student_observation) && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                          ■ 학생 상태 관찰
                          {redSection.student_observation && <RedactedBadge />}
                        </div>
                        {sn.student_mood || sn.study_attitude || sn.special_observations ? (
                          <>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 6, fontSize: 13 }}>
                              {sn.student_mood && <span>· 전반적 분위기: {sn.student_mood}</span>}
                              {sn.study_attitude && <span>· 공부 태도: {sn.study_attitude}</span>}
                            </div>
                            {sn.special_observations && (
                              <div style={{ padding: "6px 12px", background: "#FEF3C7", borderRadius: 6, fontSize: 13 }}>
                                · 특이사항: &quot;{sn.special_observations}&quot;
                              </div>
                            )}
                          </>
                        ) : (
                          <RedactedPlaceholder>
                            학생 상태 관찰(분위기·태도·특이사항)은 선배가 비공유로 설정해
                            노출되지 않습니다.
                          </RedactedPlaceholder>
                        )}
                      </div>
                    )}

                    {/* 실천 사항 */}
                    {(sn.action_items?.length > 0 || redSection.action_items) && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                          ■ 선배가 제안한 실천 사항
                          {redSection.action_items && <RedactedBadge />}
                        </div>
                        {sn.action_items && sn.action_items.length > 0 ? (
                          sn.action_items.map((a, i) => (
                            <div key={i} style={{ fontSize: 13, padding: "4px 0" }}>
                              {i + 1}. &quot;{a.action}&quot;
                            </div>
                          ))
                        ) : (
                          <RedactedPlaceholder>
                            선배가 제안한 실천 사항은 비공유로 설정되어 노출되지 않습니다.
                          </RedactedPlaceholder>
                        )}
                      </div>
                    )}

                    {/* 다음 확인 사항 */}
                    {(sn.next_checkpoints?.length > 0 || redSection.next_checkpoints) && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                          ■ 다음 상담 시 확인 필요 사항
                          {redSection.next_checkpoints && <RedactedBadge />}
                        </div>
                        {sn.next_checkpoints && sn.next_checkpoints.length > 0 ? (
                          sn.next_checkpoints.map((c, i) => (
                            <div key={i} style={{ fontSize: 13, padding: "4px 0" }}>
                              · {c.checkpoint}
                            </div>
                          ))
                        ) : (
                          <RedactedPlaceholder>
                            다음 확인 사항은 선배가 비공유로 설정해 노출되지 않습니다.
                          </RedactedPlaceholder>
                        )}
                      </div>
                    )}

                    {/* 맥락 전달 */}
                    {(sn.context_for_next || redSection.context_for_next) && (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                          ■ 선배가 상담사에게 전달하는 맥락
                          {redSection.context_for_next && <RedactedBadge />}
                        </div>
                        {sn.context_for_next ? (
                          <div style={{
                            padding: 12, background: "#EFF6FF", border: "1px solid #BFDBFE",
                            borderRadius: 6, fontSize: 13, lineHeight: 1.6,
                          }}>
                            {sn.context_for_next}
                          </div>
                        ) : (
                          <RedactedPlaceholder>
                            선배의 전달 맥락은 비공유로 설정되어 노출되지 않습니다.
                          </RedactedPlaceholder>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                );
              })
            )}
          </div>
        )}

      </main>
    </div>
  );
}
