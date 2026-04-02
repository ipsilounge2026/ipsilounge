"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import StatusBadge from "@/components/StatusBadge";
import { getAnalysisList } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface AnalysisItem {
  id: string;
  service_type: string;
  status: string;
  school_record_filename: string | null;
  target_university: string | null;
  target_major: string | null;
  created_at: string;
  uploaded_at: string | null;
  has_report: boolean;
}

function AnalysisListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serviceType = searchParams.get("type") || "학생부라운지";
  const [allItems, setAllItems] = useState<AnalysisItem[]>([]);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    getAnalysisList().then((res) => setAllItems(res.items)).catch(() => {});
  }, []);

  // 서비스 타입으로 필터링
  const items = allItems.filter(item => item.service_type === serviceType);

  const isHakjong = serviceType === "학종라운지";
  const title = isHakjong ? "학종 라운지" : "학생부 라운지";
  const applyUrl = `/analysis/apply?type=${serviceType}`;
  const btnClass = isHakjong
    ? "btn btn-outline"
    : "btn btn-primary";
  const btnStyle = isHakjong
    ? { border: "1px solid #22C55E", color: "#16A34A" }
    : {};

  return (
    <>
      <Navbar />
      <div className="container">
        <div className="page-header">
          <h1>{title}</h1>
          <Link href={applyUrl} className={btnClass} style={btnStyle}>
            {title} 신청
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 60 }}>
            <p style={{ fontSize: 16, color: "var(--gray-500)", marginBottom: 16 }}>
              아직 {title} 신청 내역이 없습니다
            </p>
            <Link href={applyUrl} className={btnClass} style={btnStyle}>
              {title} 신청하기
            </Link>
          </div>
        ) : (
          <div className="card">
            {items.map((item) => (
              <div key={item.id} className="analysis-item">
                <div className="analysis-info">
                  <h3>
                    {item.school_record_filename || "파일 미업로드"}
                  </h3>
                  <p>
                    {new Date(item.created_at).toLocaleDateString("ko-KR")} 신청
                    {(item.target_university || item.target_major) &&
                      ` | ${item.target_university || ""} ${item.target_major || ""}`}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <StatusBadge status={item.status} />
                  {item.status === "applied" ? (
                    <Link href={`/analysis/${item.id}/upload`} className="btn btn-primary btn-sm">
                      파일 업로드
                    </Link>
                  ) : (
                    <Link href={`/analysis/${item.id}`} className="btn btn-outline btn-sm">
                      {item.has_report ? "리포트 보기" : "상세 보기"}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}

export default function AnalysisListPage() {
  return (
    <Suspense fallback={<><Navbar /><div className="container"><p>로딩 중...</p></div><Footer /></>}>
      <AnalysisListInner />
    </Suspense>
  );
}
