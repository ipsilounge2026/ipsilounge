"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BlogNewsSection from "@/components/BlogNewsSection";

/**
 * 입시 뉴스 전체 목록 페이지.
 * - 네이버 블로그(consultinggogo) 의 최근 20건 노출.
 * - 본문 클릭 시 새 탭으로 블로그 글 열기 → 우리 탭은 그대로 유지 (이탈 방지).
 */
export default function NewsPage() {
  return (
    <>
      <Navbar />
      <div className="container">
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "16px 0 4px" }}>입시 뉴스</h1>
          <p style={{ color: "var(--gray-600)", margin: 0 }}>
            입시라운지 네이버 블로그의 최신 입시 정보를 모아 보세요.
          </p>
        </div>
        <BlogNewsSection limit={20} compact={false} />
      </div>
      <Footer />
    </>
  );
}
