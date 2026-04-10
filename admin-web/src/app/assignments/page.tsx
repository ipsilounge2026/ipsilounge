"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import {
  getAssignments, createAssignment, deleteAssignment,
  getAdmins, getUsers, getUnmatchedStudents,
  getSeniorAssignments, createSeniorAssignment, deleteSeniorAssignment,
  getChangeRequests, processChangeRequest,
} from "@/lib/api";
import { isLoggedIn, getAdminInfo } from "@/lib/auth";

interface Assignment {
  id: string;
  admin_id: string;
  admin_name: string;
  user_id: string;
  user_name: string;
  user_email: string;
  created_at: string;
}

interface SeniorAssignment {
  id: string;
  senior_id: string;
  senior_name: string;
  user_id: string;
  user_name: string;
  user_email: string;
  created_at: string;
}

interface ChangeRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  current_admin_id: string;
  current_admin_name: string;
  reason: string;
  status: string;
  new_admin_id: string | null;
  new_admin_name: string | null;
  admin_memo: string | null;
  created_at: string;
  processed_at: string | null;
}

interface AdminItem {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  member_type: string;
}

interface UnmatchedStudent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  member_type: string;
  student_name: string | null;
  services: string[];
  created_at: string;
}

type TabType = "assignments" | "senior" | "change-requests";

const TAB_LABELS: Record<TabType, string> = {
  assignments: "담당자 매칭",
  senior: "선배 매칭",
  "change-requests": "변경 요청",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "대기",
  approved: "승인",
  rejected: "거절",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "badge-requested",
  approved: "badge-completed",
  rejected: "badge-cancelled",
};

export default function AssignmentsPage() {
  const router = useRouter();
  const adminInfo = getAdminInfo();
  const isSuperAdmin = adminInfo?.role === "super_admin";

  const [activeTab, setActiveTab] = useState<TabType>("assignments");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [seniorAssignments, setSeniorAssignments] = useState<SeniorAssignment[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [unmatchedStudents, setUnmatchedStudents] = useState<UnmatchedStudent[]>([]);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [crFilter, setCrFilter] = useState("");

  // 미매칭 학생 빠른 매칭용
  const [quickMatchAdmin, setQuickMatchAdmin] = useState<Record<string, string>>({});

  // 변경 요청 처리 모달
  const [processingRequest, setProcessingRequest] = useState<ChangeRequest | null>(null);
  const [processAction, setProcessAction] = useState<"approved" | "rejected">("approved");
  const [processNewAdmin, setProcessNewAdmin] = useState("");
  const [processMemo, setProcessMemo] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === "change-requests") loadChangeRequests();
  }, [activeTab, crFilter]);

  const loadData = async () => {
    try {
      const [assignmentList, seniorList] = await Promise.all([
        getAssignments(),
        getSeniorAssignments().catch(() => []),
      ]);
      setAssignments(assignmentList);
      setSeniorAssignments(seniorList);
      if (isSuperAdmin) {
        const [adminList, userList, unmatched] = await Promise.all([
          getAdmins(),
          getUsers(1, undefined, undefined, undefined, true),
          getUnmatchedStudents(),
        ]);
        setAdmins(adminList.filter((a: AdminItem) => a.is_active));
        setUsers(userList.items || []);
        setUnmatchedStudents(unmatched);
      }
    } catch {}
  };

  const loadChangeRequests = async () => {
    try {
      const res = await getChangeRequests(crFilter || undefined);
      setChangeRequests(res);
    } catch { setChangeRequests([]); }
  };

  const handleCreate = async () => {
    if (!selectedAdmin || !selectedUser) {
      setMessage("담당자와 학생을 모두 선택해주세요");
      return;
    }
    try {
      if (activeTab === "senior") {
        await createSeniorAssignment(selectedAdmin, selectedUser);
      } else {
        await createAssignment(selectedAdmin, selectedUser);
      }
      setMessage("매칭이 완료되었습니다");
      setSelectedAdmin("");
      setSelectedUser("");
      setShowCreate(false);
      loadData();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleDelete = async (id: string, adminName: string, userName: string) => {
    if (!confirm(`${adminName} - ${userName} 매칭을 해제하시겠습니까?`)) return;
    try {
      if (activeTab === "senior") {
        await deleteSeniorAssignment(id);
      } else {
        await deleteAssignment(id);
      }
      setMessage("매칭이 해제되었습니다");
      loadData();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleSearchUsers = async () => {
    try {
      const result = await getUsers(1, userSearch || undefined, undefined, undefined, true);
      setUsers(result.items || []);
    } catch {}
  };

  const handleQuickMatch = async (userId: string) => {
    const adminId = quickMatchAdmin[userId];
    if (!adminId) {
      setMessage("담당자를 선택해주세요");
      return;
    }
    try {
      await createAssignment(adminId, userId);
      setMessage("매칭이 완료되었습니다");
      loadData();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleProcessRequest = async () => {
    if (!processingRequest) return;
    try {
      await processChangeRequest(processingRequest.id, {
        status: processAction,
        new_admin_id: processAction === "approved" ? (processNewAdmin || null) : null,
        admin_memo: processMemo || undefined,
      });
      setMessage(processAction === "approved" ? "변경 요청이 승인되었습니다" : "변경 요청이 거절되었습니다");
      setProcessingRequest(null);
      setProcessNewAdmin("");
      setProcessMemo("");
      loadChangeRequests();
      loadData();
    } catch (err: any) { setMessage(err.message); }
  };

  const currentAssignments = activeTab === "senior" ? seniorAssignments : assignments;
  const seniors = admins.filter(a => a.role === "senior");
  const nonSeniorAdmins = admins.filter(a => a.role !== "senior");
  const createAdminList = activeTab === "senior" ? seniors : nonSeniorAdmins;

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>학생-담당자 매칭</h1>
          {isSuperAdmin && activeTab !== "change-requests" && (
            <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? "취소" : "새 매칭"}
            </button>
          )}
        </div>

        {/* 탭 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #e5e7eb", paddingBottom: 0 }}>
          {(Object.keys(TAB_LABELS) as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setShowCreate(false); }}
              style={{
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? "#2563eb" : "#6b7280",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab ? "2px solid #2563eb" : "2px solid transparent",
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              {TAB_LABELS[tab]}
              {tab === "change-requests" && changeRequests.filter(r => r.status === "pending").length > 0 && (
                <span style={{
                  marginLeft: 6, background: "#EF4444", color: "white",
                  borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700,
                }}>
                  {changeRequests.filter(r => r.status === "pending").length}
                </span>
              )}
            </button>
          ))}
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
            <button onClick={() => setMessage("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>x</button>
          </div>
        )}

        {/* ===================== 담당자/선배 매칭 탭 ===================== */}
        {activeTab !== "change-requests" && (
          <>
            {/* 미매칭 학생 리스트 (담당자 매칭 탭에서만 표시) */}
            {activeTab === "assignments" && isSuperAdmin && unmatchedStudents.length > 0 && (
              <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: 20, marginBottom: 20 }}>
                <h3 style={{ marginBottom: 4, color: "#92400E" }}>
                  담당자 미매칭 학생 ({unmatchedStudents.length}명)
                </h3>
                <p style={{ fontSize: 13, color: "#92400E", marginBottom: 16 }}>
                  라운지 신청 또는 상담 신청을 했지만 담당자가 배정되지 않은 학생입니다.
                </p>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>이름</th>
                        <th>이메일</th>
                        <th>구분</th>
                        <th>신청 서비스</th>
                        <th>가입일</th>
                        <th>담당자 배정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedStudents.map(s => (
                        <tr key={s.id}>
                          <td>{s.name}{s.student_name ? ` (${s.student_name})` : ""}</td>
                          <td>{s.email}</td>
                          <td>
                            <span style={{
                              padding: "2px 8px", borderRadius: 4, fontSize: 12,
                              background: s.member_type === "parent" ? "#EDE9FE" : "#DBEAFE",
                              color: s.member_type === "parent" ? "#6D28D9" : "#1D4ED8",
                            }}>
                              {s.member_type === "parent" ? "학부모" : "학생"}
                            </span>
                          </td>
                          <td>
                            {s.services.map(svc => (
                              <span key={svc} style={{
                                padding: "2px 8px", borderRadius: 4, fontSize: 12,
                                background: "#E0F2FE", color: "#0369A1", marginRight: 4,
                              }}>
                                {svc}
                              </span>
                            ))}
                          </td>
                          <td>{new Date(s.created_at).toLocaleDateString("ko-KR")}</td>
                          <td>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <select
                                className="form-control"
                                style={{ fontSize: 13, padding: "4px 8px", minWidth: 100 }}
                                value={quickMatchAdmin[s.id] || ""}
                                onChange={e => setQuickMatchAdmin(prev => ({ ...prev, [s.id]: e.target.value }))}
                              >
                                <option value="">선택</option>
                                {nonSeniorAdmins.map(a => (
                                  <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                              </select>
                              <button className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => handleQuickMatch(s.id)}>
                                배정
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 매칭 생성 폼 */}
            {showCreate && isSuperAdmin && (
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 20 }}>
                <h3 style={{ marginBottom: 16 }}>
                  {activeTab === "senior" ? "선배 매칭 추가" : "새 매칭 추가"}
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div className="form-group">
                    <label>{activeTab === "senior" ? "선배 선택" : "담당자 선택"}</label>
                    <select className="form-control" value={selectedAdmin} onChange={e => setSelectedAdmin(e.target.value)}>
                      <option value="">선택하세요</option>
                      {createAdminList.map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({a.role === "senior" ? "선배" : a.role})</option>
                      ))}
                    </select>
                    {activeTab === "senior" && seniors.length === 0 && (
                      <p style={{ fontSize: 12, color: "#EF4444", marginTop: 4 }}>
                        선배 역할이 부여된 관리자가 없습니다. 담당자 관리에서 선배 역할을 먼저 추가해주세요.
                      </p>
                    )}
                  </div>
                  <div className="form-group">
                    <label>학생/학부모 선택</label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input className="form-control" placeholder="이름 또는 이메일 검색" value={userSearch} onChange={e => setUserSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearchUsers()} />
                      <button className="btn btn-sm" onClick={handleSearchUsers}>검색</button>
                    </div>
                    <select className="form-control" value={selectedUser} onChange={e => setSelectedUser(e.target.value)} size={5} style={{ height: "auto" }}>
                      {users
                        .filter(u => !currentAssignments.some(a => a.user_id === u.id))
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email}) {u.member_type === "parent" ? "[학부모]" : "[학생]"}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleCreate}>매칭하기</button>
              </div>
            )}

            {/* 매칭 목록 */}
            <h3 style={{ marginBottom: 12 }}>
              {activeTab === "senior" ? "선배 매칭 현황" : "매칭 현황"} ({currentAssignments.length}건)
            </h3>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>{activeTab === "senior" ? "선배" : "담당자"}</th>
                    <th>학생/학부모</th>
                    <th>이메일</th>
                    <th>매칭일</th>
                    {isSuperAdmin && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {currentAssignments.map(a => (
                    <tr key={a.id}>
                      <td>{"senior_name" in a ? (a as SeniorAssignment).senior_name : (a as Assignment).admin_name}</td>
                      <td>{a.user_name}</td>
                      <td>{a.user_email}</td>
                      <td>{new Date(a.created_at).toLocaleDateString("ko-KR")}</td>
                      {isSuperAdmin && (
                        <td>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(
                            a.id,
                            "senior_name" in a ? (a as SeniorAssignment).senior_name : (a as Assignment).admin_name,
                            a.user_name
                          )}>
                            해제
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {currentAssignments.length === 0 && (
                    <tr>
                      <td colSpan={isSuperAdmin ? 5 : 4} style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>
                        {activeTab === "senior" ? "선배 매칭이 없습니다" : "매칭된 학생이 없습니다"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ===================== 변경 요청 탭 ===================== */}
        {activeTab === "change-requests" && (
          <>
            <div className="filter-bar" style={{ marginBottom: 16 }}>
              <select className="form-control" value={crFilter} onChange={e => setCrFilter(e.target.value)}>
                <option value="">전체</option>
                <option value="pending">대기</option>
                <option value="approved">승인</option>
                <option value="rejected">거절</option>
              </select>
              <span style={{ color: "var(--gray-600)", fontSize: 14 }}>총 {changeRequests.length}건</span>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>학생</th>
                    <th>현재 담당자</th>
                    <th>변경 사유</th>
                    <th>상태</th>
                    <th>새 담당자</th>
                    <th>관리자 메모</th>
                    <th>요청일</th>
                    {isSuperAdmin && <th>관리</th>}
                  </tr>
                </thead>
                <tbody>
                  {changeRequests.map(cr => (
                    <tr key={cr.id}>
                      <td>
                        <div>{cr.user_name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{cr.user_email}</div>
                      </td>
                      <td>{cr.current_admin_name}</td>
                      <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cr.reason}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[cr.status] || ""}`}>
                          {STATUS_LABELS[cr.status] || cr.status}
                        </span>
                      </td>
                      <td>{cr.new_admin_name || "-"}</td>
                      <td style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cr.admin_memo || "-"}
                      </td>
                      <td>{new Date(cr.created_at).toLocaleDateString("ko-KR")}</td>
                      {isSuperAdmin && (
                        <td>
                          {cr.status === "pending" && (
                            <button className="btn btn-primary btn-sm" onClick={() => { setProcessingRequest(cr); setProcessAction("approved"); setProcessNewAdmin(""); setProcessMemo(""); }}>
                              처리
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {changeRequests.length === 0 && (
                    <tr>
                      <td colSpan={isSuperAdmin ? 8 : 7} style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>
                        변경 요청이 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 변경 요청 처리 모달 */}
        {processingRequest && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }} onClick={() => setProcessingRequest(null)}>
            <div style={{
              background: "white", borderRadius: 12, padding: 24, width: "100%", maxWidth: 460,
            }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 16 }}>변경 요청 처리</h3>
              <div style={{ background: "#f9fafb", borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 14 }}>
                <p><strong>학생:</strong> {processingRequest.user_name}</p>
                <p><strong>현재 담당자:</strong> {processingRequest.current_admin_name}</p>
                <p><strong>사유:</strong> {processingRequest.reason}</p>
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>처리</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className={`btn btn-sm ${processAction === "approved" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setProcessAction("approved")}
                  >승인</button>
                  <button
                    className={`btn btn-sm ${processAction === "rejected" ? "btn-danger" : "btn-outline"}`}
                    onClick={() => setProcessAction("rejected")}
                  >거절</button>
                </div>
              </div>

              {processAction === "approved" && (
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>새 담당자 (선택)</label>
                  <select className="form-control" value={processNewAdmin} onChange={e => setProcessNewAdmin(e.target.value)}>
                    <option value="">자동 배정 (미지정)</option>
                    {admins
                      .filter(a => a.id !== processingRequest.current_admin_id)
                      .map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({ROLE_LABELS[a.role] || a.role})</option>
                      ))}
                  </select>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>관리자 메모 (선택)</label>
                <textarea className="form-control" value={processMemo} onChange={e => setProcessMemo(e.target.value)} rows={2} placeholder="처리 사유나 메모" />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-outline" onClick={() => setProcessingRequest(null)}>취소</button>
                <button
                  className={`btn ${processAction === "approved" ? "btn-primary" : "btn-danger"}`}
                  onClick={handleProcessRequest}
                >
                  {processAction === "approved" ? "승인 처리" : "거절 처리"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "최고관리자",
  admin: "담당자",
  counselor: "상담자",
  senior: "선배",
};
