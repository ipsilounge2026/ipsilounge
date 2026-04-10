"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { getBookingDetail, updateBookingStatus, createConsultationNote } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

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
  surveys: { id: string; survey_type: string; timing: string | null; status: string; submitted_at: string | null }[];
}

interface CheckItem {
  id: string;
  label: string;
  checked: boolean;
  category: string;
}

const DEFAULT_CHECKLIST: Omit<CheckItem, "checked">[] = [
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

const CONSULTATION_MINUTES = 50;

type SessionTab = "checklist" | "notes";

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

  // Checklist
  const [checklist, setChecklist] = useState<CheckItem[]>(
    DEFAULT_CHECKLIST.map((c) => ({ ...c, checked: false }))
  );

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
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  };

  const startTimer = useCallback(() => {
    if (timerRunning) return;
    setTimerRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }, [timerRunning]);

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
  const categories = [...new Set(DEFAULT_CHECKLIST.map((c) => c.category))];

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
                    style={{
                      padding: "10px 32px", borderRadius: 8, border: "none",
                      background: "#3B82F6", color: "white", fontSize: 15, fontWeight: 600, cursor: "pointer",
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

        {/* 체크리스트/메모 탭 */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid #E5E7EB" }}>
          {(["checklist", "notes"] as SessionTab[]).map((tab) => (
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
              {tab === "checklist" ? `체크리스트 (${checkedCount}/${checklist.length})` : "상담 기록"}
            </button>
          ))}
        </div>

        {/* 체크리스트 */}
        {sessionTab === "checklist" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {categories.map((cat) => (
              <div key={cat} style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                <div style={{
                  padding: "10px 20px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB",
                  fontSize: 13, fontWeight: 600, color: "#374151",
                }}>
                  {cat}
                </div>
                <div style={{ padding: "8px 20px" }}>
                  {checklist
                    .filter((c) => c.category === cat)
                    .map((item) => (
                      <label
                        key={item.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
                          cursor: "pointer", borderBottom: "1px solid #F3F4F6",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => toggleCheck(item.id)}
                          style={{ width: 18, height: 18, cursor: "pointer" }}
                        />
                        <span style={{
                          fontSize: 14,
                          textDecoration: item.checked ? "line-through" : "none",
                          color: item.checked ? "#9CA3AF" : "#374151",
                        }}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 상담 기록 */}
        {sessionTab === "notes" && (
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
      </main>
    </div>
  );
}
