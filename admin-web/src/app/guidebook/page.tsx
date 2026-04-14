"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isLoggedIn, getAdminInfo } from "@/lib/auth";
import { getGuidebooks, bulkSaveGuidebooks } from "@/lib/api";
import { SENIOR_TIMING_TOPICS, SENIOR_TIMING_LABELS } from "@/lib/senior-topics";

const TIMING_TOPICS = SENIOR_TIMING_TOPICS;
const TIMING_LABELS = SENIOR_TIMING_LABELS;

interface GuidebookItem {
  id: string;
  timing: string;
  topic_id: string;
  title: string;
  content: string;
}

type TimingKey = "T1" | "T2" | "T3" | "T4";

export default function GuidebookPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TimingKey>("T1");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // topic_id → content 맵 (편집 중인 상태)
  const [guideContents, setGuideContents] = useState<Record<string, string>>({});
  // 서버에서 로드한 원본 (변경 감지용)
  const [savedContents, setSavedContents] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    const info = getAdminInfo();
    if (!info || (info.role !== "super_admin" && info.role !== "admin")) {
      router.push("/");
      return;
    }
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const res = await getGuidebooks();
      const items: GuidebookItem[] = res.guidebooks || [];
      const contentMap: Record<string, string> = {};
      for (const item of items) {
        if (item.topic_id) {
          contentMap[item.topic_id] = item.content;
        }
      }
      setGuideContents({ ...contentMap });
      setSavedContents({ ...contentMap });
    } catch {
      setMessage({ type: "error", text: "데이터를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const topics = TIMING_TOPICS[activeTab];
    const items = topics.map((t) => ({
      topic_id: t.id,
      title: t.label,
      content: guideContents[t.id] || "",
    }));

    setSaving(true);
    try {
      await bulkSaveGuidebooks(activeTab, items);
      // 저장 후 원본 업데이트
      const newSaved = { ...savedContents };
      for (const item of items) {
        if (item.content.trim()) {
          newSaved[item.topic_id] = item.content;
        } else {
          delete newSaved[item.topic_id];
        }
      }
      setSavedContents(newSaved);
      setMessage({ type: "success", text: `${activeTab} 가이드가 저장되었습니다.` });
    } catch {
      setMessage({ type: "error", text: "저장에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  };

  const topics = TIMING_TOPICS[activeTab];
  const coreTopics = topics.filter((t) => t.isCore);
  const optionalTopics = topics.filter((t) => !t.isCore);

  // 현재 탭에서 변경사항이 있는지
  const hasChanges = topics.some((t) => (guideContents[t.id] || "") !== (savedContents[t.id] || ""));

  // 각 시점별 작성된 가이드 수
  const countByTiming = (timing: TimingKey) => {
    return TIMING_TOPICS[timing].filter((t) => (savedContents[t.id] || "").trim()).length;
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header" style={{ marginBottom: 24 }}>
          <h1>가이드북 관리</h1>
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
            시점별 상담 항목에 대한 가이드를 작성합니다. 선배가 상담 기록 작성 시 각 항목 옆에 가이드가 표시됩니다.
          </p>
        </div>

        {message && (
          <div style={{
            padding: "10px 16px", marginBottom: 16, borderRadius: 8, fontSize: 14,
            background: message.type === "success" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${message.type === "success" ? "#bbf7d0" : "#fecaca"}`,
            color: message.type === "success" ? "#166534" : "#991b1b",
          }}>
            {message.text}
            <button onClick={() => setMessage(null)} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "inherit" }}>✕</button>
          </div>
        )}

        {/* 시점 탭 */}
        <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid #e5e7eb" }}>
          {(["T1", "T2", "T3", "T4"] as TimingKey[]).map((t) => {
            const count = countByTiming(t);
            const total = TIMING_TOPICS[t].length;
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  padding: "10px 24px", border: "none", background: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: activeTab === t ? 600 : 400,
                  color: activeTab === t ? "#7C3AED" : "#6b7280",
                  borderBottom: activeTab === t ? "2px solid #7C3AED" : "2px solid transparent",
                  marginBottom: -2,
                }}
              >
                {t} 상담 가이드
                <span style={{ marginLeft: 6, fontSize: 12, color: count > 0 ? "#10B981" : "#9ca3af" }}>
                  ({count}/{total})
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <p style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>불러오는 중...</p>
        ) : (
          <>
            {/* 시점 설명 */}
            <div style={{ padding: "12px 16px", background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 8, marginBottom: 20, fontSize: 13, color: "#5B21B6" }}>
              {TIMING_LABELS[activeTab]}
            </div>

            {/* 핵심 주제 */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1E40AF", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#3B82F6" }} />
                핵심 상담 항목
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {coreTopics.map((topic) => {
                  const content = guideContents[topic.id] || "";
                  const hasSaved = (savedContents[topic.id] || "").trim().length > 0;
                  return (
                    <div key={topic.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", background: hasSaved ? "#F0FDF4" : "#F9FAFB", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{topic.label}</div>
                          {topic.detail && (
                            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{topic.detail}</div>
                          )}
                        </div>
                        {hasSaved && (
                          <span style={{ fontSize: 11, padding: "2px 10px", background: "#DCFCE7", color: "#166534", borderRadius: 10 }}>작성됨</span>
                        )}
                      </div>
                      <div style={{ padding: 16 }}>
                        <textarea
                          value={content}
                          onChange={(e) => setGuideContents((prev) => ({ ...prev, [topic.id]: e.target.value }))}
                          placeholder="이 항목에 대한 상담 가이드를 작성하세요. 선배가 상담 기록 작성 시 이 내용이 표시됩니다."
                          rows={4}
                          style={{ width: "100%", padding: "10px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 선택 주제 */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "#92400E", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#F59E0B" }} />
                선택 상담 항목
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {optionalTopics.map((topic) => {
                  const content = guideContents[topic.id] || "";
                  const hasSaved = (savedContents[topic.id] || "").trim().length > 0;
                  return (
                    <div key={topic.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", background: hasSaved ? "#FFFBEB" : "#F9FAFB", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{topic.label}</div>
                        {hasSaved && (
                          <span style={{ fontSize: 11, padding: "2px 10px", background: "#FEF3C7", color: "#92400E", borderRadius: 10 }}>작성됨</span>
                        )}
                      </div>
                      <div style={{ padding: 16 }}>
                        <textarea
                          value={content}
                          onChange={(e) => setGuideContents((prev) => ({ ...prev, [topic.id]: e.target.value }))}
                          placeholder="이 선택 항목에 대한 상담 가이드를 작성하세요."
                          rows={3}
                          style={{ width: "100%", padding: "10px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 저장 버튼 */}
            <div style={{ position: "sticky", bottom: 0, padding: "16px 0", background: "#F9FAFB", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              {hasChanges && (
                <span style={{ fontSize: 13, color: "#F59E0B", alignSelf: "center" }}>저장하지 않은 변경사항이 있습니다</span>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "10px 32px", borderRadius: 8, border: "none",
                  background: "#7C3AED", color: "white", fontSize: 14, fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "저장 중..." : `${activeTab} 가이드 저장`}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
