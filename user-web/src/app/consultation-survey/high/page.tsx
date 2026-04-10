"use client";

/**
 * 고등학교 사전 상담 설문 페이지.
 *
 * 동작:
 * 1. 로그인 확인
 * 2. /suggest/high 로 timing/mode 자동 추천 받기
 * 3. timing 확정 (자동 추천 or 사용자 수동 선택)
 * 4. draft가 있으면 이어쓰기, 없으면 새 설문 생성
 * 5. DynamicSurvey 렌더
 * 6. 제출 완료 시 /mypage 또는 /consultation 으로 이동
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import DynamicSurvey from "@/components/survey/DynamicSurvey";
import ChildSelector from "@/components/ChildSelector";
import { isLoggedIn, getMemberType } from "@/lib/auth";
import {
  createSurvey,
  getSurvey,
  getSurveySchema,
  getSurveySuggest,
  listMySurveys,
} from "@/lib/api";
import { SurveyResponseData, SurveySchema } from "@/lib/surveyTypes";

const TIMING_OPTIONS = [
  { value: "T1", label: "T1 (고1 ~ 고2 1학기)", description: "고등학교 초반 학습/진로 설계" },
  { value: "T2", label: "T2 (고2 2학기)", description: "진로 구체화 및 학업 전략" },
  { value: "T3", label: "T3 (고3 1학기)", description: "수시 지원 전략 수립" },
  { value: "T4", label: "T4 (고3 2학기)", description: "수시 최종 점검 및 정시 전략" },
];

export default function HighSurveyPage() {
  const router = useRouter();
  const [schema, setSchema] = useState<SurveySchema | null>(null);
  const [survey, setSurvey] = useState<SurveyResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [noChildren, setNoChildren] = useState(false);
  const [childReady, setChildReady] = useState(false);
  const isParent = getMemberType() === "parent";

  // timing/mode 선택
  const [phase, setPhase] = useState<"timing" | "survey">("timing");
  const [suggestedTiming, setSuggestedTiming] = useState<string | null>(null);
  const [suggestedMode, setSuggestedMode] = useState<string>("full");
  const [suggestReason, setSuggestReason] = useState<string>("");
  const [selectedTiming, setSelectedTiming] = useState<string | null>(null);
  const [loadingSuggest, setLoadingSuggest] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login?redirect=/consultation-survey/high");
      return;
    }
    if (!isParent) {
      loadSuggest();
    }
  }, []);

  // 학부모: 자녀 선택 후 suggest 로드
  useEffect(() => {
    if (isParent && selectedChild && childReady) {
      loadSuggest();
    }
  }, [selectedChild, childReady]);

  const loadSuggest = async () => {
    try {
      setLoadingSuggest(true);
      const suggest = await getSurveySuggest("high");
      setSuggestedTiming(suggest.suggested_timing || null);
      setSuggestedMode(suggest.suggested_mode || "full");
      setSuggestReason(suggest.reason || "");
      if (suggest.suggested_timing) {
        setSelectedTiming(suggest.suggested_timing);
      }
    } catch {
      // 추천 실패 시 수동 선택
    } finally {
      setLoadingSuggest(false);
    }
  };

  const handleTimingConfirm = async () => {
    if (!selectedTiming) return;
    setPhase("survey");
    await loadOrCreate();
  };

  const loadOrCreate = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1) 스키마 로드
      const schemaData = await getSurveySchema("high");
      setSchema(schemaData);

      // 2) 기존 설문 찾기 (같은 timing의 가장 최근)
      const list = await listMySurveys({ survey_type: "high" });
      const items = (list?.items || []) as SurveyResponseData[];
      const matching = items.filter((s) => s.timing === selectedTiming);

      let surveyId: string;
      if (matching.length > 0) {
        surveyId = matching[0].id;
      } else {
        const created = await createSurvey({
          survey_type: "high",
          timing: selectedTiming,
          started_platform: "web",
          owner_user_id: selectedChild || undefined,
        });
        surveyId = created.id;
      }

      // 3) 전체 데이터 조회
      const full = await getSurvey(surveyId);
      setSurvey(full);
    } catch (e: any) {
      setError(e.message || "설문을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitted = () => {
    setSubmitted(true);
  };

  return (
    <>
      <Navbar />
      <main className="container">
        {/* 학부모 자녀 선택 */}
        {isParent && phase === "timing" && (
          <div style={{ marginBottom: 16 }}>
            <ChildSelector
              value={selectedChild}
              onChange={setSelectedChild}
              onReady={(_, kids) => {
                if (kids.length === 0) setNoChildren(true);
                setChildReady(true);
              }}
            />
          </div>
        )}

        {/* Phase 1: Timing 선택 */}
        {phase === "timing" && (
          <div className="card" style={{ padding: 24 }}>
            <h2 style={{ fontSize: 18, marginBottom: 4 }}>고등학교 사전 상담 설문</h2>
            <p style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 20, lineHeight: 1.6 }}>
              현재 시점에 맞는 설문을 선택해주세요. 시점별로 다른 질문이 포함됩니다.
            </p>

            {loadingSuggest ? (
              <div style={{ textAlign: "center", padding: 20, color: "var(--gray-500)" }}>
                추천 시점을 확인하는 중...
              </div>
            ) : (
              <>
                {/* 자동 추천 배너 */}
                {suggestedTiming && (
                  <div style={{
                    padding: 16, marginBottom: 20, background: "#EFF6FF",
                    border: "1px solid #BFDBFE", borderRadius: 8,
                  }}>
                    <div style={{ fontSize: 13, color: "#1E40AF", lineHeight: 1.6 }}>
                      <strong>추천 시점: {TIMING_OPTIONS.find(t => t.value === suggestedTiming)?.label}</strong>
                      <br />
                      <span style={{ fontSize: 12 }}>{suggestReason}</span>
                      {suggestedMode === "delta" && (
                        <span style={{
                          display: "inline-block", marginTop: 6, padding: "2px 8px",
                          background: "#DBEAFE", borderRadius: 4, fontSize: 11, color: "#1E40AF",
                        }}>
                          이전 제출 이력 있음 - 변경분만 작성
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Timing 선택 카드 */}
                <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
                  {TIMING_OPTIONS.map((opt) => {
                    const isSelected = selectedTiming === opt.value;
                    const isSuggested = suggestedTiming === opt.value;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => setSelectedTiming(opt.value)}
                        style={{
                          padding: "14px 18px",
                          border: `2px solid ${isSelected ? "#3B82F6" : "#E5E7EB"}`,
                          borderRadius: 10,
                          cursor: "pointer",
                          background: isSelected ? "#F8FAFF" : "white",
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: isSelected ? "#3B82F6" : "var(--gray-700)" }}>
                              {opt.label}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                              {opt.description}
                            </div>
                          </div>
                          {isSuggested && (
                            <span style={{
                              padding: "2px 8px", background: "#DBEAFE",
                              borderRadius: 4, fontSize: 11, color: "#1E40AF", fontWeight: 600,
                            }}>
                              추천
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={handleTimingConfirm}
                  disabled={!selectedTiming || noChildren || (isParent && !selectedChild)}
                  className="btn btn-primary btn-block btn-lg"
                  style={{ opacity: (!selectedTiming || noChildren) ? 0.5 : 1 }}
                >
                  설문 시작하기
                </button>
              </>
            )}
          </div>
        )}

        {/* Phase 2: 설문 작성 */}
        {phase === "survey" && loading && (
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <p>설문을 불러오는 중입니다...</p>
          </div>
        )}

        {phase === "survey" && !loading && error && (
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: "#DC2626", marginBottom: 16 }}>{error}</p>
            <button onClick={loadOrCreate} className="btn btn-primary">
              다시 시도
            </button>
          </div>
        )}

        {phase === "survey" && !loading && !error && submitted && (
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>설문 제출이 완료되었습니다</h2>
            <p style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 24, lineHeight: 1.6 }}>
              상담사가 답변을 검토 후 상담 일정을 안내드립니다.<br />
              제출 후에도 상담 전까지 답변을 수정하실 수 있습니다.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={() => router.push("/mypage")} className="btn btn-primary">
                마이페이지로
              </button>
            </div>
          </div>
        )}

        {phase === "survey" && !loading && !error && !submitted && schema && survey && (
          <DynamicSurvey
            schema={schema}
            survey={survey}
            onSubmitted={handleSubmitted}
            memberType={getMemberType()}
            isParentEditing={isParent && !!selectedChild}
          />
        )}
      </main>
      <Footer />
    </>
  );
}
