"use client";

/**
 * 동적 설문 컨테이너.
 *
 * 책임:
 * - 카테고리 네비게이션 (A → G 순서, 진행도 표시)
 * - 각 카테고리 내 질문 렌더링
 * - 답변 자동 저장 (디바운스 PATCH) + "저장 후 다음" 버튼
 * - 카테고리 상태 관리 (not_started/in_progress/skipped/completed)
 * - 모바일 디바이스에서 web-only 카테고리 진입 시 전환 안내
 * - 최종 제출
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Category,
  CategoryStatus,
  SurveySchema,
  SurveyResponseData,
  evaluateShowWhen,
} from "@/lib/surveyTypes";
import { patchSurvey, submitSurvey } from "@/lib/api";
import { QuestionRenderer } from "./QuestionRenderer";

interface Props {
  schema: SurveySchema;
  survey: SurveyResponseData;
  onSubmitted?: () => void;
}

const STATUS_LABEL: Record<CategoryStatus, { text: string; color: string }> = {
  not_started: { text: "시작 전", color: "var(--gray-500)" },
  in_progress: { text: "작성 중", color: "#F59E0B" },
  skipped: { text: "건너뜀", color: "#6B7280" },
  completed: { text: "완료", color: "var(--success)" },
};

function detectIsMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export default function DynamicSurvey({ schema, survey, onSubmitted }: Props) {
  const [answers, setAnswers] = useState<Record<string, any>>(survey.answers || {});
  const [categoryStatus, setCategoryStatus] = useState<Record<string, CategoryStatus>>(
    (survey.category_status as Record<string, CategoryStatus>) || {}
  );
  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    if (survey.last_category) {
      const idx = schema.categories.findIndex((c) => c.id === survey.last_category);
      if (idx >= 0) return idx;
    }
    return 0;
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useMemo(() => detectIsMobile(), []);

  const currentCategory = schema.categories[currentIdx];
  const totalCategories = schema.categories.length;

  // 자동 저장 (디바운스)
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>(JSON.stringify({ answers: survey.answers, category_status: survey.category_status }));

  const scheduleSave = (newAnswers: Record<string, any>, newStatus: Record<string, CategoryStatus>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const payload = JSON.stringify({ answers: newAnswers, category_status: newStatus });
      if (payload === lastSavedRef.current) return;
      try {
        setSaving(true);
        await patchSurvey(survey.id, {
          answers: newAnswers,
          category_status: newStatus,
          last_category: currentCategory.id,
          last_edited_platform: isMobile ? "mobile" : "web",
        });
        lastSavedRef.current = payload;
        setSavedAt(new Date());
        setError(null);
      } catch (e: any) {
        setError(e.message || "저장에 실패했습니다");
      } finally {
        setSaving(false);
      }
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // 답변 업데이트
  const updateAnswer = (questionId: string, value: any) => {
    const newAnswers = {
      ...answers,
      [currentCategory.id]: {
        ...(answers[currentCategory.id] || {}),
        [questionId]: value,
      },
    };
    setAnswers(newAnswers);

    // 첫 변경 시 카테고리 상태를 in_progress로
    let newStatus = categoryStatus;
    if (categoryStatus[currentCategory.id] !== "completed" && categoryStatus[currentCategory.id] !== "in_progress") {
      newStatus = { ...categoryStatus, [currentCategory.id]: "in_progress" };
      setCategoryStatus(newStatus);
    }

    scheduleSave(newAnswers, newStatus);
  };

  // 카테고리 완료 처리
  const markCategoryStatus = async (status: CategoryStatus) => {
    const newStatus = { ...categoryStatus, [currentCategory.id]: status };
    setCategoryStatus(newStatus);
    try {
      await patchSurvey(survey.id, {
        answers,
        category_status: newStatus,
        last_category: currentCategory.id,
        last_edited_platform: isMobile ? "mobile" : "web",
      });
      lastSavedRef.current = JSON.stringify({ answers, category_status: newStatus });
      setSavedAt(new Date());
    } catch (e: any) {
      setError(e.message || "저장에 실패했습니다");
    }
  };

  const goToCategory = (idx: number) => {
    if (idx < 0 || idx >= totalCategories) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setCurrentIdx(idx);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = async () => {
    await markCategoryStatus("completed");
    if (currentIdx < totalCategories - 1) {
      goToCategory(currentIdx + 1);
    }
  };

  const handleSkip = async () => {
    await markCategoryStatus("skipped");
    if (currentIdx < totalCategories - 1) {
      goToCategory(currentIdx + 1);
    }
  };

  const handleSubmit = async () => {
    // 미완료 체크
    const incomplete = schema.categories.filter((c) => {
      const s = categoryStatus[c.id];
      return s !== "completed" && s !== "skipped";
    });
    if (incomplete.length > 0) {
      const titles = incomplete.map((c) => `${c.id} ${c.title}`).join(", ");
      if (!confirm(`다음 카테고리가 미완료 상태입니다: ${titles}\n그래도 제출하시겠습니까?`)) return;
    }

    try {
      setSubmitting(true);
      // 마지막으로 저장 보장
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await patchSurvey(survey.id, {
        answers,
        category_status: categoryStatus,
        last_edited_platform: isMobile ? "mobile" : "web",
      });
      await submitSurvey(survey.id);
      onSubmitted?.();
    } catch (e: any) {
      setError(e.message || "제출에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  // 모바일에서 web-only 카테고리 진입 시 안내
  const isWebOnly = currentCategory.platforms?.includes("web") && !currentCategory.platforms?.includes("mobile");
  const blockMobile = isMobile && isWebOnly;

  // 진행률
  const completedCount = schema.categories.filter((c) => {
    const s = categoryStatus[c.id];
    return s === "completed" || s === "skipped";
  }).length;
  const progressPct = Math.round((completedCount / totalCategories) * 100);

  return (
    <div>
      {/* 헤더: 진행률 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>{schema.title}</h2>
          <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
            {completedCount}/{totalCategories} 카테고리 ({progressPct}%)
          </div>
        </div>
        <div style={{ height: 6, background: "var(--gray-200)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${progressPct}%`, height: "100%", background: "var(--primary)", transition: "width 0.3s" }} />
        </div>
      </div>

      {/* 카테고리 네비 (탭) */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {schema.categories.map((c, idx) => {
          const s = categoryStatus[c.id] || "not_started";
          const active = idx === currentIdx;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => goToCategory(idx)}
              style={{
                padding: "8px 14px",
                border: `1px solid ${active ? "var(--primary)" : "var(--gray-300)"}`,
                borderRadius: 8,
                background: active ? "var(--primary)" : "white",
                color: active ? "white" : "var(--gray-700)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                whiteSpace: "nowrap",
                position: "relative",
              }}
            >
              {c.id}. {c.title}
              {s !== "not_started" && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 9,
                    color: active ? "white" : STATUS_LABEL[s].color,
                    fontWeight: 600,
                  }}
                >
                  ●
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 현재 카테고리 카드 */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--gray-200)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 16, margin: 0 }}>
              {currentCategory.id}. {currentCategory.title}
            </h3>
            {currentCategory.estimated_time_minutes && (
              <span style={{ fontSize: 11, color: "var(--gray-500)" }}>
                예상 소요 {currentCategory.estimated_time_minutes[0]}~{currentCategory.estimated_time_minutes[1]}분
              </span>
            )}
          </div>
          {currentCategory.description && (
            <p style={{ fontSize: 13, color: "var(--gray-600)", margin: "6px 0 0 0" }}>{currentCategory.description}</p>
          )}
        </div>

        {/* 모바일 + 무거운 카테고리 안내 */}
        {blockMobile ? (
          <MobileWebOnlyNotice
            currentCategory={currentCategory}
            onSkip={handleSkip}
          />
        ) : (
          <CategoryQuestions
            category={currentCategory}
            answers={answers[currentCategory.id] || {}}
            onChange={updateAnswer}
          />
        )}

        {/* 하단 액션 */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--gray-200)", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => goToCategory(currentIdx - 1)}
              disabled={currentIdx === 0}
              className="btn btn-outline"
              style={{ opacity: currentIdx === 0 ? 0.5 : 1 }}
            >
              ← 이전
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {currentCategory.skippable && (
              <button type="button" onClick={handleSkip} className="btn btn-outline">
                나중에 입력
              </button>
            )}
            {currentIdx < totalCategories - 1 ? (
              <button type="button" onClick={handleNext} className="btn btn-primary">
                저장 후 다음 →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="btn btn-primary"
                style={{ opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? "제출 중..." : "최종 제출"}
              </button>
            )}
          </div>
        </div>

        {/* 저장 상태 표시 */}
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--gray-500)", textAlign: "right" }}>
          {saving && "저장 중..."}
          {!saving && savedAt && `${savedAt.toLocaleTimeString()} 자동 저장됨`}
          {error && <span style={{ color: "#DC2626", marginLeft: 8 }}>{error}</span>}
        </div>
      </div>
    </div>
  );
}

// ===== 카테고리 내 질문 렌더 =====
function CategoryQuestions({
  category,
  answers,
  onChange,
}: {
  category: Category;
  answers: Record<string, any>;
  onChange: (id: string, v: any) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {category.questions.map((q: any) => {
        if (!evaluateShowWhen(q.show_when, answers)) return null;
        return (
          <div key={q.id}>
            <QuestionRenderer
              question={q}
              value={answers[q.id]}
              onChange={(v) => onChange(q.id, v)}
            />
          </div>
        );
      })}
    </div>
  );
}

// ===== 모바일에서 web-only 카테고리 안내 =====
function MobileWebOnlyNotice({ currentCategory, onSkip }: { currentCategory: Category; onSkip: () => void }) {
  const copyLink = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => alert("링크를 복사했습니다. PC 브라우저에서 붙여넣어 이어쓰기 하세요."))
      .catch(() => alert("복사 실패. 주소창 URL을 복사해 사용하세요."));
  };

  return (
    <div
      style={{
        padding: 20,
        background: "#FEF3C7",
        border: "1px solid #FDE68A",
        borderRadius: 8,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>💻</div>
      <h4 style={{ fontSize: 15, color: "#92400E", margin: "0 0 8px 0" }}>
        이 카테고리는 입력 양이 많아 PC/태블릿에서 권장됩니다
      </h4>
      <p style={{ fontSize: 12, color: "#92400E", marginBottom: 16, lineHeight: 1.6 }}>
        {currentCategory.title}는 행렬 입력·긴 텍스트 등이 포함되어<br />
        모바일에서는 작성이 불편할 수 있습니다.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button type="button" onClick={copyLink} className="btn btn-primary">
          웹 링크 복사
        </button>
        <button type="button" onClick={onSkip} className="btn btn-outline">
          나중에 입력 (건너뛰기)
        </button>
      </div>
    </div>
  );
}
