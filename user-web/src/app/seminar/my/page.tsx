"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  getMe,
  getMySeminarReservations,
  modifySeminarReservation,
  cancelSeminarReservation,
} from "@/lib/api";

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

export default function MySeminarPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelModal, setCancelModal] = useState<{ id: string; show: boolean }>({ id: "", show: false });
  const [cancelReason, setCancelReason] = useState("");
  const [modifyModal, setModifyModal] = useState<{ res: any; show: boolean }>({ res: null, show: false });
  const [modifyForm, setModifyForm] = useState({
    contact_name: "",
    contact_phone: "",
    attendee_count: 1,
    memo: "",
    modify_reason: "",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const me = await getMe();
        if (me.member_type !== "branch_manager") {
          router.push("/");
          return;
        }
      } catch {
        router.push("/login");
        return;
      }
      await loadReservations();
      setLoading(false);
    };
    load();
  }, []);

  const loadReservations = async () => {
    try {
      const data = await getMySeminarReservations();
      setReservations(data.items || []);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) { alert("취소 사유를 입력해주세요"); return; }
    try {
      await cancelSeminarReservation(cancelModal.id, cancelReason);
      setCancelModal({ id: "", show: false });
      setCancelReason("");
      loadReservations();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const openModify = (res: any) => {
    setModifyForm({
      contact_name: res.contact_name,
      contact_phone: res.contact_phone,
      attendee_count: res.attendee_count,
      memo: res.memo || "",
      modify_reason: "",
    });
    setModifyModal({ res, show: true });
  };

  const handleModify = async () => {
    if (!modifyForm.modify_reason.trim()) { alert("수정 사유를 입력해주세요"); return; }
    try {
      await modifySeminarReservation(modifyModal.res.id, {
        contact_name: modifyForm.contact_name,
        contact_phone: modifyForm.contact_phone,
        attendee_count: modifyForm.attendee_count,
        memo: modifyForm.memo || undefined,
        modify_reason: modifyForm.modify_reason,
      });
      setModifyModal({ res: null, show: false });
      loadReservations();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) return <><Navbar /><div style={{ padding: 40, textAlign: "center" }}>로딩 중...</div></>;

  return (
    <>
    <Navbar />
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>내 설명회 예약</h1>
        <Link href="/seminar" style={{ padding: "8px 16px", backgroundColor: "#3b82f6", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 14 }}>
          새 예약
        </Link>
      </div>

      {reservations.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", backgroundColor: "#f9fafb", borderRadius: 12 }}>
          예약 내역이 없습니다
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {reservations.map((r: any) => (
            <div
              key={r.id}
              style={{
                padding: 16,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                backgroundColor: r.status === "cancelled" ? "#f9fafb" : "#fff",
                opacity: r.status === "cancelled" ? 0.6 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.schedule_title}</div>
                  <div style={{ fontSize: 14, color: "#374151", marginBottom: 2 }}>
                    {r.reservation_date} ({TIME_SLOT_LABELS[r.time_slot] || r.time_slot})
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    담당자: {r.contact_name} | 연락처: {r.contact_phone} | 참석 예정: {r.attendee_count}명
                  </div>
                  {r.actual_attendee_count !== null && r.actual_attendee_count !== undefined && (
                    <div style={{ fontSize: 13, color: "#10b981" }}>실제 참석: {r.actual_attendee_count}명</div>
                  )}
                  {r.memo && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>메모: {r.memo}</div>}
                  {r.modify_reason && <div style={{ fontSize: 12, color: "#8b5cf6", marginTop: 4 }}>수정 사유: {r.modify_reason}</div>}
                  {r.cancel_reason && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>취소 사유: {r.cancel_reason}</div>}
                </div>
                <span style={{
                  padding: "4px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  backgroundColor: STATUS_COLORS[r.status] || "#9ca3af",
                  whiteSpace: "nowrap",
                }}>
                  {STATUS_LABELS[r.status] || r.status}
                </span>
              </div>
              {r.status !== "cancelled" && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => openModify(r)}
                    style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #3b82f6", color: "#3b82f6", backgroundColor: "#fff", cursor: "pointer", fontSize: 13 }}
                  >
                    수정
                  </button>
                  <button
                    onClick={() => setCancelModal({ id: r.id, show: true })}
                    style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #ef4444", color: "#ef4444", backgroundColor: "#fff", cursor: "pointer", fontSize: 13 }}
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 취소 모달 */}
      {cancelModal.show && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setCancelModal({ id: "", show: false })}>
          <div style={{ backgroundColor: "#fff", borderRadius: 12, padding: 24, maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12 }}>예약 취소</h3>
            <textarea
              placeholder="취소 사유를 입력하세요"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #d1d5db", marginBottom: 12 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setCancelModal({ id: "", show: false }); setCancelReason(""); }} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", cursor: "pointer" }}>닫기</button>
              <button onClick={handleCancel} style={{ padding: "8px 16px", borderRadius: 6, backgroundColor: "#ef4444", color: "#fff", border: "none", cursor: "pointer" }}>취소 확정</button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {modifyModal.show && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setModifyModal({ res: null, show: false })}>
          <div style={{ backgroundColor: "#fff", borderRadius: 12, padding: 24, maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12 }}>예약 수정</h3>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>담당자 이름</label>
                <input value={modifyForm.contact_name} onChange={(e) => setModifyForm({ ...modifyForm, contact_name: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>연락처</label>
                <input value={modifyForm.contact_phone} onChange={(e) => setModifyForm({ ...modifyForm, contact_phone: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>참석 예정 인원</label>
                <input type="number" min={1} value={modifyForm.attendee_count} onChange={(e) => setModifyForm({ ...modifyForm, attendee_count: Number(e.target.value) })} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>요청사항</label>
                <textarea value={modifyForm.memo} onChange={(e) => setModifyForm({ ...modifyForm, memo: e.target.value })} rows={2} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, display: "block", marginBottom: 4, color: "#ef4444" }}>수정 사유 *</label>
                <textarea value={modifyForm.modify_reason} onChange={(e) => setModifyForm({ ...modifyForm, modify_reason: e.target.value })} rows={2} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setModifyModal({ res: null, show: false })} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", cursor: "pointer" }}>닫기</button>
              <button onClick={handleModify} style={{ padding: "8px 16px", borderRadius: 6, backgroundColor: "#3b82f6", color: "#fff", border: "none", cursor: "pointer" }}>수정 완료</button>
            </div>
          </div>
        </div>
      )}
    </div>
    <Footer />
    </>
  );
}
