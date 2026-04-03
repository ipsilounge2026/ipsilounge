"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import { getBookings, updateBookingStatus, searchUsersForBooking, createManualBooking } from "@/lib/api";
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
  admin_name: string | null;
  type: string;
  memo: string | null;
  status: string;
  created_at: string;
}

interface SearchedUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export default function ConsultationPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [message, setMessage] = useState("");

  // 직접 예약 모달 상태
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualUserSearch, setManualUserSearch] = useState("");
  const [manualSearchResults, setManualSearchResults] = useState<SearchedUser[]>([]);
  const [manualSelectedUser, setManualSelectedUser] = useState<SearchedUser | null>(null);
  const [manualDate, setManualDate] = useState("");
  const [manualStartTime, setManualStartTime] = useState("");
  const [manualEndTime, setManualEndTime] = useState("");
  const [manualType, setManualType] = useState("기타");
  const [manualMemo, setManualMemo] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [cancelModal, setCancelModal] = useState<{ id: string; show: boolean }>({ id: "", show: false });
  const [cancelReason, setCancelReason] = useState("");

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

  const handleStatusChange = async (bookingId: string, newStatus: string, reason?: string) => {
    try {
      await updateBookingStatus(bookingId, newStatus, reason);
      setMessage(`예약 상태가 변경되었습니다`);
      loadData();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelReason.trim()) { alert("취소 사유를 입력해주세요"); return; }
    await handleStatusChange(cancelModal.id, "cancelled", cancelReason);
    setCancelModal({ id: "", show: false });
    setCancelReason("");
  };

  const handleManualUserSearch = async (q: string) => {
    setManualUserSearch(q);
    if (q.length < 1) { setManualSearchResults([]); return; }
    try {
      const results = await searchUsersForBooking(q);
      setManualSearchResults(results);
    } catch { setManualSearchResults([]); }
  };

  const handleManualBooking = async () => {
    if (!manualSelectedUser || !manualDate || !manualStartTime || !manualEndTime) {
      setMessage("모든 필수 항목을 입력해주세요.");
      return;
    }
    setManualLoading(true);
    try {
      await createManualBooking({
        user_id: manualSelectedUser.id,
        date: manualDate,
        start_time: manualStartTime,
        end_time: manualEndTime,
        type: manualType,
        memo: manualMemo || undefined,
      });
      setMessage("직접 예약이 생성되었습니다.");
      setShowManualModal(false);
      resetManualForm();
      loadData();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setManualLoading(false);
    }
  };

  const resetManualForm = () => {
    setManualUserSearch("");
    setManualSearchResults([]);
    setManualSelectedUser(null);
    setManualDate("");
    setManualStartTime("");
    setManualEndTime("");
    setManualType("기타");
    setManualMemo("");
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>상담 관리</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/consultation/notes" className="btn btn-outline">상담 기록</Link>
            <button className="btn btn-outline" onClick={() => { resetManualForm(); setShowManualModal(true); }}>직접 예약</button>
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
                <th>상담자</th>
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
                  <td>{b.admin_name || "-"}</td>
                  <td>
                    <div>{b.user_name}</div>
                    <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{b.user_email}</div>
                  </td>
                  <td>{b.user_phone || "-"}</td>
                  <td>{b.type}</td>
                  <td>
                    <StatusBadge status={b.status} />
                    {b.cancel_reason && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>사유: {b.cancel_reason}</div>}
                  </td>
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
                        <button className="btn btn-danger btn-sm" onClick={() => setCancelModal({ id: b.id, show: true })}>취소</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>상담 예약이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* 직접 예약 모달 */}
        {showManualModal && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }} onClick={() => setShowManualModal(false)}>
            <div style={{
              background: "white", borderRadius: 12, padding: 24, width: "100%", maxWidth: 500,
              maxHeight: "90vh", overflow: "auto",
            }} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ fontSize: 18, marginBottom: 20 }}>직접 예약 생성</h2>

              {/* 사용자 검색 */}
              <div className="form-group">
                <label>사용자 검색</label>
                {manualSelectedUser ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F3F4F6", borderRadius: 8 }}>
                    <span>{manualSelectedUser.name} ({manualSelectedUser.email})</span>
                    <button style={{ marginLeft: "auto", background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 13 }}
                      onClick={() => { setManualSelectedUser(null); setManualUserSearch(""); setManualSearchResults([]); }}>변경</button>
                  </div>
                ) : (
                  <div style={{ position: "relative" }}>
                    <input type="text" className="form-control" value={manualUserSearch}
                      onChange={(e) => handleManualUserSearch(e.target.value)}
                      placeholder="이름 또는 이메일로 검색" />
                    {manualSearchResults.length > 0 && (
                      <div style={{
                        position: "absolute", top: "100%", left: 0, right: 0, background: "white",
                        border: "1px solid #E5E7EB", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        maxHeight: 200, overflow: "auto", zIndex: 10,
                      }}>
                        {manualSearchResults.map((u) => (
                          <div key={u.id} style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #F3F4F6", fontSize: 14 }}
                            onClick={() => { setManualSelectedUser(u); setManualSearchResults([]); setManualUserSearch(""); }}
                            onMouseOver={(e) => e.currentTarget.style.background = "#F9FAFB"}
                            onMouseOut={(e) => e.currentTarget.style.background = ""}>
                            <div style={{ fontWeight: 600 }}>{u.name}</div>
                            <div style={{ fontSize: 12, color: "#6B7280" }}>{u.email}{u.phone ? ` / ${u.phone}` : ""}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 날짜 */}
              <div className="form-group">
                <label>상담 날짜</label>
                <input type="date" className="form-control" value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)} />
              </div>

              {/* 시간 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label>시작 시간</label>
                  <input type="time" className="form-control" value={manualStartTime}
                    onChange={(e) => setManualStartTime(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>종료 시간</label>
                  <input type="time" className="form-control" value={manualEndTime}
                    onChange={(e) => setManualEndTime(e.target.value)} />
                </div>
              </div>

              {/* 상담 유형 */}
              <div className="form-group">
                <label>상담 유형</label>
                <select className="form-control" value={manualType} onChange={(e) => setManualType(e.target.value)}>
                  <option value="학생부분석">학생부 분석 상담</option>
                  <option value="입시전략">입시 전략 상담</option>
                  <option value="학습상담">학습 상담</option>
                  <option value="심리상담">심리 상담</option>
                  <option value="기타">기타</option>
                </select>
              </div>

              {/* 메모 */}
              <div className="form-group">
                <label>메모 (선택)</label>
                <textarea className="form-control" value={manualMemo}
                  onChange={(e) => setManualMemo(e.target.value)}
                  placeholder="상담 관련 메모" rows={3} />
              </div>

              {/* 버튼 */}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowManualModal(false)}>취소</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleManualBooking} disabled={manualLoading}>
                  {manualLoading ? "생성 중..." : "예약 생성"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 취소 사유 모달 */}
        {cancelModal.show && (
          <div className="modal-overlay" onClick={() => setCancelModal({ id: "", show: false })}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: 24, maxWidth: 400 }}>
              <h3 style={{ marginBottom: 12 }}>예약 취소</h3>
              <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>취소 사유를 입력해주세요. 사용자에게 표시됩니다.</p>
              <textarea className="form-control" placeholder="취소 사유를 입력하세요" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} style={{ width: "100%", marginBottom: 12 }} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-outline" onClick={() => { setCancelModal({ id: "", show: false }); setCancelReason(""); }}>닫기</button>
                <button className="btn btn-danger" onClick={handleCancelConfirm}>취소 확정</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
