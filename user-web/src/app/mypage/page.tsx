"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getMe, updateMe, getNotifications } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  created_at: string;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export default function MyPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    getMe().then((u) => { setUser(u); setName(u.name); setPhone(u.phone || ""); }).catch(() => {});
    getNotifications().then((res) => setNotifications(res.items)).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      const updated = await updateMe({ name, phone: phone || undefined });
      setUser(updated);
      setEditing(false);
      setMessage("정보가 수정되었습니다");
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  if (!user) return <><Navbar /><div className="container"><p>로딩 중...</p></div></>;

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="page-header">
          <h1>마이페이지</h1>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
          </div>
        )}

        {/* 회원 정보 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16 }}>회원 정보</h2>
            {!editing && <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>수정</button>}
          </div>

          {editing ? (
            <>
              <div className="form-group">
                <label>이름</label>
                <input type="text" className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>연락처</label>
                <input type="tel" className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={handleSave}>저장</button>
                <button className="btn btn-outline" onClick={() => { setEditing(false); setName(user.name); setPhone(user.phone || ""); }}>취소</button>
              </div>
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>이름</div>
                <div>{user.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>이메일</div>
                <div>{user.email}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>연락처</div>
                <div>{user.phone || "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 4 }}>가입일</div>
                <div>{new Date(user.created_at).toLocaleDateString("ko-KR")}</div>
              </div>
            </div>
          )}
        </div>

        {/* 바로가기 메뉴 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>빠른 메뉴</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { href: "/consultation/notes", icon: "📋", label: "상담 기록 보기" },
              { href: "/consultation/my", icon: "📅", label: "예약 현황" },
              { href: "/analysis", icon: "📊", label: "분석 내역" },
              { href: "/admission-cases", icon: "🏆", label: "합격 사례" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 14px", borderRadius: 10,
                  border: "1px solid var(--gray-200)",
                  fontSize: 14, color: "var(--gray-700)",
                  textDecoration: "none", fontWeight: 500,
                }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                {item.label}
              </a>
            ))}
          </div>
        </div>

        {/* 알림 */}
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>알림</h2>
          {notifications.length === 0 ? (
            <p style={{ color: "var(--gray-500)", fontSize: 14 }}>알림이 없습니다</p>
          ) : (
            notifications.slice(0, 10).map((n) => (
              <div key={n.id} style={{
                padding: "12px 0",
                borderBottom: "1px solid var(--gray-100)",
                opacity: n.is_read ? 0.6 : 1,
              }}>
                <div style={{ fontSize: 14, fontWeight: n.is_read ? 400 : 600 }}>{n.title}</div>
                <div style={{ fontSize: 13, color: "var(--gray-600)", marginTop: 2 }}>{n.body}</div>
                <div style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 4 }}>
                  {new Date(n.created_at).toLocaleString("ko-KR")}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
