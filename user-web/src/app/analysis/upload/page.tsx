"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { uploadSchoolRecord } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [university, setUniversity] = useState("");
  const [major, setMajor] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (typeof window !== "undefined" && !isLoggedIn()) {
    router.push("/login");
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) { setError("학생부 파일을 선택해주세요"); return; }
    setError("");
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    if (university) formData.append("target_university", university);
    if (major) formData.append("target_major", major);
    if (memo) formData.append("memo", memo);

    try {
      await uploadSchoolRecord(formData);
      router.push("/analysis");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="page-header">
          <h1>학생부 업로드</h1>
        </div>

        <div className="card">
          {error && <div className="error-msg">{error}</div>}

          {/* 파일 선택 */}
          <div className="form-group">
            <label>학생부 파일</label>
            <div className="file-upload-area" onClick={() => fileInputRef.current?.click()}>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
              {file ? (
                <p className="file-name">{file.name}</p>
              ) : (
                <>
                  <div className="upload-icon">📁</div>
                  <p>클릭하여 파일을 선택하세요</p>
                  <p style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 4 }}>PDF, JPG, PNG 지원 (최대 20MB)</p>
                </>
              )}
            </div>
          </div>

          {/* 지원 대학/학과 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="form-group">
              <label>지원 대학 (선택)</label>
              <input type="text" className="form-control" value={university}
                onChange={(e) => setUniversity(e.target.value)} placeholder="예: 서울대학교" />
            </div>
            <div className="form-group">
              <label>지원 학과 (선택)</label>
              <input type="text" className="form-control" value={major}
                onChange={(e) => setMajor(e.target.value)} placeholder="예: 경영학과" />
            </div>
          </div>

          <div className="form-group">
            <label>메모 (선택)</label>
            <textarea className="form-control" value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="분석 시 참고할 사항이 있으면 입력해주세요" />
          </div>

          <button className="btn btn-primary btn-block btn-lg" onClick={handleSubmit} disabled={loading}>
            {loading ? "업로드 중..." : "분석 요청하기"}
          </button>
        </div>
      </div>
      <Footer />
    </>
  );
}
