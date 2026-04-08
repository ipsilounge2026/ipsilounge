"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("요청이 너무 많습니다. 1시간 후 다시 시도해주세요.");
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "요청에 실패했습니다.");
      }
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow p-8 w-full max-w-md text-center">
          <div className="text-4xl mb-4">📧</div>
          <h1 className="text-2xl font-bold mb-2">이메일을 확인하세요</h1>
          <p className="text-gray-600">
            입력하신 이메일로 비밀번호 재설정 링크를 발송했습니다.
            <br />
            메일함을 확인해주세요.
          </p>
          <a href="/login" className="mt-6 inline-block text-blue-600 hover:underline">
            로그인으로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2">비밀번호 찾기</h1>
        <p className="text-gray-500 text-sm mb-6">
          가입하신 이메일 주소를 입력하시면 비밀번호 재설정 링크를 보내드립니다.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="example@email.com"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "전송 중..." : "재설정 링크 받기"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <a href="/login" className="text-sm text-gray-500 hover:underline">
            로그인으로 돌아가기
          </a>
        </div>
      </div>
    </div>
  );
}
