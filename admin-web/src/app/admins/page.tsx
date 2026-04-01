"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getAdmins, createAdmin, updateAdmin, resetAdminPassword, getAllMenus } from "@/lib/api";
import { isLoggedIn, getAdminInfo } from "@/lib/auth";

interface AdminItem {
  id: string;
  email: string;
  name: string;
  role: string;
  allowed_menus: string[];
  is_active: boolean;
  created_at: string;
}

interface MenuItem {
  key: string;
  label: string;
}

export default function AdminsPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [form, setForm] = useState({
    email: "", password: "", name: "", role: "admin", allowed_menus: [] as string[],
  });

  const adminInfo = getAdminInfo();

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    if (adminInfo?.role !== "super_admin") { router.push("/"); return; }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [adminList, menuList] = await Promise.all([getAdmins(), getAllMenus()]);
      setAdmins(adminList);
      setMenus(menuList);
    } catch {}
  };

  const handleCreate = async () => {
    try {
      await createAdmin(form);
      setMessage("담당자 계정이 생성되었습니다");
      setShowCreate(false);
      setForm({ email: "", password: "", name: "", role: "admin", allowed_menus: [] });
      loadData();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleMenuToggle = (menuKey: string, adminId: string) => {
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return;
    const current = admin.allowed_menus || [];
    const updated = current.includes(menuKey)
      ? current.filter(m => m !== menuKey)
      : [...current, menuKey];
    handleUpdateMenus(adminId, updated);
  };

  const handleUpdateMenus = async (adminId: string, menus: string[]) => {
    try {
      await updateAdmin(adminId, { allowed_menus: menus });
      setMessage("권한이 수정되었습니다");
      loadData();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleDeactivate = async (adminId: string, name: string, currentActive: boolean) => {
    if (!confirm(`${name} 계정을 ${currentActive ? "비활성화" : "활성화"}하시겠습니까?`)) return;
    try {
      await updateAdmin(adminId, { is_active: !currentActive });
      setMessage(`${name} 계정이 ${currentActive ? "비활성화" : "활성화"}되었습니다`);
      loadData();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleResetPassword = async () => {
    if (!resetId || !newPassword) return;
    try {
      await resetAdminPassword(resetId, newPassword);
      setMessage("비밀번호가 초기화되었습니다");
      setResetId(null);
      setNewPassword("");
    } catch (err: any) { setMessage(err.message); }
  };

  const toggleFormMenu = (menuKey: string) => {
    setForm(prev => ({
      ...prev,
      allowed_menus: prev.allowed_menus.includes(menuKey)
        ? prev.allowed_menus.filter(m => m !== menuKey)
        : [...prev.allowed_menus, menuKey],
    }));
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>담당자 관리</h1>
          <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "취소" : "담당자 추가"}
          </button>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
          </div>
        )}

        {/* 담당자 생성 폼 */}
        {showCreate && (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ marginBottom: 16 }}>새 담당자 추가</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div className="form-group">
                <label>이름</label>
                <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>이메일</label>
                <input className="form-control" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>비밀번호</label>
                <input className="form-control" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="8자 이상" />
              </div>
              <div className="form-group">
                <label>등급</label>
                <select className="form-control" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="admin">담당자</option>
                  <option value="super_admin">최고관리자</option>
                </select>
              </div>
            </div>
            {form.role === "admin" && (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>메뉴 접근 권한</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {menus.map(m => (
                    <label key={m.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer", padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: form.allowed_menus.includes(m.key) ? "#eff6ff" : "#fff" }}>
                      <input type="checkbox" checked={form.allowed_menus.includes(m.key)} onChange={() => toggleFormMenu(m.key)} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button className="btn btn-primary" onClick={handleCreate}>생성</button>
          </div>
        )}

        {/* 담당자 목록 */}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>등급</th>
                <th>메뉴 권한</th>
                <th>상태</th>
                <th>가입일</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admins.map(admin => (
                <tr key={admin.id}>
                  <td>{admin.name}</td>
                  <td>{admin.email}</td>
                  <td>
                    <span className={`badge ${admin.role === "super_admin" ? "badge-completed" : "badge-processing"}`}>
                      {admin.role === "super_admin" ? "최고관리자" : "담당자"}
                    </span>
                  </td>
                  <td>
                    {admin.role === "super_admin" ? (
                      <span style={{ fontSize: 13, color: "#6b7280" }}>전체 접근</span>
                    ) : editingId === admin.id ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {menus.map(m => (
                          <label key={m.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", padding: "3px 8px", border: "1px solid #e5e7eb", borderRadius: 4, background: admin.allowed_menus.includes(m.key) ? "#eff6ff" : "#fff" }}>
                            <input type="checkbox" checked={admin.allowed_menus.includes(m.key)} onChange={() => handleMenuToggle(m.key, admin.id)} />
                            {m.label}
                          </label>
                        ))}
                        <button style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }} onClick={() => setEditingId(null)}>완료</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, color: "#6b7280" }}>
                          {admin.allowed_menus.length > 0 ? admin.allowed_menus.map(k => menus.find(m => m.key === k)?.label || k).join(", ") : "없음"}
                        </span>
                        <button style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }} onClick={() => setEditingId(admin.id)}>수정</button>
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${admin.is_active ? "badge-completed" : "badge-cancelled"}`}>
                      {admin.is_active ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td>{new Date(admin.created_at).toLocaleDateString("ko-KR")}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {resetId === admin.id ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input type="password" placeholder="새 비밀번호" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ width: 120, padding: "4px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 4 }} />
                          <button className="btn btn-primary btn-sm" onClick={handleResetPassword}>확인</button>
                          <button className="btn btn-sm" onClick={() => { setResetId(null); setNewPassword(""); }}>취소</button>
                        </div>
                      ) : (
                        <>
                          <button className="btn btn-sm" onClick={() => setResetId(admin.id)}>비밀번호 초기화</button>
                          {str(admin.id) !== str(adminInfo?.id) && (
                            <button className={`btn btn-sm ${admin.is_active ? "btn-danger" : "btn-primary"}`} onClick={() => handleDeactivate(admin.id, admin.name, admin.is_active)}>
                              {admin.is_active ? "비활성화" : "활성화"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function str(val: any): string {
  return String(val || "");
}
