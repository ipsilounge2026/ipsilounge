"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { applyAnalysis } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

export default function ApplyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serviceType = searchParams.get("type") || "학생부라운지";

  const [university, setUniversity] = useState("");
  const [major, setMajor] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (typeof window !== "undefined" && !isLoggedIn()) {
    router.push("/login");
  }

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

          {error && <div className="error-msg">{error}</div>}

          {isHakjong && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="form-group">
                <label>지원 대학</label>
                <input type="text" className="form-control" value={university}
                  onChange={(e) => setUniversity(e.target.value)} placeholder="예: 서울대학교" />
              </div>
              <div className="form-group">
                <label>지원 학과</label>
                <input type="text" className="form-control" value={major}
                  onChange={(e) => setMajor(e.target.value)} placeholder="예: 경영학과" />
              </div>
            </div>
          )}

          {!isHakjong && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="form-group">
                <label>지원 대학 (선택)</label>
                <input type="text" className="form-control" value={university}
                  onChange={(e) => setUniversity(e.target.value)} placeholder="예: 서울대학교" />
              </div>
              <div className="form-group">
                <label>지원 학과 (선택)</label>
                <input type="text" className="form-control" value={major}
                  onChange={(e) => setMajor(e.target.value)} placeholder="예: 경영학과" />
              </div>
            </div>
          )}

          <div className="form-group">
            <label>메모 (선택)</label>
            <textarea className="form-control" value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="분석 시 참고할 사항이 있으면 입력해주세요" />
          </div>

          <button className="btn btn-primary btn-block btn-lg" onClick={handleSubmit} disabled={loading}>
            {loading ? "신청 중..." : "신청하기"}
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
