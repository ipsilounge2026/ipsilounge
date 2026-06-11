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

type DataSource = "대교협" | "자체발표";

interface YearSummary {
  year: number;
  source: DataSource;
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
    display_year?: number;
    mode?: string;
    source?: string;
    deleted: number;
    inserted: number;
    source_file: string;
    saved_path: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearOverride, setYearOverride] = useState<string>("");
  const [importMode, setImportMode] = useState<"full" | "partial">("full");
  const [dataSource, setDataSource] = useState<DataSource>("대교협");
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
      const res = await uploadAdigaResults(file, yearNum, importMode, dataSource);
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

  const handleDelete = async (year: number, source: DataSource) => {
    const target = items.find((i) => i.year === year && i.source === source);
    if (!confirm(`${year}학년도 [${source}] 입결 데이터 ${target?.count.toLocaleString()}건을 삭제하시겠습니까?\n같은 학년도의 다른 출처 데이터는 유지되며, 영구 저장된 Excel 파일은 보존됩니다.`)) {
      return;
    }
    try {
      await deleteAdigaResultsYear(year, source);
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
              <li>
                파일명 권장 (끝의 4자리 = 실제 입결 연도): 대교협 <code>adiga_입결_2026.xlsx</code> /
                자체발표 <code>자체발표_입결_2026.xlsx</code>
              </li>
              <li>
                지원 형식 (자동 감지): ① 시트 <code>전년도입결</code> 1개 (표준 37컬럼) ②{" "}
                <code>입결_종합</code>/<code>입결_교과</code>/<code>입결_수능</code> 3시트 ③{" "}
                <code>수시</code>/<code>정시</code> 2시트 (최종 정리 형식)
              </li>
              <li>
                자료 출처: <strong>대교협</strong>(대학어디가 공시) / <strong>자체발표</strong>(대학 입학처 발표) —
                같은 학년도라도 출처별로 별도 보관되며, 교체도 같은 출처끼리만 수행됩니다
              </li>
              <li>교체 방식: <strong>전체 교체</strong>(해당 연도·출처 전부 새로) / <strong>부분 교체</strong>(파일에 포함된 대학만 교체, 나머지 유지)</li>
              <li>업로드된 파일은 import 성공 시 <code>backend/data/admission_results/</code> 에 영구 보관됩니다 (백업·복원용)</li>
            </ul>
            <div style={{ marginTop: 10, padding: 10, background: "#FEF3C7", borderRadius: 4, fontSize: 11, color: "#92400E" }}>
              <strong>📌 학년도 의미:</strong> 여기서 입력하는 학년도는 <strong>실제 입결이 발생한 연도</strong> 입니다.
              예: 2026학년도 입결은 <code>2026</code> 으로 저장됩니다.<br/>
              사용자 페이지에서는 자동으로 한 학년도 위(2027학년도 페이지)에 &quot;전년도 입시결과&quot;로 표시됩니다.
            </div>
          </div>

          {/* 자료 출처 선택 */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>
              자료 출처
            </label>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="dataSource"
                  checked={dataSource === "대교협"}
                  onChange={() => setDataSource("대교협")}
                  disabled={uploading}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <strong>대교협 (대학어디가 공시)</strong>
                  <span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>
                    사용자 페이지 &quot;전년도 입시결과(대교협)&quot; 버튼에 표시
                  </span>
                </span>
              </label>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="dataSource"
                  checked={dataSource === "자체발표"}
                  onChange={() => setDataSource("자체발표")}
                  disabled={uploading}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <strong>자체발표 (대학 입학처 발표)</strong>
                  <span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>
                    사용자 페이지 &quot;전년도 입시결과(자체발표)&quot; 버튼에 표시
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* 교체 방식 선택 */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>
              교체 방식
            </label>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === "full"}
                  onChange={() => setImportMode("full")}
                  disabled={uploading}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <strong>전체 교체</strong>
                  <span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>
                    해당 연도 기존 데이터를 전부 지우고 파일 내용으로 교체 (파일이 그 연도의 전체 데이터일 때)
                  </span>
                </span>
              </label>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === "partial"}
                  onChange={() => setImportMode("partial")}
                  disabled={uploading}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <strong>부분 교체 (대학 단위)</strong>
                  <span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>
                    파일에 포함된 대학만 교체하고, 파일에 없는 대학의 기존 데이터는 유지 (일부 대학만 수정해 올릴 때)
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>
                입결 연도 (선택)
              </label>
              <input
                type="number"
                className="form-control"
                placeholder="예: 2026"
                value={yearOverride}
                onChange={(e) => setYearOverride(e.target.value)}
                disabled={uploading}
                style={{ maxWidth: 160 }}
              />
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                파일명이 <code>adiga_입결_2026.xlsx</code> / <code>자체발표_입결_2026.xlsx</code>{" "}
                처럼 4자리 연도로 끝나면 자동 추출됩니다
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
                <li>입결 연도: <strong>{uploadResult.year}학년도</strong></li>
                <li>자료 출처: <strong>{uploadResult.source ?? "대교협"}</strong></li>
                <li>사용자 페이지 표시: <strong>{uploadResult.display_year ?? uploadResult.year + 1}학년도 페이지</strong> (전년도 입시결과({uploadResult.source ?? "대교협"}))</li>
                <li>교체 방식: <strong>{uploadResult.mode === "partial" ? "부분 교체 (파일 포함 대학만)" : "전체 교체"}</strong></li>
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
                  <th style={{ textAlign: "left" }}>입결 연도</th>
                  <th style={{ textAlign: "left" }}>출처</th>
                  <th style={{ textAlign: "left" }}>표시 페이지</th>
                  <th style={{ textAlign: "right" }}>데이터 행 수</th>
                  <th style={{ textAlign: "left" }}>최근 import 시각</th>
                  <th style={{ textAlign: "left" }}>소스 파일</th>
                  <th style={{ textAlign: "center", width: 100 }}>작업</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.year}-${item.source}`}>
                    <td><strong>{item.year}학년도 입결</strong></td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          background: item.source === "자체발표" ? "#EDE9FE" : "#DBEAFE",
                          color: item.source === "자체발표" ? "#6D28D9" : "#1D4ED8",
                        }}
                      >
                        {item.source || "대교협"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{item.year + 1}학년도 페이지</td>
                    <td style={{ textAlign: "right" }}>{item.count.toLocaleString()}건</td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>
                      {item.last_imported ? new Date(item.last_imported).toLocaleString("ko-KR") : "-"}
                    </td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{item.source_file || "-"}</td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(item.year, item.source || "대교협")}
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
