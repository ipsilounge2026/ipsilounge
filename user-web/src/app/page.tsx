"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isLoggedIn, getMemberType, logout } from "@/lib/auth";
import { fetchBlogNews, type BlogNewsItem } from "@/lib/api";

const BLOG_URL = "https://blog.naver.com/consultinggogo";

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

const CARD_ICONS: Record<string, React.ReactNode> = {
  doc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" />
    </svg>
  ),
};

function fmtDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

export default function LandingPage() {
  const router = useRouter();
  const loggedIn = isLoggedIn();
  const memberType = getMemberType();

  const [news, setNews] = useState<BlogNewsItem[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBlogNews(5)
      .then((r) => { if (!cancelled) setNews(r.items.slice(0, 5)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setNewsLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // branch_manager는 렌더링하지 않고 바로 리다이렉트
  if (loggedIn && memberType === "branch_manager") {
    router.replace("/seminar");
    return <div style={{ padding: 40, textAlign: "center" }}>설명회 페이지로 이동 중...</div>;
  }

  const cards = [
    { key: "doc", num: "01", title: "학생부 라운지", href: loggedIn ? "/analysis?type=학생부라운지" : "/login",
      desc: "학생부 PDF를 업로드하면 내신, 세특, 창체, 행특을 종합 분석한 리포트를 받아볼 수 있습니다" },
    { key: "target", num: "02", title: "학종 라운지", href: loggedIn ? "/analysis?type=학종라운지" : "/login",
      desc: "희망 지원 대학과 학과를 지정하면 입결 비교, 교과 이수 충실도까지 포함된 맞춤 리포트를 제공합니다" },
    { key: "chat", num: "03", title: "상담 라운지", href: loggedIn ? "/consultation" : "/login",
      desc: "리포트를 기반으로 전문가와 1:1 상담을 통해 구체적인 입시 전략을 세울 수 있습니다" },
  ];

  return (
    <div className="lp">
      {/* 헤더 */}
      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <Link href="/" className="lp-logo">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" /></svg>
            입시라운지
          </Link>
          <nav className="lp-nav">
            <Link href="/news">입시 뉴스</Link>
            {loggedIn ? (
              <>
                <span className="lp-divider" />
                <Link href="/mypage" className="lp-nav-hide">마이페이지</Link>
                <button onClick={logout} className="lp-btn lp-btn-ghost" style={{ cursor: "pointer", font: "inherit" }}>로그아웃</button>
              </>
            ) : (
              <>
                <Link href="/login">로그인</Link>
                <span className="lp-divider" />
                <Link href="/register" className="lp-btn lp-btn-primary">회원가입 <Arrow /></Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* 히어로 */}
      <section className="lp-hero">
        <div className="lp-wrap">
          <h1>
            학생부 분석,
            <span className="lp-em">이제 쉽게.</span>
          </h1>
          <p>전문가가 직접 분석한 학생부 경쟁력 리포트를 받아보세요.</p>
        </div>
        <div className="lp-hero-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" /></svg>
        </div>
      </section>

      {/* 기능 카드 3종 */}
      <section className="lp-features">
        <div className="lp-wrap lp-features-grid">
          {cards.map((c) => (
            <Link key={c.key} href={c.href} className="lp-card">
              <span className="lp-card-num">{c.num}</span>
              <div className="lp-card-icon">{CARD_ICONS[c.key]}</div>
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 입시 뉴스 */}
      <section className="lp-news">
        <div className="lp-wrap">
          <div className="lp-news-head">
            <h2>입시 뉴스</h2>
            <Link href="/news" className="lp-news-all">전체보기 <Arrow /></Link>
          </div>
          <div className="lp-news-list">
            {!newsLoaded && <div className="lp-news-empty">불러오는 중...</div>}
            {newsLoaded && news.length === 0 && <div className="lp-news-empty">표시할 글이 없습니다.</div>}
            {news.map((it, i) => (
              <a key={`${it.link}-${i}`} href={it.link} target="_blank" rel="noopener noreferrer" className="lp-news-row">
                {it.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.thumbnail} alt="" className="lp-news-thumb" referrerPolicy="no-referrer" loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                )}
                <div className="lp-news-meta">
                  {it.category && <span className="lp-news-cat">{it.category}</span>}
                  <span className="lp-news-date">{fmtDate(it.published_at)}</span>
                </div>
                <div className="lp-news-title">{it.title}</div>
                <span className="lp-news-arrow"><Arrow /></span>
              </a>
            ))}
          </div>
          <a href={BLOG_URL} target="_blank" rel="noopener noreferrer" className="lp-news-blog">
            입시라운지 네이버 블로그 바로가기 →
          </a>
        </div>
      </section>

      {/* CTA (비로그인 시) */}
      {!loggedIn && (
        <section className="lp-cta">
          <div className="lp-wrap">
            <h2>
              지금 바로
              <span className="lp-em">시작해보세요.</span>
            </h2>
            <p>회원가입 후 학생부를 업로드하면 분석이 시작됩니다.</p>
            <div className="lp-cta-btns">
              <Link href="/login" className="lp-btn lp-btn-ghost" style={{ borderColor: "rgba(246,244,237,0.4)", color: "#F6F4ED" }}>로그인</Link>
              <Link href="/register" className="lp-btn lp-btn-cream">회원가입 <Arrow /></Link>
            </div>
          </div>
        </section>
      )}

      {/* 푸터 */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <Link href="/" className="lp-logo" style={{ fontSize: 17 }}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" /></svg>
            입시라운지
          </Link>
          <div className="lp-footer-links">
            <Link href="/terms">이용약관</Link>
            <Link href="/privacy">개인정보처리방침</Link>
          </div>
          <span className="lp-footer-copy">© 2026 입시라운지. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
