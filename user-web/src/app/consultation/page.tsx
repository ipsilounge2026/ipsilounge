"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getAvailableSlots, getCounselors, bookConsultation, checkConsultationEligible, checkBookingCooldown } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface Counselor {
  id: string;
  name: string;
}

interface Slot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  remaining: number;
  admin_id: string | null;
  admin_name: string | null;
}

interface EligibilityResult {
  eligible: boolean;
  reason: string | null;
  earliest_date: string | null;
  needs_survey: boolean;
}

const CONSULTATION_TYPES = [
  { value: "학생부분석", label: "학생부 분석 상담", description: "학생부 분석 결과를 바탕으로 강점/보완점 상담", requiresUpload: true },
  { value: "학종전략", label: "학종 전략 상담", description: "학생부종합전형 지원 전략 상담", requiresUpload: true },
  { value: "학습상담", label: "학습 상담", description: "학습 방법, 성적 향상 전략 상담", requiresUpload: false },
  { value: "심리상담", label: "심리 상담", description: "입시 스트레스, 진로 고민 등 심리 상담", requiresUpload: false },
  { value: "기타", label: "기타 상담", description: "그 외 입시 관련 상담", requiresUpload: false },
];

export default function ConsultationPage() {
  const router = useRouter();
  const now = new Date();
  const [step, setStep] = useState<"type" | "check" | "survey" | "booking">("type");
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // 자격 확인 관련
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);

  // 예약 UI 관련
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [selectedCounselor, setSelectedCounselor] = useState<Counselor | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookingCooldown, setBookingCooldown] = useState<{ can_book: boolean; cooldown_until: string | null; last_booked: string | null } | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
  }, []);

  // 상담 유형 선택 후 자격 확인
  const handleSelectType = async (typeValue: string) => {
    setSelectedType(typeValue);
    const typeInfo = CONSULTATION_TYPES.find(t => t.value === typeValue);

    if (typeInfo?.requiresUpload) {
      // 학생부분석/학종전략 → 자격 확인
      setStep("check");
      setCheckingEligibility(true);
      try {
        const result = await checkConsultationEligible(typeValue);
        setEligibility(result);
        if (result.eligible) {
          // 자격 충족 → 바로 예약 단계로
          setStep("booking");
          getCounselors().then(setCounselors).catch(() => {});
          checkBookingCooldown().then(setBookingCooldown).catch(() => {});
        }
      } catch {
        setEligibility({ eligible: false, reason: "자격 확인에 실패했습니다.", earliest_date: null, needs_survey: false });
      } finally {
        setCheckingEligibility(false);
      }
    } else {
      // 학습/심리/기타 → 사전조사 페이지로
      setStep("survey");
    }
  };

  // 사전조사 완료 후 예약으로 이동
  const handleSurveyComplete = () => {
    setStep("booking");
    getCounselors().then(setCounselors).catch(() => {});
    checkBookingCooldown().then(setBookingCooldown).catch(() => {});
  };

  // 상담자 선택 시 슬롯 로드
  useEffect(() => {
    if (selectedCounselor) {
      getAvailableSlots(year, month, selectedCounselor.id).then(setSlots).catch(() => {});
    } else {
      setSlots([]);
    }
  }, [year, month, selectedCounselor]);

  // 달력 데이터
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().split("T")[0];
  const earliestDate = eligibility?.earliest_date || null;
  const datesWithSlots = new Set(slots.map((s) => s.date));
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  const slotsForDate = selectedDate ? slots.filter((s) => s.date === selectedDate) : [];

  const handleSelectCounselor = (c: Counselor) => {
    setSelectedCounselor(c);
    setSelectedDate(null);
    setSelectedSlot(null);
  };

  const handleChangeCounselor = () => {
    setSelectedCounselor(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setSlots([]);
  };

  const handleBook = async () => {
    if (!selectedSlot || !selectedType) return;
    setLoading(true);
    try {
      await bookConsultation({ slot_id: selectedSlot.id, type: selectedType, memo: memo || undefined });
      setMessage("상담 예약이 신청되었습니다! 확정 알림을 기다려주세요.");
      setSelectedSlot(null);
      setSelectedDate(null);
      setMemo("");
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep("type");
    setSelectedType(null);
    setEligibility(null);
    setSelectedCounselor(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setMessage("");
    setMemo("");
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); setSelectedDate(null); setSelectedSlot(null); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); setSelectedDate(null); setSelectedSlot(null); };

  const selectedTypeLabel = CONSULTATION_TYPES.find(t => t.value === selectedType)?.label || "";

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="page-header">
          <h1>상담 라운지</h1>
          <Link href="/consultation/my" className="btn btn-outline">내 예약 보기</Link>
        </div>

        {/* Step 1: 상담 유형 선택 */}
        {step === "type" && (
          <div className="card">
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>상담 유형 선택</h2>
            <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 20 }}>원하시는 상담 유형을 선택해주세요</p>
            <div style={{ display: "grid", gap: 12 }}>
              {CONSULTATION_TYPES.map((type) => (
                <div
                  key={type.value}
                  onClick={() => handleSelectType(type.value)}
                  style={{
                    padding: "16px 20px",
                    border: "1px solid #E5E7EB",
                    borderRadius: 10,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = "#3B82F6"; e.currentTarget.style.background = "#F8FAFF"; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = ""; }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{type.label}</div>
                  <div style={{ fontSize: 13, color: "#6B7280" }}>{type.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2a: 자격 확인 중 (학생부분석/학종전략) */}
        {step === "check" && checkingEligibility && (
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <p>상담 예약 자격을 확인하고 있습니다...</p>
          </div>
        )}

        {/* Step 2b: 자격 미달 (학생부분석/학종전략) */}
        {step === "check" && !checkingEligibility && eligibility && !eligibility.eligible && (
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontSize: 18, marginBottom: 12, color: "var(--gray-700)" }}>
              {selectedTypeLabel} 예약 조건
            </h2>
            <div style={{
              padding: 16,
              borderRadius: 8,
              backgroundColor: "#FEF3C7",
              border: "1px solid #FDE68A",
              marginBottom: 20,
              textAlign: "left",
            }}>
              <p style={{ fontSize: 14, color: "#92400E", margin: 0, lineHeight: 1.6 }}>
                {eligibility.reason}
              </p>
            </div>
            {eligibility.reason?.includes("업로드를 완료") ? (
              <>
                <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 20, lineHeight: 1.6 }}>
                  신청은 완료되었습니다. 학생부 파일을 업로드하면<br />
                  학생부 분석 후 상담 진행을 위해 상담 예약이 가능합니다.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <Link href="/analysis" className="btn btn-primary">학생부 업로드하러 가기</Link>
                  <button onClick={handleBack} className="btn btn-outline">다른 상담 유형 선택</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 20, lineHeight: 1.6 }}>
                  {selectedTypeLabel}은 학생부 라운지 또는 학종 라운지를 신청하고<br />
                  학생부 파일 업로드를 완료한 후 이용 가능합니다.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                  <Link href="/analysis/apply?type=학생부라운지" className="btn btn-primary">학생부 라운지 신청</Link>
                  <Link href="/analysis/apply?type=학종라운지" className="btn btn-outline">학종 라운지 신청</Link>
                </div>
                <div style={{ marginTop: 12 }}>
                  <button onClick={handleBack} style={{ fontSize: 13, color: "#6B7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                    다른 상담 유형 선택
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2c: 사전 조사 (학습/심리/기타) */}
        {step === "survey" && (
          <div className="card" style={{ padding: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <button onClick={handleBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#6B7280" }}>←</button>
              <h2 style={{ fontSize: 16, margin: 0 }}>{selectedTypeLabel} - 사전 조사</h2>
            </div>
            <div style={{
              padding: 24,
              borderRadius: 8,
              backgroundColor: "#F9FAFB",
              border: "1px solid #E5E7EB",
              textAlign: "center",
              marginBottom: 20,
            }}>
              <p style={{ fontSize: 14, color: "#6B7280", margin: 0, lineHeight: 1.8 }}>
                사전 조사 페이지는 준비 중입니다.<br />
                아래 버튼을 눌러 바로 예약을 진행해주세요.
              </p>
            </div>
            <button onClick={handleSurveyComplete} className="btn btn-primary btn-block btn-lg">
              예약 진행하기
            </button>
          </div>
        )}

        {/* Step 3: 예약 UI */}
        {step === "booking" && (
          <>
            {/* 선택된 상담 유형 표시 */}
            <div style={{
              padding: "10px 16px",
              background: "#F0FDF4",
              border: "1px solid #BBF7D0",
              borderRadius: 8,
              marginBottom: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span style={{ fontSize: 14, color: "#166534" }}>
                <strong>{selectedTypeLabel}</strong> 선택됨
              </span>
              <button onClick={handleBack} style={{ fontSize: 13, color: "#166534", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                변경
              </button>
            </div>

            {/* earliest_date 안내 배너 */}
            {earliestDate && earliestDate > today && (
              <div style={{
                padding: "12px 16px",
                background: "#EFF6FF",
                border: "1px solid #BFDBFE",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
                color: "#1E40AF",
                lineHeight: 1.6,
              }}>
                학생부 분석 후 상담 진행을 위해 <strong>{earliestDate.replace(/-/g, ".")}</strong> 이후 날짜부터 예약 가능합니다.
              </div>
            )}

            {/* 쿨다운 배너 */}
            {bookingCooldown && !bookingCooldown.can_book && (
              <div style={{
                padding: "12px 16px",
                background: "#FEF3C7",
                border: "1px solid #FDE68A",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 14,
                color: "#92400E",
                lineHeight: 1.6,
              }}>
                이전 상담 예약일({bookingCooldown.last_booked?.replace(/-/g, ".")}) 기준 3개월 이후({bookingCooldown.cooldown_until?.replace(/-/g, ".")})부터 재예약이 가능합니다.
              </div>
            )}

            {message && (
              <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14, color: "#155724" }}>
                {message}
              </div>
            )}

            {/* 상담자 선택 */}
            {!selectedCounselor ? (
              <div className="card" style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, marginBottom: 4 }}>상담자 선택</h2>
                <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 16 }}>상담을 진행할 상담자를 선택해주세요</p>

                {counselors.length === 0 ? (
                  <p style={{ color: "var(--gray-500)", textAlign: "center", padding: 20 }}>현재 예약 가능한 상담자가 없습니다</p>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {counselors.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCounselor(c)}
                        style={{
                          padding: "16px 20px",
                          border: "1px solid #E5E7EB",
                          borderRadius: 10,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          transition: "all 0.15s",
                        }}
                        onMouseOver={e => { e.currentTarget.style.borderColor = "#3B82F6"; e.currentTarget.style.background = "#F8FAFF"; }}
                        onMouseOut={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = ""; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 40, height: 40, borderRadius: "50%",
                            background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 700, color: "#3B82F6", fontSize: 16,
                          }}>
                            {c.name.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</span>
                        </div>
                        <span style={{ color: "#3B82F6", fontSize: 13 }}>선택</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* 선택된 상담자 표시 */}
                <div style={{
                  padding: "12px 16px",
                  background: "#EFF6FF",
                  border: "1px solid #BFDBFE",
                  borderRadius: 8,
                  marginBottom: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, color: "#fff", fontSize: 14,
                    }}>
                      {selectedCounselor.name.charAt(0)}
                    </div>
                    <span style={{ fontWeight: 600 }}>{selectedCounselor.name}</span>
                    <span style={{ fontSize: 13, color: "#6B7280" }}>상담자</span>
                  </div>
                  <button
                    onClick={handleChangeCounselor}
                    style={{ fontSize: 13, color: "#3B82F6", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                  >
                    변경
                  </button>
                </div>

                {/* 달력 */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <button className="btn btn-outline btn-sm" onClick={prevMonth}>이전</button>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{year}년 {month}월</span>
                    <button className="btn btn-outline btn-sm" onClick={nextMonth}>다음</button>
                  </div>

                  <div className="calendar-grid">
                    {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                      <div key={d} className="calendar-header">{d}</div>
                    ))}
                    {calendarDays.map((day, i) => {
                      if (day === null) return <div key={i} className="calendar-day empty" />;
                      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const hasSlots = datesWithSlots.has(dateStr);
                      const isPast = dateStr < today;
                      const isBeforeEarliest = earliestDate ? dateStr < earliestDate : false;
                      const isDisabled = isPast || isBeforeEarliest;
                      const isSelected = dateStr === selectedDate;

                      return (
                        <div
                          key={i}
                          className={`calendar-day ${isSelected ? "selected" : ""} ${hasSlots && !isDisabled ? "has-slots" : ""} ${isDisabled ? "disabled" : ""} ${dateStr === today ? "today" : ""}`}
                          onClick={() => { if (!isDisabled && hasSlots) { setSelectedDate(dateStr); setSelectedSlot(null); } }}
                        >
                          {day}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 시간대 선택 */}
                {selectedDate && (
                  <div className="card" style={{ marginBottom: 16 }}>
                    <h2 style={{ fontSize: 16, marginBottom: 12 }}>
                      {new Date(selectedDate + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })} 예약 가능 시간
                    </h2>
                    {slotsForDate.length === 0 ? (
                      <p style={{ color: "var(--gray-500)" }}>이 날짜에 예약 가능한 시간이 없습니다</p>
                    ) : (
                      <div className="slot-grid">
                        {slotsForDate.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((slot) => (
                          <div
                            key={slot.id}
                            className={`slot-btn ${selectedSlot?.id === slot.id ? "selected" : ""} ${slot.remaining === 0 ? "disabled" : ""}`}
                            onClick={() => { if (slot.remaining > 0) setSelectedSlot(slot); }}
                          >
                            <div className="slot-time">{slot.start_time.slice(0, 5)} ~ {slot.end_time.slice(0, 5)}</div>
                            <div className="slot-remaining">{slot.remaining > 0 ? `${slot.remaining}자리 남음` : "마감"}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 예약 폼 */}
                {selectedSlot && (
                  <div className="card">
                    <h2 style={{ fontSize: 16, marginBottom: 16 }}>예약 정보 입력</h2>
                    <div className="form-group">
                      <label>상담 유형</label>
                      <input className="form-control" value={selectedTypeLabel} disabled style={{ background: "#F9FAFB" }} />
                    </div>
                    <div className="form-group">
                      <label>사전 질문 (선택)</label>
                      <textarea className="form-control" value={memo} onChange={(e) => setMemo(e.target.value)}
                        placeholder="상담 전에 궁금한 점이 있으면 입력해주세요" />
                    </div>
                    <button className="btn btn-primary btn-block btn-lg" onClick={handleBook} disabled={loading || bookingCooldown === null || !bookingCooldown.can_book}>
                      {loading ? "예약 중..." : bookingCooldown === null ? "확인 중..." : !bookingCooldown.can_book ? "쿨다운 기간" : "상담 예약 신청"}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      <Footer />
    </>
  );
}
