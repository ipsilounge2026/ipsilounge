"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isLoggedIn, hasMenuAccess, getDefaultRoute } from "@/lib/auth";
import { getNotices, createNotice, updateNotice, deleteNotice } from "@/lib/api";

const TARGET_LABELS: Record<string, string> = {
  all: "전체",
  student: "학생",
  parent: "학부모",
  branch_manager: "지점 담당자",
};

interface Notice {
  id: string;
  title: string;
  content: string;
  target_audience: string;
  is_pinned: boolean;
  is_active: boolean;
  send_push: boolean;
  admin_name: string | null;
  created_at: string;
  updated_at: string | null;
}

export default function NoticePage() {
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterTarget, setFilterTarget] = useState("");
  const [filterActive, setFilterActive] = useState<string>("");
  const [message, setMessage] = useState("");

  // 모달 상태
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    content: "",
    target_audience: "all",
    is_pinned: false,
    is_active: true,
    send_push: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    if (!hasMenuAccess("notice")) { router.push(getDefaultRoute()); return; }
    load();
  }, [page, filterTarget, filterActive]);

  const load = async () => {
    try {
      const isActiveParam = filterActive === "" ? undefined : filterActive === "true";
      const res = await getNotices(page, filterTarget || undefined, isActiveParam);
      setNotices(res.items);
      setTotal(res.total);
    } catch {}
  };

  const resetForm = () => {
    setForm({ title: "", content: "", target_audience: "all", is_pinned: false, is_active: true, send_push: false });
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (n: Notice) => {
    setEditingId(n.id);
    setForm({
      title: n.title,
      content: n.content,
      target_audience: n.target_audience,
      is_pinned: n.is_pinned,
      is_active: n.is_active,
      send_push: n.send_push,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setMessage("제목과 내용을 입력해주세요");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateNotice(editingId, {
          title: form.title,
          content: form.content,
          target_audience: form.target_audience,
          is_pinned: form.is_pinned,
          is_active: form.is_active,
        });
        setMessage("공지사항이 수정되었습니다");
      } else {
        await createNotice(form);
        setMessage("공지사항이 등록되었습니다");
      }
      setShowModal(false);
      resetForm();
      load();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 공지사항을 삭제하시겠습니까?")) return;
    try {
      await deleteNotice(id);
      setMessage("공지사항이 삭제되었습니다");
      load();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleToggleActive = async (n: Notice) => {
    try {
      await updateNotice(n.id, { is_active: !n.is_active });
      load();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleTogglePin = async (n: Notice) => {
    try {
      await updateNotice(n.id, { is_pinned: !n.is_pinned });
      load();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>공지사항 관리</h1>
          <button className="btn btn-primary" onClick={openCreate}>공지사항 등록</button>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
          </div>
        )}

        {/* 필터 */}
        <div className="filter-bar" style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
          <select className="form-control" value={filterTarget} onChange={(e) => { setFilterTarget(e.target.value); setPage(1); }}>
            <option value="">전체 대상</option>
            <option value="all">전체 사용자</option>
            <option value="student">학생</option>
            <option value="parent">학부모</option>
            <option value="branch_manager">지점 담당자</option>
          </select>
          <select className="form-control" value={filterActive} onChange={(e) => { setFilterActive(e.target.value); setPage(1); }}>
            <option value="">전체 상태</option>
            <option value="true">활성</option>
            <option value="false">비활성</option>
          </select>
          <span style={{ color: "var(--gray-600)", fontSize: 14 }}>총 {total}건</span>
        </div>

        {/* 목록 테이블 */}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>제목</th>
                <th>대상</th>
                <th>상태</th>
                <th>고정</th>
                <th>작성자</th>
                <th>작성일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => (
                <tr key={n.id} style={{ opacity: n.is_active ? 1 : 0.5 }}>
                  <td style={{ maxWidth: 300 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {n.is_pinned && <span style={{ color: "#ef4444", marginRight: 4 }}>📌</span>}
                      {n.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--gray-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
                      {n.content}
                    </div>
                  </td>
                  <td>
                    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 12, backgroundColor: "#F3F4F6", color: "#374151" }}>
                      {TARGET_LABELS[n.target_audience] || n.target_audience}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{ padding: "2px 8px", borderRadius: 12, fontSize: 12, color: "#fff", backgroundColor: n.is_active ? "#10b981" : "#9ca3af", cursor: "pointer" }}
                      onClick={() => handleToggleActive(n)}
                    >
                      {n.is_active ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{ cursor: "pointer", fontSize: 16 }}
                      onClick={() => handleTogglePin(n)}
                    >
                      {n.is_pinned ? "📌" : "—"}
                    </span>
                  </td>
                  <td>{n.admin_name || "-"}</td>
                  <td style={{ fontSize: 13 }}>{new Date(n.created_at).toLocaleDateString("ko-KR")}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(n)}>수정</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(n.id)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
              {notices.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>공지사항이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {total > 20 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
            <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button>
            <span style={{ padding: "6px 12px", fontSize: 14 }}>{page} / {Math.ceil(total / 20)}</span>
            <button className="btn btn-sm btn-outline" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)}>다음</button>
          </div>
        )}

        {/* 등록/수정 모달 */}
        {showModal && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }} onClick={() => setShowModal(false)}>
            <div style={{
              background: "white", borderRadius: 12, padding: 24, width: "100%", maxWidth: 560,
              maxHeight: "90vh", overflow: "auto",
            }} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ fontSize: 18, marginBottom: 20 }}>{editingId ? "공지사항 수정" : "공지사항 등록"}</h2>

              <div className="form-group">
                <label>제목</label>
                <input className="form-control" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="공지사항 제목" />
              </div>

              <div className="form-group">
                <label>내용</label>
                <textarea className="form-control" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="공지사항 내용" rows={6} />
              </div>

              <div className="form-group">
                <label>대상</label>
                <select className="form-control" value={form.target_audience} onChange={(e) => setForm({ ...form, target_audience: e.target.value })}>
                  <option value="all">전체 사용자</option>
                  <option value="student">학생</option>
                  <option value="parent">학부모</option>
                  <option value="branch_manager">지점 담당자</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.is_pinned} onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })} />
                  상단 고정
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  활성화
                </label>
                {!editingId && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.send_push} onChange={(e) => setForm({ ...form, send_push: e.target.checked })} />
                    푸시 알림 발송
                  </label>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowModal(false)}>취소</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                  {saving ? "저장 중..." : editingId ? "수정" : "등록"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
