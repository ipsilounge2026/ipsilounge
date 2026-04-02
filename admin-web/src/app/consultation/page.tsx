"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import { getBookings, updateBookingStatus } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface Booking {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone: string | null;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  type: string;
  memo: string | null;
  status: string;
  created_at: string;
}

export default function ConsultationPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadData();
  }, [statusFilter]);

  const loadData = async () => {
    try {
      const res = await getBookings(statusFilter || undefined);
      setBookings(res.items);
    } catch {}
  };

  const handleStatusChange = async (bookingId: string, newStatus: string) => {
    try {
      await updateBookingStatus(bookingId, newStatus);
      setMessage(`예약 상태가 변경되었습니다`);
      loadData();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>상담 관리</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/consultation/notes" className="btn btn-outline">상담 기록</Link>
            <Link href="/consultation/settings" className="btn btn-primary">시간 설정</Link>
          </div>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
          </div>
        )}

        <div className="filter-bar" style={{ marginBottom: 16 }}>
          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">전체 상태</option>
            <option value="requested">신청</option>
            <option value="confirmed">확정</option>
            <option value="completed">완료</option>
            <option value="cancelled">취소</option>
          </select>
          <span style={{ color: "var(--gray-600)", fontSize: 14 }}>총 {bookings.length}건</span>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>상담일</th>
                <th>시간</th>
                <th>신청자</th>
                <th>연락처</th>
                <th>유형</th>
                <th>상태</th>
                <th>메모</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.slot_date}</td>
                  <td>{b.slot_start_time?.slice(0, 5)} ~ {b.slot_end_time?.slice(0, 5)}</td>
                  <td>
                    <div>{b.user_name}</div>
                    <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{b.user_email}</div>
                  </td>
                  <td>{b.user_phone || "-"}</td>
                  <td>{b.type}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.memo || "-"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {b.status === "requested" && (
                        <button className="btn btn-success btn-sm" onClick={() => handleStatusChange(b.id, "confirmed")}>확정</button>
                      )}
                      {b.status === "confirmed" && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(b.id, "completed")}>완료</button>
                      )}
                      {(b.status === "confirmed" || b.status === "completed") && (
                        <Link
                          href={`/consultation/notes?user_id=${b.user_id}&booking_id=${b.id}&user_name=${encodeURIComponent(b.user_name)}&date=${b.slot_date}`}
                          className="btn btn-sm"
                          style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }}
                        >기록 작성</Link>
                      )}
                      {(b.status === "requested" || b.status === "confirmed") && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleStatusChange(b.id, "cancelled")}>취소</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>상담 예약이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
