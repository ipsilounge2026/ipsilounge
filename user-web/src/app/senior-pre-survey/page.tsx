"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { isLoggedIn } from "@/lib/auth";
import {
  getSeniorPreSurveySchema,
  createSeniorPreSurvey,
  patchSeniorPreSurvey,
  submitSeniorPreSurvey,
  listSeniorPreSurveys,
} from "@/lib/api";

interface RadioOption {
  value: string;
  label: string;
}

interface Question {
  id: string;
  type: "radio" | "checkboxes" | "textarea";
  label: string;
  required: boolean;
  options?: RadioOption[];
  max_length?: number;
}

type SessionKey = "S1" | "S2" | "S3" | "S4";

const SESSION_LABELS: Record<SessionKey, string> = {
  S1: "고1-1학기 초 (3월)",
  S2: "고1-2학기 초 (8월 말)",
  S3: "고2-1학기 초 (3월)",
  S4: "고2-2학기 초 (8월 말)",
};

export default function SeniorPreSurveyPage() {
  const router = useRouter();
  const [step, setStep] = useState<"select" | "survey" | "done">("select");
  const [sessionTiming, setSessionTiming] = useState<SessionKey | null>(null);
  const [loading, setLoading] = useState(true);

  // schema
  const [commonQuestions, setCommonQuestions] = useState<Question[]>([]);
  const [q3Options, setQ3Options] = useState<RadioOption[]>([]);
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);

  // survey state
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // auto-save
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const lastSaved = useRef<string>("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    // 기존 draft 확인
    checkExistingDraft();
  }, []);

  const checkExistingDraft = async () => {
    try {
      const res = await listSeniorPreSurveys();
      const drafts = (res.surveys || []).filter((s: { status: string }) => s.status === "draft");
      if (drafts.length > 0) {
        const draft = drafts[0];
        setSurveyId(draft.id);
        setAnswers(draft.answers || {});
        setSessionTiming(draft.session_timing as SessionKey);
        await loadSchema(draft.session_timing);
        setStep("survey");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadSchema = async (timing: string) => {
    const schema = await getSeniorPreSurveySchema(timing);
    setCommonQuestions(schema.common_questions || []);
    setQ3Options(schema.Q3_options || []);
    setSessionQuestions(schema.session_questions || []);
  };

  const handleSelectSession = async (s: SessionKey) => {
    setSessionTiming(s);
    setLoading(true);
    setError(null);
    try {
      await loadSchema(s);
      const sessionNum = parseInt(s.replace("S", ""));
      const survey = await createSeniorPreSurvey({ session_number: sessionNum, session_timing: s });
      setSurveyId(survey.id);
      setAnswers(survey.answers || {});
      setStep("survey");
    } catch (e: unknown) {
      setError((e as Error).message || "설문을 생성할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  // auto-save with debounce
  const scheduleAutoSave = useCallback((newAnswers: Record<string, unknown>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const json = JSON.stringify(newAnswers);
      if (surveyId && json !== lastSaved.current) {
        try {
          await patchSeniorPreSurvey(surveyId, newAnswers);
          lastSaved.current = json;
        } catch {
          // silent
        }
      }
    }, 1500);
  }, [surveyId]);

  const updateAnswer = (qId: string, value: unknown) => {
    setAnswers((prev) => {
      const next = { ...prev, [qId]: value };
      scheduleAutoSave(next);
      return next;
    });
  };

  const toggleCheckbox = (qId: string, val: string) => {
    setAnswers((prev) => {
      const arr = Array.isArray(prev[qId]) ? [...(prev[qId] as string[])] : [];
      const idx = arr.indexOf(val);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(val);
      const next = { ...prev, [qId]: arr };
      scheduleAutoSave(next);
      return next;
    });
  };

  const handleSubmit = async () => {
    // 필수 항목 검증
    const allQuestions = [...commonQuestions, ...sessionQuestions];
    for (const q of allQuestions) {
      if (!q.required) continue;
      if (q.id === "Q3") {
        const arr = answers[q.id];
        if (!arr || (Array.isArray(arr) && arr.length === 0)) {
          setError(`"${q.label}" 항목을 선택해주세요.`);
          return;
        }
        continue;
      }
      const val = answers[q.id];
      if (val === undefined || val === null || val === "") {
        setError(`"${q.label}" 항목을 선택해주세요.`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      // 최종 저장
      if (surveyId) {
        await patchSeniorPreSurvey(surveyId, answers);
        await submitSeniorPreSurvey(surveyId);
      }
      setStep("done");
    } catch (e: unknown) {
      setError((e as Error).message || "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 렌더링 ───

  const renderRadio = (q: Question) => (
    <div key={q.id} style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: "#111827" }}>
        {q.label} {q.required && <span style={{ color: "#EF4444" }}>*</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(q.options || []).map((opt) => (
          <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: answers[q.id] === opt.value ? "2px solid #7C3AED" : "1px solid #E5E7EB", background: answers[q.id] === opt.value ? "#F5F3FF" : "#fff", cursor: "pointer", fontSize: 14 }}>
            <input type="radio" name={q.id} value={opt.value} checked={answers[q.id] === opt.value} onChange={() => updateAnswer(q.id, opt.value)} style={{ accentColor: "#7C3AED" }} />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );

  const renderCheckboxes = (q: Question, options: RadioOption[]) => (
    <div key={q.id} style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: "#111827" }}>
        {q.label} {q.required && <span style={{ color: "#EF4444" }}>*</span>}
      </div>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>복수 선택 가능</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((opt) => {
          const checked = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value);
          return (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: checked ? "2px solid #7C3AED" : "1px solid #E5E7EB", background: checked ? "#F5F3FF" : "#fff", cursor: "pointer", fontSize: 14 }}>
              <input type="checkbox" checked={checked} onChange={() => toggleCheckbox(q.id, opt.value)} style={{ accentColor: "#7C3AED" }} />
              {opt.label}
            </label>
          );
        })}
      </div>
    </div>
  );

  const renderTextarea = (q: Question) => (
    <div key={q.id} style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: "#111827" }}>
        {q.label} {q.required && <span style={{ color: "#EF4444" }}>*</span>}
      </div>
      <textarea
        value={(answers[q.id] as string) || ""}
        onChange={(e) => updateAnswer(q.id, e.target.value)}
        placeholder="자유롭게 작성해주세요"
        maxLength={q.max_length || 500}
        rows={4}
        style={{ width: "100%", padding: "10px 14px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
      />
      <div style={{ textAlign: "right", fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
        {((answers[q.id] as string) || "").length}/{q.max_length || 500}자
      </div>
    </div>
  );

  const renderQuestion = (q: Question) => {
    if (q.id === "Q3") return renderCheckboxes(q, q3Options);
    if (q.type === "radio") return renderRadio(q);
    if (q.type === "checkboxes") return renderCheckboxes(q, q.options || []);
    if (q.type === "textarea") return renderTextarea(q);
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

        {/* 시점 선택 */}
        {step === "select" && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>선배 상담 사전 설문</h1>
            <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 24 }}>
              상담 전에 간단한 설문을 작성해주세요. 선배가 더 잘 준비할 수 있어요.
            </p>

            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#374151" }}>상담 회차를 선택하세요</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(["S1", "S2", "S3", "S4"] as SessionKey[]).map((s) => (
                <button
                  key={s}
                  onClick={() => handleSelectSession(s)}
                  style={{
                    padding: "16px 20px", borderRadius: 12, border: "1px solid #E5E7EB", background: "#fff",
                    textAlign: "left", cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#7C3AED"; e.currentTarget.style.background = "#F5F3FF"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}
                >
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{s.replace("S", "")}회차</div>
                  <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{SESSION_LABELS[s]}</div>
                </button>
              ))}
            </div>
            {error && <p style={{ color: "#EF4444", fontSize: 14, marginTop: 12 }}>{error}</p>}
          </>
        )}

        {/* 설문 작성 */}
        {step === "survey" && sessionTiming && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <button onClick={() => setStep("select")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#6B7280" }}>&larr; 뒤로</button>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>선배 상담 사전 설문</h1>
            <div style={{ fontSize: 13, color: "#7C3AED", fontWeight: 600, marginBottom: 24, padding: "8px 12px", background: "#F5F3FF", borderRadius: 8, display: "inline-block" }}>
              {sessionTiming.replace("S", "")}회차 · {SESSION_LABELS[sessionTiming]}
            </div>

            {/* 공통 질문 */}
            {commonQuestions.map((q) => renderQuestion(q))}

            {/* 회차별 질문 */}
            {sessionQuestions.length > 0 && (
              <>
                <div style={{ borderTop: "1px solid #E5E7EB", margin: "8px 0 24px", paddingTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#7C3AED", marginBottom: 16 }}>
                    {sessionTiming.replace("S", "")}회차 추가 질문
                  </div>
                </div>
                {sessionQuestions.map((q) => renderQuestion(q))}
              </>
            )}

            {error && <p style={{ color: "#EF4444", fontSize: 14, marginBottom: 12 }}>{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 10, border: "none",
                background: "#7C3AED", color: "#fff", fontSize: 16, fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1,
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

        {/* 완료 */}
        {step === "done" && (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>설문이 제출되었습니다</h2>
            <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 32 }}>
              선배가 설문 내용을 참고하여 상담을 준비합니다.
            </p>
            <button
              onClick={() => router.push("/mypage")}
              style={{ padding: "12px 32px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
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
