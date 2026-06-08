"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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

/** 입시라운지 드롭다운 (입시 뉴스 + 대학모집요강) */
function IpsiLoungeMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const isActive = pathname.startsWith("/news") || pathname.startsWith("/university-guide");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={isActive ? "active" : ""}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          font: "inherit",
          padding: 0,
          color: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        입시라운지
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 160,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            padding: "6px 0",
            zIndex: 50,
          }}
        >
          <Link
            href="/news"
            onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 16px", color: pathname.startsWith("/news") ? "#0B1F3F" : "#374151", fontWeight: pathname.startsWith("/news") ? 700 : 500, textDecoration: "none", fontSize: 14 }}
          >
            입시 뉴스
          </Link>
          <Link
            href="/university-guide"
            onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 16px", color: pathname.startsWith("/university-guide") ? "#0B1F3F" : "#374151", fontWeight: pathname.startsWith("/university-guide") ? 700 : 500, textDecoration: "none", fontSize: 14 }}
          >
            대학모집요강
          </Link>
        </div>
      )}
    </div>
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
                    <IpsiLoungeMenu pathname={pathname} />
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
                <IpsiLoungeMenu pathname={pathname} />
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
