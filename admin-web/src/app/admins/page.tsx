"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getAdmins, promoteToAdmin, updateAdmin, resetAdminPassword, getAllMenus, searchUsersForPromotion } from "@/lib/api";
import { isLoggedIn, getAdminInfo } from "@/lib/auth";

interface AdminItem {
  id: string;
  email: string;
  name: string;
  role: string;
  allowed_menus: string[];
  is_active: boolean;
  user_id: string | null;
  created_at: string;
}

interface MenuItem {
  key: string;
  label: string;
}

interface UserItem {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  member_type: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "최고관리자",
  admin: "담당자",
  counselor: "상담자",
};

const ROLE_BADGE_CLASS: Record<string, string> = {
  super_admin: "badge-completed",
  admin: "badge-processing",
  counselor: "badge-uploaded",
};

export default function AdminsPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [message, setMessage] = useState("");
  const [showPromote, setShowPromote] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // 회원 검색 및 승격 관련 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [promoteRole, setPromoteRole] = useState("admin");
  const [promoteMenus, setPromoteMenus] = useState<string[]>([]);

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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await searchUsersForPromotion(searchQuery.trim());
      // 이미 관리자인 이메일 제외
      const adminEmails = new Set(admins.map(a => a.email));
      const filtered = (res.items || []).filter((u: UserItem) => !adminEmails.has(u.email));
      setSearchResults(filtered);
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const handleSelectUser = (user: UserItem) => {
    setSelectedUser(user);
    setSearchResults([]);
    setSearchQuery("");
  };

  const handlePromote = async () => {
    if (!selectedUser) return;
    try {
      await promoteToAdmin({
        user_id: selectedUser.id,
        role: promoteRole,
        allowed_menus: promoteMenus,
      });
      setMessage(`${selectedUser.name}님이 ${ROLE_LABELS[promoteRole] || promoteRole}(으)로 승격되었습니다`);
      setShowPromote(false);
      setSelectedUser(null);
      setPromoteRole("admin");
      setPromoteMenus([]);
      loadData();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleCancelPromote = () => {
    setShowPromote(false);
    setSelectedUser(null);
    setSearchQuery("");
    setSearchResults([]);
    setPromoteRole("admin");
    setPromoteMenus([]);
  };

  const togglePromoteMenu = (menuKey: string) => {
    setPromoteMenus(prev =>
      prev.includes(menuKey) ? prev.filter(m => m !== menuKey) : [...prev, menuKey]
    );
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

  const handleRoleChange = async (adminId: string, newRole: string) => {
    try {
      await updateAdmin(adminId, { role: newRole });
      setMessage("역할이 변경되었습니다");
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

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>담당자 관리</h1>
          <button className="btn btn-primary" onClick={() => showPromote ? handleCancelPromote() : setShowPromote(true)}>
            {showPromote ? "취소" : "회원 승격"}
          </button>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
            <button onClick={() => setMessage("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>x</button>
          </div>
        )}

        {/* 회원 승격 폼 */}
        {showPromote && (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ marginBottom: 16 }}>회원을 관리자로 승격</h3>

            {!selectedUser ? (
              <>
                {/* 회원 검색 */}
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>회원 검색 (이름 또는 이메일)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="form-control"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSearch()}
                      placeholder="이름 또는 이메일로 검색..."
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-primary" onClick={handleSearch} disabled={searching}>
                      {searching ? "검색중..." : "검색"}
                    </button>
                  </div>
                </div>

                {/* 검색 결과 */}
                {searchResults.length > 0 && (
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                    {searchResults.map(user => (
                      <div
                        key={user.id}
                        onClick={() => handleSelectUser(user)}
                        style={{
                          padding: "12px 16px",
                          borderBottom: "1px solid #f3f4f6",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "background 0.15s",
                        }}
                        onMouseOver={e => (e.currentTarget.style.background = "#eff6ff")}
                        onMouseOut={e => (e.currentTarget.style.background = "")}
                      >
                        <div>
                          <span style={{ fontWeight: 600, marginRight: 8 }}>{user.name}</span>
                          <span style={{ color: "#6b7280", fontSize: 13 }}>{user.email}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>
                          {user.phone || ""} | {user.member_type === "parent" ? "학부모" : "학생"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searchResults.length === 0 && searchQuery && !searching && (
                  <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>검색 결과가 없거나 이미 관리자로 등록된 회원입니다</p>
                )}
              </>
            ) : (
              <>
                {/* 선택된 회원 정보 + 역할/권한 설정 */}
                <div style={{ padding: 16, background: "#eff6ff", borderRadius: 8, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{selectedUser.name}</span>
                    <span style={{ color: "#6b7280", marginLeft: 8, fontSize: 13 }}>{selectedUser.email}</span>
                  </div>
                  <button
                    onClick={() => { setSelectedUser(null); setSearchQuery(""); }}
                    style={{ fontSize: 13, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                  >
                    다른 회원 선택
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                  <div className="form-group">
                    <label>역할</label>
                    <select className="form-control" value={promoteRole} onChange={e => setPromoteRole(e.target.value)}>
                      <option value="admin">담당자</option>
                      <option value="counselor">상담자</option>
                      <option value="super_admin">최고관리자</option>
                    </select>
                    <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                      {promoteRole === "super_admin" && "모든 메뉴에 접근 가능합니다"}
                      {promoteRole === "admin" && "선택한 메뉴에만 접근 가능합니다"}
                      {promoteRole === "counselor" && "상담 관련 메뉴에 접근 가능합니다"}
                    </p>
                  </div>

                  {promoteRole !== "super_admin" && (
                    <div className="form-group">
                      <label>메뉴 접근 권한</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                        {menus.map(m => (
                          <label key={m.key} style={{
                            display: "flex", alignItems: "center", gap: 6, fontSize: 14,
                            cursor: "pointer", padding: "6px 12px", border: "1px solid #e5e7eb",
                            borderRadius: 6, background: promoteMenus.includes(m.key) ? "#eff6ff" : "#fff",
                          }}>
                            <input type="checkbox" checked={promoteMenus.includes(m.key)} onChange={() => togglePromoteMenu(m.key)} />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" onClick={handlePromote}>승격하기</button>
                  <button className="btn btn-outline" onClick={handleCancelPromote}>취소</button>
                </div>
              </>
            )}
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
                  <td>
                    {admin.name}
                    {admin.user_id && (
                      <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>(회원승격)</span>
                    )}
                  </td>
                  <td>{admin.email}</td>
                  <td>
                    {editingId === admin.id ? (
                      <select
                        className="form-control"
                        value={admin.role}
                        onChange={e => handleRoleChange(admin.id, e.target.value)}
                        style={{ width: 100, fontSize: 13, padding: "2px 6px" }}
                      >
                        <option value="admin">담당자</option>
                        <option value="counselor">상담자</option>
                        <option value="super_admin">최고관리자</option>
                      </select>
                    ) : (
                      <span className={`badge ${ROLE_BADGE_CLASS[admin.role] || "badge-processing"}`}>
                        {ROLE_LABELS[admin.role] || admin.role}
                      </span>
                    )}
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
                          <button className="btn btn-sm" onClick={() => setEditingId(editingId === admin.id ? null : admin.id)}>
                            {editingId === admin.id ? "완료" : "수정"}
                          </button>
                          <button className="btn btn-sm" onClick={() => setResetId(admin.id)}>비밀번호</button>
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
