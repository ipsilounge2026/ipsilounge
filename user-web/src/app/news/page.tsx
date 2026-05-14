"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BlogNewsSection from "@/components/BlogNewsSection";

/**
 * 입시 뉴스 전체 목록 페이지.
 * - 네이버 블로그(consultinggogo) 의 최근 20건 노출.
 * - 본문 클릭 시 새 탭으로 블로그 글 열기 → 우리 탭은 그대로 유지 (이탈 방지).
 */
const BLOG_URL = "https://blog.naver.com/consultinggogo";

export default function NewsPage() {
  return (
    <>
      <Navbar />
      <div className="container">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: "16px 0 4px" }}>입시 뉴스</h1>
            <p style={{ color: "var(--gray-600)", margin: 0 }}>
              입시라운지 네이버 블로그의 최신 입시 정보를 모아 보세요.
            </p>
          </div>
          <a
            href={BLOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{
              marginTop: 20,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            입시라운지 네이버 블로그 바로가기 →
          </a>
        </div>
        <BlogNewsSection limit={20} compact={false} />
      </div>
      <Footer />
    </>
  );
}
