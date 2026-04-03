"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { applyAnalysis, checkApplyCooldown } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

function ApplyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serviceType = searchParams.get("type") || "학생부라운지";

  const [university, setUniversity] = useState("");
  const [major, setMajor] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState<{ can_apply: boolean; cooldown_until: string | null; last_applied: string | null } | null>(null);

  if (typeof window !== "undefined" && !isLoggedIn()) {
    router.push("/login");
  }

  useEffect(() => {
    checkApplyCooldown().then(setCooldown).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await applyAnalysis({
        service_type: serviceType,
        target_university: university || undefined,
        target_major: major || undefined,
        memo: memo || undefined,
      });
      router.push(`/analysis/${result.id}/upload`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isHakjong = serviceType === "학종라운지";

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="page-header">
          <h1>{isHakjong ? "학종 라운지" : "학생부 라운지"} 신청</h1>
        </div>

        <div className="card">
          <div style={{
            padding: 16,
            marginBottom: 20,
            borderRadius: 8,
            backgroundColor: isHakjong ? "#F0FDF4" : "#EFF6FF",
            border: `1px solid ${isHakjong ? "#BBF7D0" : "#BFDBFE"}`,
          }}>
            <p style={{ fontSize: 14, color: "var(--gray-700)", margin: 0 }}>
              {isHakjong
                ? "📊 학종 라운지: 지원 대학과 학과를 지정하면 입결 비교, 교과 이수 충실도까지 포함된 맞춤 리포트를 제공합니다."
                : "📄 학생부 라운지: 학생부 PDF를 업로드하면 내신, 세특, 창체, 행특을 종합 분석한 리포트를 받아볼 수 있습니다."}
            </p>
          </div>

          {cooldown && !cooldown.can_apply && (
            <div style={{
              padding: "12px 16px",
              background: "#FEF3C7",
              border: "1px solid #FDE68A",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 14,
              color: "#92400E",
              lineHeight: 1.6,
            }}>
              이전 신청일({cooldown.last_applied?.replace(/-/g, ".")}) 기준 3개월 이후({cooldown.cooldown_until?.replace(/-/g, ".")})부터 재신청이 가능합니다.
            </div>
          )}

          {error && <div className="error-msg">{error}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="form-group">
              <label>지원 대학{!isHakjong && " (선택)"}</label>
              <input type="text" className="form-control" value={university}
                onChange={(e) => setUniversity(e.target.value)} placeholder="예: 서울대학교" />
            </div>
            <div className="form-group">
              <label>지원 학과{!isHakjong && " (선택)"}</label>
              <input type="text" className="form-control" value={major}
                onChange={(e) => setMajor(e.target.value)} placeholder="예: 경영학과" />
            </div>
          </div>

          <div className="form-group">
            <label>메모 (선택)</label>
            <textarea className="form-control" value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="분석 시 참고할 사항이 있으면 입력해주세요" />
          </div>

          <button className="btn btn-primary btn-block btn-lg" onClick={handleSubmit} disabled={loading || cooldown === null || !cooldown.can_apply}>
            {loading ? "신청 중..." : cooldown === null ? "확인 중..." : !cooldown.can_apply ? "쿨다운 기간" : "신청하기"}
          </button>

          <p style={{ textAlign: "center", fontSize: 13, color: "var(--gray-500)", marginTop: 12 }}>
            신청 후 학생부 파일을 업로드해야 분석이 시작됩니다.
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
}

export default function ApplyPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: 60 }}>로딩 중...</div>}>
      <ApplyForm />
    </Suspense>
  );
}
