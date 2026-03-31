"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import { getAnalysisList } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface AnalysisItem {
  id: string;
  user_name: string;
  user_email: string;
  status: string;
  school_record_filename: string;
  target_university: string | null;
  target_major: string | null;
  created_at: string;
  has_report: boolean;
}

export default function AnalysisListPage() {
  const router = useRouter();
  const [items, setItems] = useState<AnalysisItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadData();
  }, [page, statusFilter]);

  const loadData = async () => {
    try {
      const res = await getAnalysisList(page, statusFilter || undefined);
      setItems(res.items);
      setTotal(res.total);
    } catch {}
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>분석 관리</h1>
        </div>

        <div className="filter-bar" style={{ marginBottom: 16 }}>
          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">전체 상태</option>
            <option value="pending">대기</option>
            <option value="processing">분석중</option>
            <option value="completed">완료</option>
            <option value="cancelled">취소</option>
          </select>
          <span style={{ color: "var(--gray-600)", fontSize: 14 }}>총 {total}건</span>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>접수일</th>
                <th>신청자</th>
                <th>파일명</th>
                <th>지원 대학/학과</th>
                <th>상태</th>
                <th>리포트</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.created_at).toLocaleDateString("ko-KR")}</td>
                  <td>
                    <div>{item.user_name}</div>
                    <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{item.user_email}</div>
                  </td>
                  <td>{item.school_record_filename}</td>
                  <td>
                    {item.target_university || item.target_major
                      ? `${item.target_university || ""} ${item.target_major || ""}`
                      : "-"}
                  </td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{item.has_report ? "O" : "-"}</td>
                  <td>
                    <Link href={`/analysis/${item.id}`} className="btn btn-outline btn-sm">
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--gray-500)" }}>접수된 분석 요청이 없습니다</td></tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i + 1}
                  className={page === i + 1 ? "active" : ""}
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
