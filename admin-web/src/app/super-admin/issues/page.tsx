"use client";

/**
 * 슈퍼관리자 QA 이슈 큐 (기획서 §4-8-1)
 *
 * - analysis_status 가 blocked / repaired / warn 인 설문만 모아서 표시
 * - 각 이슈의 P1/P2/P3 분류, 필드명, 보정 로그 열람
 * - 영향 받는 상담 예약(학생·일시·담당 상담사) 미리 조회
 * - "재검증" 버튼 → 수정 후 즉시 잠금 해제 판정 확인
 * - 상세 진입(설문 상세 페이지) 링크 제공
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getQAIssueQueue, revalidateSurvey } from "@/lib/api";
import { isLoggedIn, getAdminInfo } from "@/lib/auth";

interface AffectedBooking {
  booking_id: string;
  type: string;
  status: string;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  counselor_name: string | null;
}

interface QAIssue {
  survey_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone: string | null;
  survey_type: string;
  timing: string | null;
  mode: string;
  analysis_status: string;
  submitted_at: string | null;
  updated_at: string;
  p1_issues: unknown[];
  p2_issues: unknown[];
  p3_issues: unknown[];
  auto_repaired: boolean;
  repair_log: unknown[];
  validated_at: string | null;
  affected_bookings: AffectedBooking[];
}

interface QueueResponse {
  summary: { total: number; blocked: number; repaired: number; warn: number };
  items: QAIssue[];
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blocked: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B" },
  repaired: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E" },
  warn: { bg: "#F0F9FF", border: "#BAE6FD", text: "#075985" },
};

const STATUS_LABEL: Record<string, string> = {
  blocked: "BLOCKED — 분석 차단",
  repaired: "REPAIRED — 자동 보정됨",
  warn: "WARN — 주의 필요",
};

export default function SuperAdminIssuesPage() {
  const router = useRouter();
  const [data, setData] = useState<QueueResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("blocked,repaired,warn");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string>("");
  const [revalidating, setRevalidating] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = (await getQAIssueQueue(statusFilter)) as QueueResponse;
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "불러오기 실패";
      setMessage(msg);
      setData(null);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    const info = getAdminInfo();
    if (!info || info.role !== "super_admin") {
      setMessage("슈퍼관리자 권한이 필요합니다.");
      return;
    }
    loadData();
  }, [router, loadData]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRevalidate = async (surveyId: string) => {
    setRevalidating(surveyId);
    setMessage("");
    try {
      const res = (await revalidateSurvey(surveyId)) as {
        prev_status: string;
        new_status: string;
        auto_repaired: boolean;
      };
      setMessage(
        `재검증 완료: ${res.prev_status} → ${res.new_status}` +
          (res.auto_repaired ? " (자동 보정 적용됨)" : ""),
      );
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "재검증 실패";
      setMessage(msg);
    } finally {
      setRevalidating(null);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>QA 이슈 큐 (슈퍼관리자 전용)</h1>
          <p style={{ color: "#6B7280", fontSize: 13, marginTop: 4 }}>
            자동 분석 검증에서 BLOCKED / REPAIRED / WARN 판정을 받은 설문을 점검합니다.
          </p>
        </div>

        {message && (
          <div
            style={{
              padding: "12px 16px",
              background: "#EFF6FF",
              border: "1px solid #BFDBFE",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 14,
              color: "#1E3A8A",
            }}
          >
            {message}
          </div>
        )}

        {/* 요약 카드 */}
        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            <SummaryCard label="전체" value={data.summary.total} color="#374151" />
            <SummaryCard label="BLOCKED" value={data.summary.blocked} color="#991B1B" />
            <SummaryCard label="REPAIRED" value={data.summary.repaired} color="#92400E" />
            <SummaryCard label="WARN" value={data.summary.warn} color="#075985" />
          </div>
        )}

        {/* 필터 */}
        <div className="filter-bar" style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "#374151", marginRight: 8 }}>상태 필터:</label>
          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 280 }}
          >
            <option value="blocked,repaired,warn">전체 (blocked + repaired + warn)</option>
            <option value="blocked">BLOCKED 만</option>
            <option value="repaired">REPAIRED 만</option>
            <option value="warn">WARN 만</option>
            <option value="blocked,repaired">BLOCKED + REPAIRED</option>
          </select>
          <button className="btn btn-outline" onClick={loadData} style={{ marginLeft: 8 }}>
            새로고침
          </button>
        </div>

        {/* 이슈 리스트 */}
        {data && data.items.length === 0 && (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              background: "#F9FAFB",
              borderRadius: 8,
              color: "#6B7280",
            }}
          >
            현재 해당 상태의 이슈가 없습니다.
          </div>
        )}

        {data?.items.map((issue) => {
          const colors = STATUS_COLORS[issue.analysis_status] || STATUS_COLORS.warn;
          const isOpen = expanded.has(issue.survey_id);
          return (
            <div
              key={issue.survey_id}
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        background: colors.text,
                        color: "white",
                      }}
                    >
                      {STATUS_LABEL[issue.analysis_status] || issue.analysis_status}
                    </span>
                    <strong style={{ fontSize: 15 }}>{issue.user_name}</strong>
                    <span style={{ fontSize: 13, color: "#6B7280" }}>{issue.user_email}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#374151" }}>
                    {issue.survey_type === "high" ? "고등" : "예비고1"} · {issue.timing ?? "-"} · {issue.mode} ·
                    {" "}
                    제출 {issue.submitted_at ? new Date(issue.submitted_at).toLocaleString("ko-KR") : "미제출"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    P1 이슈 {issue.p1_issues.length}건 · P2 {issue.p2_issues.length}건 · P3 {issue.p3_issues.length}건
                    {issue.auto_repaired ? " · 자동 보정됨" : ""}
                    {issue.affected_bookings.length > 0 && ` · 영향 예약 ${issue.affected_bookings.length}건`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    className="btn btn-outline"
                    onClick={() => toggleExpand(issue.survey_id)}
                    style={{ fontSize: 13 }}
                  >
                    {isOpen ? "접기" : "상세"}
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => handleRevalidate(issue.survey_id)}
                    disabled={revalidating === issue.survey_id}
                    style={{ fontSize: 13 }}
                    title="데이터 수정 후 즉시 잠금 해제 판정"
                  >
                    {revalidating === issue.survey_id ? "재검증 중..." : "재검증"}
                  </button>
                  <Link
                    href={`/surveys/${issue.survey_id}`}
                    className="btn btn-primary"
                    style={{ fontSize: 13 }}
                  >
                    설문 열기
                  </Link>
                </div>
              </div>

              {isOpen && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${colors.border}` }}>
                  <IssueDetailSection title="P1 이슈 (필수)" issues={issue.p1_issues} color="#991B1B" />
                  <IssueDetailSection title="P2 이슈 (중요)" issues={issue.p2_issues} color="#92400E" />
                  <IssueDetailSection title="P3 이슈 (참고)" issues={issue.p3_issues} color="#075985" />

                  {issue.auto_repaired && issue.repair_log.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>자동 보정 로그</div>
                      <pre
                        style={{
                          background: "#F3F4F6",
                          padding: 8,
                          borderRadius: 4,
                          fontSize: 11,
                          overflow: "auto",
                          maxHeight: 180,
                        }}
                      >
                        {JSON.stringify(issue.repair_log, null, 2)}
                      </pre>
                    </div>
                  )}

                  {issue.affected_bookings.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                        영향 받는 예약 ({issue.affected_bookings.length}건)
                      </div>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#F9FAFB" }}>
                            <th style={thStyle}>상담 일시</th>
                            <th style={thStyle}>유형</th>
                            <th style={thStyle}>담당 상담사</th>
                            <th style={thStyle}>상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {issue.affected_bookings.map((b) => (
                            <tr key={b.booking_id}>
                              <td style={tdStyle}>
                                {b.slot_date} {b.slot_start_time} ~ {b.slot_end_time}
                              </td>
                              <td style={tdStyle}>{b.type}</td>
                              <td style={tdStyle}>{b.counselor_name || "-"}</td>
                              <td style={tdStyle}>{b.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #E5E7EB",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function IssueDetailSection({
  title,
  issues,
  color,
}: {
  title: string;
  issues: unknown[];
  color: string;
}) {
  if (issues.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color, marginBottom: 4 }}>
        {title} ({issues.length})
      </div>
      <pre
        style={{
          background: "white",
          border: "1px solid #E5E7EB",
          padding: 8,
          borderRadius: 4,
          fontSize: 11,
          overflow: "auto",
          maxHeight: 180,
          margin: 0,
        }}
      >
        {JSON.stringify(issues, null, 2)}
      </pre>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid #E5E7EB",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #F3F4F6",
};
