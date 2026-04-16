"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { getSurveys, getSeniorPreSurveyList } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface SurveyItem {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone: string;
  survey_type: string;
  timing: string | null;
  mode: string;
  status: string;
  has_admin_memo: boolean;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}

interface SeniorPreSurveyItem {
  id: string;
  user_id: string;
  booking_id: string | null;
  session_number: number;
  session_timing: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string | null;
  answers?: Record<string, any>;
}

type SurveyTab = "learning" | "senior";

const typeLabel: Record<string, string> = {
  preheigh1: "예비고1",
  high: "고등학생",
};

const statusLabel: Record<string, string> = {
  draft: "작성 중",
  submitted: "제출 완료",
};

const statusBadge: Record<string, string> = {
  draft: "#F59E0B",
  submitted: "#10B981",
};

export default function SurveysPage() {
  const router = useRouter();
  const [tab, setTab] = useState<SurveyTab>("learning");
  const [items, setItems] = useState<SurveyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [surveyType, setSurveyType] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  // 선배 사전설문 상태 (기획서 §3)
  const [seniorItems, setSeniorItems] = useState<SeniorPreSurveyItem[]>([]);
  const [seniorSessionTiming, setSeniorSessionTiming] = useState("");
  const [seniorStatus, setSeniorStatus] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    if (tab === "learning") {
      loadData();
    } else {
      loadSeniorData();
    }
  }, [tab, page, surveyType, status, seniorSessionTiming]);

  const loadData = async () => {
    try {
      const res = await getSurveys(page, surveyType || undefined, status || undefined, search || undefined);
      setItems(res.items);
      setTotal(res.total);
    } catch {}
  };

  const loadSeniorData = async () => {
    try {
      const res = await getSeniorPreSurveyList({ sessionTiming: seniorSessionTiming || undefined });
      setSeniorItems(res.surveys || []);
      setTotal((res.surveys || []).length);
    } catch {
      setSeniorItems([]);
      setTotal(0);
    }
  };

  const handleSearch = () => {
    setPage(1);
    if (tab === "learning") loadData();
    else loadSeniorData();
  };

  const totalPages = Math.ceil(total / 20);

  // 선배 탭: status/search 클라이언트 필터
  const filteredSeniorItems = seniorItems.filter((s) => {
    if (seniorStatus && s.status !== seniorStatus) return false;
    if (search) {
      const lower = search.toLowerCase();
      const uname = (s.answers?.user_name || s.answers?.name || "") as string;
      if (!uname.toLowerCase().includes(lower) && !s.user_id.toLowerCase().includes(lower)) return false;
    }
    return true;
  });

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>사전 상담 설문 관리</h1>
          <span style={{ fontSize: 13, color: "#6b7280" }}>총 {total}건</span>
        </div>

        {/* 탭: 학습상담 / 선배상담 사전설문 */}
        <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #E5E7EB", marginBottom: 16 }}>
          {([
            { key: "learning", label: "학습상담 사전설문" },
            { key: "senior", label: "선배상담 사전설문" },
          ] as { key: SurveyTab; label: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              style={{
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: tab === t.key ? "#3B82F6" : "#6B7280",
                borderBottom: tab === t.key ? "2px solid #3B82F6" : "2px solid transparent",
                marginBottom: -2,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "learning" ? (
          <>
            <div className="filter-bar">
              <select value={surveyType} onChange={(e) => { setSurveyType(e.target.value); setPage(1); }}>
                <option value="">전체 유형</option>
                <option value="preheigh1">예비고1</option>
                <option value="high">고등학생</option>
              </select>
              <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">전체 상태</option>
                <option value="draft">작성 중</option>
                <option value="submitted">제출 완료</option>
              </select>
              <input
                type="text"
                placeholder="이름 또는 이메일 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <button onClick={handleSearch} className="btn btn-sm">검색</button>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>학생</th>
                    <th>연락처</th>
                    <th>유형</th>
                    <th>시점</th>
                    <th>상태</th>
                    <th>메모</th>
                    <th>생성일</th>
                    <th>제출일</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                        설문이 없습니다
                      </td>
                    </tr>
                  )}
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{s.user_name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{s.user_email}</div>
                      </td>
                      <td style={{ fontSize: 13 }}>{s.user_phone || "-"}</td>
                      <td>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          background: s.survey_type === "high" ? "#EFF6FF" : "#F0FDF4",
                          color: s.survey_type === "high" ? "#1E40AF" : "#166534",
                        }}>
                          {typeLabel[s.survey_type] || s.survey_type}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{s.timing || "-"}</td>
                      <td>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          color: "white",
                          background: statusBadge[s.status] || "#6b7280",
                        }}>
                          {statusLabel[s.status] || s.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {s.has_admin_memo && (
                          <span style={{ fontSize: 14 }} title="상담사 메모 있음">📝</span>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>{new Date(s.created_at).toLocaleDateString("ko-KR")}</td>
                      <td style={{ fontSize: 13 }}>
                        {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString("ko-KR") : "-"}
                      </td>
                      <td>
                        <Link href={`/surveys/${s.id}`} style={{ fontSize: 13, color: "#3B82F6" }}>
                          상세보기
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button>
                <span>{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>다음</button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* 선배상담 사전설문 (S1~S4) */}
            <div className="filter-bar">
              <select value={seniorSessionTiming} onChange={(e) => setSeniorSessionTiming(e.target.value)}>
                <option value="">전체 회차</option>
                <option value="S1">S1 (1회차)</option>
                <option value="S2">S2 (2회차)</option>
                <option value="S3">S3 (3회차)</option>
                <option value="S4">S4 (4회차)</option>
              </select>
              <select value={seniorStatus} onChange={(e) => setSeniorStatus(e.target.value)}>
                <option value="">전체 상태</option>
                <option value="draft">작성 중</option>
                <option value="submitted">제출 완료</option>
              </select>
              <input
                type="text"
                placeholder="학생명 또는 사용자 ID 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <button onClick={handleSearch} className="btn btn-sm">검색</button>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>학생</th>
                    <th>회차</th>
                    <th>상태</th>
                    <th>작성 선배</th>
                    <th>생성일</th>
                    <th>제출일</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSeniorItems.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                        선배 사전설문이 없습니다
                      </td>
                    </tr>
                  )}
                  {filteredSeniorItems.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {(s.answers?.user_name as string) || (s.answers?.name as string) || "-"}
                        </div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>{s.user_id.slice(0, 8)}…</div>
                      </td>
                      <td>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          background: "#EDE9FE",
                          color: "#5B21B6",
                          fontWeight: 600,
                        }}>
                          {s.session_timing || `${s.session_number}회차`}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          color: "white",
                          background: statusBadge[s.status] || "#6b7280",
                        }}>
                          {statusLabel[s.status] || s.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {(s.answers?.senior_name as string) || (s.answers?.author_name as string) || "-"}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {s.created_at ? new Date(s.created_at).toLocaleDateString("ko-KR") : "-"}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString("ko-KR") : "-"}
                      </td>
                      <td>
                        <Link href={`/surveys/senior/${s.id}`} style={{ fontSize: 13, color: "#3B82F6" }}>
                          상세보기
                        </Link>
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
