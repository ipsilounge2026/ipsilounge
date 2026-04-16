"use client";

/**
 * 상담사→선배 공유 검토 상세 (연계규칙 V1 §6)
 *
 * - 좌측: 원본 내용 (설문 답변 / 상담기록)
 * - 우측: 선배 공유 토글 + 시스템 차단 항목 안내 + 선배 미리보기
 * - 하단: 관리자 코멘트 + 검토 완료 / 수정 요청 버튼
 * - D8(심리) / F(학부모) / G(고3)은 백엔드가 시스템적으로 차단 → UI는 고지만
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import {
  getCounselorSharingDetail,
  updateCounselorSharingReview,
  previewCounselorSharing,
} from "@/lib/api";
import { isLoggedIn, getAdminInfo } from "@/lib/auth";

type SourceType = "survey" | "note";
type ReviewStatus = "pending" | "reviewed" | "revision_requested";

interface SharingDetail {
  id: string;
  user_id: string;
  user_name: string;
  senior_review_status: ReviewStatus;
  senior_review_notes: string | null;
  senior_sharing_settings: Record<string, boolean> | null;
  senior_reviewed_at: string | null;
  senior_reviewer_admin_id: string | null;
  preview_for_senior: Record<string, unknown> | null;
  default_sharing_settings: Record<string, boolean>;
  // survey 전용
  survey_type?: string;
  timing?: string | null;
  submitted_at?: string | null;
  answers?: Record<string, unknown>;
  // note 전용
  category?: string;
  consultation_date?: string | null;
  main_content?: string | null;
  goals?: string | null;
  advice_given?: string | null;
  next_steps?: string | null;
  next_senior_context?: string | null;
  topic_notes?: Record<string, string> | null;
  created_at?: string | null;
  [k: string]: unknown;
}

const SURVEY_SHARING_LABELS: Record<string, string> = {
  academic_tier_label: "학업 현황 레이블",
  career_direction: "진로·전형 방향",
  target_school_name: "구체 목표 학교명",
  subject_difficulties: "과목 고민",
  study_methods: "학습법",
  roadmap_top_summary: "맞춤 로드맵 상위",
  action_plan_detail: "상세 액션 플랜",
  subject_selection: "선택과목",
  radar_grades: "레이더 등급",
};

const NOTE_SHARING_LABELS: Record<string, string> = {
  next_senior_context: "다음 선배 맥락",
  action_plan_detail: "상세 액션 플랜",
};

const STATUS_BADGE: Record<ReviewStatus, { label: string; bg: string; color: string }> = {
  pending: { label: "검토 대기", bg: "#FEF3C7", color: "#92400E" },
  reviewed: { label: "검토 완료", bg: "#D1FAE5", color: "#065F46" },
  revision_requested: { label: "수정 요청", bg: "#FEE2E2", color: "#991B1B" },
};

const SURVEY_PREVIEW_LABELS: Record<string, string> = {
  naesin: "내신",
  mock: "모의고사",
  subject_difficulties: "과목 고민",
  study_methods: "학습법",
  career_direction: "진로 방향",
  target_level: "목표 수준",
  subject_selection: "선택과목",
  radar_grades: "레이더 등급",
  overall_grade: "종합 등급",
  timing: "시점",
  academic_tier_label: "학업 현황",
  target_school_name: "목표 학교",
  roadmap_top_summary: "맞춤 로드맵",
  action_plan_detail: "상세 액션 플랜",
};

const NOTE_PREVIEW_LABELS: Record<string, string> = {
  next_senior_context: "다음 선배 맥락",
  next_steps: "다음 단계",
  advice_given: "제공한 조언",
};

function formatPreviewValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>— 공유 안 됨</span>;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <>{String(value)}</>;
  }
  return (
    <pre
      style={{
        background: "#F9FAFB",
        border: "1px solid #E5E7EB",
        borderRadius: 6,
        padding: 10,
        fontSize: 12,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        margin: 0,
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function CounselorSharingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sourceType = (params.sourceType as SourceType) || "survey";
  const id = params.id as string;

  const [detail, setDetail] = useState<SharingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const [sharing, setSharing] = useState<Record<string, boolean>>({});
  const [reviewNotes, setReviewNotes] = useState("");

  // P2-③: 실시간 미리보기 (토글 변경 시 debounce 로 백엔드 preview API 호출)
  const [livePreview, setLivePreview] = useState<Record<string, unknown> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const sharingLabels = useMemo(
    () => (sourceType === "survey" ? SURVEY_SHARING_LABELS : NOTE_SHARING_LABELS),
    [sourceType],
  );

  const previewLabels = useMemo(
    () => (sourceType === "survey" ? SURVEY_PREVIEW_LABELS : NOTE_PREVIEW_LABELS),
    [sourceType],
  );

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    const admin = getAdminInfo();
    if (!admin) {
      setAuthorized(false);
      return;
    }
    const allowed =
      admin.role === "super_admin" || admin.role === "admin" || admin.role === "counselor";
    setAuthorized(allowed);
    if (allowed) {
      loadDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sourceType]);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await getCounselorSharingDetail(sourceType, id)) as SharingDetail;
      setDetail(data);
      setSharing({
        ...(data.default_sharing_settings || {}),
        ...(data.senior_sharing_settings || {}),
      });
      setReviewNotes(data.senior_review_notes || "");
      // 초기 preview: 서버 사이드 렌더 결과를 시작점으로 사용 (이후 토글 변경 시 갱신)
      setLivePreview(data.preview_for_senior || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  };

  // P2-③: sharing 변경 시 300ms debounce 로 백엔드 preview 호출해 실시간 반영
  useEffect(() => {
    if (!detail) return;
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const { preview_for_senior } = await previewCounselorSharing(
          sourceType,
          id,
          sharing,
        );
        setLivePreview(preview_for_senior);
      } catch (e) {
        // 실패 시 기존 미리보기 유지 (사용자에게는 조용히 실패)
        console.error("[counselor-sharing] preview refresh failed", e);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // detail 자체(객체)의 변동은 의미없고 sharing/sourceType/id 만 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, sourceType, id]);

  const toggleSharing = (key: string) => {
    setSharing((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (reviewStatus: "reviewed" | "revision_requested") => {
    if (!detail) return;
    setSaving(true);
    try {
      await updateCounselorSharingReview(sourceType, id, {
        review_status: reviewStatus,
        review_notes: reviewNotes || null,
        sharing_settings: sharing,
      });
      alert(reviewStatus === "reviewed" ? "검토 완료 처리되었습니다." : "수정 요청을 보냈습니다.");
      router.push("/consultation/counselor-sharing");
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  if (authorized === null) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>확인 중...</div>
        </main>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>
            이 페이지는 관리자/상담사만 이용할 수 있습니다.
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>로딩 중...</div>
        </main>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>
            {error || "기록을 찾을 수 없습니다"}
          </div>
        </main>
      </div>
    );
  }

  const sectionStyle = {
    background: "white",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  };
  const headerStyle = {
    fontSize: 14,
    fontWeight: 600 as const,
    color: "#374151",
    marginBottom: 12,
  };

  const badge = STATUS_BADGE[detail.senior_review_status] || STATUS_BADGE.pending;

  const timingLabel =
    detail.timing ||
    (sourceType === "survey" ? detail.survey_type : detail.category) ||
    "-";

  const writtenAt =
    detail.created_at || detail.submitted_at || detail.consultation_date || null;

  const answers = (detail.answers || {}) as Record<string, unknown>;

  // P2-③: survey answers 에 BLOCKED 카테고리(D8/F/G) 가 실제 포함되었는지 판정
  // — 포함 시 더 강한 붉은색 경고, 미포함 시 회색 안내로 구분
  const blockedCatsFound: string[] = (() => {
    if (sourceType !== "survey") return [];
    const found: string[] = [];
    const d = answers["D"];
    if (d && typeof d === "object" && (d as Record<string, unknown>)["D8"]) {
      found.push("D8");
    }
    const f = answers["F"];
    if (f !== undefined && f !== null && f !== "") {
      if (typeof f !== "object" || Object.keys(f as Record<string, unknown>).length > 0) {
        found.push("F");
      }
    }
    const g = answers["G"];
    if (g !== undefined && g !== null && g !== "") {
      if (typeof g !== "object" || Object.keys(g as Record<string, unknown>).length > 0) {
        found.push("G");
      }
    }
    return found;
  })();

  // 공유 항목 카운트 (True 인 토글 수 / 전체 토글 수)
  const sharingCountTotal = Object.keys(sharingLabels).length;
  const sharingCountOn = Object.entries(sharing).filter(
    ([key, val]) => val && key in sharingLabels,
  ).length;

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        {/* Header */}
        <div className="page-header">
          <div>
            <button
              onClick={() => router.push("/consultation/counselor-sharing")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "#6B7280",
                marginBottom: 8,
              }}
            >
              &larr; 검토 목록으로
            </button>
            <h1 style={{ margin: 0 }}>
              상담사→선배 공유 검토
              <span
                style={{
                  marginLeft: 10,
                  padding: "3px 10px",
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 400,
                  background: badge.bg,
                  color: badge.color,
                }}
              >
                {badge.label}
              </span>
            </h1>
          </div>
        </div>

        {/* 메타 정보 */}
        <div style={sectionStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>학생</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{detail.user_name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>유형</div>
              <div style={{ fontSize: 14 }}>
                {sourceType === "survey" ? "설문" : "상담기록"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>시점</div>
              <div style={{ fontSize: 14 }}>{timingLabel}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>작성일</div>
              <div style={{ fontSize: 14 }}>
                {writtenAt ? new Date(writtenAt).toLocaleString("ko-KR") : "-"}
              </div>
            </div>
          </div>
        </div>

        {/* D8/F/G 시스템 차단 경고 — 실제 포함 여부에 따라 강도 차등 */}
        {blockedCatsFound.length > 0 ? (
          <div
            style={{
              padding: 14,
              background: "#FEF2F2",
              border: "1px solid #FCA5A5",
              borderRadius: 8,
              marginBottom: 16,
              color: "#991B1B",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            ⚠️ 이 기록에는 <strong>{blockedCatsFound.join(", ")}</strong> 카테고리가 포함되어
            있습니다. 해당 항목은 관리자 설정과 무관하게 <strong>시스템적으로 차단</strong>되어
            절대 선배에게 공유되지 않습니다 (V1 §6-1).
          </div>
        ) : sourceType === "survey" ? (
          <div
            style={{
              padding: 12,
              background: "#F3F4F6",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              marginBottom: 16,
              color: "#4B5563",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            ℹ️ 이 설문에는 D8(심리)/F(학부모)/G(고3) 민감 카테고리가 포함되어 있지 않습니다. 하단 토글은
            비민감 항목만 제어합니다.
          </div>
        ) : (
          <div
            style={{
              padding: 12,
              background: "#F3F4F6",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              marginBottom: 16,
              color: "#4B5563",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            ℹ️ 상담 기록 본문의 민감 정보(D8/F/G)는 시스템적으로 차단되어 선배에게 노출되지 않습니다.
          </div>
        )}

        {/* 2단 레이아웃 */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          {/* Left: 원본 내용 */}
          <div>
            {sourceType === "survey" ? (
              <div style={sectionStyle}>
                <div style={headerStyle}>원본 설문 답변</div>
                {Object.keys(answers).length === 0 ? (
                  <div style={{ color: "#9CA3AF", fontSize: 13 }}>답변 데이터가 없습니다.</div>
                ) : (
                  Object.entries(answers).map(([cat, val]) => (
                    <div key={cat} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#374151",
                          marginBottom: 4,
                        }}
                      >
                        {cat}
                      </div>
                      <pre
                        style={{
                          background: "#F9FAFB",
                          border: "1px solid #E5E7EB",
                          borderRadius: 6,
                          padding: 10,
                          fontSize: 12,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          margin: 0,
                          maxHeight: 240,
                          overflow: "auto",
                        }}
                      >
                        {JSON.stringify(val, null, 2)}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div style={sectionStyle}>
                <div style={headerStyle}>상담 기록 원본</div>
                {[
                  { key: "main_content", label: "주요 내용" },
                  { key: "goals", label: "목표" },
                  { key: "advice_given", label: "제공한 조언" },
                  { key: "next_steps", label: "다음 단계" },
                  { key: "next_senior_context", label: "다음 선배 맥락" },
                ].map((f) => {
                  const v = (detail as Record<string, unknown>)[f.key];
                  if (!v) return null;
                  return (
                    <div key={f.key} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#6B7280",
                          marginBottom: 4,
                        }}
                      >
                        {f.label}
                      </div>
                      <div
                        style={{
                          padding: 10,
                          background: "#F9FAFB",
                          border: "1px solid #E5E7EB",
                          borderRadius: 6,
                          fontSize: 13,
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.6,
                        }}
                      >
                        {String(v)}
                      </div>
                    </div>
                  );
                })}
                {detail.topic_notes && Object.keys(detail.topic_notes).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6B7280",
                        marginBottom: 4,
                      }}
                    >
                      주제별 메모
                    </div>
                    {Object.entries(detail.topic_notes).map(([k, v]) => (
                      <div
                        key={k}
                        style={{
                          padding: "8px 10px",
                          background: "#F9FAFB",
                          border: "1px solid #E5E7EB",
                          borderRadius: 6,
                          fontSize: 13,
                          marginBottom: 6,
                        }}
                      >
                        <span style={{ fontWeight: 600, marginRight: 6 }}>{k}:</span>
                        {v}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: 공유 토글 + 시스템 차단 + 미리보기 */}
          <div>
            <div style={{ ...sectionStyle, position: "sticky", top: 20 }}>
              {/* 공유 토글 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>
                  선배 공유 토글
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: sharingCountOn === 0 ? "#9CA3AF" : "#065F46",
                    background: sharingCountOn === 0 ? "#F3F4F6" : "#D1FAE5",
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  공유 {sharingCountOn} / {sharingCountTotal}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
                체크된 항목만 선배가 볼 수 있는 요약에 포함됩니다.
              </div>
              {Object.entries(sharingLabels).map(([key, label]) => (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: "1px solid #F3F4F6",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sharing[key] ?? false}
                    onChange={() => toggleSharing(key)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
                </label>
              ))}

              {/* 시스템 차단 항목 */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "2px solid #E5E7EB" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                  시스템 차단 항목
                </div>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>
                  백엔드에서 강제로 차단됩니다 — 관리자도 해제할 수 없습니다 (V1 §6-1).
                </div>
                {[
                  { key: "D8", label: "D8 심리·컨디션" },
                  { key: "F", label: "F 학부모 관점" },
                  { key: "G", label: "G 고3 준비" },
                ].map((s) => {
                  const isPresent = blockedCatsFound.includes(s.key);
                  return (
                    <div
                      key={s.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        background: isPresent ? "#FEE2E2" : "#F3F4F6",
                        borderRadius: 6,
                        marginBottom: 6,
                        fontSize: 12,
                        color: isPresent ? "#991B1B" : "#6B7280",
                        border: isPresent ? "1px solid #FCA5A5" : "1px solid transparent",
                      }}
                    >
                      🔒{" "}
                      <span>
                        {s.label} — 시스템 차단
                        {isPresent ? " · 본 기록에 포함됨" : " · 관리자도 해제 불가"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 선배 미리보기 */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "2px solid #E5E7EB" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1E40AF" }}>
                    🎓 선배가 보게 될 요약
                  </div>
                  {previewLoading && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#1E40AF",
                        background: "#DBEAFE",
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}
                    >
                      갱신 중…
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>
                  ※ 체크박스를 변경하면 실시간으로 미리보기가 갱신됩니다 (저장 불필요).
                </div>
                <div
                  style={{
                    border: "1px solid #BFDBFE",
                    background: "#EFF6FF",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 12,
                    opacity: previewLoading ? 0.6 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {!livePreview || Object.keys(livePreview).length === 0 ? (
                    <div style={{ color: "#9CA3AF", fontStyle: "italic" }}>
                      공유될 항목이 없습니다. 위의 토글을 켜서 선배에게 전달할 내용을 선택하세요.
                    </div>
                  ) : (
                    Object.entries(livePreview).map(([k, v]) => {
                      const label = previewLabels[k] || k;
                      return (
                        <div key={k} style={{ marginBottom: 10 }}>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "#1E3A8A",
                              marginBottom: 2,
                            }}
                          >
                            {label}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#1F2937",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {formatPreviewValue(v)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 관리자 코멘트 */}
              <div style={{ marginTop: 20 }}>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  관리자 코멘트 (선택)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="작성자에게 전달할 코멘트..."
                  style={{
                    width: "100%",
                    minHeight: 80,
                    padding: 10,
                    border: "1px solid #D1D5DB",
                    borderRadius: 6,
                    fontSize: 13,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* 액션 버튼 */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 16,
                }}
              >
                <button
                  onClick={() => handleSave("reviewed")}
                  disabled={saving}
                  style={{
                    padding: "12px",
                    borderRadius: 6,
                    border: "none",
                    width: "100%",
                    background: "#10B981",
                    color: "white",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.5 : 1,
                  }}
                >
                  {saving ? "저장 중..." : "✅ 검토 완료 (공유 허용)"}
                </button>
                <button
                  onClick={() => handleSave("revision_requested")}
                  disabled={saving}
                  style={{
                    padding: "12px",
                    borderRadius: 6,
                    border: "1px solid #EF4444",
                    width: "100%",
                    background: "white",
                    color: "#EF4444",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.5 : 1,
                  }}
                >
                  ↩️ 작성자에게 수정 요청
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
