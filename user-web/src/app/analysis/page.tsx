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
  status: string;
  school_record_filename: string;
  target_university: string | null;
  target_major: string | null;
  created_at: string;
  has_report: boolean;
}

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
          <h1>학생부 분석</h1>
          <Link href="/analysis/upload" className="btn btn-primary">새 분석 요청</Link>
        </div>

        {items.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 60 }}>
            <p style={{ fontSize: 16, color: "var(--gray-500)", marginBottom: 16 }}>아직 분석 요청이 없습니다</p>
            <Link href="/analysis/upload" className="btn btn-primary">학생부 업로드하기</Link>
          </div>
        ) : (
          <div className="card">
            {items.map((item) => (
              <div key={item.id} className="analysis-item">
                <div className="analysis-info">
                  <h3>{item.school_record_filename}</h3>
                  <p>
                    {new Date(item.created_at).toLocaleDateString("ko-KR")} 접수
                    {(item.target_university || item.target_major) &&
                      ` | ${item.target_university || ""} ${item.target_major || ""}`}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <StatusBadge status={item.status} />
                  <Link href={`/analysis/${item.id}`} className="btn btn-outline btn-sm">
                    {item.has_report ? "리포트 보기" : "상세 보기"}
                  </Link>
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
