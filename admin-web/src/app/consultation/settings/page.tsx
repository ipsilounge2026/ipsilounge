"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getConsultationSlots, createSlot, deleteSlot, updateSlot, getCounselors } from "@/lib/api";
import { isLoggedIn, getAdminInfo } from "@/lib/auth";

interface Slot {
  id: string;
  admin_id: string | null;
  admin_name: string | null;
  repeat_group_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  max_bookings: number;
  current_bookings: number;
  is_active: boolean;
}

interface Counselor {
  id: string;
  name: string;
  role: string;
}

export default function ConsultationSettingsPage() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [message, setMessage] = useState("");
  const [filterAdminId, setFilterAdminId] = useState("");

  // 날짜 선택 & 생성 폼
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    admin_id: "",
    start_time: "10:00",
    end_time: "11:00",
    max_bookings: 1,
    repeat_type: "" as "" | "weekly" | "monthly",
    repeat_count: 4,
  });

  // 수정 모달
  const [editSlot, setEditSlot] = useState<Slot | null>(null);
  const [editForm, setEditForm] = useState({ start_time: "", end_time: "", max_bookings: 1 });

  const adminInfo = getAdminInfo();
  const isSuperAdmin = adminInfo?.role === "super_admin";

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadCounselors();
  }, []);

  useEffect(() => { loadSlots(); }, [year, month, filterAdminId]);

  const loadCounselors = async () => {
    try { setCounselors(await getCounselors()); } catch {}
  };

  const loadSlots = async () => {
    try { setSlots(await getConsultationSlots(year, month, filterAdminId || undefined)); } catch {}
  };

  // 달력 데이터
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = new Date().toISOString().split("T")[0];

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  // 날짜별 슬롯 그룹
  const slotsByDate: Record<string, Slot[]> = {};
  slots.forEach(s => {
    if (!slotsByDate[s.date]) slotsByDate[s.date] = [];
    slotsByDate[s.date].push(s);
  });

  const selectedDateSlots = selectedDate ? (slotsByDate[selectedDate] || []).sort((a, b) => a.start_time.localeCompare(b.start_time)) : [];

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setShowCreateForm(false);
    setEditSlot(null);
  };

  const handleOpenCreate = () => {
    setShowCreateForm(true);
    setEditSlot(null);
    setCreateForm({ admin_id: "", start_time: "10:00", end_time: "11:00", max_bookings: 1, repeat_type: "", repeat_count: 4 });
  };

  const handleCreate = async () => {
    if (!selectedDate) return;
    if (createForm.end_time <= createForm.start_time) {
      setMessage("종료 시간은 시작 시간보다 이후여야 합니다");
      return;
    }
    try {
      const payload: Record<string, any> = {
        date: selectedDate,
        start_time: createForm.start_time + ":00",
        end_time: createForm.end_time + ":00",
        max_bookings: createForm.max_bookings,
      };
      if (createForm.admin_id) payload.admin_id = createForm.admin_id;
      if (createForm.repeat_type) {
        payload.repeat_type = createForm.repeat_type;
        payload.repeat_count = createForm.repeat_count;
      }
      const res = await createSlot(payload);
      setMessage(res.message);
      setShowCreateForm(false);
      loadSlots();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleOpenEdit = (slot: Slot) => {
    setEditSlot(slot);
    setShowCreateForm(false);
    setEditForm({
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
      max_bookings: slot.max_bookings,
    });
  };

  const handleUpdate = async (scope: "single" | "future_all") => {
    if (!editSlot) return;
    if (editForm.end_time <= editForm.start_time) {
      setMessage("종료 시간은 시작 시간보다 이후여야 합니다");
      return;
    }
    try {
      await updateSlot(editSlot.id, {
        start_time: editForm.start_time + ":00",
        end_time: editForm.end_time + ":00",
        max_bookings: editForm.max_bookings,
        update_scope: scope,
      });
      setMessage(scope === "future_all" ? "이후 반복 건 전체가 수정되었습니다" : "수정되었습니다");
      setEditSlot(null);
      loadSlots();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleToggleActive = async (slot: Slot) => {
    try {
      await updateSlot(slot.id, { is_active: !slot.is_active, update_scope: "single" });
      loadSlots();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleDelete = async (slot: Slot, scope: "single" | "future_all" = "single") => {
    const scopeLabel = scope === "future_all" ? "이후 반복 건 전체를" : "이 시간을";
    if (!confirm(`${scopeLabel} 삭제하시겠습니까?`)) return;
    try {
      const res = await deleteSlot(slot.id, scope);
      setMessage(res.message);
      loadSlots();
    } catch (err: any) { setMessage(err.message); }
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); setSelectedDate(null); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); setSelectedDate(null); };

  const selectedDateObj = selectedDate ? new Date(selectedDate + "T00:00:00") : null;
  const selectedDateLabel = selectedDateObj
    ? selectedDateObj.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })
    : "";

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
            <button onClick={() => setMessage("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>x</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* 좌측: 달력 */}
          <div>
            {/* 상담자 필터 (최고관리자) */}
            {isSuperAdmin && counselors.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <select className="form-control" value={filterAdminId} onChange={e => setFilterAdminId(e.target.value)}>
                  <option value="">전체 상담자</option>
                  {counselors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <button className="btn btn-outline btn-sm" onClick={prevMonth}>이전</button>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{year}년 {month}월</span>
                <button className="btn btn-outline btn-sm" onClick={nextMonth}>다음</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", gap: 2 }}>
                {["일", "월", "화", "수", "목", "금", "토"].map(d => (
                  <div key={d} style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "6px 0" }}>{d}</div>
                ))}
                {calendarDays.map((day, i) => {
                  if (day === null) return <div key={i} />;
                  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const daySlots = slotsByDate[dateStr] || [];
                  const isSelected = dateStr === selectedDate;
                  const isToday = dateStr === todayStr;
                  const activeCount = daySlots.filter(s => s.is_active).length;

                  return (
                    <div
                      key={i}
                      onClick={() => handleDateClick(dateStr)}
                      style={{
                        padding: "8px 4px",
                        cursor: "pointer",
                        borderRadius: 8,
                        background: isSelected ? "#3B82F6" : isToday ? "#EFF6FF" : "transparent",
                        color: isSelected ? "#fff" : "#111827",
                        textAlign: "center",
                        position: "relative",
                        transition: "background 0.15s",
                        minHeight: 48,
                      }}
                      onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = "#F3F4F6"; }}
                      onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = isToday ? "#EFF6FF" : "transparent"; }}
                    >
                      <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400 }}>{day}</div>
                      {activeCount > 0 && (
                        <div style={{
                          fontSize: 10,
                          color: isSelected ? "#BFDBFE" : "#3B82F6",
                          marginTop: 2,
                        }}>
                          {activeCount}건
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 우측: 선택된 날짜 상세 */}
          <div>
            {!selectedDate ? (
              <div className="card" style={{ textAlign: "center", padding: 60, color: "#9CA3AF" }}>
                달력에서 날짜를 선택해주세요
              </div>
            ) : (
              <>
                <div className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ fontSize: 16, margin: 0 }}>{selectedDateLabel}</h2>
                    <button className="btn btn-primary btn-sm" onClick={handleOpenCreate}>+ 시간 추가</button>
                  </div>

                  {/* 생성 폼 */}
                  {showCreateForm && (
                    <div style={{ padding: 16, background: "#F9FAFB", borderRadius: 8, marginBottom: 16, border: "1px solid #E5E7EB" }}>
                      {isSuperAdmin && counselors.length > 0 && (
                        <div className="form-group" style={{ marginBottom: 12 }}>
                          <label>상담자</label>
                          <select className="form-control" value={createForm.admin_id} onChange={e => setCreateForm({ ...createForm, admin_id: e.target.value })}>
                            <option value="">본인 ({adminInfo?.name})</option>
                            {counselors.filter(c => c.id !== adminInfo?.id).map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        <div className="form-group">
                          <label>시작 시간</label>
                          <input type="time" className="form-control" value={createForm.start_time}
                            onChange={e => setCreateForm({ ...createForm, start_time: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label>종료 시간</label>
                          <input type="time" className="form-control" value={createForm.end_time}
                            onChange={e => setCreateForm({ ...createForm, end_time: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label>예약 가능 수</label>
                          <input type="number" className="form-control" min={1} value={createForm.max_bookings}
                            onChange={e => setCreateForm({ ...createForm, max_bookings: Number(e.target.value) })} />
                        </div>
                      </div>

                      {/* 반복 설정 */}
                      <div style={{ marginTop: 12, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #E5E7EB" }}>
                        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block" }}>반복 설정</label>
                        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                          {[
                            { value: "", label: "반복 없음" },
                            { value: "weekly", label: "매주 반복" },
                            { value: "monthly", label: "매월 반복" },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              className={`btn btn-sm ${createForm.repeat_type === opt.value ? "btn-primary" : "btn-outline"}`}
                              onClick={() => setCreateForm({ ...createForm, repeat_type: opt.value as any })}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {createForm.repeat_type && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                            <span>{createForm.repeat_type === "weekly" ? "다음 주부터" : "다음 달부터"}</span>
                            <input
                              type="number" min={1} max={52} value={createForm.repeat_count}
                              onChange={e => setCreateForm({ ...createForm, repeat_count: Number(e.target.value) })}
                              style={{ width: 60, padding: "4px 8px", border: "1px solid #D1D5DB", borderRadius: 4, textAlign: "center" }}
                            />
                            <span>{createForm.repeat_type === "weekly" ? "주간 반복" : "개월 반복"}</span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="btn btn-primary" onClick={handleCreate}>생성</button>
                        <button className="btn btn-outline" onClick={() => setShowCreateForm(false)}>취소</button>
                      </div>
                    </div>
                  )}

                  {/* 기존 슬롯 목록 */}
                  {selectedDateSlots.length === 0 && !showCreateForm && (
                    <p style={{ color: "#9CA3AF", textAlign: "center", padding: 20 }}>설정된 시간이 없습니다</p>
                  )}

                  {selectedDateSlots.map(slot => (
                    <div key={slot.id} style={{
                      padding: "12px 16px",
                      border: `1px solid ${slot.is_active ? "#E5E7EB" : "#FCA5A5"}`,
                      borderRadius: 8,
                      marginBottom: 8,
                      opacity: slot.is_active ? 1 : 0.6,
                      background: editSlot?.id === slot.id ? "#F0F9FF" : "#fff",
                    }}>
                      {editSlot?.id === slot.id ? (
                        /* 수정 모드 */
                        <div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                            <div className="form-group">
                              <label>시작 시간</label>
                              <input type="time" className="form-control" value={editForm.start_time}
                                onChange={e => setEditForm({ ...editForm, start_time: e.target.value })} />
                            </div>
                            <div className="form-group">
                              <label>종료 시간</label>
                              <input type="time" className="form-control" value={editForm.end_time}
                                onChange={e => setEditForm({ ...editForm, end_time: e.target.value })} />
                            </div>
                            <div className="form-group">
                              <label>예약 가능 수</label>
                              <input type="number" className="form-control" min={1} value={editForm.max_bookings}
                                onChange={e => setEditForm({ ...editForm, max_bookings: Number(e.target.value) })} />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn btn-primary btn-sm" onClick={() => handleUpdate("single")}>이 건만 수정</button>
                            {slot.repeat_group_id && (
                              <button className="btn btn-sm" style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
                                onClick={() => handleUpdate("future_all")}>이후 반복 전체 수정</button>
                            )}
                            <button className="btn btn-outline btn-sm" onClick={() => setEditSlot(null)}>취소</button>
                          </div>
                        </div>
                      ) : (
                        /* 보기 모드 */
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>
                              {slot.start_time.slice(0, 5)} ~ {slot.end_time.slice(0, 5)}
                            </span>
                            {slot.admin_name && (
                              <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "#EFF6FF", color: "#2563EB" }}>
                                {slot.admin_name}
                              </span>
                            )}
                            {slot.repeat_group_id && (
                              <span style={{ fontSize: 10, padding: "2px 5px", borderRadius: 4, background: "#F3E8FF", color: "#7C3AED" }}>반복</span>
                            )}
                            <span style={{ fontSize: 12, color: "#6B7280" }}>
                              ({slot.current_bookings}/{slot.max_bookings}명)
                            </span>
                            {!slot.is_active && (
                              <span style={{ fontSize: 11, color: "#EF4444" }}>비활성</span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="btn btn-outline btn-sm" style={{ padding: "3px 8px", fontSize: 11 }}
                              onClick={() => handleOpenEdit(slot)}>수정</button>
                            <button className="btn btn-outline btn-sm" style={{ padding: "3px 8px", fontSize: 11 }}
                              onClick={() => handleToggleActive(slot)}>
                              {slot.is_active ? "비활성화" : "활성화"}
                            </button>
                            {slot.current_bookings === 0 && (
                              <>
                                <button className="btn btn-danger btn-sm" style={{ padding: "3px 8px", fontSize: 11 }}
                                  onClick={() => handleDelete(slot, "single")}>삭제</button>
                                {slot.repeat_group_id && (
                                  <button className="btn btn-sm" style={{ padding: "3px 8px", fontSize: 11, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}
                                    onClick={() => handleDelete(slot, "future_all")}>이후 전체 삭제</button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
