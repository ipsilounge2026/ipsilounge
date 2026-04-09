"use client";

/**
 * 이어쓰기 토큰으로 진입하는 페이지.
 *
 * 흐름:
 * 1. URL ?token= 쿼리에서 토큰 추출
 * 2. /api/consultation-surveys/resume?token=... 호출 (인증 불필요)
 * 3. survey_type 에 따라 적절한 페이지로 redirect
 *
 * 모바일 → 웹 단방향 동선의 진입점 역할.
 *
 * Next.js 15에서 useSearchParams는 Suspense 경계 내에서 사용되어야 하므로,
 * 실제 로직은 ResumeContent에 두고 default export에서 Suspense로 감싼다.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getSurveyByResumeToken } from "@/lib/api";

function ResumeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(null);
  const [survey, setSurvey] = useState<any | null>(null);

  useEffect(() => {
    if (!token) {
      setError("이어쓰기 토큰이 없습니다");
      return;
    }
    (async () => {
      try {
        const data = await getSurveyByResumeToken(token);
        setSurvey(data);
        // 자동으로 해당 설문 페이지로 이동
        if (data.survey_type === "preheigh1") {
          router.replace("/consultation-survey/preheigh1");
        } else if (data.survey_type === "high") {
          // Week 3에서 구현 예정
          router.replace("/consultation-survey/preheigh1");
        }
      } catch (e: any) {
        setError(e.message || "이어쓰기에 실패했습니다");
      }
    })();
  }, [token]);

  return (
    <div className="card" style={{ padding: 40, textAlign: "center" }}>
      {!error && !survey && (
        <>
          <p>이어쓰기 정보를 확인하고 있습니다...</p>
        </>
      )}
      {error && (
        <>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: "#DC2626", marginBottom: 16 }}>{error}</p>
          <p style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 16 }}>
            이어쓰기 링크가 만료되었거나 유효하지 않습니다.<br />
            새 링크를 발급받거나 직접 마이페이지에서 이어쓰기 해주세요.
          </p>
          <button onClick={() => router.push("/mypage")} className="btn btn-primary">
            마이페이지로
          </button>
        </>
      )}
      {!error && survey && (
        <p>설문으로 이동 중입니다...</p>
      )}
    </div>
  );
}

export default function SurveyResumePage() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Suspense
          fallback={
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <p>로딩 중...</p>
            </div>
          }
        >
          <ResumeContent />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
