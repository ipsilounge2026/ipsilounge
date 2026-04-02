"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

const STATUS_LABELS: Record<string, string> = {
  applied: "신청완료 (파일 업로드 필요)",
  uploaded: "업로드완료 (분석 대기중)",
  processing: "분석중",
  completed: "분석완료",
  cancelled: "취소됨",
};

export default function AnalysisListPage() {
  const router = useRouter();
  const [items, setItems] = useState<AnalysisItem[]>([]);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    getAnalysisList().then((res) => setItems(res.items)).catch(() => {});
  }, []);

  return (
    <>
      <Navbar />
      <div className="container">
        <div className="page-header">
          <h1>분석 라운지</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/analysis/apply?type=학생부라운지" className="btn btn-primary">학생부 라운지 신청</Link>
            <Link href="/analysis/apply?type=학종라운지" className="btn btn-outline" style={{ border: "1px solid #22C55E", color: "#16A34A" }}>학종 라운지 신청</Link>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 60 }}>
            <p style={{ fontSize: 16, color: "var(--gray-500)", marginBottom: 16 }}>아직 신청 내역이 없습니다</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Link href="/analysis/apply?type=학생부라운지" className="btn btn-primary">학생부 라운지 신청하기</Link>
              <Link href="/analysis/apply?type=학종라운지" className="btn btn-outline">학종 라운지 신청하기</Link>
            </div>
          </div>
        ) : (
          <div className="card">
            {items.map((item) => (
              <div key={item.id} className="analysis-item">
                <div className="analysis-info">
                  <h3>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      marginRight: 8,
                      backgroundColor: item.service_type === "학종라운지" ? "#F0FDF4" : "#EFF6FF",
                      color: item.service_type === "학종라운지" ? "#16A34A" : "#2563EB",
                    }}>
                      {item.service_type}
                    </span>
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
