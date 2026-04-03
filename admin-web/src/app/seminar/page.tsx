"use client";

import { useEffect, useState } from "react";
import {
  getSeminarDashboard,
  getSeminarReservations,
  getSeminarSchedules,
  approveSeminarReservation,
  cancelSeminarReservation,
  updateSeminarActualAttendee,
  getSeminarStatsByBranch,
  getSeminarStatsBySchedule,
} from "@/lib/api";
import Link from "next/link";

const TIME_SLOT_LABELS: Record<string, string> = {
  morning: "오전",
  afternoon: "오후",
  evening: "저녁",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "승인대기",
  modified: "수정대기",
  approved: "승인완료",
  cancelled: "취소",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  modified: "#8b5cf6",
  approved: "#10b981",
  cancelled: "#9ca3af",
};

export default function SeminarPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [branchStats, setBranchStats] = useState<any[]>([]);
  const [scheduleStats, setScheduleStats] = useState<any[]>([]);
  const [filter, setFilter] = useState({ schedule_id: "", status: "", branch_name: "" });
  const [cancelModal, setCancelModal] = useState<{ id: string; show: boolean }>({ id: "", show: false });
  const [cancelReason, setCancelReason] = useState("");
  const [attendeeModal, setAttendeeModal] = useState<{ id: string; show: boolean; current: number }>({ id: "", show: false, current: 0 });
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"reservations" | "stats">("reservations");

  const load = async () => {
    try {
      const [d, r, s, bs, ss] = await Promise.all([
        getSeminarDashboard(filter.schedule_id || undefined),
        getSeminarReservations(filter.schedule_id || undefined, filter.status || undefined, filter.branch_name || undefined),
        getSeminarSchedules(),
        getSeminarStatsByBranch(filter.schedule_id || undefined),
        getSeminarStatsBySchedule(),
      ]);
      setDashboard(d);
      setReservations(r.items || []);
      setSchedules(s);
      setBranchStats(bs);
      setScheduleStats(ss);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, [filter.schedule_id, filter.status]);

  const handleApprove = async (id: string) => {
    if (!confirm("이 예약을 승인하시겠습니까?")) return;
    try {
      await approveSeminarReservation(id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) { alert("취소 사유를 입력해주세요"); return; }
    try {
      await cancelSeminarReservation(cancelModal.id, cancelReason);
      setCancelModal({ id: "", show: false });
      setCancelReason("");
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleAttendeeUpdate = async () => {
    try {
      await updateSeminarActualAttendee(attendeeModal.id, attendeeCount);
      setAttendeeModal({ id: "", show: false, current: 0 });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSearch = () => { load(); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 className="page-title">설명회 관리</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/seminar/schedules" className="btn btn-outline" style={{ textDecoration: "none" }}>일정 관리</Link>
          <Link href="/seminar/mail" className="btn btn-outline" style={{ textDecoration: "none" }}>메일 발송</Link>
        </div>
      </div>

      {/* 대시보드 카드 */}
      {dashboard && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "전체 예약", value: dashboard.total_reservations, color: "#3b82f6" },
            { label: "승인 대기", value: dashboard.pending_count, color: "#f59e0b" },
            { label: "수정 대기", value: dashboard.modified_count, color: "#8b5cf6" },
            { label: "승인 완료", value: dashboard.approved_count, color: "#10b981" },
            { label: "취소", value: dashboard.cancelled_count, color: "#9ca3af" },
            { label: "신청 인원", value: dashboard.total_attendee_count, color: "#6366f1" },
            { label: "실제 참석", value: dashboard.total_actual_attendee_count, color: "#ec4899" },
          ].map((card) => (
            <div key={card.label} className="card" style={{ padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn ${activeTab === "reservations" ? "btn-primary" : "btn-outline"}`} onClick={() => setActiveTab("reservations")}>예약 관리</button>
        <button className={`btn ${activeTab === "stats" ? "btn-primary" : "btn-outline"}`} onClick={() => setActiveTab("stats")}>현황 통계</button>
      </div>

      {activeTab === "reservations" && (
        <>
          {/* 필터 */}
          <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>설명회</label>
              <select className="input" value={filter.schedule_id} onChange={(e) => setFilter({ ...filter, schedule_id: e.target.value })}>
                <option value="">전체</option>
                {schedules.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>상태</label>
              <select className="input" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
                <option value="">전체</option>
                <option value="pending">승인대기</option>
                <option value="modified">수정대기</option>
                <option value="approved">승인완료</option>
                <option value="cancelled">취소</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>지점명</label>
              <input className="input" placeholder="지점명 검색" value={filter.branch_name} onChange={(e) => setFilter({ ...filter, branch_name: e.target.value })} />
            </div>
            <button className="btn btn-primary" onClick={handleSearch}>검색</button>
          </div>

          {/* 예약 목록 테이블 */}
          <div className="card" style={{ overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>설명회</th>
                  <th>지점명</th>
                  <th>예약일</th>
                  <th>시간대</th>
                  <th>담당자</th>
                  <th>연락처</th>
                  <th>예정/실제</th>
                  <th>상태</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {reservations.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>예약이 없습니다</td></tr>
                )}
                {reservations.map((r: any) => (
                  <tr key={r.id} style={{ opacity: r.status === "cancelled" ? 0.5 : 1 }}>
                    <td>{r.schedule_title}</td>
                    <td>{r.branch_name}</td>
                    <td>{r.reservation_date}</td>
                    <td>{TIME_SLOT_LABELS[r.time_slot] || r.time_slot}</td>
                    <td>{r.contact_name}</td>
                    <td>{r.contact_phone}</td>
                    <td>
                      {r.attendee_count}명
                      {r.status === "approved" && (
                        <span
                          style={{ marginLeft: 4, cursor: "pointer", color: "#3b82f6" }}
                          onClick={() => { setAttendeeModal({ id: r.id, show: true, current: r.actual_attendee_count || 0 }); setAttendeeCount(r.actual_attendee_count || 0); }}
                        >
                          / {r.actual_attendee_count !== null ? `${r.actual_attendee_count}명` : "입력"}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 12, color: "#fff", backgroundColor: STATUS_COLORS[r.status] || "#9ca3af" }}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                      {r.modify_reason && <div style={{ fontSize: 11, color: "#8b5cf6", marginTop: 2 }}>수정: {r.modify_reason}</div>}
                      {r.cancel_reason && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>취소: {r.cancel_reason}</div>}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {(r.status === "pending" || r.status === "modified") && (
                          <button className="btn btn-sm btn-primary" onClick={() => handleApprove(r.id)}>승인</button>
                        )}
                        {r.status !== "cancelled" && (
                          <button className="btn btn-sm btn-danger" onClick={() => setCancelModal({ id: r.id, show: true })}>취소</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "stats" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* 지점별 현황 */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>지점별 참석 현황</h3>
            <table className="table">
              <thead><tr><th>지점명</th><th>예약 수</th><th>신청 인원</th><th>실제 참석</th></tr></thead>
              <tbody>
                {branchStats.map((b: any) => (
                  <tr key={b.branch_name}><td>{b.branch_name}</td><td>{b.reservation_count}</td><td>{b.total_attendee}</td><td>{b.total_actual}</td></tr>
                ))}
                {branchStats.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "#9ca3af" }}>데이터 없음</td></tr>}
              </tbody>
            </table>
          </div>

          {/* 일정별 현황 */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>일정별 현황</h3>
            <table className="table">
              <thead><tr><th>설명회</th><th>기간</th><th>승인</th><th>신청 인원</th><th>실제 참석</th></tr></thead>
              <tbody>
                {scheduleStats.map((s: any) => (
                  <tr key={s.id}><td>{s.title}</td><td>{s.start_date}~{s.end_date}</td><td>{s.approved_count}</td><td>{s.total_attendee}</td><td>{s.total_actual}</td></tr>
                ))}
                {scheduleStats.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "#9ca3af" }}>데이터 없음</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 취소 모달 */}
      {cancelModal.show && (
        <div className="modal-overlay" onClick={() => setCancelModal({ id: "", show: false })}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: 24, maxWidth: 400 }}>
            <h3 style={{ marginBottom: 12 }}>예약 취소</h3>
            <textarea className="input" placeholder="취소 사유를 입력하세요" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} style={{ width: "100%", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={() => { setCancelModal({ id: "", show: false }); setCancelReason(""); }}>닫기</button>
              <button className="btn btn-danger" onClick={handleCancel}>취소 확정</button>
            </div>
          </div>
        </div>
      )}

      {/* 실제 참석 인원 모달 */}
      {attendeeModal.show && (
        <div className="modal-overlay" onClick={() => setAttendeeModal({ id: "", show: false, current: 0 })}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: 24, maxWidth: 300 }}>
            <h3 style={{ marginBottom: 12 }}>실제 참석 인원</h3>
            <input className="input" type="number" min={0} value={attendeeCount} onChange={(e) => setAttendeeCount(Number(e.target.value))} style={{ width: "100%", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={() => setAttendeeModal({ id: "", show: false, current: 0 })}>닫기</button>
              <button className="btn btn-primary" onClick={handleAttendeeUpdate}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
