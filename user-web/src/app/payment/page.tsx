"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { isLoggedIn } from "@/lib/auth";
import { preparePayment, getMyPayments } from "@/lib/api";

declare global {
  interface Window {
    TossPayments: (clientKey: string) => {
      payment: (opts: { customerKey: string }) => {
        requestPayment: (opts: {
          method: string;
          amount: { currency: string; value: number };
          orderId: string;
          orderName: string;
          successUrl: string;
          failUrl: string;
          customerEmail?: string;
          customerName?: string;
        }) => Promise<void>;
      };
    };
  }
}

const PRODUCTS = [
  {
    id: "analysis",
    name: "학생부 분석 서비스",
    price: 50000,
    description: "전문가가 직접 분석하는 맞춤형 학생부 컨설팅",
    features: ["7개 영역 루브릭 기반 상세 분석", "Excel + PDF 리포트 제공", "분석가 코멘트 포함"],
  },
  {
    id: "consultation",
    name: "1:1 입시 상담",
    price: 80000,
    description: "학생부 분석 결과를 토대로 한 60분 심층 상담",
    features: ["분석 결과 기반 맞춤 전략", "지원 대학/학과 추천", "면접·자소서 방향 안내"],
  },
];

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const preType = searchParams.get("type") as "analysis" | "consultation" | null;
  const preOrderId = searchParams.get("id");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadPaymentScript();
    getMyPayments().then((res) => setPayments(res.items)).catch(() => {});
  }, []);

  const loadPaymentScript = () => {
    if (document.getElementById("toss-payments-sdk")) return;
    const script = document.createElement("script");
    script.id = "toss-payments-sdk";
    script.src = "https://js.tosspayments.com/v2/standard";
    script.async = true;
    document.head.appendChild(script);
  };

  const handlePay = async (product: typeof PRODUCTS[0]) => {
    setLoading(true);
    setMessage("");
    try {
      const userEmail = localStorage.getItem("user_email") || "";
      const readyRes = await preparePayment({
        order_type: product.id as "analysis" | "consultation",
        order_id: preOrderId || "00000000-0000-0000-0000-000000000000",
        amount: product.price,
      });
      if (!window.TossPayments) {
        setMessage("결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
        setLoading(false);
        return;
      }
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "";
      const tossPayments = window.TossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey: userEmail || readyRes.payment_id });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: product.price },
        orderId: readyRes.order_id,
        orderName: product.name,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
        customerEmail: userEmail,
      });
    } catch (err: any) {
      if (err?.code !== "USER_CANCEL") {
        setMessage(err?.message || "결제 처리 중 오류가 발생했습니다");
      }
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => price.toLocaleString("ko-KR") + "원";
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ko-KR");

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="page-header"><h1>결제</h1></div>
        {message && (
          <div style={{ padding: "12px 16px", background: "#fee2e2", borderRadius: 8, marginBottom: 16, fontSize: 14, color: "#991b1b" }}>
            {message}
          </div>
        )}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>서비스 선택</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {PRODUCTS.map((product) => (
              <div key={product.id} className="card" style={{ borderTop: "3px solid var(--primary)" }}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{product.name}</div>
                  <div style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 12 }}>{product.description}</div>
                  <ul style={{ paddingLeft: 16, margin: "0 0 16px", fontSize: 13, color: "var(--gray-700)" }}>
                    {product.features.map((f, i) => <li key={i} style={{ marginBottom: 4 }}>{f}</li>)}
                  </ul>
                </div>
                <div style={{ borderTop: "1px solid var(--gray-100)", paddingTop: 12 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--primary)", marginBottom: 12 }}>
                    {formatPrice(product.price)}
                  </div>
                  <button className="btn btn-primary btn-block" onClick={() => handlePay(product)} disabled={loading}>
                    {loading ? "처리 중..." : "결제하기"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ marginBottom: 32, background: "var(--gray-50)", fontSize: 13, color: "var(--gray-700)" }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>결제 안내</p>
          <ul style={{ paddingLeft: 16, lineHeight: 1.8 }}>
            <li>결제 후 영업일 기준 2~3일 내에 분석이 완료됩니다</li>
            <li>분석 완료 시 앱 및 이메일로 알림을 드립니다</li>
            <li>결제 취소는 분석 시작 전까지 가능합니다</li>
            <li>문의: support@ipsilounge.com</li>
          </ul>
        </div>
        {payments.length > 0 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>결제 내역</h2>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--gray-50)" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--gray-200)" }}>날짜</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--gray-200)" }}>수단</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--gray-200)" }}>금액</th>
                    <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--gray-200)" }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--gray-100)" }}>
                      <td style={{ padding: "10px 16px" }}>{formatDate(p.created_at)}</td>
                      <td style={{ padding: "10px 16px" }}>{p.method === "toss" ? "카드" : "인앱결제"}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right" }}>{p.amount.toLocaleString()}원</td>
                      <td style={{ padding: "10px 16px", textAlign: "center" }}><PaymentStatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}

export default function PaymentPage() {
  return (
    <Suspense>
      <PaymentContent />
    </Suspense>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; color: string; bg: string }> = {
    pending:   { label: "대기중", color: "#92400e", bg: "#fef3c7" },
    completed: { label: "완료",   color: "#065f46", bg: "#d1fae5" },
    refunded:  { label: "환불됨", color: "#1e40af", bg: "#dbeafe" },
    failed:    { label: "실패",   color: "#991b1b", bg: "#fee2e2" },
  };
  const c = configs[status] || { label: status, color: "#374151", bg: "#f3f4f6" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 12, fontWeight: 500, color: c.color, background: c.bg }}>
      {c.label}
    </span>
  );
}
