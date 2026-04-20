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
  // V1 §7-2 SLA 메타 (2026-04-20 추가)
  hours_since_submission?: number | null;
  is_overdue?: boolean;
  sla_hours?: number;
}

interface PendingResponse {
  items: PendingItem[];
  total_count?: number;
  overdue_count?: number;
  sla_hours?: number;
}

const SOURCE_TYPE_BADGE: Record<"survey" | "note", { label: string; bg: string; color: string }> = {
  survey: { label: "설문", bg: "#DBEAFE", color: "#1E40AF" },
  note: { label: "상담기록", bg: "#EDE9FE", color: "#5B21B6" },
};

export default function CounselorSharingListPage() {
  const router = useRouter();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [slaHours, setSlaHours] = useState(48);
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
      const data: PendingResponse = await getCounselorSharingPending();
      setItems(data.items || []);
      setOverdueCount(data.overdue_count ?? 0);
      setSlaHours(data.sla_hours ?? 48);
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  };

  const formatElapsed = (hours: number | null | undefined): string => {
    if (hours === null || hours === undefined) return "-";
    if (hours < 1) return `${Math.round(hours * 60)}분`;
    if (hours < 24) return `${hours.toFixed(1)}시간`;
    const days = Math.floor(hours / 24);
    const rem = Math.round(hours - days * 24);
    return `${days}일 ${rem}시간`;
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
            (SLA {slaHours}시간 이내 권장 — §7-2)
          </div>
        </div>

        {/* SLA 초과 경고 배너 (V1 §7-2) */}
        {overdueCount > 0 && (
          <div style={{
            margin: "12px 0",
            padding: "12px 16px",
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: 8,
            color: "#991B1B",
            fontSize: 14,
            fontWeight: 600,
          }}>
            ⚠️ SLA {slaHours}시간 초과 건 {overdueCount}개 — 우선 검토 필요
          </div>
        )}

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
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>경과</th>
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
                        <span style={{
                          fontSize: 13,
                          color: it.is_overdue ? "#991B1B" : "#6B7280",
                          fontWeight: it.is_overdue ? 600 : 400,
                        }}>
                          {formatElapsed(it.hours_since_submission)}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {it.is_overdue ? (
                          <span style={{
                            padding: "3px 10px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            background: "#FEE2E2",
                            color: "#991B1B",
                          }}>
                            SLA 초과
                          </span>
                        ) : (
                          <span style={{
                            padding: "3px 10px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            background: "#FEF3C7",
                            color: "#92400E",
                          }}>
                            검토 대기
                          </span>
                        )}
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
