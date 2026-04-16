"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { isLoggedIn } from "@/lib/auth";
import {
  getSatisfactionSurveySchema,
  listSatisfactionSurveys,
  patchSatisfactionSurvey,
  submitSatisfactionSurvey,
} from "@/lib/api";

interface ScaleQuestion {
  id: string;
  type: "scale";
  label: string;
  required: boolean;
}

interface TextQuestion {
  id: string;
  type: "textarea";
  label: string;
  required: boolean;
  max_length?: number;
}

type Question = ScaleQuestion | TextQuestion;

const SCORE_HINTS: Record<number, string> = {
  1: "매우 불만족",
  5: "보통",
  10: "매우 만족",
};

function SatisfactionSurveyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("booking_id") || "";
  const surveyType = searchParams.get("type") || "senior";

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [freeText, setFreeText] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"survey" | "done">("survey");

  // auto-save
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const lastSaved = useRef<string>("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    loadSurvey();
  }, []);

  const loadSurvey = async () => {
    try {
      // Check for existing draft
      const listRes = await listSatisfactionSurveys();
      const surveys = listRes.surveys || listRes.items || [];
      const draft = surveys.find(
        (s: { status: string; booking_id?: string; survey_type?: string }) =>
          s.status === "pending" &&
          (!bookingId || s.booking_id === bookingId)
      );

      if (draft) {
        setSurveyId(draft.id);
        setScores(draft.scores || {});
        setFreeText(draft.free_text || {});
      }

      // Load schema — API returns common_items/type_items/free_text_items
      const schema = await getSatisfactionSurveySchema(surveyType);
      const qs: Question[] = [];
      for (const item of (schema.common_items || [])) {
        qs.push({ id: item.key, type: "scale", label: item.question, required: true });
      }
      for (const item of (schema.type_items || [])) {
        qs.push({ id: item.key, type: "scale", label: item.question, required: true });
      }
      for (const item of (schema.free_text_items || [])) {
        qs.push({ id: item.key, type: "textarea", label: item.question, required: item.required !== false ? true : false, max_length: 500 } as TextQuestion);
      }
      setQuestions(qs.length > 0 ? qs : (schema.questions || []));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // auto-save with debounce
  const scheduleAutoSave = useCallback(
    (newScores: Record<string, number>, newFreeText: Record<string, string>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const json = JSON.stringify({ scores: newScores, free_text: newFreeText });
        if (surveyId && json !== lastSaved.current) {
          try {
            await patchSatisfactionSurvey(surveyId, {
              scores: newScores,
              free_text: newFreeText,
            });
            lastSaved.current = json;
          } catch {
            // silent
          }
        }
      }, 1500);
    },
    [surveyId]
  );

  const updateScore = (qId: string, value: number) => {
    setScores((prev) => {
      const next = { ...prev, [qId]: value };
      scheduleAutoSave(next, freeText);
      return next;
    });
  };

  const updateFreeText = (qId: string, value: string) => {
    setFreeText((prev) => {
      const next = { ...prev, [qId]: value };
      scheduleAutoSave(scores, next);
      return next;
    });
  };

  const handleSubmit = async () => {
    // Validate required questions
    for (const q of questions) {
      if (!q.required) continue;
      if (q.type === "scale") {
        if (!scores[q.id]) {
          setError(`"${q.label}" 항목에 점수를 선택해주세요.`);
          return;
        }
      }
      if (q.type === "textarea") {
        if (!freeText[q.id]?.trim()) {
          setError(`"${q.label}" 항목을 입력해주세요.`);
          return;
        }
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      if (surveyId) {
        await patchSatisfactionSurvey(surveyId, { scores, free_text: freeText });
        await submitSatisfactionSurvey(surveyId);
      }
      setStep("done");
    } catch (e: unknown) {
      setError((e as Error).message || "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render helpers ---

  const renderScaleQuestion = (q: Question) => (
    <div key={q.id} style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "#111827" }}>
        {q.label} {q.required && <span style={{ color: "#EF4444" }}>*</span>}
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => {
          const isSelected = scores[q.id] === num;
          return (
            <button
              key={num}
              type="button"
              onClick={() => updateScore(q.id, num)}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: isSelected ? "2px solid #7C3AED" : "1px solid #D1D5DB",
                background: isSelected ? "#7C3AED" : "#fff",
                color: isSelected ? "#fff" : "#374151",
                fontSize: 14,
                fontWeight: isSelected ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {num}
            </button>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "#9CA3AF",
          marginTop: 6,
          padding: "0 4px",
        }}
      >
        <span>{SCORE_HINTS[1]}</span>
        <span>{SCORE_HINTS[5]}</span>
        <span>{SCORE_HINTS[10]}</span>
      </div>
    </div>
  );

  const renderTextareaQuestion = (q: TextQuestion) => {
    const maxLen = q.max_length || 500;
    return (
      <div key={q.id} style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: "#111827" }}>
          {q.label} {q.required && <span style={{ color: "#EF4444" }}>*</span>}
        </div>
        <textarea
          value={freeText[q.id] || ""}
          onChange={(e) => updateFreeText(q.id, e.target.value)}
          placeholder="자유롭게 작성해주세요"
          maxLength={maxLen}
          rows={4}
          style={{
            width: "100%",
            padding: "10px 14px",
            border: "1px solid #D1D5DB",
            borderRadius: 8,
            fontSize: 14,
            lineHeight: 1.6,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
        <div style={{ textAlign: "right", fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
          {(freeText[q.id] || "").length}/{maxLen}자
        </div>
      </div>
    );
  };

  const renderQuestion = (q: Question) => {
    if (q.type === "scale") return renderScaleQuestion(q);
    if (q.type === "textarea") return renderTextareaQuestion(q as TextQuestion);
    return null;
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div style={{ minHeight: "60vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <p style={{ color: "#9CA3AF" }}>불러오는 중...</p>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px", minHeight: "60vh" }}>
        {step === "survey" && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>만족도 설문</h1>
            <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 24 }}>
              {surveyType === "senior"
                ? "선배 상담에 대한 만족도를 평가해주세요. 더 나은 서비스를 제공하는 데 큰 도움이 됩니다."
                : "상담에 대한 만족도를 평가해주세요. 더 나은 서비스를 제공하는 데 큰 도움이 됩니다."}
            </p>

            <div
              style={{
                fontSize: 13,
                color: "#7C3AED",
                fontWeight: 600,
                marginBottom: 12,
                padding: "8px 12px",
                background: "#F5F3FF",
                borderRadius: 8,
                display: "inline-block",
              }}
            >
              {surveyType === "senior" ? "선배 상담 만족도" : "상담 만족도"}
            </div>

            <div
              style={{
                fontSize: 13,
                color: "#374151",
                marginBottom: 28,
                padding: "10px 14px",
                background: "#F9FAFB",
                border: "1px solid #E5E7EB",
                borderRadius: 8,
              }}
            >
              🔒 응답자 정보는 상담사에게 노출되지 않습니다.
            </div>

            {questions.map((q) => renderQuestion(q))}

            {error && <p style={{ color: "#EF4444", fontSize: 14, marginBottom: 12 }}>{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: "100%",
                padding: "14px 0",
                borderRadius: 10,
                border: "none",
                background: "#7C3AED",
                color: "#fff",
                fontSize: 16,
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.6 : 1,
                marginTop: 8,
              }}
            >
              {submitting ? "제출 중..." : "설문 제출"}
            </button>
            <p style={{ textAlign: "center", fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>
              작성 중인 내용은 자동 저장됩니다
            </p>
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>설문이 제출되었습니다</h2>
            <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 32 }}>
              소중한 의견 감사합니다. 더 나은 서비스를 위해 노력하겠습니다.
            </p>
            <button
              onClick={() => router.push("/mypage")}
              style={{
                padding: "12px 32px",
                borderRadius: 8,
                border: "none",
                background: "#7C3AED",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              마이페이지로 이동
            </button>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}

export default function SatisfactionSurveyPage() {
  return (
    <Suspense fallback={<><Navbar /><div style={{ minHeight: "60vh", display: "flex", justifyContent: "center", alignItems: "center" }}><p style={{ color: "#9CA3AF" }}>로딩 중...</p></div><Footer /></>}>
      <SatisfactionSurveyContent />
    </Suspense>
  );
}
