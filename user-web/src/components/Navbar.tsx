"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isLoggedIn, logout } from "@/lib/auth";

export default function Navbar() {
  const pathname = usePathname();
  const loggedIn = isLoggedIn();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="navbar-logo">입시라운지</Link>
        <div className="navbar-menu">
          {loggedIn ? (
            <>
              <Link href="/analysis" className={pathname.startsWith("/analysis") ? "active" : ""}>학생부 분석</Link>
              <Link href="/consultation" className={pathname.startsWith("/consultation") ? "active" : ""}>상담 예약</Link>
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
  );
}
