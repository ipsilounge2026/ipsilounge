"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getAssignments, createAssignment, deleteAssignment, getAdmins, getUsers } from "@/lib/api";
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

export default function AssignmentsPage() {
  const router = useRouter();
  const adminInfo = getAdminInfo();
  const isSuperAdmin = adminInfo?.role === "super_admin";

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const assignmentList = await getAssignments();
      setAssignments(assignmentList);
      if (isSuperAdmin) {
        const [adminList, userList] = await Promise.all([getAdmins(), getUsers(1)]);
        setAdmins(adminList.filter((a: AdminItem) => a.role === "admin" && a.is_active));
        setUsers(userList.items || []);
      }
    } catch {}
  };

  const handleCreate = async () => {
    if (!selectedAdmin || !selectedUser) {
      setMessage("담당자와 학생을 모두 선택해주세요");
      return;
    }
    try {
      await createAssignment(selectedAdmin, selectedUser);
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
      await deleteAssignment(id);
      setMessage("매칭이 해제되었습니다");
      loadData();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleSearchUsers = async () => {
    try {
      const result = await getUsers(1, userSearch || undefined);
      setUsers(result.items || []);
    } catch {}
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>학생-담당자 매칭</h1>
          {isSuperAdmin && (
            <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? "취소" : "새 매칭"}
            </button>
          )}
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
          </div>
        )}

        {/* 매칭 생성 폼 */}
        {showCreate && isSuperAdmin && (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ marginBottom: 16 }}>새 매칭 추가</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div className="form-group">
                <label>담당자 선택</label>
                <select className="form-control" value={selectedAdmin} onChange={e => setSelectedAdmin(e.target.value)}>
                  <option value="">선택하세요</option>
                  {admins.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>학생/학부모 선택</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input className="form-control" placeholder="이름 또는 이메일 검색" value={userSearch} onChange={e => setUserSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearchUsers()} />
                  <button className="btn btn-sm" onClick={handleSearchUsers}>검색</button>
                </div>
                <select className="form-control" value={selectedUser} onChange={e => setSelectedUser(e.target.value)} size={5} style={{ height: "auto" }}>
                  {users.map(u => (
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
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>담당자</th>
                <th>학생/학부모</th>
                <th>이메일</th>
                <th>매칭일</th>
                {isSuperAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.id}>
                  <td>{a.admin_name}</td>
                  <td>{a.user_name}</td>
                  <td>{a.user_email}</td>
                  <td>{new Date(a.created_at).toLocaleDateString("ko-KR")}</td>
                  {isSuperAdmin && (
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id, a.admin_name, a.user_name)}>
                        해제
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={isSuperAdmin ? 5 : 4} style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>
                    매칭된 학생이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
