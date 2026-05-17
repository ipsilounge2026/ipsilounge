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
    <div className="lp lp-app">
      <Navbar />
      <div className="lp-app-body">
        <section className="lp-app-hero">
          <p className="lp-auth-eyebrow">Admission news</p>
          <h1 className="lp-auth-title">입시 뉴스<span style={{ color: "var(--lp-teal)" }}>.</span></h1>
          <p className="lp-auth-sub">입시라운지 네이버 블로그의 최신 입시 정보를 모아 보세요.</p>
          <div style={{ marginTop: 24 }}>
            <a
              href={BLOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-btn lp-btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", whiteSpace: "nowrap" }}
            >
              입시라운지 네이버 블로그 바로가기 →
            </a>
          </div>
        </section>
        <BlogNewsSection limit={20} compact={false} />
      </div>
      <Footer />
    </div>
  );
}
