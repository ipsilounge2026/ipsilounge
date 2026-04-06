"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import StatusBadge from "@/components/StatusBadge";
import { getAnalysisDetail, getReportExcelUrl, getReportPdfUrl, toFullUrl } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface Detail {
  id: string;
  status: string;
  school_record_filename: string | null;
  target_university: string | null;
  target_major: string | null;
  memo: string | null;
  admin_memo: string | null;
  created_at: string;
  uploaded_at: string | null;
  processing_at: string | null;
  completed_at: string | null;
  has_report: boolean;
}

export default function AnalysisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<Detail | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    getAnalysisDetail(id).then(setData).catch(() => {});
  }, [id]);

  const handleDownloadExcel = async () => {
    try {
      const res = await getReportExcelUrl(id);
      window.open(toFullUrl(res.download_url), "_blank");
    } catch {}
  };

  const handleDownloadPdf = async () => {
    try {
      const res = await getReportPdfUrl(id);
      window.open(toFullUrl(res.download_url), "_blank");
    } catch {}
  };

  if (!data) return <><Navbar /><div className="container"><p>로딩 중...</p></div></>;

  const statusSteps = [
    { key: "applied", label: "신청완료", date: data.created_at },
    { key: "uploaded", label: "업로드완료", date: data.uploaded_at },
    { key: "processing", label: "분석중", date: data.processing_at },
    { key: "completed", label: "완료", date: data.completed_at },
  ];

  const currentStep = data.status === "completed" ? 3
    : data.status === "processing" ? 2
    : data.status === "uploaded" || data.status === "pending" ? 1
    : 0;

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="page-header">
          <h1>분석 상세</h1>
          <button className="btn btn-outline" onClick={() => router.push("/analysis")}>목록으로</button>
        </div>

        {/* 진행 상태 바 */}
        {data.status !== "cancelled" && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", position: "relative", padding: "0 20px" }}>
              {statusSteps.map((step, i) => (
                <div key={step.key} style={{ textAlign: "center", flex: 1, position: "relative", zIndex: 1 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: i <= currentStep ? "var(--primary)" : "var(--gray-300)",
                    color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 8px", fontSize: 14, fontWeight: 700,
                  }}>{i + 1}</div>
                  <div style={{ fontSize: 13, fontWeight: i <= currentStep ? 600 : 400, color: i <= currentStep ? "var(--gray-900)" : "var(--gray-500)" }}>
                    {step.label}
                  </div>
                  {step.date && (
                    <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 2 }}>
                      {new Date(step.date).toLocaleDateString("ko-KR")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.status === "cancelled" && (
          <div className="card" style={{ marginBottom: 16, textAlign: "center" }}>
            <StatusBadge status="cancelled" />
            <p style={{ marginTop: 8, color: "var(--gray-600)" }}>이 분석 요청은 취소되었습니다</p>
          </div>
        )}

        {/* 파일 업로드 안내 (applied 상태) */}
        {data.status === "applied" && (
          <div className="card" style={{ marginBottom: 16, padding: 20, textAlign: "center", backgroundColor: "#FFF7ED", border: "1px solid #FED7AA" }}>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "var(--gray-800)" }}>⚠️ 학생부 파일을 업로드해야 분석이 시작됩니다</p>
            <Link href={`/analysis/${data.id}/upload`} className="btn btn-primary">파일 업로드하기</Link>
          </div>
        )}

        {/* 기본 정보 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>파일명</div>
              <div style={{ fontSize: 15, color: data.school_record_filename ? undefined : "var(--danger)" }}>
                {data.school_record_filename || "미업로드"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>접수일</div>
              <div style={{ fontSize: 15 }}>{new Date(data.created_at).toLocaleString("ko-KR")}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>희망 지원 대학</div>
              <div style={{ fontSize: 15 }}>{data.target_university || "미지정"}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>희망 지원 학과</div>
              <div style={{ fontSize: 15 }}>{data.target_major || "미지정"}</div>
            </div>
          </div>
          {data.memo && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--gray-100)" }}>
              <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>메모</div>
              <div style={{ fontSize: 14 }}>{data.memo}</div>
            </div>
          )}
        </div>

        {/* 리포트 다운로드 */}
        {data.has_report && (
          <div className="card">
            <h2 style={{ fontSize: 16, marginBottom: 16 }}>분석 리포트</h2>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-primary" onClick={handleDownloadExcel}>Excel 다운로드</button>
              <button className="btn btn-outline" onClick={handleDownloadPdf}>PDF 다운로드</button>
            </div>
            {data.admin_memo && (
              <div style={{ marginTop: 16, padding: 12, background: "var(--gray-50)", borderRadius: 8, fontSize: 14 }}>
                <strong>분석가 코멘트:</strong> {data.admin_memo}
              </div>
            )}
          </div>
        )}

        {!data.has_report && data.status !== "cancelled" && (
          <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--gray-500)" }}>
            <p>리포트가 준비되면 알림을 보내드립니다</p>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
