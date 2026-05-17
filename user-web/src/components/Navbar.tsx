"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { isLoggedIn, logout, getMemberType } from "@/lib/auth";
import NoticeBanner from "@/components/NoticeBanner";
import Logo from "@/components/Logo";

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function NavbarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const loggedIn = isLoggedIn();
  const memberType = getMemberType();
  const currentType = searchParams.get("type") || "";

  const cls = (active: boolean) => (active ? "active" : "");

  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <Link href="/" className="lp-logo"><Logo size={26} />입시라운지</Link>
          <nav className="lp-nav">
            {loggedIn ? (
              <>
                {memberType !== "branch_manager" && (
                  <>
                    <Link href="/analysis?type=학생부라운지" className={cls(pathname.startsWith("/analysis") && currentType === "학생부라운지")}>학생부 라운지</Link>
                    <Link href="/analysis?type=학종라운지" className={cls(pathname.startsWith("/analysis") && currentType === "학종라운지")}>학종 라운지</Link>
                    <Link href="/consultation" className={cls(pathname.startsWith("/consultation"))}>상담 라운지</Link>
                    <Link href="/news" className={cls(pathname.startsWith("/news"))}>입시 뉴스</Link>
                  </>
                )}
                {memberType === "branch_manager" && (
                  <Link href="/seminar" className={cls(pathname.startsWith("/seminar"))}>설명회</Link>
                )}
                <Link href="/mypage" className={cls(pathname.startsWith("/mypage"))}>마이페이지</Link>
                <span className="lp-divider" />
                <button onClick={logout} className="lp-btn lp-btn-ghost" style={{ cursor: "pointer", font: "inherit" }}>로그아웃</button>
              </>
            ) : (
              <>
                <Link href="/news" className={cls(pathname.startsWith("/news"))}>입시 뉴스</Link>
                <Link href="/login">로그인</Link>
                <span className="lp-divider" />
                <Link href="/register" className="lp-btn lp-btn-primary">회원가입 <Arrow /></Link>
              </>
            )}
          </nav>
        </div>
      </header>
      {loggedIn && <NoticeBanner />}
    </div>
  );
}

export default function Navbar() {
  return (
    <Suspense fallback={
      <div className="lp">
        <header className="lp-header">
          <div className="lp-wrap lp-header-inner">
            <span className="lp-logo"><Logo size={26} />입시라운지</span>
            <nav className="lp-nav" />
          </div>
        </header>
      </div>
    }>
      <NavbarInner />
    </Suspense>
  );
}
