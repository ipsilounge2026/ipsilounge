"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { isLoggedIn, logout, getMemberType } from "@/lib/auth";
import NoticeBanner from "@/components/NoticeBanner";

function NavbarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const loggedIn = isLoggedIn();
  const memberType = getMemberType();
  const currentType = searchParams.get("type") || "";

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <Link href="/" className="navbar-logo">입시라운지</Link>
          <div className="navbar-menu">
            {loggedIn ? (
              <>
                {memberType !== "branch_manager" && (
                  <>
                    <Link href="/analysis?type=학생부라운지" className={pathname.startsWith("/analysis") && currentType === "학생부라운지" ? "active" : ""}>학생부 라운지</Link>
                    <Link href="/analysis?type=학종라운지" className={pathname.startsWith("/analysis") && currentType === "학종라운지" ? "active" : ""}>학종 라운지</Link>
                    <Link href="/consultation" className={pathname.startsWith("/consultation") ? "active" : ""}>상담 라운지</Link>
                    <Link href="/admission-info" className={pathname.startsWith("/admission-info") ? "active" : ""}>대입 정보</Link>
                  </>
                )}
                {memberType === "branch_manager" && (
                  <Link href="/seminar" className={pathname.startsWith("/seminar") ? "active" : ""}>설명회</Link>
                )}
                <Link href="/mypage" className={pathname.startsWith("/mypage") ? "active" : ""}>마이페이지</Link>
                <button onClick={logout}>로그아웃</button>
              </>
            ) : (
              <>
                <Link href="/login">로그인</Link>
                <Link href="/register" className="btn btn-primary btn-sm">회원가입</Link>
              </>
            )}
          </div>
        </div>
      </nav>
      {loggedIn && <NoticeBanner />}
    </>
  );
}

export default function Navbar() {
  return (
    <Suspense fallback={
      <>
        <nav className="navbar">
          <div className="navbar-inner">
            <span className="navbar-logo">입시라운지</span>
            <div className="navbar-menu"></div>
          </div>
        </nav>
      </>
    }>
      <NavbarInner />
    </Suspense>
  );
}
