"use client";

/**
 * 예비고1 사전 상담 설문 페이지.
 *
 * 동작:
 * 1. 로그인 확인
 * 2. 내 preheigh1 설문 목록 조회 → draft 가 있으면 그것을 사용, 없으면 새로 생성
 * 3. DynamicSurvey 렌더
 * 4. 제출 완료 시 /mypage 또는 /consultation 으로 이동
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import DynamicSurvey from "@/components/survey/DynamicSurvey";
import { isLoggedIn } from "@/lib/auth";
import {
  createSurvey,
  getSurvey,
  getSurveySchema,
  listMySurveys,
} from "@/lib/api";
import { SurveyResponseData, SurveySchema } from "@/lib/surveyTypes";

export default function Preheigh1SurveyPage() {
  const router = useRouter();
  const [schema, setSchema] = useState<SurveySchema | null>(null);
  const [survey, setSurvey] = useState<SurveyResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login?redirect=/consultation-survey/preheigh1");
      return;
    }
    loadOrCreate();
  }, []);

  const loadOrCreate = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1) 스키마 로드
      const schemaData = await getSurveySchema("preheigh1");
      setSchema(schemaData);

      // 2) 기존 draft 찾기
      const list = await listMySurveys({ survey_type: "preheigh1", status: "draft" });
      const items = (list?.items || []) as SurveyResponseData[];

      let surveyId: string;
      if (items.length > 0) {
        // 가장 최근 draft 사용
        surveyId = items[0].id;
      } else {
        // 새로 생성
        const created = await createSurvey({
          survey_type: "preheigh1",
          started_platform: "web",
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
        {loading && (
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <p>설문을 불러오는 중입니다...</p>
          </div>
        )}

        {!loading && error && (
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: "#DC2626", marginBottom: 16 }}>{error}</p>
            <button onClick={loadOrCreate} className="btn btn-primary">
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && submitted && (
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
              <button onClick={() => router.push("/consultation")} className="btn btn-outline">
                상담 예약하기
              </button>
            </div>
          </div>
        )}

        {!loading && !error && !submitted && schema && survey && (
          <DynamicSurvey schema={schema} survey={survey} onSubmitted={handleSubmitted} />
        )}
      </main>
      <Footer />
    </>
  );
}
