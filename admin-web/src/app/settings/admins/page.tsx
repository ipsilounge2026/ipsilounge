"use client";

import { useEffect, useState } from "react";

interface AdminAccount {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminAccountsPage() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "admin" });
  const [loading, setLoading] = useState(true);

  function authHeader() {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  async function fetchAdmins() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/admins`, {
      headers: authHeader(),
    });
    const data = await res.json();
    setAdmins(data);
    setLoading(false);
  }

  useEffect(() => { fetchAdmins(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createAdmin() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/admins`, {
      method: "POST",
      headers: authHeader(),
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ email: "", password: "", name: "", role: "admin" });
      fetchAdmins();
    } else {
      const err = await res.json();
      alert(err.detail ?? "오류가 발생했습니다.");
    }
  }

  async function toggleActive(admin: AdminAccount) {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/admins/${admin.id}`, {
      method: "PUT",
      headers: authHeader(),
      body: JSON.stringify({ is_active: !admin.is_active }),
    });
    fetchAdmins();
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">관리자 계정 관리</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
        >
          + 관리자 추가
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="font-semibold mb-4">새 관리자 계정 생성</h2>
          <div className="grid grid-cols-2 gap-4">
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="이름"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="이메일"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="비밀번호 (8자 이상)"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            <select
              className="border rounded-lg px-3 py-2"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="admin">일반 관리자</option>
              <option value="super_admin">슈퍼 관리자</option>
            </select>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={createAdmin} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
              생성
            </button>
            <button onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm">
              취소
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">불러오는 중...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">이름</th>
                <th className="px-4 py-3 text-left">이메일</th>
                <th className="px-4 py-3 text-left">역할</th>
                <th className="px-4 py-3 text-left">상태</th>
                <th className="px-4 py-3 text-left">가입일</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {admins.map((a) => (
                <tr key={a.id} className={!a.is_active ? "opacity-50" : ""}>
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-gray-600">{a.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        a.role === "super_admin"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {a.role === "super_admin" ? "슈퍼 관리자" : "일반 관리자"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        a.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {a.is_active ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(a.created_at).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(a)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {a.is_active ? "비활성화" : "활성화"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
