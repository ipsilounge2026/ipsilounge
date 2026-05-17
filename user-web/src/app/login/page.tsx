"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/api";

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
function Pin() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" /></svg>;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("saved_email");
    if (saved) {
      setEmail(saved);
      setRememberEmail(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      if (rememberEmail) {
        localStorage.setItem("saved_email", email);
      } else {
        localStorage.removeItem("saved_email");
      }
      if (keepLoggedIn) {
        localStorage.setItem("keep_logged_in", "true");
      } else {
        localStorage.removeItem("keep_logged_in");
      }
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp lp-auth">
      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <Link href="/" className="lp-logo"><Pin />입시라운지</Link>
          <nav className="lp-nav">
            <Link href="/news">입시 뉴스</Link>
            <Link href="/login">로그인</Link>
            <span className="lp-divider" />
            <Link href="/register" className="lp-btn lp-btn-primary">회원가입 <Arrow /></Link>
          </nav>
        </div>
      </header>

      <main className="lp-auth-body">
        <div className="lp-auth-grid">
          {/* 좌측 인트로 */}
          <section className="lp-auth-intro">
            <p className="lp-auth-eyebrow">Welcome back</p>
            <h1 className="lp-auth-title">
              로그인.
              <span className="lp-en">Sign in.</span>
            </h1>
            <p className="lp-auth-sub">입시라운지에 오신 것을 환영합니다.</p>
          </section>

          <div className="lp-auth-divider" aria-hidden="true" />

          {/* 우측 폼 */}
          <section className="lp-auth-form">
            <form onSubmit={handleSubmit}>
              <div className="lp-sec-mark">
                <span className="sec-no">01</span>
              </div>
              <h2 className="lp-sec-title">계정 정보를 입력하세요</h2>

              {error && <div className="lp-auth-error">{error}</div>}

              <div className="lp-field">
                <label htmlFor="login-email">EMAIL<span className="ko">· 이메일</span></label>
                <input id="login-email" name="email" aria-label="이메일" autoComplete="email" type="email" className="lp-input" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="이메일을 입력하세요" required />
              </div>

              <div className="lp-field">
                <label htmlFor="login-password">PASSWORD<span className="ko">· 비밀번호</span></label>
                <Link href="/forgot-password" className="lp-field-link">비밀번호 찾기 →</Link>
                <input id="login-password" name="password" aria-label="비밀번호" autoComplete="current-password" type="password" className="lp-input" value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호를 입력하세요" required />
              </div>

              <div className="lp-checkrow">
                <label className="lp-check">
                  <input type="checkbox" checked={rememberEmail} onChange={(e) => setRememberEmail(e.target.checked)} />
                  아이디 저장
                </label>
                <label className="lp-check">
                  <input type="checkbox" checked={keepLoggedIn} onChange={(e) => setKeepLoggedIn(e.target.checked)} />
                  로그인 유지
                </label>
              </div>

              <button type="submit" className="lp-auth-submit" disabled={loading}>
                {loading ? "로그인 중..." : <>로그인 <Arrow /></>}
              </button>

              <div className="lp-auth-foot">
                계정이 없으신가요? <Link href="/register">회원가입 →</Link>
              </div>
            </form>
          </section>
        </div>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <Link href="/" className="lp-logo" style={{ fontSize: 17 }}><Pin />입시라운지</Link>
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
