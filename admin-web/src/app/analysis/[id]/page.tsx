"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import FileUploader from "@/components/FileUploader";
import {
  getAnalysisDetail,
  downloadSchoolRecord,
  uploadReport,
  updateAnalysisStatus,
} from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface AnalysisDetail {
  id: string;
  user_name: string;
  user_email: string;
  user_phone: string | null;
  status: string;
  school_record_filename: string;
  target_university: string | null;
  target_major: string | null;
  memo: string | null;
  admin_memo: string | null;
  created_at: string;
  processing_at: string | null;
  completed_at: string | null;
  has_report: boolean;
}

export default function AnalysisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<AnalysisDetail | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [adminMemo, setAdminMemo] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const res = await getAnalysisDetail(id);
      setData(res);
      setAdminMemo(res.admin_memo || "");
    } catch {}
  };

  const handleDownload = async () => {
    try {
      const res = await downloadSchoolRecord(id);
      window.open(res.download_url, "_blank");
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleUploadReport = async () => {
    if (!excelFile && !pdfFile) {
      setMessage("Excel 또는 PDF 파일을 선택해주세요");
      return;
    }
    const formData = new FormData();
    if (excelFile) formData.append("excel_file", excelFile);
    if (pdfFile) formData.append("pdf_file", pdfFile);

    try {
      await uploadReport(id, formData);
      setMessage("리포트가 업로드되었습니다");
      loadData();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateAnalysisStatus(id, newStatus, adminMemo || undefined);
      setMessage(`상태가 '${newStatus}'로 변경되었습니다`);
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
          <h1>분석 상세</h1>
          <button className="btn btn-outline" onClick={() => router.push("/analysis")}>목록으로</button>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
          </div>
        )}

        {/* 기본 정보 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>접수 정보</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div className="card-title">신청자</div>
              <div>{data.user_name} ({data.user_email})</div>
              {data.user_phone && <div style={{ fontSize: 13, color: "var(--gray-600)" }}>{data.user_phone}</div>}
            </div>
            <div>
              <div className="card-title">상태</div>
              <StatusBadge status={data.status} />
            </div>
            <div>
              <div className="card-title">접수일</div>
              <div>{new Date(data.created_at).toLocaleString("ko-KR")}</div>
            </div>
            <div>
              <div className="card-title">지원 대학/학과</div>
              <div>{data.target_university || "-"} / {data.target_major || "-"}</div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="card-title">사용자 메모</div>
              <div>{data.memo || "-"}</div>
            </div>
          </div>
        </div>

        {/* 학생부 다운로드 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>학생부 파일</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span>{data.school_record_filename}</span>
            <button className="btn btn-primary btn-sm" onClick={handleDownload}>다운로드</button>
          </div>
        </div>

        {/* 리포트 업로드 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>리포트 업로드</h2>
          {data.has_report && (
            <div style={{ marginBottom: 12, padding: "8px 12px", background: "#d4edda", borderRadius: 8, fontSize: 14, color: "#155724" }}>
              리포트가 이미 업로드되어 있습니다. 새로 업로드하면 덮어씁니다.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Excel 리포트</label>
              <FileUploader
                label="Excel 파일을 선택하세요 (.xlsx)"
                accept=".xlsx,.xls"
                onFileSelect={setExcelFile}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>PDF 리포트</label>
              <FileUploader
                label="PDF 파일을 선택하세요 (.pdf)"
                accept=".pdf"
                onFileSelect={setPdfFile}
              />
            </div>
          </div>
          <button className="btn btn-success" onClick={handleUploadReport}>리포트 업로드</button>
        </div>

        {/* 상태 변경 + 메모 */}
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>상태 관리</h2>
          <div className="form-group">
            <label>관리자 메모</label>
            <textarea
              className="form-control"
              value={adminMemo}
              onChange={(e) => setAdminMemo(e.target.value)}
              placeholder="관리자 메모를 입력하세요"
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {data.status === "pending" && (
              <button className="btn btn-primary" onClick={() => handleStatusChange("processing")}>분석 시작</button>
            )}
            {data.status === "processing" && (
              <button className="btn btn-success" onClick={() => handleStatusChange("completed")}>분석 완료</button>
            )}
            {data.status !== "cancelled" && data.status !== "completed" && (
              <button className="btn btn-danger" onClick={() => handleStatusChange("cancelled")}>취소</button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
