"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSeniorNotes } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface SeniorNote {
  id: string;
  user_id: string;
  senior_id: string | null;
  session_number: number;
  session_timing: string | null;
  consultation_date: string;
  review_status: string;
  review_notes: string | null;
  created_at: string | null;
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: "검토 대기", bg: "#FEF3C7", color: "#92400E" },
  reviewed: { label: "검토 완료", bg: "#D1FAE5", color: "#065F46" },
  revision_requested: { label: "수정 요청", bg: "#FEE2E2", color: "#991B1B" },
};

export default function SeniorReviewListPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<SeniorNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const data = await getSeniorNotes();
      setNotes(data.notes || []);
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  };

  const filtered = statusFilter === "all" ? notes : notes.filter(n => n.review_status === statusFilter);

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1 style={{ margin: 0 }}>선배 상담 기록 검토</h1>
        </div>

        {/* 필터 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { key: "all", label: "전체" },
            { key: "pending", label: "검토 대기" },
            { key: "reviewed", label: "검토 완료" },
            { key: "revision_requested", label: "수정 요청" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              style={{
                padding: "6px 16px", borderRadius: 6, border: "1px solid #D1D5DB",
                background: statusFilter === f.key ? "#7C3AED" : "white",
                color: statusFilter === f.key ? "white" : "#374151",
                fontSize: 13, cursor: "pointer", fontWeight: statusFilter === f.key ? 600 : 400,
              }}
            >
              {f.label}
              {f.key === "pending" && (
                <span style={{ marginLeft: 6, background: "#EF4444", color: "white", borderRadius: 10, padding: "1px 6px", fontSize: 11 }}>
                  {notes.filter(n => n.review_status === "pending").length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>기록이 없습니다</div>
        ) : (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>상담일</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>세션</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>상태</th>
                  <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600 }}>작업</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(note => {
                  const badge = STATUS_BADGE[note.review_status] || STATUS_BADGE.pending;
                  return (
                    <tr key={note.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "12px 16px" }}>{note.consultation_date}</td>
                      <td style={{ padding: "12px 16px" }}>
                        {note.session_timing || `${note.session_number}회차`}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 4, fontSize: 12,
                          background: badge.bg, color: badge.color, fontWeight: 600,
                        }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <button
                          onClick={() => router.push(`/consultation/senior-review/${note.id}`)}
                          style={{
                            padding: "5px 14px", borderRadius: 4, border: "1px solid #D1D5DB",
                            background: "white", color: "#374151", fontSize: 13, cursor: "pointer",
                          }}
                        >
                          {note.review_status === "pending" ? "검토하기" : "상세보기"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
