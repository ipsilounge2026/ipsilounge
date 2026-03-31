"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getDashboard } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface DashboardData {
  analysis: { pending: number; processing: number; completed_this_month: number };
  consultation: { bookings_active: number };
  users: { total: number; new_this_month: number };
  revenue: { this_month: number };
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    getDashboard().then(setData).catch(() => router.push("/login"));
  }, [router]);

  if (!data) return <div className="admin-layout"><Sidebar /><main className="admin-main"><p>로딩 중...</p></main></div>;

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>대시보드</h1>
        </div>

        <div className="stats-grid">
          <div className="card">
            <div className="card-title">분석 대기</div>
            <div className="card-value" style={{ color: "var(--warning)" }}>{data.analysis.pending}</div>
          </div>
          <div className="card">
            <div className="card-title">분석 진행중</div>
            <div className="card-value" style={{ color: "var(--info)" }}>{data.analysis.processing}</div>
          </div>
          <div className="card">
            <div className="card-title">이번 달 완료</div>
            <div className="card-value" style={{ color: "var(--success)" }}>{data.analysis.completed_this_month}</div>
          </div>
          <div className="card">
            <div className="card-title">활성 상담 예약</div>
            <div className="card-value">{data.consultation.bookings_active}</div>
          </div>
        </div>

        <div className="stats-grid">
          <div className="card">
            <div className="card-title">전체 회원</div>
            <div className="card-value">{data.users.total}</div>
          </div>
          <div className="card">
            <div className="card-title">이번 달 신규</div>
            <div className="card-value" style={{ color: "var(--primary)" }}>{data.users.new_this_month}</div>
          </div>
          <div className="card">
            <div className="card-title">이번 달 매출</div>
            <div className="card-value">{data.revenue.this_month.toLocaleString()}원</div>
          </div>
        </div>
      </main>
    </div>
  );
}
