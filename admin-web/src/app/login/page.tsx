"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminLogin, getAdminMe } from "@/lib/api";
import { setAdminInfo } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await adminLogin(email, password);
      const me = await getAdminMe();
      setAdminInfo(me);
      router.push("/");
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

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
