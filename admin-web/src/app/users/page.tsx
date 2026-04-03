"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getUsers, deactivateUser, activateUser } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface UserItem {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  member_type: string;
  student_name: string | null;
  student_birth: string | null;
  birth_date: string | null;
  school_name: string | null;
  grade: number | null;
  branch_name: string | null;
  is_active: boolean;
  created_at: string;
}

const memberTypeLabel: Record<string, string> = {
  student: "학생",
  parent: "학부모",
  branch_manager: "지점담당자",
};

const memberTypeBadge: Record<string, string> = {
  student: "badge-completed",
  parent: "badge-processing",
  branch_manager: "badge-pending",
};

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [memberTypeFilter, setMemberTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadData();
  }, [page, search, memberTypeFilter, activeFilter]);

  const loadData = async () => {
    try {
      const isActive = activeFilter === "" ? undefined : activeFilter === "true";
      const res = await getUsers(page, search || undefined, memberTypeFilter || undefined, isActive);
      setUsers(res.items);
      setTotal(res.total);
    } catch {}
  };

  const handleActivate = async (userId: string, userName: string) => {
    if (!confirm(`${userName} 회원을 승인(활성화)하시겠습니까?`)) return;
    try {
      await activateUser(userId);
      setMessage(`${userName} 회원이 승인되었습니다`);
      loadData();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleDeactivate = async (userId: string, userName: string) => {
    if (!confirm(`${userName} 회원을 비활성화하시겠습니까?`)) return;
    try {
      await deactivateUser(userId);
      setMessage(`${userName} 회원이 비활성화되었습니다`);
      loadData();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const totalPages = Math.ceil(total / 20);

  // 승인 대기 중인 지점 담당자 수
  const pendingCount = users.filter(u => u.member_type === "branch_manager" && !u.is_active).length;

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>회원 관리</h1>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
          </div>
        )}

        {/* 필터 바 */}
        <div className="filter-bar" style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            className="form-control"
            placeholder="이름 또는 이메일 검색"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ minWidth: 220 }}
          />
          <select
            className="form-control"
            value={memberTypeFilter}
            onChange={(e) => { setMemberTypeFilter(e.target.value); setPage(1); }}
            style={{ width: 140 }}
          >
            <option value="">전체 유형</option>
            <option value="student">학생</option>
            <option value="parent">학부모</option>
            <option value="branch_manager">지점담당자</option>
          </select>
          <select
            className="form-control"
            value={activeFilter}
            onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
            style={{ width: 130 }}
          >
            <option value="">전체 상태</option>
            <option value="true">활성</option>
            <option value="false">비활성/대기</option>
          </select>
          <span style={{ color: "var(--gray-600)", fontSize: 14, marginLeft: "auto" }}>총 {total}명</span>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>유형</th>
                <th>이메일</th>
                <th>연락처</th>
                <th>추가정보</th>
                <th>가입일</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 500 }}>{user.name}</td>
                  <td>
                    <span className={`badge ${memberTypeBadge[user.member_type] || "badge-completed"}`}>
                      {memberTypeLabel[user.member_type] || user.member_type}
                    </span>
                  </td>
                  <td>{user.email}</td>
                  <td>{user.phone || "-"}</td>
                  <td style={{ fontSize: 13, color: "var(--gray-600)" }}>
                    {user.member_type === "branch_manager" && user.branch_name && (
                      <span>{user.branch_name}</span>
                    )}
                    {user.member_type === "parent" && user.student_name && (
                      <span>자녀: {user.student_name}</span>
                    )}
                    {(user.member_type === "student" || user.member_type === "parent") && user.school_name && (
                      <span>{user.member_type === "parent" ? " / " : ""}{user.school_name}{user.grade ? ` ${user.grade}학년` : ""}</span>
                    )}
                    {user.member_type === "student" && !user.school_name && "-"}
                  </td>
                  <td>{new Date(user.created_at).toLocaleDateString("ko-KR")}</td>
                  <td>
                    {user.is_active ? (
                      <span className="badge badge-completed">활성</span>
                    ) : user.member_type === "branch_manager" ? (
                      <span className="badge badge-pending" style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>승인대기</span>
                    ) : (
                      <span className="badge badge-cancelled">비활성</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!user.is_active && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleActivate(user.id, user.name)}>
                          승인
                        </button>
                      )}
                      {user.is_active && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(user.id, user.name)}>
                          비활성화
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>회원이 없습니다</td></tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i + 1} className={page === i + 1 ? "active" : ""} onClick={() => setPage(i + 1)}>{i + 1}</button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
