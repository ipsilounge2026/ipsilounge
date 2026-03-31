"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getUsers, deactivateUser } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface UserItem {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadData();
  }, [page, search]);

  const loadData = async () => {
    try {
      const res = await getUsers(page, search || undefined);
      setUsers(res.items);
      setTotal(res.total);
    } catch {}
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

        <div className="filter-bar" style={{ marginBottom: 16 }}>
          <input
            type="text"
            className="form-control"
            placeholder="이름 또는 이메일 검색"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ minWidth: 250 }}
          />
          <span style={{ color: "var(--gray-600)", fontSize: 14 }}>총 {total}명</span>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>연락처</th>
                <th>가입일</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.phone || "-"}</td>
                  <td>{new Date(user.created_at).toLocaleDateString("ko-KR")}</td>
                  <td>
                    <span className={`badge ${user.is_active ? "badge-completed" : "badge-cancelled"}`}>
                      {user.is_active ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td>
                    {user.is_active && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(user.id, user.name)}>
                        비활성화
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>회원이 없습니다</td></tr>
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
