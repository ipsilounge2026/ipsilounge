"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { register, login } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", passwordConfirm: "", name: "", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다");
      return;
    }
    if (form.password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다");
      return;
    }

    setLoading(true);
    try {
      await register(form.email, form.password, form.name, form.phone || undefined);
      await login(form.email, form.password);
      router.push("/analysis");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm({ ...form, [field]: value });

  return (
    <>
      <Navbar />
      <div className="auth-page">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>회원가입</h1>
          <p>입시라운지에 가입하고 학생부 분석을 시작하세요</p>

          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>이름</label>
            <input type="text" className="form-control" value={form.name}
              onChange={(e) => update("name", e.target.value)} placeholder="이름을 입력하세요" required />
          </div>
          <div className="form-group">
            <label>이메일</label>
            <input type="email" className="form-control" value={form.email}
              onChange={(e) => update("email", e.target.value)} placeholder="이메일을 입력하세요" required />
          </div>
          <div className="form-group">
            <label>비밀번호</label>
            <input type="password" className="form-control" value={form.password}
              onChange={(e) => update("password", e.target.value)} placeholder="6자 이상" required />
          </div>
          <div className="form-group">
            <label>비밀번호 확인</label>
            <input type="password" className="form-control" value={form.passwordConfirm}
              onChange={(e) => update("passwordConfirm", e.target.value)} placeholder="비밀번호를 다시 입력하세요" required />
          </div>
          <div className="form-group">
            <label>연락처 (선택)</label>
            <input type="tel" className="form-control" value={form.phone}
              onChange={(e) => update("phone", e.target.value)} placeholder="010-0000-0000" />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "가입 중..." : "회원가입"}
          </button>

          <div className="link-text">
            이미 계정이 있으신가요? <Link href="/login">로그인</Link>
          </div>
        </form>
      </div>
    </>
  );
}
