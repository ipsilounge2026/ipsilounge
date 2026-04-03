"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { isLoggedIn, getMemberType } from "@/lib/auth";

export default function LandingPage() {
  const router = useRouter();
  const loggedIn = isLoggedIn();
  const memberType = getMemberType();

  useEffect(() => {
    if (loggedIn && memberType === "branch_manager") {
      router.replace("/seminar");
    }
  }, [loggedIn, memberType, router]);

  return (
    <>
      <Navbar />
      <div className="container">
        <div className="hero">
          <h1>학생부 분석, 이제 쉽게</h1>
          <p>전문가가 직접 분석한 학생부 경쟁력 리포트를 받아보세요</p>
          {loggedIn ? (
            <Link href="/analysis" className="btn">내 분석 보기</Link>
          ) : (
            <Link href="/register" className="btn">무료로 시작하기</Link>
          )}
        </div>

        <div className="features-grid">
          <Link href={loggedIn ? "/analysis?type=학생부라운지" : "/login"} className="feature-card" style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}>
            <div className="icon">📄</div>
            <h3>학생부 라운지</h3>
            <p>학생부 PDF를 업로드하면 내신, 세특, 창체, 행특을 종합 분석한 리포트를 받아볼 수 있습니다</p>
          </Link>
          <Link href={loggedIn ? "/analysis?type=학종라운지" : "/login"} className="feature-card" style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}>
            <div className="icon">📊</div>
            <h3>학종 라운지</h3>
            <p>지원 대학과 학과를 지정하면 입결 비교, 교과 이수 충실도까지 포함된 맞춤 리포트를 제공합니다</p>
          </Link>
          <Link href={loggedIn ? "/consultation" : "/login"} className="feature-card" style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}>
            <div className="icon">💬</div>
            <h3>상담 라운지</h3>
            <p>리포트를 기반으로 전문가와 1:1 상담을 통해 구체적인 입시 전략을 세울 수 있습니다</p>
          </Link>
        </div>

        {!loggedIn && (
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12 }}>지금 바로 시작해보세요</h2>
            <p style={{ color: "var(--gray-600)", marginBottom: 20 }}>회원가입 후 학생부를 업로드하면 분석이 시작됩니다</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Link href="/register" className="btn btn-primary btn-lg">회원가입</Link>
              <Link href="/login" className="btn btn-lg" style={{ border: "1px solid var(--gray-300)", backgroundColor: "white", color: "var(--gray-700)" }}>로그인</Link>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
