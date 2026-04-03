"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  getMe,
  getSeminarSchedules,
  getSeminarAvailability,
  createSeminarReservation,
} from "@/lib/api";

const TIME_SLOT_LABELS: Record<string, string> = {
  morning: "오전",
  afternoon: "오후",
  evening: "저녁",
};

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function SeminarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);
  const [availability, setAvailability] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [form, setForm] = useState({ contact_name: "", contact_phone: "", attendee_count: 1, memo: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const me = await getMe();
        if (me.member_type !== "branch_manager") {
          alert("지점 담당자만 이용 가능합니다");
          router.push("/");
          return;
        }
        setUser(me);
        setForm((prev) => ({ ...prev, contact_name: me.name || "", contact_phone: me.phone || "" }));
      } catch {
        router.push("/login");
        return;
      }

      try {
        const scheds = await getSeminarSchedules();
        setSchedules(scheds);
      } catch (e: any) {
        console.error(e);
      }
      setLoading(false);
    };
    loadUser();
  }, []);

  const loadAvailability = async (scheduleId: string) => {
    try {
      const data = await getSeminarAvailability(scheduleId);
      setAvailability(data);
      setSelectedDate("");
      setSelectedSlot("");
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleSelectSchedule = (sched: any) => {
    setSelectedSchedule(sched);
    loadAvailability(sched.id);
  };

  // 캘린더 렌더링
  const renderCalendar = () => {
    if (!availability) return null;
    const { year, month } = currentMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const availableDatesMap: Record<string, any> = {};
    (availability.available_dates || []).forEach((d: any) => {
      availableDatesMap[d.date] = d;
    });

    const cells: React.ReactNode[] = [];
    // 빈 칸
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} style={{ padding: 8 }} />);
    }
    // 날짜
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const avail = availableDatesMap[dateStr];
      const isSelected = selectedDate === dateStr;
      const dayOfWeek = new Date(year, month, day).getDay();

      cells.push(
        <div
          key={dateStr}
          onClick={() => avail && setSelectedDate(dateStr)}
          style={{
            padding: 8,
            textAlign: "center",
            borderRadius: 8,
            cursor: avail ? "pointer" : "default",
            backgroundColor: isSelected ? "#3b82f6" : avail ? "#eff6ff" : "transparent",
            color: isSelected ? "#fff" : dayOfWeek === 0 ? "#ef4444" : dayOfWeek === 6 ? "#3b82f6" : avail ? "#1e40af" : "#d1d5db",
            fontWeight: avail ? 600 : 400,
            border: isSelected ? "2px solid #2563eb" : "1px solid transparent",
          }}
        >
          {day}
          {avail && (
            <div style={{ fontSize: 8, marginTop: 2 }}>
              {avail.morning_remaining > 0 && <span style={{ color: isSelected ? "#fff" : "#f59e0b" }}>AM </span>}
              {avail.afternoon_remaining > 0 && <span style={{ color: isSelected ? "#fff" : "#10b981" }}>PM </span>}
              {avail.evening_remaining > 0 && <span style={{ color: isSelected ? "#fff" : "#8b5cf6" }}>EVE</span>}
            </div>
          )}
        </div>
      );
    }

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <button className="btn btn-sm btn-outline" onClick={() => setCurrentMonth((p) => p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 })}>&lt;</button>
          <span style={{ fontWeight: 600 }}>{year}년 {month + 1}월</span>
          <button className="btn btn-sm btn-outline" onClick={() => setCurrentMonth((p) => p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 })}>&gt;</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {DAYS.map((d, i) => (
            <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, padding: 4, color: i === 0 ? "#ef4444" : i === 6 ? "#3b82f6" : "#6b7280" }}>{d}</div>
          ))}
          {cells}
        </div>
      </div>
    );
  };

  // 선택된 날짜의 시간대
  const getDateSlots = () => {
    if (!selectedDate || !availability) return null;
    const dateInfo = (availability.available_dates || []).find((d: any) => d.date === selectedDate);
    if (!dateInfo) return null;

    const slots = [];
    if (dateInfo.morning_remaining > 0) slots.push({ key: "morning", label: "오전", remaining: dateInfo.morning_remaining });
    if (dateInfo.afternoon_remaining > 0) slots.push({ key: "afternoon", label: "오후", remaining: dateInfo.afternoon_remaining });
    if (dateInfo.evening_remaining > 0) slots.push({ key: "evening", label: "저녁", remaining: dateInfo.evening_remaining });

    return slots;
  };

  const handleSubmit = async () => {
    if (!selectedSchedule || !selectedDate || !selectedSlot) {
      alert("설명회, 날짜, 시간대를 선택해주세요");
      return;
    }
    if (!form.contact_name.trim() || !form.contact_phone.trim() || form.attendee_count < 1) {
      alert("담당자 정보와 참석 인원을 입력해주세요");
      return;
    }
    setSubmitting(true);
    try {
      await createSeminarReservation({
        schedule_id: selectedSchedule.id,
        reservation_date: selectedDate,
        time_slot: selectedSlot,
        contact_name: form.contact_name,
        contact_phone: form.contact_phone,
        attendee_count: form.attendee_count,
        memo: form.memo || undefined,
      });
      alert("예약 신청이 완료되었습니다. 관리자 승인 후 확정됩니다.");
      router.push("/seminar/my");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <><Navbar /><div style={{ padding: 40, textAlign: "center" }}>로딩 중...</div></>;

  const dateSlots = getDateSlots();

  return (
    <>
    <Navbar />
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>설명회 예약</h1>

      {schedules.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", backgroundColor: "#f9fafb", borderRadius: 12 }}>
          현재 신청 가능한 설명회가 없습니다
        </div>
      ) : (
        <>
          {/* 설명회 선택 */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}>설명회 선택</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {schedules.map((s: any) => (
                <div
                  key={s.id}
                  onClick={() => handleSelectSchedule(s)}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: selectedSchedule?.id === s.id ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                    backgroundColor: selectedSchedule?.id === s.id ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
                  {s.description && <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>{s.description}</div>}
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    {s.start_date} ~ {s.end_date} | 마감: {new Date(s.deadline_at).toLocaleString("ko-KR")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 캘린더 */}
          {availability && (
            <div style={{ marginBottom: 24, padding: 16, backgroundColor: "#fff", borderRadius: 12, border: "1px solid #e5e7eb" }}>
              <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}>날짜 선택</h3>
              {renderCalendar()}
            </div>
          )}

          {/* 시간대 선택 */}
          {dateSlots && (
            <div style={{ marginBottom: 24, padding: 16, backgroundColor: "#fff", borderRadius: 12, border: "1px solid #e5e7eb" }}>
              <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}>{selectedDate} 시간대 선택</h3>
              <div style={{ display: "flex", gap: 8 }}>
                {dateSlots.map((slot: any) => (
                  <button
                    key={slot.key}
                    onClick={() => setSelectedSlot(slot.key)}
                    style={{
                      flex: 1,
                      padding: "12px 16px",
                      borderRadius: 8,
                      border: selectedSlot === slot.key ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                      backgroundColor: selectedSlot === slot.key ? "#eff6ff" : "#fff",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{slot.label}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>잔여 {slot.remaining}자리</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 신청 폼 */}
          {selectedSlot && (
            <div style={{ marginBottom: 24, padding: 16, backgroundColor: "#fff", borderRadius: 12, border: "1px solid #e5e7eb" }}>
              <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}>신청 정보</h3>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>담당자 이름 *</label>
                  <input className="form-control" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} style={{ width: "100%" }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>연락처 *</label>
                  <input className="form-control" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} style={{ width: "100%" }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>참석 예정 인원 *</label>
                  <input className="form-control" type="number" min={1} value={form.attendee_count} onChange={(e) => setForm({ ...form, attendee_count: Number(e.target.value) })} style={{ width: "100%" }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>요청사항 (선택)</label>
                  <textarea className="form-control" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} rows={3} style={{ width: "100%" }} />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{ padding: "12px 24px", fontSize: 16 }}
                >
                  {submitting ? "신청 중..." : "예약 신청"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    <Footer />
    </>
  );
}
