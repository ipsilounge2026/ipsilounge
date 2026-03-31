"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getConsultationSlots, createSlotsBulk, deleteSlot, updateSlot } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface Slot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  max_bookings: number;
  current_bookings: number;
  is_active: boolean;
}

export default function ConsultationSettingsPage() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [message, setMessage] = useState("");

  // 일괄 생성 폼
  const [bulkForm, setBulkForm] = useState({
    start_date: "",
    end_date: "",
    weekdays: [0, 1, 2, 3, 4] as number[],
    start_time: "10:00",
    end_time: "18:00",
    duration_minutes: 60,
    max_bookings: 1,
  });

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadSlots();
  }, [year, month]);

  const loadSlots = async () => {
    try {
      const res = await getConsultationSlots(year, month);
      setSlots(res);
    } catch {}
  };

  const handleBulkCreate = async () => {
    if (!bulkForm.start_date || !bulkForm.end_date) {
      setMessage("시작일과 종료일을 입력해주세요");
      return;
    }
    try {
      const res = await createSlotsBulk({
        ...bulkForm,
        start_time: bulkForm.start_time + ":00",
        end_time: bulkForm.end_time + ":00",
      });
      setMessage(res.message);
      loadSlots();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleToggleActive = async (slot: Slot) => {
    try {
      await updateSlot(slot.id, { is_active: !slot.is_active });
      loadSlots();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleDelete = async (slotId: string) => {
    if (!confirm("이 시간대를 삭제하시겠습니까?")) return;
    try {
      await deleteSlot(slotId);
      setMessage("시간대가 삭제되었습니다");
      loadSlots();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const weekdayLabels = ["월", "화", "수", "목", "금", "토", "일"];

  const toggleWeekday = (day: number) => {
    setBulkForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort(),
    }));
  };

  // 날짜별로 그룹화
  const groupedSlots: Record<string, Slot[]> = {};
  slots.forEach((s) => {
    if (!groupedSlots[s.date]) groupedSlots[s.date] = [];
    groupedSlots[s.date].push(s);
  });

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>상담 시간 설정</h1>
          <button className="btn btn-outline" onClick={() => router.push("/consultation")}>예약 현황</button>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
          </div>
        )}

        {/* 일괄 생성 */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>상담 시간 일괄 생성</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
            <div className="form-group">
              <label>시작일</label>
              <input type="date" className="form-control" value={bulkForm.start_date}
                onChange={(e) => setBulkForm({ ...bulkForm, start_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>종료일</label>
              <input type="date" className="form-control" value={bulkForm.end_date}
                onChange={(e) => setBulkForm({ ...bulkForm, end_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>상담 시작 시간</label>
              <input type="time" className="form-control" value={bulkForm.start_time}
                onChange={(e) => setBulkForm({ ...bulkForm, start_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label>상담 종료 시간</label>
              <input type="time" className="form-control" value={bulkForm.end_time}
                onChange={(e) => setBulkForm({ ...bulkForm, end_time: e.target.value })} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 16 }}>
            <div className="form-group">
              <label>요일 선택</label>
              <div style={{ display: "flex", gap: 8 }}>
                {weekdayLabels.map((label, i) => (
                  <button
                    key={i}
                    className={`btn btn-sm ${bulkForm.weekdays.includes(i) ? "btn-primary" : "btn-outline"}`}
                    onClick={() => toggleWeekday(i)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>1회 소요시간 (분)</label>
              <input type="number" className="form-control" value={bulkForm.duration_minutes}
                onChange={(e) => setBulkForm({ ...bulkForm, duration_minutes: Number(e.target.value) })} />
            </div>
            <div className="form-group">
              <label>동시 예약 가능 수</label>
              <input type="number" className="form-control" value={bulkForm.max_bookings} min={1}
                onChange={(e) => setBulkForm({ ...bulkForm, max_bookings: Number(e.target.value) })} />
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleBulkCreate}>일괄 생성</button>
        </div>

        {/* 월 선택 */}
        <div className="filter-bar" style={{ marginBottom: 16 }}>
          <button className="btn btn-outline btn-sm" onClick={() => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); }}>이전 달</button>
          <span style={{ fontWeight: 600 }}>{year}년 {month}월</span>
          <button className="btn btn-outline btn-sm" onClick={() => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); }}>다음 달</button>
          <span style={{ color: "var(--gray-600)", fontSize: 14 }}>총 {slots.length}개 시간대</span>
        </div>

        {/* 시간대 목록 */}
        {Object.entries(groupedSlots).sort().map(([date, dateSlots]) => (
          <div key={date} className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, marginBottom: 12, color: "var(--gray-700)" }}>
              {new Date(date + "T00:00:00").toLocaleDateString("ko-KR", { weekday: "long", month: "long", day: "numeric" })}
            </h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {dateSlots.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((slot) => (
                <div
                  key={slot.id}
                  style={{
                    padding: "8px 12px",
                    border: `1px solid ${slot.is_active ? "var(--gray-300)" : "var(--danger)"}`,
                    borderRadius: 8,
                    fontSize: 13,
                    opacity: slot.is_active ? 1 : 0.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>{slot.start_time.slice(0, 5)} ~ {slot.end_time.slice(0, 5)}</span>
                  <span style={{ color: "var(--gray-500)" }}>({slot.current_bookings}/{slot.max_bookings})</span>
                  <button className="btn btn-outline btn-sm" style={{ padding: "2px 6px", fontSize: 11 }}
                    onClick={() => handleToggleActive(slot)}>
                    {slot.is_active ? "비활성화" : "활성화"}
                  </button>
                  {slot.current_bookings === 0 && (
                    <button className="btn btn-danger btn-sm" style={{ padding: "2px 6px", fontSize: 11 }}
                      onClick={() => handleDelete(slot.id)}>삭제</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {Object.keys(groupedSlots).length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>
            이 달에 설정된 상담 시간이 없습니다
          </div>
        )}
      </main>
    </div>
  );
}
