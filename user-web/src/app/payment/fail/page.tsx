"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function PaymentFailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const errorCode = searchParams.get("code");
  const errorMessage = searchParams.get("message");

  const isUserCancel = errorCode === "PAY_PROCESS_CANCELED";

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 480 }}>
        <div className="card" style={{ textAlign: "center", padding: "60px 32px" }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: isUserCancel ? "#f3f4f6" : "#fee2e2",
            display: "flex", alignItems: "center",
            justifyContent: "center", margin: "0 auto 20px", fontSize: 32,
          }}>
            {isUserCancel ? "🚫" : "✗"}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            {isUserCancel ? "결제를 취소하셨습니다" : "결제에 실패했습니다"}
          </h1>
          {!isUserCancel && errorMessage && (
            <p style={{ fontSize: 14, color: "var(--gray-600)", marginBottom: 8 }}>
              {errorMessage}
            </p>
          )}
          <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 32 }}>
            {isUserCancel
              ? "언제든지 다시 결제를 진행하실 수 있습니다."
              : "카드 정보를 확인하시거나 다른 결제 수단을 이용해주세요."}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => router.push("/payment")}>
              다시 시도하기
            </button>
            <button className="btn btn-outline" onClick={() => router.push("/")}>
              홈으로
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
