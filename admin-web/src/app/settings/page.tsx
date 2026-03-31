"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isLoggedIn } from "@/lib/auth";

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
  }, []);

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>설정</h1>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>서비스 정보</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div className="card-title">서비스명</div>
              <div>입시라운지 (IpsiLounge)</div>
            </div>
            <div>
              <div className="card-title">API 버전</div>
              <div>1.0.0</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>공지사항 관리</h2>
          <p style={{ color: "var(--gray-500)", fontSize: 14 }}>
            공지사항 기능은 추후 업데이트 예정입니다
          </p>
        </div>
      </main>
    </div>
  );
}
