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

// ===== 검증 유틸 =====
function isEmptyValue(v: any): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

/**
 * 카테고리 내 모든 필수 항목 중 미응답 항목의 라벨을 수집한다.
 * - show_when을 평가해서 보이지 않는 질문은 건너뜀
 * - composite는 내부 필드의 required도 확인
 */
function collectMissingRequired(category: any, categoryAnswers: Record<string, any>): string[] {
  const missing: string[] = [];
  for (const q of category.questions || []) {
    if (q.show_when && !evaluateShowWhen(q.show_when, categoryAnswers)) continue;

    // composite는 자식 필드까지 확인
    if (q.type === "composite" && Array.isArray(q.fields)) {
      const innerValue =
        categoryAnswers[q.id] && typeof categoryAnswers[q.id] === "object"
          ? categoryAnswers[q.id]
          : {};
      for (const f of q.fields) {
        if (f.show_when && !evaluateShowWhen(f.show_when, innerValue)) continue;
        if (!f.required) continue;
        if (isEmptyValue(innerValue[f.name])) {
          missing.push(`${q.label || q.id} - ${f.label || f.name}`);
        }
      }
      continue;
    }

    // 일반 질문
    if (!q.required) continue;
    if (isEmptyValue(categoryAnswers[q.id])) {
      missing.push(q.label || q.id);
    }
  }
  return missing;
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
    // 현재 카테고리의 미응답 필수 항목 차단
    const currentAnswers = answers[currentCategory.id] || {};
    const missing = collectMissingRequired(currentCategory, currentAnswers);
    if (missing.length > 0) {
      alert(
        `다음 필수 항목을 입력해주세요:\n\n` +
          missing.map((m) => `• ${m}`).join("\n") +
          `\n\n작성 후 다시 진행하거나, "나중에 입력" 버튼을 누르면 이 카테고리를 건너뛸 수 있습니다.`
      );
      return;
    }
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
    // (1) 모든 카테고리를 "나중에 입력"으로 건너뛴 채 제출하는 것을 차단
    //     — 최소 1개 이상의 카테고리가 실제로 completed 상태여야 제출 가능
    const completedCategoryCount = schema.categories.filter(
      (c) => categoryStatus[c.id] === "completed"
    ).length;
    if (completedCategoryCount === 0) {
      alert(
        "사전 조사를 한 카테고리도 작성하지 않으셨습니다.\n" +
          "최소 1개 이상의 카테고리를 직접 작성한 뒤 제출해주세요.\n\n" +
          '("나중에 입력"으로 모든 카테고리를 건너뛴 상태로는 제출이 불가합니다.)'
      );
      // 첫 번째 카테고리로 이동
      goToCategory(0);
      return;
    }

    // (2) 모든 비-skipped 카테고리에서 미응답 필수 항목 검사
    const missingByCategory: Array<{ id: string; title: string; items: string[] }> = [];
    for (const cat of schema.categories) {
      if (categoryStatus[cat.id] === "skipped") continue;
      const catAnswers = answers[cat.id] || {};
      const missing = collectMissingRequired(cat, catAnswers);
      if (missing.length > 0) {
        missingByCategory.push({ id: cat.id, title: cat.title, items: missing });
      }
    }

    if (missingByCategory.length > 0) {
      const msg = missingByCategory
        .map((c) => `[${c.id}. ${c.title}]\n${c.items.map((i) => `  • ${i}`).join("\n")}`)
        .join("\n\n");
      alert(
        `아래 필수 항목이 미응답 상태입니다.\n작성을 완료한 후 다시 제출해주세요.\n\n` + msg
      );
      // 첫 번째 미응답 카테고리로 이동
      const firstIdx = schema.categories.findIndex((c) => c.id === missingByCategory[0].id);
      if (firstIdx >= 0) goToCategory(firstIdx);
      return;
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

      {/* 카테고리 네비 (위치 표시 전용 — 클릭 이동 불가. 이동은 "저장 후 다음" / "나중에 입력" / "이전" 버튼으로만) */}
      <div
        style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}
        role="tablist"
        aria-label="카테고리 진행 상태"
      >
        {schema.categories.map((c, idx) => {
          const s = categoryStatus[c.id] || "not_started";
          const active = idx === currentIdx;
          return (
            <div
              key={c.id}
              role="tab"
              aria-selected={active}
              style={{
                padding: "8px 14px",
                border: `1px solid ${active ? "var(--primary)" : "var(--gray-300)"}`,
                borderRadius: 8,
                background: active ? "var(--primary)" : "white",
                color: active ? "white" : "var(--gray-700)",
                cursor: "default",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                whiteSpace: "nowrap",
                position: "relative",
                userSelect: "none",
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
            </div>
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
