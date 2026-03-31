"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { confirmTossPayment } from "@/lib/api";

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const paymentKey = searchParams.get("paymentKey");
    const orderId = searchParams.get("orderId");
    const amount = searchParams.get("amount");

    if (!paymentKey || !orderId || !amount) {
      setStatus("error");
      setErrorMessage("결제 정보가 올바르지 않습니다.");
      return;
    }

    confirmTossPayment({
      payment_key: paymentKey,
      order_id: orderId,
      amount: parseInt(amount),
    })
      .then(() => setStatus("success"))
      .catch((err: any) => {
        setStatus("error");
        setErrorMessage(err.message || "결제 확인 중 오류가 발생했습니다.");
      });
  }, []);

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 480 }}>
        <div className="card" style={{ textAlign: "center", padding: "60px 32px" }}>
          {status === "loading" && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
              <h1 style={{ fontSize: 20, marginBottom: 8 }}>결제 확인 중...</h1>
              <p style={{ fontSize: 14, color: "var(--gray-500)" }}>잠시만 기다려주세요</p>
            </>
          )}
          {status === "success" && (
            <>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                background: "#d1fae5", display: "flex", alignItems: "center",
                justifyContent: "center", margin: "0 auto 20px", fontSize: 32,
              }}>✓</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>결제가 완료되었습니다!</h1>
              <p style={{ fontSize: 14, color: "var(--gray-600)", marginBottom: 32 }}>
                분석 완료 시 앱 알림과 이메일로 안내드립니다.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn btn-primary" onClick={() => router.push("/analysis")}>
                  내 분석 목록 보기
                </button>
                <button className="btn btn-outline" onClick={() => router.push("/")}>
                  홈으로
                </button>
              </div>
            </>
          )}
          {status === "error" && (
            <>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                background: "#fee2e2", display: "flex", alignItems: "center",
                justifyContent: "center", margin: "0 auto 20px", fontSize: 32,
              }}>✗</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>결제 확인 실패</h1>
              <p style={{ fontSize: 14, color: "var(--gray-600)", marginBottom: 8 }}>{errorMessage}</p>
              <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 32 }}>
                문제가 지속되면 support@ipsilounge.com으로 문의해주세요.
              </p>
              <button className="btn btn-primary" onClick={() => router.push("/payment")}>
                결제 페이지로 돌아가기
              </button>
            </>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense>
      <PaymentSuccessContent />
    </Suspense>
  );
}
