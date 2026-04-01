"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { register, login } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    phone: "",
    member_type: "student" as "student" | "parent",
    student_name: "",
    student_birth: "",
  });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeAll, setAgreeAll] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAgreeAll = (checked: boolean) => {
    setAgreeAll(checked);
    setAgreeTerms(checked);
    setAgreePrivacy(checked);
  };

  const handleIndividualAgree = (type: "terms" | "privacy", checked: boolean) => {
    if (type === "terms") {
      setAgreeTerms(checked);
      setAgreeAll(checked && agreePrivacy);
    } else {
      setAgreePrivacy(checked);
      setAgreeAll(agreeTerms && checked);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!agreeTerms || !agreePrivacy) {
      setError("필수 약관에 모두 동의해주세요");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다");
      return;
    }
    if (form.password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다");
      return;
    }
    if (form.member_type === "parent" && (!form.student_name || !form.student_birth)) {
      setError("학부모 회원은 자녀 이름과 생년월일을 입력해주세요");
      return;
    }

    setLoading(true);
    try {
      await register(
        form.email,
        form.password,
        form.name,
        form.phone || undefined,
        form.member_type,
        form.member_type === "parent" ? form.student_name || undefined : undefined,
        form.member_type === "parent" ? form.student_birth || undefined : undefined,
      );
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

          {/* 회원 유형 선택 */}
          <div className="form-group">
            <label>회원 유형</label>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => update("member_type", "student")}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  border: form.member_type === "student" ? "2px solid #2563eb" : "2px solid #e5e7eb",
                  borderRadius: 8,
                  backgroundColor: form.member_type === "student" ? "#eff6ff" : "#fff",
                  color: form.member_type === "student" ? "#2563eb" : "#374151",
                  fontWeight: form.member_type === "student" ? 600 : 400,
                  cursor: "pointer",
                  fontSize: 14,
                  transition: "all 0.2s",
                }}
              >
                학생
              </button>
              <button
                type="button"
                onClick={() => update("member_type", "parent")}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  border: form.member_type === "parent" ? "2px solid #2563eb" : "2px solid #e5e7eb",
                  borderRadius: 8,
                  backgroundColor: form.member_type === "parent" ? "#eff6ff" : "#fff",
                  color: form.member_type === "parent" ? "#2563eb" : "#374151",
                  fontWeight: form.member_type === "parent" ? 600 : 400,
                  cursor: "pointer",
                  fontSize: 14,
                  transition: "all 0.2s",
                }}
              >
                학부모
              </button>
            </div>
          </div>

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

          {/* 학부모 추가 정보 */}
          {form.member_type === "parent" && (
            <div style={{
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}>
              <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
                학부모 회원은 자녀 정보를 입력해주세요
              </p>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>자녀 이름</label>
                <input type="text" className="form-control" value={form.student_name}
                  onChange={(e) => update("student_name", e.target.value)} placeholder="자녀 이름을 입력하세요" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>자녀 생년월일</label>
                <input type="date" className="form-control" value={form.student_birth}
                  onChange={(e) => update("student_birth", e.target.value)} />
              </div>
            </div>
          )}

          {/* 약관 동의 */}
          <div style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}>
            {/* 전체 동의 */}
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              paddingBottom: 12,
              borderBottom: "1px solid #e5e7eb",
              marginBottom: 12,
              fontWeight: 600,
              fontSize: 15,
            }}>
              <input
                type="checkbox"
                checked={agreeAll}
                onChange={(e) => handleAgreeAll(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#2563eb" }}
              />
              전체 동의
            </label>

            {/* 이용약관 */}
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              marginBottom: 8,
              fontSize: 14,
              color: "#374151",
            }}>
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => handleIndividualAgree("terms", e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#2563eb" }}
              />
              <span>[필수] 이용약관에 동의합니다</span>
              <Link href="/terms" target="_blank" style={{
                marginLeft: "auto",
                fontSize: 12,
                color: "#6b7280",
                textDecoration: "underline",
              }}>
                보기
              </Link>
            </label>

            {/* 개인정보처리방침 */}
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              fontSize: 14,
              color: "#374151",
            }}>
              <input
                type="checkbox"
                checked={agreePrivacy}
                onChange={(e) => handleIndividualAgree("privacy", e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#2563eb" }}
              />
              <span>[필수] 개인정보처리방침에 동의합니다</span>
              <Link href="/privacy" target="_blank" style={{
                marginLeft: "auto",
                fontSize: 12,
                color: "#6b7280",
                textDecoration: "underline",
              }}>
                보기
              </Link>
            </label>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading || !agreeTerms || !agreePrivacy}>
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
