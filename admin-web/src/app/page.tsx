"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getDashboard, getChangeRequests, processChangeRequest, getAdmins } from "@/lib/api";
import { isLoggedIn, hasMenuAccess, getDefaultRoute, getAdminInfo } from "@/lib/auth";

interface AnalysisStats {
  applied: number;
  uploaded: number;
  processing: number;
  completed: number;
}

interface ConsultationTypeStats {
  booked: number;
  completed: number;
}

interface DashboardData {
  period: { year: number; month: number };
  revenue: {
    year: number;
    month: number;
    prev_year: number;
    prev_year_month: number;
  };
  student_lounge: { year: AnalysisStats; month: AnalysisStats };
  hakjong_lounge: { year: AnalysisStats; month: AnalysisStats };
  consultation: {
    year: Record<string, ConsultationTypeStats>;
    month: Record<string, ConsultationTypeStats>;
  };
  users: { total: number; new_this_month: number };
  matching: { matched: number; unmatched: number };
  change_requests: { pending: number };
}

interface ChangeRequest {
  id: string;
  user_name: string;
  user_email: string;
  current_admin_name: string | null;
  requested_admin_name: string;
  requested_admin_id: string | null;
  reason: string;
  status: string;
  created_at: string;
}

interface AdminItem {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
}

const CONSULTATION_TYPE_LABELS: Record<string, string> = {
  "학생부분석": "학생부분석",
  "입시전략": "입시전략",
  "학습상담": "학습상담",
  "심리상담": "심리상담",
  "기타": "기타",
};

export default function DashboardPage() {
  const router = useRouter();
  const adminInfo = getAdminInfo();
  const isSuperAdmin = adminInfo?.role === "super_admin";
  const [data, setData] = useState<DashboardData | null>(null);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [processAdmin, setProcessAdmin] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    if (!hasMenuAccess("dashboard")) {
      router.push(getDefaultRoute());
      return;
    }
    loadData();
  }, [router]);

  const loadData = async () => {
    try {
      const dashData = await getDashboard();
      setData(dashData);
      if (isSuperAdmin) {
        const [requests, adminList] = await Promise.all([
          getChangeRequests("pending"),
          getAdmins(),
        ]);
        setChangeRequests(requests);
        setAdmins(adminList.filter((a: AdminItem) => a.is_active));
      }
    } catch {
      router.push("/login");
    }
  };

  const handleProcessRequest = async (requestId: string, status: "approved" | "rejected") => {
    try {
      const newAdminId = processAdmin[requestId] || null;
      if (status === "approved" && !newAdminId) {
        setMessage("배정할 담당자를 선택해주세요.");
        return;
      }
      await processChangeRequest(requestId, { status, new_admin_id: newAdminId });
      setMessage(`변경 요청이 ${status === "approved" ? "승인" : "거절"}되었습니다.`);
      loadData();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const formatMoney = (amount: number) => {
    return amount.toLocaleString() + "원";
  };

  if (!data) return <div className="admin-layout"><Sidebar /><main className="admin-main"><p>로딩 중...</p></main></div>;

  const { period } = data;

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>대시보드</h1>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
          </div>
        )}

        {/* ========== 매출 ========== */}
        <SectionTitle title="매출" />
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <StatCard label={`${period.year}년 매출`} value={formatMoney(data.revenue.year)} color="#5a3d8a" />
          <StatCard label={`${period.month}월 매출`} value={formatMoney(data.revenue.month)} color="#0c5460" />
          <StatCard label={`${period.year - 1}년 매출`} value={formatMoney(data.revenue.prev_year)} color="#6B7280" />
          <StatCard label={`${period.year - 1}년 ${period.month}월 매출`} value={formatMoney(data.revenue.prev_year_month)} color="#6B7280" />
        </div>

        {/* ========== 학생부 라운지 ========== */}
        <SectionTitle title="학생부 라운지" />
        <AnalysisStatsRow label={`${period.year}년 전체`} stats={data.student_lounge.year} />
        <AnalysisStatsRow label={`${period.month}월`} stats={data.student_lounge.month} />

        {/* ========== 학종 라운지 ========== */}
        <SectionTitle title="학종 라운지" />
        <AnalysisStatsRow label={`${period.year}년 전체`} stats={data.hakjong_lounge.year} />
        <AnalysisStatsRow label={`${period.month}월`} stats={data.hakjong_lounge.month} />

        {/* ========== 상담 라운지 ========== */}
        <SectionTitle title="상담 라운지" />
        <ConsultationStatsTable
          yearLabel={`${period.year}년 전체`}
          monthLabel={`${period.month}월`}
          yearData={data.consultation.year}
          monthData={data.consultation.month}
        />

        {/* ========== 기타 현황 ========== */}
        <SectionTitle title="기타 현황" />
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <StatCard label="전체 회원" value={String(data.users.total)} />
          <StatCard label="이번 달 신규" value={String(data.users.new_this_month)} color="var(--primary)" />
          <StatCard label="담당자 매칭 완료" value={String(data.matching.matched)} color="#22C55E" />
          <StatCard
            label="담당자 매칭 필요"
            value={String(data.matching.unmatched)}
            color={data.matching.unmatched > 0 ? "#EF4444" : "#22C55E"}
          />
        </div>

        {/* ========== 담당자 변경 요청 (super_admin만) ========== */}
        {isSuperAdmin && changeRequests.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 16, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              담당자 변경 요청
              <span style={{
                padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: "#FEE2E2", color: "#DC2626",
              }}>
                {changeRequests.length}건
              </span>
            </h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>학생/학부모</th>
                    <th>현재 담당자</th>
                    <th>희망 담당자</th>
                    <th>사유</th>
                    <th>요청일</th>
                    <th>처리</th>
                  </tr>
                </thead>
                <tbody>
                  {changeRequests.map(req => (
                    <tr key={req.id}>
                      <td>
                        <div>{req.user_name}</div>
                        <div style={{ fontSize: 12, color: "#9CA3AF" }}>{req.user_email}</div>
                      </td>
                      <td>{req.current_admin_name || "-"}</td>
                      <td>{req.requested_admin_name}</td>
                      <td style={{ maxWidth: 200, fontSize: 13 }}>{req.reason}</td>
                      <td>{new Date(req.created_at).toLocaleDateString("ko-KR")}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {req.requested_admin_id ? (
                            <span style={{ fontSize: 12, color: "#6B7280" }}>
                              {req.requested_admin_name}(으)로 변경
                            </span>
                          ) : (
                            <select
                              className="form-control"
                              style={{ fontSize: 12, padding: "2px 6px", minWidth: 90 }}
                              value={processAdmin[req.id] || ""}
                              onChange={e => setProcessAdmin(prev => ({ ...prev, [req.id]: e.target.value }))}
                            >
                              <option value="">담당자 선택</option>
                              {admins.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          )}
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: 11, padding: "2px 8px" }}
                              onClick={() => {
                                if (req.requested_admin_id) {
                                  setProcessAdmin(prev => ({ ...prev, [req.id]: req.requested_admin_id! }));
                                }
                                handleProcessRequest(req.id, "approved");
                              }}
                            >
                              승인
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              style={{ fontSize: 11, padding: "2px 8px" }}
                              onClick={() => handleProcessRequest(req.id, "rejected")}
                            >
                              거절
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ========== 하위 컴포넌트 ========== */

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 style={{
      fontSize: 15, fontWeight: 700, marginTop: 28, marginBottom: 10,
      paddingBottom: 6, borderBottom: "2px solid var(--gray-200)",
      color: "var(--gray-800)",
    }}>
      {title}
    </h2>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card">
      <div className="card-title">{label}</div>
      <div className="card-value" style={{ color: color || "inherit" }}>{value}</div>
    </div>
  );
}

function AnalysisStatsRow({ label, stats }: { label: string; stats: AnalysisStats }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <StatCard label="신청완료 (미업로드)" value={String(stats.applied)} color="#5a3d8a" />
        <StatCard label="업로드 완료" value={String(stats.uploaded)} color="#0c5460" />
        <StatCard label="분석 진행중" value={String(stats.processing)} color="var(--info)" />
        <StatCard label="분석 완료" value={String(stats.completed)} color="var(--success)" />
      </div>
    </div>
  );
}

function ConsultationStatsTable({
  yearLabel,
  monthLabel,
  yearData,
  monthData,
}: {
  yearLabel: string;
  monthLabel: string;
  yearData: Record<string, ConsultationTypeStats>;
  monthData: Record<string, ConsultationTypeStats>;
}) {
  const types = Object.keys(CONSULTATION_TYPE_LABELS);

  return (
    <div className="table-wrapper" style={{ marginBottom: 8 }}>
      <table>
        <thead>
          <tr>
            <th>기간</th>
            {types.map(t => (
              <th key={t} colSpan={2} style={{ textAlign: "center" }}>
                {CONSULTATION_TYPE_LABELS[t]}
              </th>
            ))}
          </tr>
          <tr>
            <th></th>
            {types.map(t => (
              <React.Fragment key={t}>
                <th style={{ textAlign: "center", fontSize: 12, color: "var(--info)" }}>예약</th>
                <th style={{ textAlign: "center", fontSize: 12, color: "var(--success)" }}>완료</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ fontWeight: 600, fontSize: 13 }}>{yearLabel}</td>
            {types.map(t => {
              const s = yearData[t] || { booked: 0, completed: 0 };
              return (
                <React.Fragment key={t}>
                  <td style={{ textAlign: "center", color: "var(--info)", fontWeight: 600 }}>{s.booked}</td>
                  <td style={{ textAlign: "center", color: "var(--success)", fontWeight: 600 }}>{s.completed}</td>
                </React.Fragment>
              );
            })}
          </tr>
          <tr>
            <td style={{ fontWeight: 600, fontSize: 13 }}>{monthLabel}</td>
            {types.map(t => {
              const s = monthData[t] || { booked: 0, completed: 0 };
              return (
                <React.Fragment key={t}>
                  <td style={{ textAlign: "center", color: "var(--info)", fontWeight: 600 }}>{s.booked}</td>
                  <td style={{ textAlign: "center", color: "var(--success)", fontWeight: 600 }}>{s.completed}</td>
                </React.Fragment>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
