"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FamilyLinkSection from "@/components/FamilyLinkSection";
import { getMe, updateMe, getNotifications, getMySeminarReservations, modifySeminarReservation, cancelSeminarReservation, getSeminarAvailability, getMyCounselor, getAvailableCounselors, requestCounselorChange, getMySenior, requestSeniorChange, listMySurveys, deleteSurvey, getMySeniorChangeRequests } from "@/lib/api";
import type { SeniorChangeRequestHistoryItem } from "@/lib/api";
import { isLoggedIn, getMemberType } from "@/lib/auth";

interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  member_type: string;
  branch_name: string | null;
  is_academy_student: boolean;
  created_at: string;
}

const BRANCH_OPTIONS = [
  "경복궁점", "광화문점", "구리점", "대치점", "대흥점",
  "마포점", "분당점", "은평점", "중계점", "대치스터디센터점",
];

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
  const [isAcademyStudent, setIsAcademyStudent] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [seminarReservations, setSeminarReservations] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);

  // 수정/취소 관련
  const [editingReservation, setEditingReservation] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTimeSlot, setEditTimeSlot] = useState("");
  const [editAttendeeCount, setEditAttendeeCount] = useState<number>(0);
  const [editMemo, setEditMemo] = useState("");
  const [modifyReason, setModifyReason] = useState("");
  const [availableDates, setAvailableDates] = useState<any[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // 사전 조사 관련
  const [surveys, setSurveys] = useState<Array<{ id: string; user_id: string; survey_type: string; timing: string | null; status: string; updated_at: string }>>([]);

  // 담당자 관련
  const [myCounselor, setMyCounselor] = useState<CounselorInfo | null>(null);
  const [isAssigned, setIsAssigned] = useState(false);
  const [showChangeRequest, setShowChangeRequest] = useState(false);
  const [availableCounselors, setAvailableCounselors] = useState<CounselorInfo[]>([]);
  const [selectedNewCounselor, setSelectedNewCounselor] = useState<string>("recommend");
  const [changeReason, setChangeReason] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);

  // 담당 선배 관련
  const [mySenior, setMySenior] = useState<{id: string; name: string} | null>(null);
  const [isSeniorAssigned, setIsSeniorAssigned] = useState(false);
  const [showSeniorChangeRequest, setShowSeniorChangeRequest] = useState(false);
  const [seniorChangeReason, setSeniorChangeReason] = useState("");
  const [seniorChangeLoading, setSeniorChangeLoading] = useState(false);

  // 선배 변경 요청 이력 (기획서 §9-4)
  const [seniorChangeHistory, setSeniorChangeHistory] = useState<SeniorChangeRequestHistoryItem[]>([]);
  const [seniorChangeHistoryLoaded, setSeniorChangeHistoryLoaded] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    getMe().then((u) => {
      setUser(u);
      setName(u.name);
      setPhone(u.phone || "");
      setIsAcademyStudent(u.is_academy_student || false);
      setBranchName(u.branch_name || "");
    }).catch(() => {});
    if (memberType === "branch_manager") {
      getMySeminarReservations().then((res) => setSeminarReservations(res.items || [])).catch(() => {});
    } else {
      getNotifications().then((res) => setNotifications(res.items)).catch(() => {});
      // 사전 조사 목록
      listMySurveys({}).then((res) => setSurveys(res.items || [])).catch(() => {});
      // 담당자 조회
      getMyCounselor().then((res) => {
        setIsAssigned(res.assigned);
        setMyCounselor(res.counselor);
      }).catch(() => {});
      // 담당 선배 조회
      getMySenior().then((res) => {
        setIsSeniorAssigned(res.assigned);
        setMySenior(res.senior);
      }).catch(() => {});
      // 선배 변경 요청 이력 조회 (기획서 §9-4)
      loadSeniorChangeHistory();
    }
  }, []);

  const loadSeniorChangeHistory = async () => {
    try {
      const res = await getMySeniorChangeRequests();
      setSeniorChangeHistory(res.items || []);
    } catch {
      setSeniorChangeHistory([]);
    } finally {
      setSeniorChangeHistoryLoaded(true);
    }
  };

  const handleSave = async () => {
    try {
      const payload: Record<string, any> = { name, phone: phone || undefined };
      // 학생/학부모: 재원생 여부 + 지점 저장 (지점 담당자는 지점 수정 불가)
      if (memberType !== "branch_manager") {
        payload.is_academy_student = isAcademyStudent;
        if (isAcademyStudent) {
          if (!branchName) {
            setMessage("재원생이시면 지점을 선택해주세요");
            return;
          }
          payload.branch_name = branchName;
        } else {
          payload.branch_name = null;
        }
      }
      const updated = await updateMe(payload);
      setUser(updated);
      setIsAcademyStudent(updated.is_academy_student || false);
      setBranchName(updated.branch_name || "");
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

  const handleSubmitSeniorChange = async () => {
    if (!seniorChangeReason.trim()) {
      setMessage("변경 사유를 입력해주세요.");
      return;
    }
    setSeniorChangeLoading(true);
    try {
      await requestSeniorChange({ requested_senior_id: null, reason: seniorChangeReason });
      setMessage("선배 변경 요청이 접수되었습니다. 관리자 확인 후 처리됩니다.");
      setShowSeniorChangeRequest(false);
      setSeniorChangeReason("");
      // 이력 재조회
      loadSeniorChangeHistory();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSeniorChangeLoading(false);
    }
  };

  const isBeforeDeadline = (deadlineAt: string | null) => {
    if (!deadlineAt) return false;
    return new Date() < new Date(deadlineAt);
  };

  const handleStartEdit = async (r: any) => {
    setEditingReservation(r.id);
    setEditDate(r.reservation_date);
    setEditTimeSlot(r.time_slot);
    setEditAttendeeCount(r.attendee_count);
    setEditMemo(r.memo || "");
    setModifyReason("");
    setAvailableDates([]);
    setAvailabilityLoading(true);
    try {
      const res = await getSeminarAvailability(r.schedule_id);
      setAvailableDates(res.available_dates || []);
    } catch {
      setAvailableDates([]);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const handleSubmitEdit = async (id: string, originalDate: string, originalSlot: string) => {
    if (!modifyReason.trim()) {
      setMessage("수정 사유를 입력해주세요.");
      return;
    }
    setActionLoading(true);
    try {
      const payload: any = {
        attendee_count: editAttendeeCount,
        memo: editMemo || undefined,
        modify_reason: modifyReason,
      };
      if (editDate !== originalDate) payload.reservation_date = editDate;
      if (editTimeSlot !== originalSlot) payload.time_slot = editTimeSlot;

      await modifySeminarReservation(id, payload);
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

              {/* 지점 담당자: 담당 지점 표시 (수정 불가, 관리자 문의) */}
              {memberType === "branch_manager" && (
                <div className="form-group">
                  <label>담당 지점</label>
                  <input
                    type="text"
                    className="form-control"
                    value={user.branch_name || ""}
                    disabled
                    style={{ background: "#F3F4F6", color: "#6B7280", cursor: "not-allowed" }}
                  />
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>담당 지점 변경은 관리자에게 문의해주세요</span>
                </div>
              )}

              {/* 학생/학부모: 재원생 여부 + 지점 선택 */}
              {memberType !== "branch_manager" && (
                <>
                  <div className="form-group">
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={isAcademyStudent}
                        onChange={(e) => setIsAcademyStudent(e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: "#2563eb" }}
                      />
                      <span>입시라운지 재원생입니다</span>
                    </label>
                  </div>
                  {isAcademyStudent && (
                    <div className="form-group">
                      <label>재원 지점</label>
                      <select
                        className="form-control"
                        value={branchName}
                        onChange={(e) => setBranchName(e.target.value)}
                      >
                        <option value="">지점을 선택해주세요</option>
                        {BRANCH_OPTIONS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={handleSave}>저장</button>
                <button className="btn btn-outline" onClick={() => {
                  setEditing(false);
                  setName(user.name);
                  setPhone(user.phone || "");
                  setIsAcademyStudent(user.is_academy_student || false);
                  setBranchName(user.branch_name || "");
                }}>취소</button>
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

                {/* 지점 담당자: 담당 지점 */}
                {memberType === "branch_manager" && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>담당 지점</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        padding: "3px 10px",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#9A3412",
                        background: "#FFF7ED",
                        border: "1px solid #FED7AA",
                      }}>
                        🏢 {user.branch_name || "-"}
                      </span>
                    </div>
                  </div>
                )}

                {/* 학생/학부모: 재원생 여부 + 재원 지점 */}
                {memberType !== "branch_manager" && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>재원 여부</div>
                    {user.is_academy_student ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          padding: "3px 10px",
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#065F46",
                          background: "#D1FAE5",
                          border: "1px solid #6EE7B7",
                        }}>
                          ✓ 재원생
                        </span>
                        {user.branch_name && (
                          <span style={{
                            padding: "3px 10px",
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#1E40AF",
                            background: "#DBEAFE",
                            border: "1px solid #93C5FD",
                          }}>
                            🏢 {user.branch_name}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, color: "#9CA3AF" }}>
                        비재원생
                      </div>
                    )}
                  </div>
                )}
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

              {/* 담당 선배 정보 (학생/학부모만) */}
              {memberType !== "branch_manager" && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--gray-100)" }}>
                  <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 6 }}>담당 선배</div>
                  {isSeniorAssigned && mySenior ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, color: "#fff", fontSize: 14,
                      }}>
                        {mySenior.name.charAt(0)}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{mySenior.name}</span>
                      <button
                        onClick={() => setShowSeniorChangeRequest(true)}
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
                        선배 변경 요청
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, color: "#9CA3AF" }}>
                      아직 배정된 선배가 없습니다. 선배 상담 예약 시 자동 배정됩니다.
                    </div>
                  )}

                  {/* 기획서 §9-4: 선배 변경 요청 이력 */}
                  {(() => {
                    const pending = seniorChangeHistory.find((r) => r.status === "pending");
                    return (
                      <div style={{ marginTop: 14 }}>
                        {pending && (
                          <div style={{
                            padding: "10px 12px",
                            background: "#FEF3C7",
                            border: "1px solid #FDE68A",
                            borderRadius: 8,
                            marginBottom: 10,
                            fontSize: 13,
                            color: "#92400E",
                            lineHeight: 1.5,
                          }}>
                            <strong>⏳ 변경 요청이 검토 중입니다</strong>
                            <div style={{ marginTop: 4, fontSize: 12 }}>
                              {new Date(pending.created_at).toLocaleDateString("ko-KR")} 제출 · 관리자 확인을 기다리고 있습니다.
                            </div>
                          </div>
                        )}

                        <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 6 }}>
                          변경 요청 이력
                        </div>
                        {!seniorChangeHistoryLoaded ? (
                          <div style={{ fontSize: 13, color: "#9CA3AF" }}>이력 조회 중...</div>
                        ) : seniorChangeHistory.length === 0 ? (
                          <div style={{ fontSize: 13, color: "#9CA3AF" }}>변경 요청 이력 없음</div>
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {seniorChangeHistory.map((r) => {
                              const statusLabel =
                                r.status === "pending" ? "대기" : r.status === "approved" ? "승인" : "거절";
                              const statusColor =
                                r.status === "pending" ? "#F59E0B" : r.status === "approved" ? "#10B981" : "#9CA3AF";
                              return (
                                <div
                                  key={r.id}
                                  style={{
                                    padding: "10px 12px",
                                    border: "1px solid var(--gray-200)",
                                    borderRadius: 8,
                                    background: "#fff",
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                    <span style={{ fontSize: 12, color: "var(--gray-500)" }}>
                                      {new Date(r.created_at).toLocaleDateString("ko-KR")} 요청
                                    </span>
                                    <span style={{
                                      padding: "2px 8px",
                                      borderRadius: 10,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: "#fff",
                                      background: statusColor,
                                    }}>
                                      {statusLabel}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 13, color: "var(--gray-700)", marginBottom: 4, lineHeight: 1.5 }}>
                                    <strong style={{ color: "#6B7280", fontWeight: 600, fontSize: 12 }}>사유: </strong>
                                    {r.reason}
                                  </div>
                                  {r.processed_at && (
                                    <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 4 }}>
                                      처리일: {new Date(r.processed_at).toLocaleDateString("ko-KR")}
                                    </div>
                                  )}
                                  {r.admin_memo && (
                                    <div style={{ fontSize: 12, color: "var(--gray-600)", marginTop: 4, background: "#F9FAFB", padding: 8, borderRadius: 6 }}>
                                      <strong style={{ fontWeight: 600 }}>관리자 코멘트: </strong>
                                      {r.admin_memo}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>

        {/* 선배상담 연계 관리 진입점 (학생만, V1 §10-1) */}
        {memberType === "student" && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
                  🔗 선배상담 연계 관리
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
                  상담사와의 상담 내용 중 관리자 검토를 통과한 내용만 담당 선배에게 공유됩니다.<br />
                  개별 건별로 공유를 중단하거나 다시 허용할 수 있습니다.
                </div>
              </div>
              <button
                onClick={() => router.push("/mypage/senior-sharing")}
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: "1px solid #D1D5DB",
                  background: "white",
                  color: "#374151",
                  fontSize: 13,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                연계 관리 열기 →
              </button>
            </div>
          </div>
        )}

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

        {/* 선배 변경 요청 모달 */}
        {showSeniorChangeRequest && (
          <div className="card" style={{ marginBottom: 16, border: "1px solid #DDD6FE", background: "#F5F3FF" }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>선배 변경 요청</h3>
            <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>
              관리자가 적합한 선배를 새로 배정해드립니다.
            </p>
            <div className="form-group">
              <label>변경 사유</label>
              <textarea
                className="form-control"
                value={seniorChangeReason}
                onChange={e => setSeniorChangeReason(e.target.value)}
                placeholder="선배 변경을 요청하는 사유를 입력해주세요"
                rows={3}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSubmitSeniorChange} disabled={seniorChangeLoading}
                style={{ background: "#7C3AED", borderColor: "#7C3AED" }}>
                {seniorChangeLoading ? "요청 중..." : "변경 요청 제출"}
              </button>
              <button className="btn btn-outline" onClick={() => setShowSeniorChangeRequest(false)}>취소</button>
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
                        {availabilityLoading ? (
                          <p style={{ fontSize: 13, color: "var(--gray-500)" }}>가용 일정 로딩 중...</p>
                        ) : (
                          <>
                            <div className="form-group" style={{ marginBottom: 10 }}>
                              <label style={{ fontSize: 12, color: "var(--gray-600)" }}>예약 날짜</label>
                              <select className="form-control" value={editDate}
                                onChange={e => { setEditDate(e.target.value); setEditTimeSlot(""); }}>
                                {/* 현재 날짜가 available_dates에 없을 수도 있으므로 포함 */}
                                {!availableDates.find((d: any) => d.date === r.reservation_date) && (
                                  <option value={r.reservation_date}>{r.reservation_date} (현재)</option>
                                )}
                                {availableDates.map((d: any) => (
                                  <option key={d.date} value={d.date}>
                                    {d.date}
                                    {d.date === r.reservation_date ? " (현재)" : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 10 }}>
                              <label style={{ fontSize: 12, color: "var(--gray-600)" }}>시간대</label>
                              {(() => {
                                const selectedDateInfo = availableDates.find((d: any) => d.date === editDate);
                                const slots = [
                                  { value: "morning", label: "오전", remaining: selectedDateInfo?.morning_remaining ?? 0 },
                                  { value: "afternoon", label: "오후", remaining: selectedDateInfo?.afternoon_remaining ?? 0 },
                                  { value: "evening", label: "저녁", remaining: selectedDateInfo?.evening_remaining ?? 0 },
                                ];
                                return (
                                  <div style={{ display: "flex", gap: 8 }}>
                                    {slots.map(slot => {
                                      const isCurrentSlot = editDate === r.reservation_date && slot.value === r.time_slot;
                                      const available = slot.remaining > 0 || isCurrentSlot;
                                      const isSelected = editTimeSlot === slot.value;
                                      return (
                                        <button
                                          key={slot.value}
                                          type="button"
                                          disabled={!available}
                                          onClick={() => setEditTimeSlot(slot.value)}
                                          style={{
                                            flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 13,
                                            fontWeight: isSelected ? 600 : 400, cursor: available ? "pointer" : "not-allowed",
                                            border: isSelected ? "2px solid #3B82F6" : "1px solid #D1D5DB",
                                            background: isSelected ? "#EFF6FF" : available ? "#fff" : "#F3F4F6",
                                            color: available ? (isSelected ? "#1D4ED8" : "#374151") : "#9CA3AF",
                                          }}
                                        >
                                          {slot.label}
                                          {selectedDateInfo && (
                                            <div style={{ fontSize: 10, marginTop: 2, color: "#9CA3AF" }}>
                                              {isCurrentSlot ? "현재" : `잔여 ${slot.remaining}`}
                                            </div>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          </>
                        )}
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
                        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, lineHeight: 1.5 }}>
                          수정 후 관리자 재승인이 필요합니다.
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-primary btn-sm" disabled={actionLoading || !editTimeSlot}
                            onClick={() => handleSubmitEdit(r.id, r.reservation_date, r.time_slot)}>
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
            {/* 학생/학부모: 가족 연결 */}
            {(memberType === "student" || memberType === "parent") && (
              <FamilyLinkSection memberType={memberType as "student" | "parent"} />
            )}

            {/* 학생/학부모: 사전 조사 관리 */}
            {surveys.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ fontSize: 16, margin: 0 }}>사전 조사</h2>
                  <a href="/consultation" style={{ fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>
                    새 설문 작성 &rarr;
                  </a>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {surveys.map((s) => {
                    const typeLabel = s.survey_type === "preheigh1" ? "예비고1" : "고등학생";
                    const timingLabel = s.timing ? ` (${s.timing})` : "";
                    const statusLabel = s.status === "submitted" ? "제출 완료" : "작성 중";
                    const statusColor = s.status === "submitted" ? "#16A34A" : "#F59E0B";
                    const href = s.survey_type === "preheigh1"
                      ? "/consultation-survey/preheigh1"
                      : "/consultation-survey/high";
                    return (
                      <div
                        key={s.id}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "12px 14px", borderRadius: 10,
                          border: "1px solid var(--gray-200)",
                        }}
                      >
                        <a href={href} style={{ flex: 1, textDecoration: "none", color: "var(--gray-700)" }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {typeLabel}{timingLabel} 사전 조사
                          </div>
                          <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                            {new Date(s.updated_at).toLocaleDateString("ko-KR")} 수정
                          </div>
                        </a>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                            color: "#fff", background: statusColor,
                          }}>
                            {statusLabel}
                          </span>
                          {s.status === "submitted" && (
                            <a href={`/consultation-survey/report/${s.id}`} style={{
                              color: "#fff", fontSize: 12, textDecoration: "none", fontWeight: 600,
                              background: "var(--primary)", padding: "4px 12px", borderRadius: 16,
                            }}>
                              리포트
                            </a>
                          )}
                          <a href={href} style={{ color: "var(--primary)", fontSize: 13, textDecoration: "none" }}>
                            {s.status === "submitted" ? "수정" : "이어쓰기"} →
                          </a>
                          {s.status === "draft" && user && s.user_id === user.id && (
                            <button
                              onClick={async () => {
                                if (!confirm("이 설문을 삭제하시겠습니까?")) return;
                                try {
                                  await deleteSurvey(s.id);
                                  setSurveys((prev) => prev.filter((x) => x.id !== s.id));
                                } catch {}
                              }}
                              style={{
                                background: "none", border: "none", cursor: "pointer",
                                fontSize: 13, color: "#DC2626", padding: "2px 4px",
                              }}
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 학생/학부모: 바로가기 메뉴 */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, marginBottom: 12 }}>빠른 메뉴</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { href: "/consultation/notes", icon: "📋", label: "상담 기록 보기" },
                  { href: "/consultation/my", icon: "📅", label: "예약 현황" },
                  { href: "/analysis?type=학생부라운지", icon: "📊", label: "학생부 분석 내역" },
                  { href: "/analysis?type=학종라운지", icon: "🎯", label: "학종 분석 내역" },
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
