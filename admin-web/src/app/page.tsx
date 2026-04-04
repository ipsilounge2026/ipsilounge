"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getDashboard, getChangeRequests, processChangeRequest, getAdmins } from "@/lib/api";
import { isLoggedIn, hasMenuAccess, getDefaultRoute, getAdminInfo } from "@/lib/auth";

interface DashboardData {
  analysis: { applied: number; uploaded: number; processing: number; completed_this_month: number };
  consultation: { bookings_active: number };
  users: { total: number; new_this_month: number };
  revenue: { this_month: number };
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

  if (!data) return <div className="admin-layout"><Sidebar /><main className="admin-main"><p>로딩 중...</p></main></div>;

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

        {/* 분석 현황 */}
        <div className="stats-grid">
          <div className="card">
            <div className="card-title">신청완료 (미업로드)</div>
            <div className="card-value" style={{ color: "#5a3d8a" }}>{data.analysis.applied}</div>
          </div>
          <div className="card">
            <div className="card-title">업로드완료</div>
            <div className="card-value" style={{ color: "#0c5460" }}>{data.analysis.uploaded}</div>
          </div>
          <div className="card">
            <div className="card-title">분석 진행중</div>
            <div className="card-value" style={{ color: "var(--info)" }}>{data.analysis.processing}</div>
          </div>
          <div className="card">
            <div className="card-title">이번 달 완료</div>
            <div className="card-value" style={{ color: "var(--success)" }}>{data.analysis.completed_this_month}</div>
          </div>
          <div className="card">
            <div className="card-title">활성 상담 예약</div>
            <div className="card-value">{data.consultation.bookings_active}</div>
          </div>
        </div>

        <div className="stats-grid">
          <div className="card">
            <div className="card-title">전체 회원</div>
            <div className="card-value">{data.users.total}</div>
          </div>
          <div className="card">
            <div className="card-title">이번 달 신규</div>
            <div className="card-value" style={{ color: "var(--primary)" }}>{data.users.new_this_month}</div>
          </div>
          <div className="card">
            <div className="card-title">이번 달 매출</div>
            <div className="card-value">{data.revenue.this_month.toLocaleString()}원</div>
          </div>
          <div className="card">
            <div className="card-title">담당자 매칭 완료</div>
            <div className="card-value" style={{ color: "#22C55E" }}>{data.matching.matched}</div>
          </div>
          <div className="card">
            <div className="card-title">매칭 필요</div>
            <div className="card-value" style={{ color: data.matching.unmatched > 0 ? "#EF4444" : "#22C55E" }}>
              {data.matching.unmatched}
            </div>
          </div>
        </div>

        {/* 담당자 변경 요청 (super_admin만) */}
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
