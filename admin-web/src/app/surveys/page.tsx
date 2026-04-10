"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { getSurveys } from "@/lib/api";
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
  const [items, setItems] = useState<SurveyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [surveyType, setSurveyType] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    loadData();
  }, [page, surveyType, status]);

  const loadData = async () => {
    try {
      const res = await getSurveys(page, surveyType || undefined, status || undefined, search || undefined);
      setItems(res.items);
      setTotal(res.total);
    } catch {}
  };

  const handleSearch = () => {
    setPage(1);
    loadData();
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>사전 상담 설문 관리</h1>
          <span style={{ fontSize: 13, color: "#6b7280" }}>총 {total}건</span>
        </div>

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
      </main>
    </div>
  );
}
