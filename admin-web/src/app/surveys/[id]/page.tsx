"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSurveyDetail } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface SurveyDetail {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone: string;
  survey_type: string;
  timing: string | null;
  mode: string;
  status: string;
  answers: Record<string, Record<string, any>>;
  category_status: Record<string, string>;
  last_category: string | null;
  last_question: string | null;
  started_platform: string;
  last_edited_platform: string;
  schema_version: string;
  booking_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  schema: SurveySchema | null;
}

interface SurveySchema {
  survey_type: string;
  categories: Category[];
}

interface Category {
  id: string;
  title: string;
  description?: string;
  respondent?: string;
  questions: Question[];
}

interface Question {
  id: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
  rows?: { key: string; label: string }[];
  columns?: { key: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  children?: Question[];
  condition?: { question: string; value: any };
}

const typeLabel: Record<string, string> = {
  preheigh1: "예비고1",
  high: "고등학생",
};

const statusLabel: Record<string, string> = {
  draft: "작성 중",
  submitted: "제출 완료",
};

const catStatusLabel: Record<string, string> = {
  completed: "완료",
  in_progress: "작성 중",
  skipped: "건너뜀",
  not_started: "미시작",
};

const catStatusColor: Record<string, string> = {
  completed: "#10B981",
  in_progress: "#F59E0B",
  skipped: "#9CA3AF",
  not_started: "#D1D5DB",
};

export default function SurveyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    loadSurvey();
  }, [id]);

  const loadSurvey = async () => {
    try {
      const data = await getSurveyDetail(id);
      setSurvey(data);
      // 기본적으로 답변이 있는 카테고리 펼치기
      const withAnswers = new Set<string>();
      if (data.answers) {
        for (const catId of Object.keys(data.answers)) {
          if (Object.keys(data.answers[catId] || {}).length > 0) {
            withAnswers.add(catId);
          }
        }
      }
      setExpandedCats(withAnswers);
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  };

  const toggleCat = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const renderAnswer = (question: Question, answer: any): string => {
    if (answer === null || answer === undefined || answer === "") return "-";

    if (question.type === "radio" || question.type === "select") {
      const opt = question.options?.find((o) => o.value === answer);
      return opt ? opt.label : String(answer);
    }
    if (question.type === "checkbox" && Array.isArray(answer)) {
      return answer
        .map((v: string) => {
          const opt = question.options?.find((o) => o.value === v);
          return opt ? opt.label : v;
        })
        .join(", ") || "-";
    }
    if (question.type === "grid" && question.rows && typeof answer === "object") {
      return question.rows
        .map((r) => {
          const val = answer[r.key];
          if (!val) return null;
          const col = question.columns?.find((c) => c.key === val);
          return `${r.label}: ${col ? col.label : val}`;
        })
        .filter(Boolean)
        .join(" / ") || "-";
    }
    return String(answer);
  };

  const renderQuestions = (questions: Question[], answers: Record<string, any>) => {
    return questions.map((q) => {
      // condition check
      if (q.condition) {
        const condVal = answers[q.condition.question];
        if (Array.isArray(q.condition.value)) {
          if (!q.condition.value.includes(condVal)) return null;
        } else if (condVal !== q.condition.value) {
          return null;
        }
      }

      const answer = answers[q.id];

      // group type with children
      if (q.type === "group" && q.children) {
        return (
          <div key={q.id} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "#374151" }}>
              {q.label}
            </div>
            <div style={{ paddingLeft: 16, borderLeft: "2px solid #E5E7EB" }}>
              {renderQuestions(q.children, answers)}
            </div>
          </div>
        );
      }

      return (
        <div key={q.id} style={{ marginBottom: 12, display: "flex", gap: 12 }}>
          <div style={{ minWidth: 200, maxWidth: 300, fontSize: 13, color: "#6B7280", flexShrink: 0 }}>
            {q.label}
            {q.required && <span style={{ color: "#EF4444" }}> *</span>}
          </div>
          <div style={{ fontSize: 13, color: "#111827", flex: 1, whiteSpace: "pre-wrap" }}>
            {renderAnswer(q, answer)}
          </div>
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>로딩 중...</div>
        </main>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>설문을 찾을 수 없습니다</div>
        </main>
      </div>
    );
  }

  const schema = survey.schema;

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <div>
            <button onClick={() => router.push("/surveys")} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6B7280", marginBottom: 8,
            }}>
              &larr; 목록으로
            </button>
            <h1 style={{ margin: 0 }}>
              {survey.user_name}님의 설문
              <span style={{
                marginLeft: 10, padding: "3px 10px", borderRadius: 4, fontSize: 13,
                color: "white", background: survey.status === "submitted" ? "#10B981" : "#F59E0B",
              }}>
                {statusLabel[survey.status] || survey.status}
              </span>
            </h1>
          </div>
        </div>

        {/* 기본 정보 카드 */}
        <div style={{
          background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20, marginBottom: 20,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>학생</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{survey.user_name}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{survey.user_email}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>연락처</div>
              <div style={{ fontSize: 14 }}>{survey.user_phone || "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>유형</div>
              <div style={{ fontSize: 14 }}>{typeLabel[survey.survey_type] || survey.survey_type}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>시점</div>
              <div style={{ fontSize: 14 }}>{survey.timing || "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>모드</div>
              <div style={{ fontSize: 14 }}>{survey.mode === "delta" ? "변경분" : "전체"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>생성일</div>
              <div style={{ fontSize: 14 }}>{new Date(survey.created_at).toLocaleString("ko-KR")}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>수정일</div>
              <div style={{ fontSize: 14 }}>{new Date(survey.updated_at).toLocaleString("ko-KR")}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>제출일</div>
              <div style={{ fontSize: 14 }}>
                {survey.submitted_at ? new Date(survey.submitted_at).toLocaleString("ko-KR") : "-"}
              </div>
            </div>
          </div>
          {survey.note && (
            <div style={{ marginTop: 16, padding: 12, background: "#FFFBEB", borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: "#92400E", marginBottom: 4 }}>학생 메모</div>
              <div style={{ fontSize: 13, color: "#78350F", whiteSpace: "pre-wrap" }}>{survey.note}</div>
            </div>
          )}
        </div>

        {/* 카테고리별 답변 */}
        {schema ? (
          schema.categories.map((cat) => {
            const catAnswers = survey.answers[cat.id] || {};
            const catSt = survey.category_status[cat.id] || "not_started";
            const isExpanded = expandedCats.has(cat.id);
            const answerCount = Object.keys(catAnswers).length;
            const questionCount = cat.questions.length;

            return (
              <div key={cat.id} style={{
                background: "white", border: "1px solid #E5E7EB", borderRadius: 8, marginBottom: 12, overflow: "hidden",
              }}>
                <div
                  onClick={() => toggleCat(cat.id)}
                  style={{
                    padding: "14px 20px", cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "space-between", background: isExpanded ? "#F9FAFB" : "white",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "#9CA3AF" }}>{cat.id}</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{cat.title}</span>
                    {cat.respondent === "parent" && (
                      <span style={{
                        padding: "1px 6px", borderRadius: 3, fontSize: 11,
                        background: "#F3E8FF", color: "#7C3AED",
                      }}>
                        학부모
                      </span>
                    )}
                    <span style={{
                      padding: "1px 6px", borderRadius: 3, fontSize: 11,
                      background: catStatusColor[catSt] || "#D1D5DB", color: "white",
                    }}>
                      {catStatusLabel[catSt] || catSt}
                    </span>
                    <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                      {answerCount}/{questionCount}
                    </span>
                  </div>
                  <span style={{ fontSize: 14, color: "#9CA3AF" }}>{isExpanded ? "▲" : "▼"}</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: "16px 20px", borderTop: "1px solid #E5E7EB" }}>
                    {cat.description && (
                      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>{cat.description}</div>
                    )}
                    {answerCount === 0 ? (
                      <div style={{ padding: 20, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                        아직 작성된 답변이 없습니다
                      </div>
                    ) : (
                      renderQuestions(cat.questions, catAnswers)
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* 스키마 없이 raw JSON 표시 */
          <div style={{
            background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20,
          }}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>답변 데이터 (Raw)</h3>
            <pre style={{ fontSize: 12, overflow: "auto", maxHeight: 600 }}>
              {JSON.stringify(survey.answers, null, 2)}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
