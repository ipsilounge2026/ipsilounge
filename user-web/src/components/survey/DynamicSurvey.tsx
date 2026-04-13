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
  VirtualStep,
  evaluateShowWhen,
} from "@/lib/surveyTypes";
import { patchSurvey, submitSurvey } from "@/lib/api";
import { QuestionRenderer } from "./QuestionRenderer";

interface Props {
  schema: SurveySchema;
  survey: SurveyResponseData;
  onSubmitted?: () => void;
  /** 현재 로그인한 사용자의 member_type. 학부모이면 respondent="parent" 카테고리만 편집 가능. */
  memberType?: string | null;
  /** 학부모가 자녀 설문을 편집 중인지 (survey.user_id !== 현재 사용자) */
  isParentEditing?: boolean;
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

export default function DynamicSurvey({ schema, survey, onSubmitted, memberType, isParentEditing }: Props) {
  const isDelta = survey.mode === "delta";
  const timing = survey.timing; // T1, T2, T3, T4

  // 카테고리 필터링:
  // - 학생: respondent="parent" 카테고리 숨김
  // - 학부모가 자녀 설문 편집: 전체 카테고리 표시 (학부모 카테고리만 편집, 나머지 읽기전용)
  // - 본인 설문 (학부모 자신이 owner): 전체 카테고리 표시
  const visibleCategories = useMemo(() => {
    if (memberType === "student") {
      return schema.categories.filter((c) => c.respondent !== "parent");
    }
    return schema.categories;
  }, [schema.categories, memberType]);

  // Build virtual steps from ui_step_order (10-STEP display)
  // Each virtual step maps to a category + optional question subset
  const virtualSteps: VirtualStep[] = useMemo(() => {
    const stepOrder = (schema as any).ui_step_order;
    if (!stepOrder || !Array.isArray(stepOrder)) {
      // Fallback: no ui_step_order, use categories as-is
      return visibleCategories.map((c, i) => ({
        stepNumber: i + 1,
        label: c.title,
        category: c,
        questions: c.questions,
      }));
    }

    const catMap = new Map<string, Category>();
    for (const c of schema.categories) catMap.set(c.id, c);

    const steps: VirtualStep[] = [];
    for (const entry of stepOrder) {
      const cat = catMap.get(entry.category_id);
      if (!cat) continue;

      // Respondent filter: student hides parent categories
      if (memberType === "student" && cat.respondent === "parent") continue;
      // Parent editing: only show parent categories
      if (isParentEditing && cat.respondent !== "parent") continue;

      // Timing filter: skip category if current timing not in category's timings
      if (cat.timings && timing && !cat.timings.includes(timing)) continue;

      // Filter questions for this step
      let questions = cat.questions;
      if (entry.include_questions && Array.isArray(entry.include_questions)) {
        const includeSet = new Set(entry.include_questions);
        questions = cat.questions.filter((q: any) => includeSet.has(q.id));
      }

      // Per-question timing filter: remove questions whose timings don't include current timing
      if (timing) {
        questions = questions.filter((q: any) => {
          if (!q.timings || !Array.isArray(q.timings)) return true;
          return q.timings.includes(timing);
        });
      }

      // Skip step entirely if no questions remain after filtering
      if (questions.length === 0) continue;

      steps.push({
        stepNumber: entry.step,
        label: entry.label,
        category: cat,
        questions,
      });
    }
    return steps;
  }, [schema, visibleCategories, memberType, isParentEditing, timing]);

  const [answers, setAnswers] = useState<Record<string, any>>(survey.answers || {});
  const [categoryStatus, setCategoryStatus] = useState<Record<string, CategoryStatus>>(
    (survey.category_status as Record<string, CategoryStatus>) || {}
  );
  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    if (survey.last_category) {
      const idx = virtualSteps.findIndex((s) => s.category.id === survey.last_category);
      if (idx >= 0) return idx;
    }
    return 0;
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictAlert, setConflictAlert] = useState(false);
  const isMobile = useMemo(() => detectIsMobile(), []);
  // 서버에서 마지막으로 받은 updated_at (낙관적 잠금용)
  const lastUpdatedAtRef = useRef<string>(survey.updated_at);

  const currentStep = virtualSteps[currentIdx];
  const currentCategory = currentStep?.category;
  const totalSteps = virtualSteps.length;

  // 학부모가 자녀 설문 편집 시, 현재 카테고리가 읽기 전용인지 판별
  const isCurrentReadOnly = isParentEditing && currentCategory?.respondent !== "parent";

  // Collect unique categories that appear across all virtual steps (for validation/save)
  const uniqueCategories = useMemo(() => {
    const seen = new Set<string>();
    const result: Category[] = [];
    for (const s of virtualSteps) {
      if (!seen.has(s.category.id)) {
        seen.add(s.category.id);
        result.push(s.category);
      }
    }
    return result;
  }, [virtualSteps]);

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
        const result = await patchSurvey(survey.id, {
          answers: newAnswers,
          category_status: newStatus,
          last_category: currentCategory.id,
          last_edited_platform: isMobile ? "mobile" : "web",
          last_known_updated_at: lastUpdatedAtRef.current,
        });
        lastSavedRef.current = payload;
        lastUpdatedAtRef.current = result.updated_at;
        setSavedAt(new Date());
        setError(null);
        setConflictAlert(false);
      } catch (e: any) {
        if (e.message?.includes("409") || e.status === 409) {
          setConflictAlert(true);
          setError("다른 기기 또는 사용자가 이 설문을 수정했습니다. 새로고침이 필요합니다.");
        } else {
          setError(e.message || "저장에 실패했습니다");
        }
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

  // Delta 모드 초기화: change_check 질문에 prefill이 있으면 delta_status를 "unchanged"로 세팅
  useEffect(() => {
    if (!isDelta) return;
    let changed = false;
    const newAnswers = { ...answers };
    for (const cat of uniqueCategories) {
      const catAnswers = newAnswers[cat.id] || {};
      let catChanged = false;
      for (const q of cat.questions as any[]) {
        if (q.delta === "change_check" && !isEmptyValue(catAnswers[q.id])) {
          const statusKey = `${q.id}_delta_status`;
          if (!catAnswers[statusKey]) {
            catAnswers[statusKey] = "unchanged";
            catChanged = true;
          }
        }
      }
      if (catChanged) {
        newAnswers[cat.id] = catAnswers;
        changed = true;
      }
    }
    if (changed) {
      setAnswers(newAnswers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const result = await patchSurvey(survey.id, {
        answers,
        category_status: newStatus,
        last_category: currentCategory.id,
        last_edited_platform: isMobile ? "mobile" : "web",
        last_known_updated_at: lastUpdatedAtRef.current,
      });
      lastSavedRef.current = JSON.stringify({ answers, category_status: newStatus });
      lastUpdatedAtRef.current = result.updated_at;
      setSavedAt(new Date());
      setConflictAlert(false);
    } catch (e: any) {
      if (e.message?.includes("409") || e.status === 409) {
        setConflictAlert(true);
        setError("다른 기기 또는 사용자가 이 설문을 수정했습니다. 새로고침이 필요합니다.");
      } else {
        setError(e.message || "저장에 실패했습니다");
      }
    }
  };

  const goToCategory = (idx: number) => {
    if (idx < 0 || idx >= totalSteps) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setCurrentIdx(idx);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = async () => {
    // 현재 스텝의 필터된 질문만으로 미응답 필수 항목 차단
    const currentAnswers = answers[currentCategory.id] || {};
    const stepCategory = { ...currentCategory, questions: currentStep.questions };
    const missing = collectMissingRequired(stepCategory, currentAnswers);
    if (missing.length > 0) {
      alert(
        `다음 필수 항목을 입력해주세요:\n\n` +
          missing.map((m) => `• ${m}`).join("\n") +
          `\n\n작성 후 다시 진행하거나, "나중에 입력" 버튼을 누르면 이 단계를 건너뛸 수 있습니다.`
      );
      return;
    }
    // Mark category completed only if ALL steps for this category are done
    // For split categories (D, E), check if the other steps for the same category are also completed
    const siblingSteps = virtualSteps.filter(
      (s, i) => s.category.id === currentCategory.id && i !== currentIdx
    );
    const allSiblingsDone = siblingSteps.every((s) => {
      // Check if a sibling step's required questions are answered
      const siblingAnswers = answers[s.category.id] || {};
      const siblingCat = { ...s.category, questions: s.questions };
      return collectMissingRequired(siblingCat, siblingAnswers).length === 0;
    });
    if (allSiblingsDone) {
      await markCategoryStatus("completed");
    } else {
      // Mark as in_progress since not all steps for this category are done
      await markCategoryStatus("in_progress");
    }
    if (currentIdx < totalSteps - 1) {
      goToCategory(currentIdx + 1);
    }
  };

  const handleSkip = async () => {
    await markCategoryStatus("skipped");
    if (currentIdx < totalSteps - 1) {
      goToCategory(currentIdx + 1);
    }
  };

  const handleSubmit = async () => {
    // 제출 시점에는 스킵/미응답 카테고리가 모두 없어야 한다.
    // - "나중에 입력"으로 건너뛴(skipped) 카테고리: 모바일↔웹 작성 분리를 위한 임시 상태이므로 최종 제출 시에는 모두 작성 완료되어야 함
    // - 미작성(not_started) 카테고리: 한 번도 손대지 않은 상태
    // - 작성 중(in_progress) 카테고리: 일부만 입력했고 완료 처리되지 않은 상태
    // - 필수 항목 누락: completed 처리되지 않았더라도 누락된 필수 항목 안내
    type Issue = { stepIdx: number; label: string; catId: string; reason: string; items?: string[] };
    const issues: Issue[] = [];

    for (let si = 0; si < virtualSteps.length; si++) {
      const step = virtualSteps[si];
      const cat = step.category;

      // 학부모가 자녀 설문 편집 시, 학생 전용 카테고리는 검증 건너뜀 (읽기 전용이므로)
      if (isParentEditing && cat.respondent !== "parent") continue;

      const status = categoryStatus[cat.id] || "not_started";
      const catAnswers = answers[cat.id] || {};
      const stepCat = { ...cat, questions: step.questions };
      const missing = collectMissingRequired(stepCat, catAnswers);

      if (missing.length > 0) {
        issues.push({
          stepIdx: si,
          label: step.label,
          catId: cat.id,
          reason: status === "in_progress" ? "작성 중 — 필수 항목 누락" : "필수 항목 누락",
          items: missing,
        });
        continue;
      }
      // Only flag status issues on the FIRST step of each category to avoid duplicates
      const isFirstStepForCat = virtualSteps.findIndex((s) => s.category.id === cat.id) === si;
      if (isFirstStepForCat) {
        if (status === "skipped") {
          issues.push({ stepIdx: si, label: step.label, catId: cat.id, reason: "건너뜀(나중에 입력) 상태" });
          continue;
        }
        if (status === "not_started") {
          issues.push({ stepIdx: si, label: step.label, catId: cat.id, reason: "작성 시작 전" });
          continue;
        }
      }
    }

    if (issues.length > 0) {
      const msg = issues
        .map((c) => {
          const head = `[${c.label}] ${c.reason}`;
          if (c.items && c.items.length > 0) {
            return head + "\n" + c.items.map((i) => `  • ${i}`).join("\n");
          }
          return head;
        })
        .join("\n\n");
      alert(
        "아직 작성이 완료되지 않은 항목이 있어 제출할 수 없습니다.\n" +
          "아래 항목을 모두 작성한 뒤 다시 제출해주세요.\n\n" +
          msg
      );
      // 첫 번째 미완료 스텝으로 이동
      goToCategory(issues[0].stepIdx);
      return;
    }

    try {
      setSubmitting(true);
      // 마지막으로 저장 보장
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const result = await patchSurvey(survey.id, {
        answers,
        category_status: categoryStatus,
        last_edited_platform: isMobile ? "mobile" : "web",
        last_known_updated_at: lastUpdatedAtRef.current,
      });
      lastUpdatedAtRef.current = result.updated_at;
      await submitSurvey(survey.id);
      onSubmitted?.();
    } catch (e: any) {
      setError(e.message || "제출에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  // 모바일에서 web-only 카테고리 진입 시 안내
  const isWebOnly = currentCategory?.platforms?.includes("web") && !currentCategory?.platforms?.includes("mobile");
  const blockMobile = isMobile && isWebOnly;

  // 진행률 (스텝 기반 - 각 스텝의 필수 항목이 모두 채워졌으면 완료로 간주)
  const completedStepCount = virtualSteps.filter((step) => {
    const catAnswers = answers[step.category.id] || {};
    const stepCat = { ...step.category, questions: step.questions };
    return collectMissingRequired(stepCat, catAnswers).length === 0 &&
      (categoryStatus[step.category.id] === "completed" ||
       categoryStatus[step.category.id] === "skipped" ||
       categoryStatus[step.category.id] === "in_progress");
  }).length;
  const progressPct = totalSteps > 0 ? Math.round((completedStepCount / totalSteps) * 100) : 0;

  return (
    <div>
      {/* 헤더: 진행률 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>{schema.title}</h2>
          <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
            {currentIdx + 1}/{totalSteps} 단계 ({progressPct}%)
          </div>
        </div>
        <div style={{ height: 6, background: "var(--gray-200)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${progressPct}%`, height: "100%", background: "var(--primary)", transition: "width 0.3s" }} />
        </div>
      </div>

      {/* 단계 네비 (학부모: 클릭 이동 가능 / 학생: 순차 진행만, 클릭 불가) */}
      <div
        style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}
        role="tablist"
        aria-label="단계 진행 상태"
      >
        {virtualSteps.map((step, idx) => {
          const s = categoryStatus[step.category.id] || "not_started";
          const active = idx === currentIdx;
          const canClick = isParentEditing;
          const Tag = canClick ? "button" : "div";
          return (
            <Tag
              {...(canClick ? { type: "button", onClick: () => goToCategory(idx) } : {})}
              key={`${step.stepNumber}-${step.category.id}`}
              role="tab"
              aria-selected={active}
              style={{
                padding: "8px 14px",
                border: `1px solid ${active ? "var(--primary)" : "var(--gray-300)"}`,
                borderRadius: 8,
                background: active ? "var(--primary)" : "white",
                color: active ? "white" : "var(--gray-700)",
                cursor: canClick ? "pointer" : "default",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                whiteSpace: "nowrap",
                position: "relative",
                userSelect: "none",
              }}
            >
              {step.stepNumber}. {step.label}
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
            </Tag>
          );
        })}
      </div>

      {/* 충돌 알림 배너 */}
      {conflictAlert && (
        <div style={{
          padding: 16, marginBottom: 16, background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <div>
            <div style={{ fontWeight: 600, color: "#991B1B", fontSize: 14, marginBottom: 4 }}>
              동시 편집 충돌 감지
            </div>
            <div style={{ fontSize: 12, color: "#991B1B" }}>
              다른 기기 또는 사용자가 이 설문을 수정했습니다. 새로고침하여 최신 데이터를 불러오세요.
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ flexShrink: 0, fontSize: 13 }}
            onClick={() => window.location.reload()}
          >
            새로고침
          </button>
        </div>
      )}

      {/* 현재 카테고리 카드 */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--gray-200)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 16, margin: 0 }}>
              {currentStep.stepNumber}. {currentStep.label}
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

        {/* 읽기 전용 안내 (학부모가 자녀의 학생 카테고리를 볼 때) */}
        {isCurrentReadOnly && (
          <div style={{
            padding: "10px 14px", marginBottom: 16, background: "#EFF6FF",
            border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 13, color: "#1E40AF",
          }}>
            이 카테고리는 학생이 작성하는 항목입니다. 내용 확인만 가능합니다.
          </div>
        )}

        {/* Delta 모드 안내 */}
        {isDelta && !isCurrentReadOnly && (
          <div style={{
            padding: "10px 14px", marginBottom: 16, background: "#F0FDF4",
            border: "1px solid #BBF7D0", borderRadius: 8, fontSize: 13, color: "#166534",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>🔄</span>
            <span>이전 상담 답변이 자동으로 채워져 있습니다. <b>변경된 내용만 수정</b>하고 넘어가세요.</span>
          </div>
        )}

        {/* 모바일 + 무거운 카테고리 안내 */}
        {blockMobile ? (
          <MobileWebOnlyNotice
            currentCategory={currentCategory}
            onSkip={handleSkip}
          />
        ) : (
          <CategoryQuestions
            category={{ ...currentCategory, questions: currentStep.questions }}
            answers={answers[currentCategory.id] || {}}
            onChange={updateAnswer}
            readOnly={isCurrentReadOnly}
            isDelta={isDelta}
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
            {isCurrentReadOnly ? (
              /* 읽기 전용 카테고리: 저장 없이 이동만 */
              currentIdx < totalSteps - 1 ? (
                <button type="button" onClick={() => goToCategory(currentIdx + 1)} className="btn btn-primary">
                  다음 →
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
              )
            ) : (
              /* 편집 가능 카테고리: 기존 동작 */
              <>
                {currentCategory.skippable && (
                  <button type="button" onClick={handleSkip} className="btn btn-outline">
                    나중에 입력
                  </button>
                )}
                {currentIdx < totalSteps - 1 ? (
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
              </>
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
  readOnly,
  isDelta,
}: {
  category: Category;
  answers: Record<string, any>;
  onChange: (id: string, v: any) => void;
  readOnly?: boolean;
  isDelta?: boolean;
}) {
  // Delta "변경 없음" 체크 상태: question id -> boolean
  // change_check 질문에 prefill이 있으면 기본 true(변경 없음 체크됨)
  const [unchangedMap, setUnchangedMap] = useState<Record<string, boolean>>(() => {
    if (!isDelta) return {};
    const initial: Record<string, boolean> = {};
    for (const q of category.questions as any[]) {
      if (q.delta === "change_check" && !isEmptyValue(answers[q.id])) {
        initial[q.id] = true;
      }
    }
    return initial;
  });

  const toggleUnchanged = (qId: string, checked: boolean) => {
    setUnchangedMap((prev) => ({ ...prev, [qId]: checked }));
    // delta_status 메타 필드 업데이트
    onChange(`${qId}_delta_status`, checked ? "unchanged" : "changed");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, ...(readOnly ? { opacity: 0.7, pointerEvents: "none" } : {}) }}>
      {category.questions.map((q: any) => {
        if (!evaluateShowWhen(q.show_when, answers)) return null;
        const hasPrefill = isDelta && !isEmptyValue(answers[q.id]);
        const isChangeCheck = isDelta && q.delta === "change_check" && hasPrefill;
        const isUnchanged = isChangeCheck && unchangedMap[q.id] === true;

        return (
          <div key={q.id} style={{ position: "relative" }}>
            {/* Delta change_check: "변경 없음" 체크박스 */}
            {isChangeCheck && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 8,
                  padding: "6px 10px",
                  background: isUnchanged ? "#F0FDF4" : "#FEF3C7",
                  border: `1px solid ${isUnchanged ? "#BBF7D0" : "#FDE68A"}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  color: isUnchanged ? "#166534" : "#92400E",
                  fontWeight: 500,
                  userSelect: "none",
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                <input
                  type="checkbox"
                  checked={isUnchanged}
                  onChange={(e) => toggleUnchanged(q.id, e.target.checked)}
                  style={{ accentColor: "#16A34A", width: 16, height: 16, cursor: "pointer" }}
                />
                {isUnchanged ? "변경 없음 (이전 답변 유지)" : "변경하려면 아래 내용을 수정하세요"}
              </label>
            )}

            {/* "이전 답변" 뱃지 (change_check가 아닌 delta prefill에만 표시) */}
            {hasPrefill && !isChangeCheck && (
              <span style={{
                position: "absolute", top: 0, right: 0, fontSize: 10, fontWeight: 600,
                padding: "2px 8px", borderRadius: 4,
                background: "#DBEAFE", color: "#1E40AF",
              }}>
                이전 답변
              </span>
            )}

            {/* 질문 본체: 변경 없음이면 비활성화 */}
            <div style={isUnchanged ? { opacity: 0.5, pointerEvents: "none", transition: "opacity 0.15s" } : undefined}>
              <QuestionRenderer
                question={q}
                value={answers[q.id]}
                onChange={(v) => onChange(q.id, v)}
              />
            </div>
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
