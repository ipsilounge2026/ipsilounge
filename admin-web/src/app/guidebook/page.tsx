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

type TimingKey = "S1" | "S2" | "S3" | "S4";

export default function GuidebookPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TimingKey>("S1");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // topic_id → content 맵 (편집 중인 상태)
  const [guideContents, setGuideContents] = useState<Record<string, string>>({});
  // 서버에서 로드한 원본 (변경 감지용)
  const [savedContents, setSavedContents] = useState<Record<string, string>>({});
  // 편집 모드 (탭별)
  const [editMode, setEditMode] = useState<Record<TimingKey, boolean>>({ S1: true, S2: true, S3: true, S4: true });

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

      // 저장된 내용이 있는 탭은 읽기 모드로 시작
      const newEditMode: Record<TimingKey, boolean> = { S1: true, S2: true, S3: true, S4: true };
      for (const timing of ["S1", "S2", "S3", "S4"] as TimingKey[]) {
        const cautionKey = `caution_${timing}`;
        const hasAnyContent = TIMING_TOPICS[timing].some((t) => (contentMap[t.id] || "").trim().length > 0) || (contentMap[cautionKey] || "").trim().length > 0;
        if (hasAnyContent) {
          newEditMode[timing] = false;
        }
      }
      setEditMode(newEditMode);
    } catch {
      setMessage({ type: "error", text: "데이터를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  };

  const cautionKey = `caution_${activeTab}`;

  const handleSave = async () => {
    const topics = TIMING_TOPICS[activeTab];
    const items = topics.map((t) => ({
      topic_id: t.id,
      title: t.label,
      content: guideContents[t.id] || "",
    }));
    // 주의사항도 함께 저장
    items.push({
      topic_id: cautionKey,
      title: `${activeTab} 주의사항`,
      content: guideContents[cautionKey] || "",
    });

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
      setEditMode((prev) => ({ ...prev, [activeTab]: false }));
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
  const isEditing = editMode[activeTab];

  // 현재 탭에서 변경사항이 있는지
  const hasChanges = topics.some((t) => (guideContents[t.id] || "") !== (savedContents[t.id] || ""))
    || (guideContents[cautionKey] || "") !== (savedContents[cautionKey] || "");

  // 각 시점별 작성된 가이드 수 (주의사항 포함)
  const countByTiming = (timing: TimingKey) => {
    const ck = `caution_${timing}`;
    const topicCount = TIMING_TOPICS[timing].filter((t) => (savedContents[t.id] || "").trim()).length;
    const cautionCount = (savedContents[ck] || "").trim() ? 1 : 0;
    return topicCount + cautionCount;
  };

  const totalByTiming = (timing: TimingKey) => {
    return TIMING_TOPICS[timing].length + 1; // +1 for 주의사항
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
          {(["S1", "S2", "S3", "S4"] as TimingKey[]).map((t) => {
            const count = countByTiming(t);
            const total = totalByTiming(t);
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
                        {isEditing ? (
                          <textarea
                            value={content}
                            onChange={(e) => setGuideContents((prev) => ({ ...prev, [topic.id]: e.target.value }))}
                            placeholder="이 항목에 대한 상담 가이드를 작성하세요. 선배가 상담 기록 작성 시 이 내용이 표시됩니다."
                            rows={4}
                            style={{ width: "100%", padding: "10px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
                          />
                        ) : (
                          <div style={{ fontSize: 13, lineHeight: 1.6, color: content.trim() ? "#374151" : "#9CA3AF", whiteSpace: "pre-wrap", minHeight: 40 }}>
                            {content.trim() || "작성된 가이드가 없습니다."}
                          </div>
                        )}
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
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{topic.label}</div>
                          {topic.detail && (
                            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{topic.detail}</div>
                          )}
                        </div>
                        {hasSaved && (
                          <span style={{ fontSize: 11, padding: "2px 10px", background: "#FEF3C7", color: "#92400E", borderRadius: 10 }}>작성됨</span>
                        )}
                      </div>
                      <div style={{ padding: 16 }}>
                        {isEditing ? (
                          <textarea
                            value={content}
                            onChange={(e) => setGuideContents((prev) => ({ ...prev, [topic.id]: e.target.value }))}
                            placeholder="이 선택 항목에 대한 상담 가이드를 작성하세요."
                            rows={3}
                            style={{ width: "100%", padding: "10px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
                          />
                        ) : (
                          <div style={{ fontSize: 13, lineHeight: 1.6, color: content.trim() ? "#374151" : "#9CA3AF", whiteSpace: "pre-wrap", minHeight: 32 }}>
                            {content.trim() || "작성된 가이드가 없습니다."}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 주의사항 */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "#DC2626", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#EF4444" }} />
                주의사항
              </h3>
              <div style={{ background: "#fff", border: "1px solid #FECACA", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: (savedContents[cautionKey] || "").trim() ? "#FEF2F2" : "#F9FAFB", borderBottom: "1px solid #FECACA", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>반드시 피해야 할 것</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>이 시점 상담에서 선배가 주의해야 할 사항을 작성합니다.</div>
                  </div>
                  {(savedContents[cautionKey] || "").trim() && (
                    <span style={{ fontSize: 11, padding: "2px 10px", background: "#FEE2E2", color: "#991B1B", borderRadius: 10 }}>작성됨</span>
                  )}
                </div>
                <div style={{ padding: 16 }}>
                  {isEditing ? (
                    <textarea
                      value={guideContents[cautionKey] || ""}
                      onChange={(e) => setGuideContents((prev) => ({ ...prev, [cautionKey]: e.target.value }))}
                      placeholder={"예: 특정 교사에 대한 험담 금지, 부정확한 대입 정보 전달 금지, 연락처 교환 금지 등"}
                      rows={5}
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #FECACA", borderRadius: 8, fontSize: 13, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
                    />
                  ) : (
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: (guideContents[cautionKey] || "").trim() ? "#374151" : "#9CA3AF", whiteSpace: "pre-wrap", minHeight: 40 }}>
                      {(guideContents[cautionKey] || "").trim() || "작성된 주의사항이 없습니다."}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 저장/수정 버튼 */}
            <div style={{ position: "sticky", bottom: 0, padding: "16px 0", background: "#F9FAFB", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              {isEditing && hasChanges && (
                <span style={{ fontSize: 13, color: "#F59E0B", alignSelf: "center" }}>저장하지 않은 변경사항이 있습니다</span>
              )}
              {isEditing ? (
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
              ) : (
                <button
                  onClick={() => setEditMode((prev) => ({ ...prev, [activeTab]: true }))}
                  style={{
                    padding: "10px 32px", borderRadius: 8, border: "1px solid #7C3AED",
                    background: "white", color: "#7C3AED", fontSize: 14, fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {activeTab} 가이드 수정
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
