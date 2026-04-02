"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getAvailableSlots, bookConsultation, checkConsultationEligible } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface Slot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  remaining: number;
}

interface EligibilityResult {
  eligible: boolean;
  reason: string | null;
  earliest_date: string | null;
}

export default function ConsultationPage() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [consultType, setConsultType] = useState("학생부분석");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    checkConsultationEligible()
      .then(setEligibility)
      .catch(() => setEligibility({ eligible: false, reason: "자격 확인에 실패했습니다.", earliest_date: null }))
      .finally(() => setCheckingEligibility(false));
  }, []);

  useEffect(() => {
    if (eligibility?.eligible) {
      getAvailableSlots(year, month).then(setSlots).catch(() => {});
    }
  }, [year, month, eligibility]);

  // 달력 데이터 생성
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().split("T")[0];

  const datesWithSlots = new Set(slots.map((s) => s.date));

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const slotsForDate = selectedDate ? slots.filter((s) => s.date === selectedDate) : [];

  const handleBook = async () => {
    if (!selectedSlot) return;
    setLoading(true);
    try {
      await bookConsultation({ slot_id: selectedSlot.id, type: consultType, memo: memo || undefined });
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

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  if (checkingEligibility) {
    return (
      <>
        <Navbar />
        <div className="container" style={{ maxWidth: 640, textAlign: "center", padding: 60 }}>
          <p>상담 예약 자격을 확인하고 있습니다...</p>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="page-header">
          <h1>상담 라운지</h1>
          <Link href="/consultation/my" className="btn btn-outline">내 예약 보기</Link>
        </div>

        {/* 자격 미달 시 안내 */}
        {eligibility && !eligibility.eligible && (
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontSize: 18, marginBottom: 12, color: "var(--gray-700)" }}>상담 예약 조건</h2>
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
            <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 20, lineHeight: 1.6 }}>
              상담 라운지는 학생부 라운지 또는 학종 라운지를 신청하고<br />
              학생부 파일 업로드를 완료한 후 이용 가능합니다.<br />
              학생부 분석에 최소 7일이 소요되므로, 업로드 완료일 기준 7일 이후부터 상담 예약이 가능합니다.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Link href="/analysis/apply?type=학생부라운지" className="btn btn-primary">학생부 라운지 신청</Link>
              <Link href="/analysis/apply?type=학종라운지" className="btn btn-outline">학종 라운지 신청</Link>
            </div>
          </div>
        )}

        {/* 자격 충족 시 예약 UI */}
        {eligibility?.eligible && (
          <>
            {message && (
              <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14, color: "#155724" }}>
                {message}
              </div>
            )}

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
                  const isSelected = dateStr === selectedDate;

                  return (
                    <div
                      key={i}
                      className={`calendar-day ${isSelected ? "selected" : ""} ${hasSlots ? "has-slots" : ""} ${isPast ? "disabled" : ""} ${dateStr === today ? "today" : ""}`}
                      onClick={() => { if (!isPast && hasSlots) { setSelectedDate(dateStr); setSelectedSlot(null); } }}
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
                  <select className="form-control" value={consultType} onChange={(e) => setConsultType(e.target.value)}>
                    <option value="학생부분석">학생부 분석 상담</option>
                    <option value="입시전략">입시 전략 상담</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>사전 질문 (선택)</label>
                  <textarea className="form-control" value={memo} onChange={(e) => setMemo(e.target.value)}
                    placeholder="상담 전에 궁금한 점이 있으면 입력해주세요" />
                </div>
                <button className="btn btn-primary btn-block btn-lg" onClick={handleBook} disabled={loading}>
                  {loading ? "예약 중..." : "상담 예약 신청"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </>
  );
}
