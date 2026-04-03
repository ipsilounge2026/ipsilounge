"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import StatusBadge from "@/components/StatusBadge";
import { getMyBookings, cancelBooking } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface Booking {
  id: string;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  type: string;
  memo: string | null;
  status: string;
  cancel_reason: string | null;
  created_at: string;
}

export default function MyBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await getMyBookings();
      setBookings(res.items);
    } catch {}
  };

  const handleCancel = async (id: string) => {
    if (!confirm("상담 예약을 취소하시겠습니까?")) return;
    try {
      await cancelBooking(id);
      setMessage("예약이 취소되었습니다");
      loadData();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="page-header">
          <h1>내 상담 예약</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" onClick={() => router.push("/consultation/notes")}>
              📋 상담 기록
            </button>
            <button className="btn btn-primary" onClick={() => router.push("/consultation")}>새 예약</button>
          </div>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
          </div>
        )}

        {bookings.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 60, color: "var(--gray-500)" }}>
            <p>예약된 상담이 없습니다</p>
          </div>
        ) : (
          bookings.map((b) => (
            <div key={b.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    {new Date(b.slot_date + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}
                  </div>
                  <div style={{ fontSize: 14, color: "var(--gray-600)", marginBottom: 8 }}>
                    {b.slot_start_time?.slice(0, 5)} ~ {b.slot_end_time?.slice(0, 5)} | {b.type}
                  </div>
                  {b.memo && <div style={{ fontSize: 13, color: "var(--gray-500)" }}>메모: {b.memo}</div>}
                  {b.cancel_reason && <div style={{ fontSize: 13, color: "#ef4444", marginTop: 4 }}>취소 사유: {b.cancel_reason}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusBadge status={b.status} />
                  {(b.status === "requested" || b.status === "confirmed") && (
                    <button className="btn btn-outline btn-sm" onClick={() => handleCancel(b.id)}>취소</button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <Footer />
    </>
  );
}
