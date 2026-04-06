"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminLogin, getAdminMe } from "@/lib/api";
import { setAdminInfo, getDefaultRoute } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem("admin_saved_email");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberEmail(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await adminLogin(email, password);
      const me = await getAdminMe();
      setAdminInfo(me);

      // 아이디 저장
      if (rememberEmail) {
        localStorage.setItem("admin_saved_email", email);
      } else {
        localStorage.removeItem("admin_saved_email");
      }

      // 로그인 유지
      if (keepLoggedIn) {
        localStorage.setItem("admin_keep_logged_in", "true");
        localStorage.setItem("admin_keep_cred", btoa(password));
      } else {
        localStorage.removeItem("admin_keep_logged_in");
        localStorage.removeItem("admin_keep_cred");
      }

      router.push(getDefaultRoute());
    } catch (err: any) {
      setError(err.message || "로그인에 실패했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>입시라운지</h1>
        <p>관리자 로그인</p>

        {error && <div className="error-msg">{error}</div>}

        <div className="form-group">
          <label>이메일</label>
          <input
            type="email"
            className="form-control"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@ipsilounge.com"
            required
          />
        </div>

        <div className="form-group">
          <label>비밀번호</label>
          <input
            type="password"
            className="form-control"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호를 입력하세요"
            required
          />
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6B7280", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={rememberEmail}
              onChange={(e) => setRememberEmail(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            아이디 저장
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6B7280", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={keepLoggedIn}
              onChange={(e) => setKeepLoggedIn(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            로그인 유지
          </label>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
