"use client";

/**
 * 상담사→선배 공유 검토 목록 (연계규칙 V1 §6)
 *
 * - 검토 대기 중인 설문/상담기록을 모아 표시
 * - 권한: super_admin / admin / counselor
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getCounselorSharingPending } from "@/lib/api";
import { isLoggedIn, getAdminInfo } from "@/lib/auth";

interface PendingItem {
  source_type: "survey" | "note";
  id: string;
  user_id: string;
  user_name: string;
  timing: string | null;
  created_at: string | null;
  submitted_at?: string;
  consultation_date?: string;
  survey_type?: string;
  category?: string;
  senior_review_status: "pending";
}

const SOURCE_TYPE_BADGE: Record<"survey" | "note", { label: string; bg: string; color: string }> = {
  survey: { label: "설문", bg: "#DBEAFE", color: "#1E40AF" },
  note: { label: "상담기록", bg: "#EDE9FE", color: "#5B21B6" },
};

export default function CounselorSharingListPage() {
  const router = useRouter();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    const admin = getAdminInfo();
    if (!admin) {
      setAuthorized(false);
      return;
    }
    const allowed = admin.role === "super_admin" || admin.role === "admin" || admin.role === "counselor";
    setAuthorized(allowed);
    if (allowed) {
      loadItems();
    }
  }, []);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCounselorSharingPending();
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string | null | undefined): string => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString("ko-KR");
    } catch {
      return iso;
    }
  };

  if (authorized === null) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>확인 중...</div>
        </main>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>
            이 페이지는 관리자/상담사만 이용할 수 있습니다.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1 style={{ margin: 0 }}>상담사→선배 공유 검토</h1>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            연계규칙 V1 §6에 따라 상담사 기록 중 선배에게 공유될 항목을 개별 검토합니다.
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>로딩 중...</div>
        ) : error ? (
          <div
            style={{
              padding: 16,
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 8,
              color: "#991B1B",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
            검토 대기 중인 상담사 공유 건이 없습니다
          </div>
        ) : (
          <div
            style={{
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>학생</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>유형</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>시점</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>작성일</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>상태</th>
                  <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600 }}>작업</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const badge = SOURCE_TYPE_BADGE[it.source_type];
                  const timingLabel =
                    it.timing ||
                    (it.source_type === "survey" ? it.survey_type : it.category) ||
                    "-";
                  const dateLabel =
                    it.created_at ||
                    it.submitted_at ||
                    it.consultation_date ||
                    null;
                  return (
                    <tr key={`${it.source_type}-${it.id}`} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "12px 16px" }}>{it.user_name}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            background: badge.bg,
                            color: badge.color,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>{timingLabel}</td>
                      <td style={{ padding: "12px 16px", color: "#6B7280" }}>{formatDate(dateLabel)}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            background: "#FEF3C7",
                            color: "#92400E",
                          }}
                        >
                          검토 대기
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <button
                          onClick={() =>
                            router.push(`/consultation/counselor-sharing/${it.source_type}/${it.id}`)
                          }
                          style={{
                            padding: "5px 14px",
                            borderRadius: 4,
                            border: "1px solid #D1D5DB",
                            background: "white",
                            color: "#374151",
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          상세 검토
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
