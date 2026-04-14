"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isLoggedIn, hasMenuAccess, getDefaultRoute, getAdminInfo } from "@/lib/auth";
import { getGuidebooks, createGuidebook, updateGuidebook, deleteGuidebook } from "@/lib/api";

const CATEGORY_LABELS: Record<string, string> = {
  manual: "상담 진행 매뉴얼",
  timing_guide: "시점별 상담 가이드",
  caution: "주의 사항",
};

const TIMING_OPTIONS = [
  { value: "", label: "전체 (시점 무관)" },
  { value: "S1", label: "S1 — 고1-1학기 말" },
  { value: "S2", label: "S2 — 고1-2학기 말" },
  { value: "S3", label: "S3 — 고2-1학기 말" },
  { value: "S4", label: "S4 — 고2-2학기 말" },
];

interface GuidebookItem {
  id: string;
  category: string;
  title: string;
  content: string;
  sort_order: number;
  session_timing: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

type TabCategory = "manual" | "timing_guide" | "caution";

export default function GuidebookPage() {
  const router = useRouter();
  const [items, setItems] = useState<GuidebookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabCategory>("manual");
  const [message, setMessage] = useState("");

  // 모달 상태
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "manual" as string,
    sort_order: 0,
    session_timing: "" as string,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    const info = getAdminInfo();
    if (!info || (info.role !== "super_admin" && info.role !== "admin")) {
      router.push(getDefaultRoute());
      return;
    }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getGuidebooks();
      setItems(res.guidebooks || []);
    } catch {
      setMessage("데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = items.filter((g) => g.category === activeTab);

  const resetForm = () => {
    setForm({ title: "", content: "", category: activeTab, sort_order: 0, session_timing: "", is_active: true });
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setForm((f) => ({ ...f, category: activeTab, sort_order: filtered.length }));
    setShowModal(true);
  };

  const openEdit = (g: GuidebookItem) => {
    setEditingId(g.id);
    setForm({
      title: g.title,
      content: g.content,
      category: g.category,
      sort_order: g.sort_order,
      session_timing: g.session_timing || "",
      is_active: g.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setMessage("제목과 내용을 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        content: form.content,
        category: form.category,
        sort_order: form.sort_order,
        session_timing: form.session_timing || undefined,
        is_active: form.is_active,
      };
      if (editingId) {
        await updateGuidebook(editingId, payload);
        setMessage("수정되었습니다.");
      } else {
        await createGuidebook(payload);
        setMessage("생성되었습니다.");
      }
      setShowModal(false);
      resetForm();
      await load();
    } catch {
      setMessage("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`"${title}" 항목을 삭제하시겠습니까?`)) return;
    try {
      await deleteGuidebook(id);
      setMessage("삭제되었습니다.");
      await load();
    } catch {
      setMessage("삭제에 실패했습니다.");
    }
  };

  const handleToggleActive = async (g: GuidebookItem) => {
    try {
      await updateGuidebook(g.id, { is_active: !g.is_active });
      await load();
    } catch {
      setMessage("상태 변경에 실패했습니다.");
    }
  };

  const handleMoveOrder = async (g: GuidebookItem, direction: "up" | "down") => {
    const idx = filtered.findIndex((x) => x.id === g.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= filtered.length) return;
    const other = filtered[swapIdx];
    try {
      await updateGuidebook(g.id, { sort_order: other.sort_order });
      await updateGuidebook(other.id, { sort_order: g.sort_order });
      await load();
    } catch {
      setMessage("순서 변경에 실패했습니다.");
    }
  };

  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1>가이드북 관리</h1>
          <p style={{ color: "#6b7280", marginTop: 4 }}>선배 상담 시 참고할 가이드 콘텐츠를 관리합니다.</p>
        </div>

        {message && (
          <div style={{ padding: "10px 16px", marginBottom: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, color: "#166534", fontSize: 14 }}>
            {message}
            <button onClick={() => setMessage("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "#166534" }}>✕</button>
          </div>
        )}

        {/* 탭 */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #e5e7eb" }}>
          {(Object.keys(CATEGORY_LABELS) as TabCategory[]).map((cat) => {
            const count = items.filter((g) => g.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: activeTab === cat ? 600 : 400,
                  color: activeTab === cat ? "#3b82f6" : "#6b7280",
                  borderBottom: activeTab === cat ? "2px solid #3b82f6" : "2px solid transparent",
                  marginBottom: -2,
                }}
              >
                {CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>

        {/* 추가 버튼 */}
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={openCreate} className="btn btn-primary" style={{ padding: "8px 20px", fontSize: 14 }}>
            + 새 항목 추가
          </button>
        </div>

        {/* 목록 */}
        {loading ? (
          <p style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>등록된 항목이 없습니다.</p>
            <p style={{ fontSize: 13 }}>위의 &quot;+ 새 항목 추가&quot; 버튼으로 가이드를 추가하세요.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((g, idx) => (
              <div
                key={g.id}
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 20,
                  opacity: g.is_active ? 1 : 0.5,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 15, color: "#111827" }}>{g.title}</span>
                      {!g.is_active && (
                        <span style={{ fontSize: 11, padding: "2px 8px", background: "#fef3c7", color: "#92400e", borderRadius: 10 }}>비활성</span>
                      )}
                      {g.session_timing && (
                        <span style={{ fontSize: 11, padding: "2px 8px", background: "#dbeafe", color: "#1e40af", borderRadius: 10 }}>{g.session_timing}</span>
                      )}
                    </div>
                    <pre style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0, fontFamily: "inherit", maxHeight: 120, overflow: "hidden" }}>
                      {g.content}
                    </pre>
                    {g.content.length > 300 && (
                      <span style={{ fontSize: 12, color: "#9ca3af" }}>... (더보기: 편집 클릭)</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginLeft: 12, flexShrink: 0 }}>
                    <button onClick={() => handleMoveOrder(g, "up")} disabled={idx === 0} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: idx === 0 ? "not-allowed" : "pointer", opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                    <button onClick={() => handleMoveOrder(g, "down")} disabled={idx === filtered.length - 1} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: idx === filtered.length - 1 ? "not-allowed" : "pointer", opacity: idx === filtered.length - 1 ? 0.3 : 1 }}>▼</button>
                    <button onClick={() => handleToggleActive(g)} style={{ padding: "4px 10px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12 }}>
                      {g.is_active ? "비활성" : "활성"}
                    </button>
                    <button onClick={() => openEdit(g)} style={{ padding: "4px 10px", border: "1px solid #3b82f6", borderRadius: 6, background: "#eff6ff", color: "#3b82f6", cursor: "pointer", fontSize: 12 }}>편집</button>
                    <button onClick={() => handleDelete(g.id, g.title)} style={{ padding: "4px 10px", border: "1px solid #ef4444", borderRadius: 6, background: "#fef2f2", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>삭제</button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  순서: {g.sort_order} | 생성: {g.created_at ? new Date(g.created_at).toLocaleDateString("ko-KR") : "-"}
                  {g.updated_at && ` | 수정: ${new Date(g.updated_at).toLocaleDateString("ko-KR")}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 모달 */}
        {showModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: 12, width: "90%", maxWidth: 700, maxHeight: "90vh", overflow: "auto", padding: 28 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
                {editingId ? "가이드북 항목 편집" : "새 가이드북 항목"}
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* 카테고리 */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>카테고리</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* 시점 (timing_guide일 때만) */}
                {form.category === "timing_guide" && (
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>적용 시점</label>
                    <select
                      value={form.session_timing}
                      onChange={(e) => setForm({ ...form, session_timing: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
                    >
                      {TIMING_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 제목 */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>제목</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="가이드 제목을 입력하세요"
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
                  />
                </div>

                {/* 내용 */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>내용</label>
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    rows={12}
                    placeholder="가이드 내용을 입력하세요. 마크다운 형식 사용 가능합니다."
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, lineHeight: 1.6, resize: "vertical" }}
                  />
                </div>

                {/* 정렬 순서 + 활성 */}
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>정렬 순서</label>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      />
                      <span style={{ fontSize: 14 }}>활성 상태</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 버튼 */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
                <button
                  onClick={() => { setShowModal(false); resetForm(); }}
                  style={{ padding: "8px 20px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 14 }}
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ padding: "8px 24px", fontSize: 14 }}
                >
                  {saving ? "저장 중..." : editingId ? "수정" : "생성"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
