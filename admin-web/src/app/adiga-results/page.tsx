"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isLoggedIn, hasMenuAccess, getDefaultRoute } from "@/lib/auth";
import {
  getAdigaResultsSummary,
  uploadAdigaResults,
  deleteAdigaResultsYear,
} from "@/lib/api";

interface YearSummary {
  year: number;
  count: number;
  last_imported: string | null;
  source_file: string | null;
}

export default function AdigaResultsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<YearSummary[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    year: number;
    deleted: number;
    inserted: number;
    source_file: string;
    saved_path: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearOverride, setYearOverride] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdigaResultsSummary();
      setItems(res.items || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("목록 로드 실패: " + msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    if (!hasMenuAccess("adiga_results")) {
      router.push(getDefaultRoute());
      return;
    }
    load();
  }, [router, load]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setUploadResult(null);
    try {
      const yearNum = yearOverride.trim() ? Number(yearOverride.trim()) : undefined;
      const res = await uploadAdigaResults(file, yearNum);
      setUploadResult(res);
      await load();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("업로드 실패: " + msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (year: number) => {
    if (!confirm(`${year}학년도 입결 데이터 ${items.find((i) => i.year === year)?.count.toLocaleString()}건을 삭제하시겠습니까?\n영구 저장된 Excel 파일은 보존됩니다.`)) {
      return;
    }
    try {
      await deleteAdigaResultsYear(year);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("삭제 실패: " + msg);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1 className="page-title">대학어디가 입결 데이터 업로드</h1>
        </div>

        {/* 업로드 영역 */}
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>
            📥 Excel 업로드
          </h3>
          <div style={{ background: "#F3F4F6", borderRadius: 6, padding: 12, fontSize: 13, marginBottom: 16, color: "#374151" }}>
            <strong>자동 수집 프로그램이 만든 Excel을 업로드하세요.</strong>
            <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 12 }}>
              <li>파일명 권장: <code>adiga_입결_2027.xlsx</code> (학년도 자동 추출)</li>
              <li>시트명: <code>전년도입결</code> (또는 첫 번째 시트)</li>
              <li>업로드 시 해당 학년도 기존 데이터를 모두 새 데이터로 교체합니다</li>
              <li>업로드된 파일은 <code>backend/data/admission_results/</code> 에 영구 보관됩니다 (백업·복원용)</li>
            </ul>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>
                학년도 강제 지정 (선택)
              </label>
              <input
                type="number"
                className="form-control"
                placeholder="예: 2027"
                value={yearOverride}
                onChange={(e) => setYearOverride(e.target.value)}
                disabled={uploading}
                style={{ maxWidth: 160 }}
              />
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                파일명에서 학년도가 추출되면 비워두세요
              </div>
            </div>
            <div style={{ flex: "1 1 300px" }}>
              <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>
                Excel 파일
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="form-control"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                }}
              />
            </div>
          </div>

          {uploading && (
            <div style={{ marginTop: 16, padding: 12, background: "#EFF6FF", borderRadius: 6, fontSize: 13, color: "#1E40AF" }}>
              ⏳ 업로드 + DB 갱신 중... (24,000행 처리에 30초~1분 소요)
              <br />
              <span style={{ color: "#6b7280", fontSize: 12 }}>페이지를 새로고침하지 마세요.</span>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 16, padding: 12, background: "#FEF2F2", borderRadius: 6, fontSize: 13, color: "#B91C1C" }}>
              ❌ {error}
            </div>
          )}

          {uploadResult && (
            <div style={{ marginTop: 16, padding: 12, background: "#ECFDF5", borderRadius: 6, fontSize: 13, color: "#065F46" }}>
              ✅ 업로드 완료!
              <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                <li>학년도: <strong>{uploadResult.year}</strong></li>
                <li>기존 데이터 삭제: {uploadResult.deleted.toLocaleString()}건</li>
                <li>신규 INSERT: {uploadResult.inserted.toLocaleString()}건</li>
                <li>영구 보관 경로: <code>{uploadResult.saved_path}</code></li>
              </ul>
            </div>
          )}
        </div>

        {/* 학년도별 현황 */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>
            📊 학년도별 현황
          </h3>
          {loading ? (
            <p style={{ color: "#6b7280" }}>로딩 중...</p>
          ) : items.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
              아직 업로드된 데이터가 없습니다. 위에서 Excel을 업로드하세요.
            </div>
          ) : (
            <table className="table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>학년도</th>
                  <th style={{ textAlign: "right" }}>데이터 행 수</th>
                  <th style={{ textAlign: "left" }}>최근 import 시각</th>
                  <th style={{ textAlign: "left" }}>소스 파일</th>
                  <th style={{ textAlign: "center", width: 100 }}>작업</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.year}>
                    <td><strong>{item.year}학년도</strong></td>
                    <td style={{ textAlign: "right" }}>{item.count.toLocaleString()}건</td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>
                      {item.last_imported ? new Date(item.last_imported).toLocaleString("ko-KR") : "-"}
                    </td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{item.source_file || "-"}</td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(item.year)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
