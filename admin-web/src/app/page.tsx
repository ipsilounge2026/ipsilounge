"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import SatisfactionTrendsCard from "@/components/SatisfactionTrendsCard";
import { getDashboard, getChangeRequests, processChangeRequest, getAdmins } from "@/lib/api";
import { isLoggedIn, hasMenuAccess, getDefaultRoute, getAdminInfo } from "@/lib/auth";

/* ========== 타입 정의 ========== */

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

interface UpcomingConsultation {
  id: string;
  status: string;
  type: string;
  mode: string | null;
  memo: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  student_name: string;
}

interface UnwrittenRecord {
  booking_id: string;
  type: string;
  date: string | null;
  student_name: string;
}

interface StudentSurvey {
  id: string;
  survey_type: string;
  status: string;
  updated_at: string | null;
  student_name: string;
}

interface SeniorReviewItem {
  id: string;
  session_timing: string;
  consultation_date: string | null;
  student_name: string;
}

interface DashboardData {
  period: { year: number; month: number };
  role: string;
  // 최고관리자 전용
  revenue?: {
    year: number;
    month: number;
    prev_year: number;
    prev_year_month: number;
  };
  users?: { total: number; new_this_month: number };
  // 최고관리자 + 관리자
  student_lounge?: { year: AnalysisStats; month: AnalysisStats };
  hakjong_lounge?: { year: AnalysisStats; month: AnalysisStats };
  consultation?: {
    year: Record<string, ConsultationTypeStats>;
    month: Record<string, ConsultationTypeStats>;
  };
  matching?: { matched?: number; unmatched: number };
  change_requests?: { pending: number };
  senior_review?: { pending: number; items?: SeniorReviewItem[] };
  // 상담사 + 선배
  my_students?: { count: number };
  upcoming_consultations?: UpcomingConsultation[];
  unwritten_records?: UnwrittenRecord[];
  student_surveys?: StudentSurvey[];
  student_surveys_summary?: { draft: number; submitted: number; total: number };
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
  const role = adminInfo?.role || "";
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin";
  const isCounselor = role === "counselor";
  const isSenior = role === "senior";
  const isManagerRole = isSuperAdmin || isAdmin;
  const isCounselorRole = isCounselor || isSenior;

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
      // 최고관리자/관리자: 변경 요청 로드
      if (isManagerRole) {
        const [requests, adminList] = await Promise.all([
          getChangeRequests("pending"),
          getAdmins().catch(() => []),
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

  const formatMoney = (amount: number) => amount.toLocaleString() + "원";

  if (!data)
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main">
          <p>로딩 중...</p>
        </main>
      </div>
    );

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

        {/* ================================================================
            최고관리자 전용: 매출 현황
           ================================================================ */}
        {isSuperAdmin && data.revenue && (
          <>
            <SectionTitle title="매출 현황" />
            <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <StatCard label={`${period.year}년 매출`} value={formatMoney(data.revenue.year)} color="#5a3d8a" />
              <StatCard label={`${period.month}월 매출`} value={formatMoney(data.revenue.month)} color="#0c5460" />
              <StatCard label={`${period.year - 1}년 매출`} value={formatMoney(data.revenue.prev_year)} color="#6B7280" />
              <StatCard label={`${period.year - 1}년 ${period.month}월 매출`} value={formatMoney(data.revenue.prev_year_month)} color="#6B7280" />
            </div>
          </>
        )}

        {/* ================================================================
            최고관리자 전용: 상담 만족도 추이 (M1~M3 / C1~C3)
           ================================================================ */}
        {isSuperAdmin && (
          <>
            <SectionTitle title="상담 만족도 추이" />
            <SatisfactionTrendsCard />
          </>
        )}

        {/* ================================================================
            최고관리자 + 관리자: 학생부 라운지
           ================================================================ */}
        {isManagerRole && data.student_lounge && (
          <>
            <SectionTitle title="학생부 라운지" />
            <AnalysisStatsRow label={`${period.year}년 전체`} stats={data.student_lounge.year} />
            <AnalysisStatsRow label={`${period.month}월`} stats={data.student_lounge.month} />
          </>
        )}

        {/* ================================================================
            최고관리자 + 관리자: 학종 라운지
           ================================================================ */}
        {isManagerRole && data.hakjong_lounge && (
          <>
            <SectionTitle title="학종 라운지" />
            <AnalysisStatsRow label={`${period.year}년 전체`} stats={data.hakjong_lounge.year} />
            <AnalysisStatsRow label={`${period.month}월`} stats={data.hakjong_lounge.month} />
          </>
        )}

        {/* ================================================================
            최고관리자 + 관리자: 상담 라운지
           ================================================================ */}
        {isManagerRole && data.consultation && (
          <>
            <SectionTitle title="상담 라운지" />
            <ConsultationStatsTable
              yearLabel={`${period.year}년 전체`}
              monthLabel={`${period.month}월`}
              yearData={data.consultation.year}
              monthData={data.consultation.month}
            />
          </>
        )}

        {/* ================================================================
            최고관리자 전용: 전체 회원수 / 신규 / 매칭 완료
           ================================================================ */}
        {isSuperAdmin && data.users && (
          <>
            <SectionTitle title="회원 현황" />
            <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <StatCard label="전체 회원" value={String(data.users.total)} />
              <StatCard label="이번 달 신규" value={String(data.users.new_this_month)} color="var(--primary)" />
              <StatCard label="담당자 매칭 완료" value={String(data.matching?.matched ?? 0)} color="#22C55E" />
            </div>
          </>
        )}

        {/* ================================================================
            최고관리자 + 관리자: 매칭 대기 현황
           ================================================================ */}
        {isManagerRole && data.matching && (
          <>
            <SectionTitle title="매칭 대기 현황" />
            <div className="stats-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              <StatCard
                label="담당자 매칭 필요"
                value={String(data.matching.unmatched)}
                color={data.matching.unmatched > 0 ? "#EF4444" : "#22C55E"}
              />
              <StatCard
                label="담당자 변경 요청"
                value={`${data.change_requests?.pending ?? 0}건`}
                color={(data.change_requests?.pending ?? 0) > 0 ? "#F59E0B" : "#6B7280"}
              />
            </div>
          </>
        )}

        {/* ================================================================
            최고관리자 + 관리자 + 상담사: 선배 기록 검토 대기
           ================================================================ */}
        {(isManagerRole || isCounselor) && data.senior_review && data.senior_review.pending > 0 && (
          <>
            <SectionTitle title="선배 기록 검토 대기" />
            {data.senior_review.items && data.senior_review.items.length > 0 ? (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>학생</th>
                      <th>회차</th>
                      <th>상담일</th>
                      <th>상태</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.senior_review.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.student_name}</td>
                        <td>{item.session_timing || "-"}</td>
                        <td>{item.consultation_date ? new Date(item.consultation_date).toLocaleDateString("ko-KR") : "-"}</td>
                        <td>
                          <span style={{
                            padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                            background: "#FEF3C7", color: "#D97706",
                          }}>
                            검토 대기
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => router.push(`/consultation/senior-review/${item.id}`)}
                          >
                            검토하기
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-grid" style={{ gridTemplateColumns: "1fr" }}>
                <StatCard
                  label="검토 대기 기록"
                  value={`${data.senior_review.pending}건`}
                  color="#F59E0B"
                />
              </div>
            )}
          </>
        )}

        {/* ================================================================
            최고관리자 + 관리자: 담당자 변경 요청 테이블
           ================================================================ */}
        {isManagerRole && changeRequests.length > 0 && (
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
                  {changeRequests.map((req) => (
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
                              onChange={(e) => setProcessAdmin((prev) => ({ ...prev, [req.id]: e.target.value }))}
                            >
                              <option value="">담당자 선택</option>
                              {admins.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: 11, padding: "2px 8px" }}
                              onClick={() => {
                                if (req.requested_admin_id) {
                                  setProcessAdmin((prev) => ({ ...prev, [req.id]: req.requested_admin_id! }));
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

        {/* ================================================================
            상담사 + 선배: 나의 다가오는 상담
           ================================================================ */}
        {isCounselorRole && data.upcoming_consultations && (
          <>
            <SectionTitle title="나의 다가오는 상담" />
            {data.upcoming_consultations.length === 0 ? (
              <div style={{ padding: 16, color: "#9CA3AF", fontSize: 14 }}>예정된 상담이 없습니다.</div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>시간</th>
                      <th>학생</th>
                      <th>유형</th>
                      <th>방식</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.upcoming_consultations.map((c) => (
                      <tr key={c.id}>
                        <td>{c.date ? new Date(c.date).toLocaleDateString("ko-KR") : "-"}</td>
                        <td>
                          {c.start_time ? c.start_time.slice(0, 5) : ""} ~ {c.end_time ? c.end_time.slice(0, 5) : ""}
                        </td>
                        <td style={{ fontWeight: 600 }}>{c.student_name}</td>
                        <td>{c.type}</td>
                        <td>{c.mode === "remote" ? "비대면" : c.mode === "in_person" ? "대면" : "-"}</td>
                        <td>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 600,
                              background: c.status === "confirmed" ? "#DCFCE7" : "#FEF3C7",
                              color: c.status === "confirmed" ? "#16A34A" : "#D97706",
                            }}
                          >
                            {c.status === "confirmed" ? "확정" : "대기"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ================================================================
            상담사 + 선배: 나의 담당 학생
           ================================================================ */}
        {isCounselorRole && data.my_students && (
          <>
            <SectionTitle title="나의 담당 학생" />
            <div className="stats-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              <StatCard label="담당 학생 수" value={`${data.my_students.count}명`} color="var(--primary)" />
              <StatCard
                label="설문 제출"
                value={`${data.student_surveys_summary?.submitted ?? 0} / ${data.student_surveys_summary?.total ?? 0}`}
                color="#22C55E"
              />
            </div>
          </>
        )}

        {/* ================================================================
            상담사 + 선배: 기록 미작성 알림
           ================================================================ */}
        {isCounselorRole && data.unwritten_records && data.unwritten_records.length > 0 && (
          <>
            <SectionTitle title="기록 미작성 알림" />
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>학생</th>
                    <th>상담 유형</th>
                    <th>상담일</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.unwritten_records.map((r) => (
                    <tr key={r.booking_id}>
                      <td style={{ fontWeight: 600 }}>{r.student_name}</td>
                      <td>{r.type}</td>
                      <td>{r.date ? new Date(r.date).toLocaleDateString("ko-KR") : "-"}</td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: 11, padding: "2px 8px" }}
                          onClick={() => router.push(`/consultation`)}
                        >
                          기록 작성
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ================================================================
            상담사 + 선배: 담당 학생 설문 현황
           ================================================================ */}
        {isCounselorRole && data.student_surveys && data.student_surveys.length > 0 && (
          <>
            <SectionTitle title="담당 학생 설문 현황" />
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>학생</th>
                    <th>설문 유형</th>
                    <th>상태</th>
                    <th>최근 수정</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.student_surveys.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.student_name}</td>
                      <td>{s.survey_type === "high" ? "고등학교" : s.survey_type === "preheigh1" ? "예비고1" : s.survey_type}</td>
                      <td>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            background: s.status === "submitted" ? "#DCFCE7" : "#FEF9C4",
                            color: s.status === "submitted" ? "#16A34A" : "#A16207",
                          }}
                        >
                          {s.status === "submitted" ? "제출 완료" : "작성 중"}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {s.updated_at ? new Date(s.updated_at).toLocaleDateString("ko-KR") : "-"}
                      </td>
                      <td>
                        {s.status === "submitted" && (
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => router.push(`/surveys/${s.id}`)}
                          >
                            보기
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ========== 하위 컴포넌트 ========== */

function SectionTitle({ title }: { title: string }) {
  return (
    <h2
      style={{
        fontSize: 15,
        fontWeight: 700,
        marginTop: 28,
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: "2px solid var(--gray-200)",
        color: "var(--gray-800)",
      }}
    >
      {title}
    </h2>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card">
      <div className="card-title">{label}</div>
      <div className="card-value" style={{ color: color || "inherit" }}>
        {value}
      </div>
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
            {types.map((t) => (
              <th key={t} colSpan={2} style={{ textAlign: "center" }}>
                {CONSULTATION_TYPE_LABELS[t]}
              </th>
            ))}
          </tr>
          <tr>
            <th></th>
            {types.map((t) => (
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
            {types.map((t) => {
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
            {types.map((t) => {
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
