"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getMe, updateMe, getNotifications, getMySeminarReservations, modifySeminarReservation, cancelSeminarReservation, getMyCounselor, getAvailableCounselors, requestCounselorChange } from "@/lib/api";
import { isLoggedIn, getMemberType } from "@/lib/auth";

interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  member_type: string;
  created_at: string;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface CounselorInfo {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<string, string> = {
  student: "학생",
  parent: "학부모",
  branch_manager: "지점 담당자",
  admin: "관리자",
  counselor: "상담자",
};

const ROLE_COLORS: Record<string, string> = {
  student: "#3B82F6",
  parent: "#8B5CF6",
  branch_manager: "#F59E0B",
  admin: "#EF4444",
  counselor: "#10B981",
};

const TIME_SLOT_LABELS: Record<string, string> = { morning: "오전", afternoon: "오후", evening: "저녁" };
const STATUS_LABELS: Record<string, string> = { pending: "승인대기", modified: "수정대기", approved: "승인완료", cancelled: "취소" };
const STATUS_COLORS: Record<string, string> = { pending: "#f59e0b", modified: "#8b5cf6", approved: "#10b981", cancelled: "#9ca3af" };

export default function MyPage() {
  const router = useRouter();
  const memberType = getMemberType();
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [seminarReservations, setSeminarReservations] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);

  // 수정/취소 관련
  const [editingReservation, setEditingReservation] = useState<string | null>(null);
  const [editAttendeeCount, setEditAttendeeCount] = useState<number>(0);
  const [editMemo, setEditMemo] = useState("");
  const [modifyReason, setModifyReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // 담당자 관련
  const [myCounselor, setMyCounselor] = useState<CounselorInfo | null>(null);
  const [isAssigned, setIsAssigned] = useState(false);
  const [showChangeRequest, setShowChangeRequest] = useState(false);
  const [availableCounselors, setAvailableCounselors] = useState<CounselorInfo[]>([]);
  const [selectedNewCounselor, setSelectedNewCounselor] = useState<string>("recommend");
  const [changeReason, setChangeReason] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    getMe().then((u) => { setUser(u); setName(u.name); setPhone(u.phone || ""); }).catch(() => {});
    if (memberType === "branch_manager") {
      getMySeminarReservations().then((res) => setSeminarReservations(res.items || [])).catch(() => {});
    } else {
      getNotifications().then((res) => setNotifications(res.items)).catch(() => {});
      // 담당자 조회
      getMyCounselor().then((res) => {
        setIsAssigned(res.assigned);
        setMyCounselor(res.counselor);
      }).catch(() => {});
    }
  }, []);

  const handleSave = async () => {
    try {
      const updated = await updateMe({ name, phone: phone || undefined });
      setUser(updated);
      setEditing(false);
      setMessage("정보가 수정되었습니다");
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleOpenChangeRequest = async () => {
    setShowChangeRequest(true);
    try {
      const counselors = await getAvailableCounselors();
      setAvailableCounselors(counselors);
    } catch {}
  };

  const handleSubmitChangeRequest = async () => {
    if (!changeReason.trim()) {
      setMessage("변경 사유를 입력해주세요.");
      return;
    }
    setChangeLoading(true);
    try {
      await requestCounselorChange({
        requested_admin_id: selectedNewCounselor === "recommend" ? null : selectedNewCounselor,
        reason: changeReason,
      });
      setMessage("담당자 변경 요청이 접수되었습니다. 관리자 확인 후 처리됩니다.");
      setShowChangeRequest(false);
      setChangeReason("");
      setSelectedNewCounselor("recommend");
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setChangeLoading(false);
    }
  };

  const isBeforeDeadline = (deadlineAt: string | null) => {
    if (!deadlineAt) return false;
    return new Date() < new Date(deadlineAt);
  };

  const handleStartEdit = (r: any) => {
    setEditingReservation(r.id);
    setEditAttendeeCount(r.attendee_count);
    setEditMemo(r.memo || "");
    setModifyReason("");
  };

  const handleSubmitEdit = async (id: string) => {
    if (!modifyReason.trim()) {
      setMessage("수정 사유를 입력해주세요.");
      return;
    }
    setActionLoading(true);
    try {
      await modifySeminarReservation(id, {
        attendee_count: editAttendeeCount,
        memo: editMemo || undefined,
        modify_reason: modifyReason,
      });
      setMessage("예약이 수정되었습니다. 관리자 재승인 후 확정됩니다.");
      setEditingReservation(null);
      const res = await getMySeminarReservations();
      setSeminarReservations(res.items || []);
    } catch (err: any) {
      setMessage(err.message || "수정에 실패했습니다");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitCancel = async (id: string) => {
    if (!cancelReason.trim()) {
      setMessage("취소 사유를 입력해주세요.");
      return;
    }
    setActionLoading(true);
    try {
      await cancelSeminarReservation(id, cancelReason);
      setMessage("예약이 취소되었습니다.");
      setCancelTarget(null);
      setCancelReason("");
      const res = await getMySeminarReservations();
      setSeminarReservations(res.items || []);
    } catch (err: any) {
      setMessage(err.message || "취소에 실패했습니다");
    } finally {
      setActionLoading(false);
    }
  };

  if (!user) return <><Navbar /><div className="container"><p>로딩 중...</p></div></>;

  const roleLabel = ROLE_LABELS[user.member_type] || user.member_type;
  const roleColor = ROLE_COLORS[user.member_type] || "#6B7280";

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="page-header">
          <h1>마이페이지</h1>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
          </div>
        )}

        {/* 회원 정보 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>회원 정보</h2>
              <span style={{
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                backgroundColor: roleColor,
              }}>
                {roleLabel}
              </span>
            </div>
            {!editing && <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>수정</button>}
          </div>

          {editing ? (
            <>
              <div className="form-group">
                <label>이름</label>
                <input type="text" className="form-control" value={name} disabled
                  style={{ background: "#F3F4F6", color: "#6B7280", cursor: "not-allowed" }} />
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>이름은 변경할 수 없습니다</span>
              </div>
              <div className="form-group">
                <label>연락처</label>
                <input type="tel" className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={handleSave}>저장</button>
                <button className="btn btn-outline" onClick={() => { setEditing(false); setName(user.name); setPhone(user.phone || ""); }}>취소</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>이름</div>
                  <div>{user.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>이메일</div>
                  <div>{user.email}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>연락처</div>
                  <div>{user.phone || "-"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>가입일</div>
                  <div>{new Date(user.created_at).toLocaleDateString("ko-KR")}</div>
                </div>
              </div>

              {/* 담당자 정보 (학생/학부모만) */}
              {memberType !== "branch_manager" && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--gray-100)" }}>
                  <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 6 }}>담당 상담자</div>
                  {isAssigned && myCounselor ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: "#22C55E", display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, color: "#fff", fontSize: 14,
                      }}>
                        {myCounselor.name.charAt(0)}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{myCounselor.name}</span>
                      <button
                        onClick={handleOpenChangeRequest}
                        style={{
                          marginLeft: "auto",
                          fontSize: 12,
                          padding: "4px 12px",
                          borderRadius: 6,
                          border: "1px solid #E5E7EB",
                          background: "#fff",
                          color: "#6B7280",
                          cursor: "pointer",
                        }}
                      >
                        담당자 변경 요청
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, color: "#9CA3AF" }}>
                      아직 배정된 담당자가 없습니다. 상담 예약 시 자동 배정됩니다.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 담당자 변경 요청 모달 */}
        {showChangeRequest && (
          <div className="card" style={{ marginBottom: 16, border: "1px solid #FDE68A", background: "#FFFBEB" }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>담당자 변경 요청</h3>
            <div className="form-group">
              <label>변경 희망 담당자</label>
              <select
                className="form-control"
                value={selectedNewCounselor}
                onChange={e => setSelectedNewCounselor(e.target.value)}
              >
                <option value="recommend">추천 희망 (관리자가 배정)</option>
                {availableCounselors.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>변경 사유</label>
              <textarea
                className="form-control"
                value={changeReason}
                onChange={e => setChangeReason(e.target.value)}
                placeholder="담당자 변경을 요청하는 사유를 입력해주세요"
                rows={3}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSubmitChangeRequest} disabled={changeLoading}>
                {changeLoading ? "요청 중..." : "변경 요청 제출"}
              </button>
              <button className="btn btn-outline" onClick={() => setShowChangeRequest(false)}>취소</button>
            </div>
          </div>
        )}

        {memberType === "branch_manager" ? (
          /* 지점 담당자: 설명회 예약 내역 */
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16 }}>설명회 예약 내역</h2>
              <a href="/seminar" style={{ fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>새 예약 &rarr;</a>
            </div>
            {seminarReservations.length === 0 ? (
              <p style={{ color: "var(--gray-500)", fontSize: 14 }}>예약 내역이 없습니다</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {seminarReservations.map((r: any) => {
                  const canModify = r.status !== "cancelled" && isBeforeDeadline(r.deadline_at);
                  return (
                  <div key={r.id} style={{
                    padding: 14, borderRadius: 10, border: "1px solid var(--gray-200)",
                    opacity: r.status === "cancelled" ? 0.5 : 1,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{r.schedule_title}</span>
                      <span style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: "#fff",
                        backgroundColor: STATUS_COLORS[r.status] || "#9ca3af",
                      }}>{STATUS_LABELS[r.status] || r.status}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--gray-600)" }}>
                      {r.reservation_date} ({TIME_SLOT_LABELS[r.time_slot] || r.time_slot}) | 참석 예정 {r.attendee_count}명
                    </div>
                    {r.actual_attendee_count != null && (
                      <div style={{ fontSize: 13, color: "#10b981", marginTop: 2 }}>실제 참석: {r.actual_attendee_count}명</div>
                    )}
                    {r.deadline_at && (
                      <div style={{ fontSize: 12, color: canModify ? "var(--gray-400)" : "#EF4444", marginTop: 4 }}>
                        예약 마감: {new Date(r.deadline_at).toLocaleString("ko-KR")}
                        {!canModify && r.status !== "cancelled" && " (마감)"}
                      </div>
                    )}

                    {/* 수정/취소 버튼 */}
                    {canModify && editingReservation !== r.id && cancelTarget !== r.id && (
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button
                          onClick={() => handleStartEdit(r)}
                          style={{
                            padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                            border: "1px solid #3B82F6", background: "#fff", color: "#3B82F6", cursor: "pointer",
                          }}
                        >수정</button>
                        <button
                          onClick={() => { setCancelTarget(r.id); setCancelReason(""); }}
                          style={{
                            padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                            border: "1px solid #EF4444", background: "#fff", color: "#EF4444", cursor: "pointer",
                          }}
                        >취소</button>
                      </div>
                    )}

                    {/* 수정 폼 */}
                    {editingReservation === r.id && (
                      <div style={{ marginTop: 12, padding: 12, background: "#F0F9FF", borderRadius: 8 }}>
                        <div className="form-group" style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 12, color: "var(--gray-600)" }}>참석 예정 인원</label>
                          <input type="number" className="form-control" min={1}
                            value={editAttendeeCount} onChange={e => setEditAttendeeCount(Number(e.target.value))} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 12, color: "var(--gray-600)" }}>메모</label>
                          <input type="text" className="form-control"
                            value={editMemo} onChange={e => setEditMemo(e.target.value)} placeholder="메모 (선택)" />
                        </div>
                        <div className="form-group" style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 12, color: "var(--gray-600)" }}>수정 사유 *</label>
                          <input type="text" className="form-control"
                            value={modifyReason} onChange={e => setModifyReason(e.target.value)} placeholder="수정 사유를 입력하세요" />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-primary btn-sm" disabled={actionLoading}
                            onClick={() => handleSubmitEdit(r.id)}>
                            {actionLoading ? "처리 중..." : "수정 확인"}
                          </button>
                          <button className="btn btn-outline btn-sm"
                            onClick={() => setEditingReservation(null)}>닫기</button>
                        </div>
                      </div>
                    )}

                    {/* 취소 폼 */}
                    {cancelTarget === r.id && (
                      <div style={{ marginTop: 12, padding: 12, background: "#FEF2F2", borderRadius: 8 }}>
                        <div className="form-group" style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 12, color: "#991B1B" }}>취소 사유 *</label>
                          <input type="text" className="form-control"
                            value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="취소 사유를 입력하세요" />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button style={{
                            padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                            border: "none", background: "#EF4444", color: "#fff", cursor: "pointer",
                          }} disabled={actionLoading}
                            onClick={() => handleSubmitCancel(r.id)}>
                            {actionLoading ? "처리 중..." : "취소 확인"}
                          </button>
                          <button className="btn btn-outline btn-sm"
                            onClick={() => setCancelTarget(null)}>닫기</button>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 학생/학부모: 바로가기 메뉴 */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, marginBottom: 12 }}>빠른 메뉴</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { href: "/consultation/notes", icon: "📋", label: "상담 기록 보기" },
                  { href: "/consultation/my", icon: "📅", label: "예약 현황" },
                  { href: "/analysis", icon: "📊", label: "분석 내역" },
                  { href: "/admission-cases", icon: "🏆", label: "합격 사례" },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "12px 14px", borderRadius: 10,
                      border: "1px solid var(--gray-200)",
                      fontSize: 14, color: "var(--gray-700)",
                      textDecoration: "none", fontWeight: 500,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    {item.label}
                  </a>
                ))}
              </div>
            </div>

            {/* 알림 */}
            <div className="card">
              <h2 style={{ fontSize: 16, marginBottom: 16 }}>알림</h2>
              {notifications.length === 0 ? (
                <p style={{ color: "var(--gray-500)", fontSize: 14 }}>알림이 없습니다</p>
              ) : (
                notifications.slice(0, 10).map((n) => (
                  <div key={n.id} style={{
                    padding: "12px 0",
                    borderBottom: "1px solid var(--gray-100)",
                    opacity: n.is_read ? 0.6 : 1,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: n.is_read ? 400 : 600 }}>{n.title}</div>
                    <div style={{ fontSize: 13, color: "var(--gray-600)", marginTop: 2 }}>{n.body}</div>
                    <div style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 4 }}>
                      {new Date(n.created_at).toLocaleString("ko-KR")}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
      <Footer />
    </>
  );
}
