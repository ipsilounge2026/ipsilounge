"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { login } from "@/lib/api";

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
    <>
      <Navbar />
      <div className="auth-page">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>로그인</h1>
          <p>입시라운지에 오신 것을 환영합니다</p>

          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>이메일</label>
            <input type="email" className="form-control" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="이메일을 입력하세요" required />
          </div>
          <div className="form-group">
            <label>비밀번호</label>
            <input type="password" className="form-control" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호를 입력하세요" required />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, fontSize: 13 }}>
            <div style={{ display: "flex", gap: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "var(--gray-600)" }}>
                <input type="checkbox" checked={rememberEmail} onChange={(e) => setRememberEmail(e.target.checked)} />
                아이디 저장
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "var(--gray-600)" }}>
                <input type="checkbox" checked={keepLoggedIn} onChange={(e) => setKeepLoggedIn(e.target.checked)} />
                로그인 유지
              </label>
            </div>
            <Link href="/forgot-password" style={{ color: "var(--gray-500)", textDecoration: "none" }}>
              비밀번호 찾기
            </Link>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <div className="link-text">
            계정이 없으신가요? <Link href="/register">회원가입</Link>
          </div>
        </form>
      </div>
    </>
  );
}
