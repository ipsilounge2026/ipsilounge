"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isLoggedIn, hasMenuAccess, getDefaultRoute } from "@/lib/auth";
import {
  getSeminarSchedules,
  createSeminarSchedule,
  updateSeminarSchedule,
  deleteSeminarSchedule,
  toggleSeminarVisibility,
} from "@/lib/api";
import Link from "next/link";

export default function SeminarSchedulesPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    blocked_dates: [] as string[],
    morning_max: 0,
    afternoon_max: 0,
    evening_max: 0,
    deadline_at: "",
    is_visible: true,
  });

  const load = async () => {
    try {
      const data = await getSeminarSchedules();
      setSchedules(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    if (!hasMenuAccess("seminar")) { router.push(getDefaultRoute()); return; }
    load();
  }, []);

  const resetForm = () => {
    setForm({ title: "", description: "", start_date: "", end_date: "", blocked_dates: [], morning_max: 0, afternoon_max: 0, evening_max: 0, deadline_at: "", is_visible: true });
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (s: any) => {
    setForm({
      title: s.title,
      description: s.description || "",
      start_date: s.start_date,
      end_date: s.end_date,
      blocked_dates: s.blocked_dates || [],
      morning_max: s.morning_max,
      afternoon_max: s.afternoon_max,
      evening_max: s.evening_max,
      deadline_at: s.deadline_at ? s.deadline_at.slice(0, 16) : "",
      is_visible: s.is_visible,
    });
    setEditId(s.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title || !form.start_date || !form.end_date || !form.deadline_at) {
      alert("필수 항목을 입력해주세요");
      return;
    }
    try {
      const payload = {
        ...form,
        blocked_dates: form.blocked_dates.length > 0 ? form.blocked_dates : undefined,
      };
      if (editId) {
        await updateSeminarSchedule(editId, payload);
      } else {
        await createSeminarSchedule(payload);
      }
      resetForm();
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 일정을 삭제하시겠습니까? 관련 예약도 모두 삭제됩니다.")) return;
    try {
      await deleteSeminarSchedule(id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleToggleVisibility = async (id: string) => {
    try {
      await toggleSeminarVisibility(id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // blocked dates: 시작~종료 범위 내에서 클릭 토글
  const generateDateRange = () => {
    if (!form.start_date || !form.end_date) return [];
    const dates: string[] = [];
    const start = new Date(form.start_date);
    const end = new Date(form.end_date);
    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().split("T")[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const toggleBlockedDate = (d: string) => {
    setForm((prev) => ({
      ...prev,
      blocked_dates: prev.blocked_dates.includes(d)
        ? prev.blocked_dates.filter((x) => x !== d)
        : [...prev.blocked_dates, d],
    }));
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 className="page-title">설명회 일정 관리</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/seminar" className="btn btn-outline" style={{ textDecoration: "none" }}>목록으로</Link>
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>일정 등록</button>
        </div>
      </div>

      {/* 등록/수정 폼 */}
      {showForm && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>{editId ? "일정 수정" : "새 일정 등록"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">설명회 제목 *</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: "100%" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">설명 내용</label>
              <textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} style={{ width: "100%" }} />
            </div>
            <div>
              <label className="form-label">신청 시작일 *</label>
              <input className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={{ width: "100%" }} />
            </div>
            <div>
              <label className="form-label">신청 종료일 *</label>
              <input className="input" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={{ width: "100%" }} />
            </div>
            <div>
              <label className="form-label">오전 최대 예약 수 (0=미운영)</label>
              <input className="input" type="number" min={0} value={form.morning_max} onChange={(e) => setForm({ ...form, morning_max: Number(e.target.value) })} style={{ width: "100%" }} />
            </div>
            <div>
              <label className="form-label">오후 최대 예약 수 (0=미운영)</label>
              <input className="input" type="number" min={0} value={form.afternoon_max} onChange={(e) => setForm({ ...form, afternoon_max: Number(e.target.value) })} style={{ width: "100%" }} />
            </div>
            <div>
              <label className="form-label">저녁 최대 예약 수 (0=미운영)</label>
              <input className="input" type="number" min={0} value={form.evening_max} onChange={(e) => setForm({ ...form, evening_max: Number(e.target.value) })} style={{ width: "100%" }} />
            </div>
            <div>
              <label className="form-label">예약 마감일시 *</label>
              <input className="input" type="datetime-local" value={form.deadline_at} onChange={(e) => setForm({ ...form, deadline_at: e.target.value })} style={{ width: "100%" }} />
            </div>
            <div>
              <label className="form-label">공개 여부</label>
              <select className="input" value={form.is_visible ? "true" : "false"} onChange={(e) => setForm({ ...form, is_visible: e.target.value === "true" })} style={{ width: "100%" }}>
                <option value="true">공개</option>
                <option value="false">비공개</option>
              </select>
            </div>
          </div>

          {/* 신청 불가 날짜 선택 */}
          {form.start_date && form.end_date && (
            <div style={{ marginTop: 16 }}>
              <label className="form-label">신청 불가 날짜 (클릭하여 선택/해제)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {generateDateRange().map((d) => {
                  const isBlocked = form.blocked_dates.includes(d);
                  const dayOfWeek = new Date(d).getDay();
                  const dayLabel = ["일", "월", "화", "수", "목", "금", "토"][dayOfWeek];
                  return (
                    <button
                      key={d}
                      onClick={() => toggleBlockedDate(d)}
                      style={{
                        padding: "4px 8px",
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        backgroundColor: isBlocked ? "#ef4444" : "#fff",
                        color: isBlocked ? "#fff" : dayOfWeek === 0 ? "#ef4444" : dayOfWeek === 6 ? "#3b82f6" : "#374151",
                        cursor: "pointer",
                      }}
                    >
                      {d.slice(5)} ({dayLabel})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn btn-outline" onClick={resetForm}>취소</button>
            <button className="btn btn-primary" onClick={handleSubmit}>{editId ? "수정" : "등록"}</button>
          </div>
        </div>
      )}

      {/* 일정 목록 */}
      <div className="card" style={{ overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>제목</th>
              <th>신청 기간</th>
              <th>시간대(오전/오후/저녁)</th>
              <th>마감일</th>
              <th>공개</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {schedules.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>등록된 일정이 없습니다</td></tr>
            )}
            {schedules.map((s: any) => (
              <tr key={s.id}>
                <td>{s.title}</td>
                <td>{s.start_date} ~ {s.end_date}</td>
                <td>{s.morning_max} / {s.afternoon_max} / {s.evening_max}</td>
                <td>{s.deadline_at ? new Date(s.deadline_at).toLocaleString("ko-KR") : "-"}</td>
                <td>
                  <button
                    className={`btn btn-sm ${s.is_visible ? "btn-primary" : "btn-outline"}`}
                    onClick={() => handleToggleVisibility(s.id)}
                  >
                    {s.is_visible ? "공개" : "비공개"}
                  </button>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-sm btn-outline" onClick={() => handleEdit(s)}>수정</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </main>
    </div>
  );
}
