"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import { isLoggedIn } from "@/lib/auth";
import { getPayments, getPaymentStats, refundPayment } from "@/lib/api";

interface Payment {
  id: string;
  user_name: string;
  user_email: string;
  amount: number;
  method: string;
  status: string;
  transaction_id: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  completed: number;
  pending: number;
  total_revenue: number;
}

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadStats();
  }, []);

  useEffect(() => {
    loadPayments();
  }, [page, statusFilter]);

  const loadStats = async () => {
    try {
      const s = await getPaymentStats();
      setStats(s);
    } catch {}
  };

  const loadPayments = async () => {
    setIsLoading(true);
    try {
      const res = await getPayments(page, statusFilter || undefined);
      setPayments(res.items);
      setTotal(res.total);
    } catch {} finally {
      setIsLoading(false);
    }
  };

  const handleRefund = async (id: string) => {
    if (!confirm("환불 처리하시겠습니까? 이 작업은 결제 기록만 변경하며 실제 환불은 별도로 진행해야 합니다.")) return;
    try {
      await refundPayment(id);
      setMessage("환불 처리되었습니다");
      loadPayments();
      loadStats();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const formatAmount = (n: number) => n.toLocaleString("ko-KR") + "원";
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ko-KR");
  const methodLabel = (m: string) => m === "toss" ? "토스(카드)" : m === "google_play" ? "인앱결제" : m;

  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>결제 현황</h1>
        </div>

        {message && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>{message}</div>
        )}

        {/* 통계 카드 */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {[
              { label: "전체 결제", value: `${stats.total}건` },
              { label: "완료", value: `${stats.completed}건`, color: "#065f46" },
              { label: "대기중", value: `${stats.pending}건`, color: "#92400e" },
              { label: "총 매출", value: formatAmount(stats.total_revenue), color: "#1e40af" },
            ].map((s) => (
              <div key={s.label} className="card" style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color || "var(--gray-900)" }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 필터 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--gray-600)" }}>상태:</span>
            {[
              { value: "", label: "전체" },
              { value: "pending", label: "대기중" },
              { value: "completed", label: "완료" },
              { value: "refunded", label: "환불됨" },
              { value: "failed", label: "실패" },
            ].map((f) => (
              <button
                key={f.value}
                className={`btn btn-sm ${statusFilter === f.value ? "btn-primary" : "btn-outline"}`}
                onClick={() => { setStatusFilter(f.value); setPage(1); }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 테이블 */}
        <div className="card" style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>로딩 중...</div>
          ) : payments.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>결제 내역이 없습니다</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>회원</th>
                  <th>결제수단</th>
                  <th style={{ textAlign: "right" }}>금액</th>
                  <th>거래ID</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(p.created_at)}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{p.user_name}</div>
                      <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{p.user_email}</div>
                    </td>
                    <td>{methodLabel(p.method)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{formatAmount(p.amount)}</td>
                    <td>
                      <span style={{ fontSize: 11, color: "var(--gray-500)", fontFamily: "monospace" }}>
                        {p.transaction_id ? p.transaction_id.slice(0, 20) + "..." : "-"}
                      </span>
                    </td>
                    <td><StatusBadge status={p.status} /></td>
                    <td>
                      {p.status === "completed" && (
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                          onClick={() => handleRefund(p.id)}
                        >
                          환불
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-outline btn-sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              이전
            </button>
            <span style={{ lineHeight: "32px", fontSize: 13 }}>{page} / {totalPages}</span>
            <button
              className="btn btn-outline btn-sm"
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              다음
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
