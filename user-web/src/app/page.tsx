"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <div className="container">
        <div className="hero">
          <h1>학생부 분석, 이제 쉽게</h1>
          <p>전문가가 직접 분석한 학생부 경쟁력 리포트를 받아보세요</p>
          <Link href="/register" className="btn">무료로 시작하기</Link>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="icon">📄</div>
            <h3>학생부 분석</h3>
            <p>학생부 PDF를 업로드하면 내신, 세특, 창체, 행특을 종합 분석한 리포트를 받아볼 수 있습니다</p>
          </div>
          <div className="feature-card">
            <div className="icon">📊</div>
            <h3>맞춤 리포트</h3>
            <p>지원 대학과 학과를 지정하면 입결 비교, 교과 이수 충실도까지 포함된 맞춤 리포트를 제공합니다</p>
          </div>
          <div className="feature-card">
            <div className="icon">💬</div>
            <h3>1:1 상담</h3>
            <p>리포트를 기반으로 전문가와 1:1 상담을 통해 구체적인 입시 전략을 세울 수 있습니다</p>
          </div>
        </div>

        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>지금 바로 시작해보세요</h2>
          <p style={{ color: "var(--gray-600)", marginBottom: 20 }}>회원가입 후 학생부를 업로드하면 분석이 시작됩니다</p>
          <Link href="/register" className="btn btn-primary btn-lg">회원가입</Link>
        </div>
      </div>
      <Footer />
    </>
  );
}
