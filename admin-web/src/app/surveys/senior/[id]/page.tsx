"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSeniorPreSurvey } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface SeniorPreSurveyDetail {
  id: string;
  user_id: string;
  booking_id: string | null;
  session_number: number;
  session_timing: string | null;
  status: string;
  answers: Record<string, any>;
  submitted_at: string | null;
  created_at: string | null;
}

const statusLabel: Record<string, string> = {
  draft: "작성 중",
  submitted: "제출 완료",
};

const statusBadge: Record<string, string> = {
  draft: "#F59E0B",
  submitted: "#10B981",
};

export default function SeniorPreSurveyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const surveyId = params.id as string;

  const [data, setData] = useState<SeniorPreSurveyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    load();
  }, [surveyId]);

  const load = async () => {
    try {
      const res = await getSeniorPreSurvey(surveyId);
      setData(res);
    } catch {
      setError("설문을 불러올 수 없습니다");
    } finally {
      setLoading(false);
    }
  };

  const sectionStyle = { background: "white", border: "1px solid #E5E7EB", borderRadius: 8, padding: 20, marginBottom: 16 };

  if (loading) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>로딩 중...</div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>{error || "설문을 찾을 수 없습니다"}</div>
        </main>
      </div>
    );
  }

  const answerEntries = Object.entries(data.answers || {});

  const renderAnswer = (value: any): React.ReactNode => {
    if (value === null || value === undefined || value === "") return <span style={{ color: "#9CA3AF" }}>미응답</span>;
    if (Array.isArray(value)) {
      if (value.length === 0) return <span style={{ color: "#9CA3AF" }}>미응답</span>;
      return (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {value.map((v, i) => (
            <li key={i} style={{ fontSize: 13 }}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</li>
          ))}
        </ul>
      );
    }
    if (typeof value === "object") {
      return (
        <pre style={{ fontSize: 12, background: "#F9FAFB", padding: 8, borderRadius: 4, overflow: "auto", margin: 0 }}>
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }
    return <span style={{ fontSize: 13 }}>{String(value)}</span>;
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <div>
            <button onClick={() => router.push("/surveys")} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6B7280", marginBottom: 8,
            }}>
              &larr; 설문 목록으로
            </button>
            <h1 style={{ margin: 0 }}>
              선배상담 사전설문
              <span style={{
                marginLeft: 10, padding: "3px 10px", borderRadius: 4, fontSize: 13, fontWeight: 400,
                color: "white", background: statusBadge[data.status] || "#6b7280",
              }}>
                {statusLabel[data.status] || data.status}
              </span>
            </h1>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>회차</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {data.session_timing || `${data.session_number}회차`}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>사용자 ID</div>
              <div style={{ fontSize: 13, fontFamily: "monospace" }}>{data.user_id.slice(0, 8)}…</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>생성일</div>
              <div style={{ fontSize: 13 }}>
                {data.created_at ? new Date(data.created_at).toLocaleString("ko-KR") : "-"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>제출일</div>
              <div style={{ fontSize: 13 }}>
                {data.submitted_at ? new Date(data.submitted_at).toLocaleString("ko-KR") : "-"}
              </div>
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 16 }}>응답 내용</div>
          {answerEntries.length === 0 ? (
            <div style={{ fontSize: 13, color: "#9CA3AF", padding: 20, textAlign: "center" }}>응답이 비어 있습니다</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {answerEntries.map(([key, value]) => (
                <div key={key} style={{ borderBottom: "1px solid #F3F4F6", paddingBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>{key}</div>
                  <div style={{ fontSize: 13 }}>{renderAnswer(value)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
