"use client";

/**
 * 상담 데이터 열람 감사 로그 (연계규칙 V1 §10-2)
 *
 * - super_admin 전용
 * - target_user_id, viewer_role, access_type, limit로 필터링
 * - 시각/역할/열람자/대상/타입/메타 JSON 축약 표시
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getConsultationDataAccessLogs } from "@/lib/api";
import { isLoggedIn, getAdminInfo } from "@/lib/auth";

interface AccessLog {
  id: string;
  viewer_admin_id: string | null;
  viewer_role: string | null;
  target_user_id: string | null;
  access_type: string | null;
  source_type: string | null;
  source_id: string | null;
  meta: Record<string, unknown> | null;
  accessed_at: string;
}

const VIEWER_ROLE_OPTIONS = [
  { value: "", label: "전체" },
  { value: "senior", label: "선배" },
  { value: "counselor", label: "상담사" },
  { value: "admin", label: "관리자" },
  { value: "super_admin", label: "최고관리자" },
];

const ACCESS_TYPE_OPTIONS = [
  { value: "", label: "전체" },
  { value: "senior_views_counselor_summary", label: "선배→상담사 요약 열람" },
  { value: "counselor_views_senior_notes", label: "상담사→선배 기록 열람" },
];

function truncateMeta(meta: Record<string, unknown> | null): string {
  if (!meta) return "-";
  try {
    const s = JSON.stringify(meta);
    return s.length > 80 ? `${s.slice(0, 80)}...` : s;
  } catch {
    return "-";
  }
}

export default function AccessLogsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 필터 상태
  const [targetUserId, setTargetUserId] = useState("");
  const [viewerRole, setViewerRole] = useState("");
  const [accessType, setAccessType] = useState("");
  const [limit, setLimit] = useState(100);

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
    setAuthorized(admin.role === "super_admin");
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: {
        target_user_id?: string;
        viewer_role?: string;
        access_type?: string;
        limit?: number;
      } = {};
      if (targetUserId.trim()) params.target_user_id = targetUserId.trim();
      if (viewerRole) params.viewer_role = viewerRole;
      if (accessType) params.access_type = accessType;
      if (limit) params.limit = limit;
      const data = await getConsultationDataAccessLogs(params);
      setLogs(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
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
            이 페이지는 최고관리자(super_admin)만 이용할 수 있습니다.
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
          <h1 style={{ margin: 0 }}>상담 데이터 열람 감사 로그</h1>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            연계규칙 V1 §10-2에 따라 선배/상담사 간 상담 데이터 교차 열람 이력을 조회합니다.
          </div>
        </div>

        {/* 필터 */}
        <div
          style={{
            background: "white",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1.5fr 0.7fr auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#374151",
                display: "block",
                marginBottom: 4,
              }}
            >
              대상 학생 user_id (UUID)
            </label>
            <input
              type="text"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              placeholder="예: 11111111-2222-3333-4444-555555555555"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#374151",
                display: "block",
                marginBottom: 4,
              }}
            >
              열람자 역할
            </label>
            <select
              value={viewerRole}
              onChange={(e) => setViewerRole(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                fontSize: 13,
                background: "white",
              }}
            >
              {VIEWER_ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#374151",
                display: "block",
                marginBottom: 4,
              }}
            >
              열람 타입
            </label>
            <select
              value={accessType}
              onChange={(e) => setAccessType(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                fontSize: 13,
                background: "white",
              }}
            >
              {ACCESS_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#374151",
                display: "block",
                marginBottom: 4,
              }}
            >
              Limit
            </label>
            <input
              type="number"
              value={limit}
              min={1}
              max={1000}
              onChange={(e) => setLimit(Number(e.target.value) || 100)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <button
              onClick={handleSearch}
              disabled={loading}
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                border: "none",
                background: "#4472C4",
                color: "white",
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? "조회 중..." : "조회"}
            </button>
          </div>
        </div>

        {/* 결과 */}
        {error && (
          <div
            style={{
              padding: 16,
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 8,
              color: "#991B1B",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {logs.length === 0 && !loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
            조건에 맞는 로그가 없습니다. 조회 버튼을 눌러 검색하세요.
          </div>
        ) : (
          <div
            style={{
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              overflow: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>시각</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>역할</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>
                    열람자 admin ID
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>
                    대상 user ID
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>
                    열람 타입
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>
                    원본 타입
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>
                    원본 ID
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>메타</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "10px 12px", color: "#6B7280", whiteSpace: "nowrap" }}>
                      {new Date(log.accessed_at).toLocaleString("ko-KR")}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{log.viewer_role || "-"}</td>
                    <td
                      style={{
                        padding: "10px 12px",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                    >
                      {log.viewer_admin_id || "-"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                    >
                      {log.target_user_id || "-"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{log.access_type || "-"}</td>
                    <td style={{ padding: "10px 12px" }}>{log.source_type || "-"}</td>
                    <td
                      style={{
                        padding: "10px 12px",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                    >
                      {log.source_id || "-"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        fontSize: 12,
                        color: "#6B7280",
                        maxWidth: 280,
                      }}
                      title={log.meta ? JSON.stringify(log.meta) : ""}
                    >
                      {truncateMeta(log.meta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
