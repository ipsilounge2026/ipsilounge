"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isLoggedIn, getAdminInfo } from "@/lib/auth";
import { getGuidebooks, bulkSaveGuidebooks } from "@/lib/api";

// ── 시점별 상담 주제 정의 (session page와 동일) ──

interface TopicDef {
  id: string;
  label: string;
  isCore: boolean;
  detail?: string;
}

const TIMING_TOPICS: Record<string, TopicDef[]> = {
  T1: [
    { id: "t1c1", label: "첫 학기 종합 진단 (내신 + 모의고사 결합 분석)", isCore: true, detail: "첫 내신 결과를 목표 대비 해석, 내신 vs 모의 비교, 예상과 실제 차이 원인 분석" },
    { id: "t1c2", label: "학습 방법 전환 진단 ★", isCore: true, detail: "중학교식 공부법 잔존 여부, 예습·복습·수업 활용도 점검, 과목별 학습법 적절성 평가" },
    { id: "t1c3", label: "과목별 취약 유형 정밀 진단", isCore: true, detail: "국어: 문학/비문학, 수학: 계산 실수/고난도/단원, 영어: 어휘·독해·시간" },
    { id: "t1c4", label: "컨디션·심리 점검 + 여름방학 전략", isCore: true, detail: "심리·컨디션, 첫 학기 번아웃, 수면 패턴, 여름방학 학습 계획" },
    { id: "t1o1", label: "자기주도 비율 조정 (학원 의존도 높을 경우)", isCore: false },
    { id: "t1o2", label: "오답 관리 루틴 재설계", isCore: false },
    { id: "t1o3", label: "진로 탐색 심화 (미정 시)", isCore: false },
  ],
  T2: [
    { id: "t2c1", label: "1년치 성적 데이터 종합 분석", isCore: true, detail: "1학기→2학기 내신 추이, 모의 4회 추이, 내신-모의 Gap 변화" },
    { id: "t2c2", label: "확정된 선택과목 학습 준비도 점검 ★", isCore: true, detail: "선택과목 목록 확인, 준비 수준 점검, 진로·권장과목 정합성, 수능 선택과목 연계" },
    { id: "t2c3", label: "과목별 학습법 최적화 (1년 데이터 검증)", isCore: true, detail: "T1 학습법 효과 검증, 안 바뀐 습관 체크, 재조정" },
    { id: "t2c4", label: "전형 방향 초기 탐색", isCore: true, detail: "수시·정시 가능성 탐색, 내신형/수능형/균형형 판단" },
    { id: "t2c5", label: "겨울방학 로드맵 + 고2 진입 전략", isCore: true, detail: "선택과목 선행 계획, 수능 기초 시작 여부, 피로 관리" },
    { id: "t2o1", label: "내신-모의 Gap 심화 분석", isCore: false },
    { id: "t2o2", label: "학부모 소통 방법 (갈등 시)", isCore: false },
    { id: "t2o3", label: "진로 구체화 심화 (방향 없을 경우)", isCore: false },
  ],
  T3: [
    { id: "t3c1", label: "선택과목 첫 성적 분석", isCore: true, detail: "예상 vs 실제 차이, 경쟁 강도, 목표 대학 라인 영향" },
    { id: "t3c2", label: "수시 vs 정시 방향 탐색 ★", isCore: true, detail: "1.5년치 내신+모의 비교, 내신형/수능형/균형형 탐색" },
    { id: "t3c3", label: "수능 최저 정밀 시뮬레이션", isCore: true, detail: "목표 대학별 수능 최저 기준, 충족 가능성, 부족 영역" },
    { id: "t3c4", label: "과목별 학습법 최종 조정", isCore: true, detail: "시험 전략 점검, 내신·수능 학습 비율 재조정" },
    { id: "t3c5", label: "여름방학 집중 전략", isCore: true, detail: "방향에 맞춘 계획, 취약 보강, 체력·멘탈 관리" },
    { id: "t3o1", label: "모의고사 취약 유형 심화 분석", isCore: false },
    { id: "t3o2", label: "학습 습관 고착화 여부 재점검", isCore: false },
    { id: "t3o3", label: "진로 방향성 재검토", isCore: false },
  ],
  T4: [
    { id: "t4c1", label: "2년치 종합 진단 — 나를 명확히 이해하기 ★", isCore: true, detail: "내신 패턴 확정, 모의 영역별 추이, 학습법 안정화" },
    { id: "t4c2", label: "수시 vs 정시 최종 결정 ★", isCore: true, detail: "T3 방향 확정, 2년 데이터 기반 최종 판단" },
    { id: "t4c3", label: "진학 가능성 확인 (대학 라인)", isCore: true, detail: "현실적 대학 수준 확인, 도전 vs 안전 라인" },
    { id: "t4c4", label: "고3 학습 로드맵 확정 ★", isCore: true, detail: "월 단위 계획 (3월~수능), 주간 시간 배분" },
    { id: "t4c5", label: "체력·멘탈 관리 + 겨울방학 집중 전략", isCore: true, detail: "고3 체력 관리, 번아웃 대비, 생활 리듬 전환" },
    { id: "t4o1", label: "학부모와의 소통 전략", isCore: false },
    { id: "t4o2", label: "지난 2년 복기 (성찰)", isCore: false },
    { id: "t4o3", label: "모의고사 시험 전략 최적화", isCore: false },
  ],
};

const TIMING_LABELS: Record<string, string> = {
  T1: "T1 — 고1-1학기 말 (7월)",
  T2: "T2 — 고1-2학기 말 (2월)",
  T3: "T3 — 고2-1학기 말 (7월)",
  T4: "T4 — 고2-2학기 말 (2월)",
};

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
