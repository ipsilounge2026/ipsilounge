"use client";

import { useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { uploadSchoolRecordToOrder } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

export default function UploadToOrderPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
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

    try {
      await uploadSchoolRecordToOrder(orderId, formData);
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
          <h1>학생부 파일 업로드</h1>
        </div>

        <div className="card">
          <div style={{
            padding: 16,
            marginBottom: 20,
            borderRadius: 8,
            backgroundColor: "#FFF7ED",
            border: "1px solid #FED7AA",
          }}>
            <p style={{ fontSize: 14, color: "var(--gray-700)", margin: 0 }}>
              ⚠️ 신청이 완료되었습니다. 학생부 파일을 업로드해야 분석이 시작됩니다.
            </p>
          </div>

          {error && <div className="error-msg">{error}</div>}

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
                  <p style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 4 }}>PDF, JPG, PNG 지원</p>
                </>
              )}
            </div>
          </div>

          <button className="btn btn-primary btn-block btn-lg" onClick={handleSubmit} disabled={loading}>
            {loading ? "업로드 중..." : "파일 업로드"}
          </button>
        </div>
      </div>
      <Footer />
    </>
  );
}
