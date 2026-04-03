"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isLoggedIn, hasMenuAccess, getDefaultRoute } from "@/lib/auth";
import {
  getSeminarSchedules,
  getSeminarReservations,
  sendSeminarMail,
  getSeminarMailLogs,
  getSeminarMailLogDetail,
} from "@/lib/api";
import Link from "next/link";

export default function SeminarMailPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"send" | "history">("send");
  const [schedules, setSchedules] = useState<any[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [mailLogs, setMailLogs] = useState<any[]>([]);
  const [detailModal, setDetailModal] = useState<any>(null);

  const load = async () => {
    try {
      const [scheds, reservations, logs] = await Promise.all([
        getSeminarSchedules(),
        getSeminarReservations(undefined, "approved"),
        getSeminarMailLogs(),
      ]);
      setSchedules(scheds);
      // 승인된 예약에서 고유 지점명 추출
      const branchSet = new Set<string>();
      (reservations.items || []).forEach((r: any) => branchSet.add(r.branch_name));
      setBranches(Array.from(branchSet).sort());
      setMailLogs(logs);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    if (!hasMenuAccess("seminar")) { router.push(getDefaultRoute()); return; }
    load();
  }, []);

  const toggleSchedule = (id: string) => {
    setSelectedSchedules((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleBranch = (name: string) => {
    setSelectedBranches((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      alert("제목과 내용을 입력해주세요");
      return;
    }
    if (!confirm("메일을 발송하시겠습니까?")) return;
    setSending(true);
    try {
      const result = await sendSeminarMail({
        schedule_ids: selectedSchedules.length > 0 ? selectedSchedules : undefined,
        branch_names: selectedBranches.length > 0 ? selectedBranches : undefined,
        subject,
        body,
      });
      alert(result.message);
      setSubject("");
      setBody("");
      setSelectedSchedules([]);
      setSelectedBranches([]);
      setActiveTab("history");
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSending(false);
    }
  };

  const showDetail = async (id: string) => {
    try {
      const detail = await getSeminarMailLogDetail(id);
      setDetailModal(detail);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const previewCount = () => {
    // 간단 프리뷰: 전체 or 선택된 지점 수
    if (selectedBranches.length === 0 && selectedSchedules.length === 0) return branches.length;
    if (selectedBranches.length > 0) return selectedBranches.length;
    return branches.length;
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 className="page-title">설명회 메일 발송</h1>
        <Link href="/seminar" className="btn btn-outline" style={{ textDecoration: "none" }}>목록으로</Link>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn ${activeTab === "send" ? "btn-primary" : "btn-outline"}`} onClick={() => setActiveTab("send")}>발송</button>
        <button className={`btn ${activeTab === "history" ? "btn-primary" : "btn-outline"}`} onClick={() => setActiveTab("history")}>발송 이력</button>
      </div>

      {activeTab === "send" && (
        <div className="card" style={{ padding: 24 }}>
          {/* 설명회 선택 */}
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">발송 대상 설명회 (미선택 시 전체)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {schedules.map((s: any) => (
                <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedSchedules.includes(s.id)} onChange={() => toggleSchedule(s.id)} />
                  {s.title}
                </label>
              ))}
            </div>
          </div>

          {/* 지점 선택 */}
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">발송 대상 지점 (미선택 시 전체)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {branches.map((b) => (
                <label key={b} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedBranches.includes(b)} onChange={() => toggleBranch(b)} />
                  {b}
                </label>
              ))}
              {branches.length === 0 && <span style={{ color: "#9ca3af", fontSize: 13 }}>승인된 예약이 없어 발송 대상이 없습니다</span>}
            </div>
          </div>

          <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
            발송 예정: 약 {previewCount()}개 지점
          </div>

          {/* 메일 내용 */}
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">메일 제목 *</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">메일 내용 *</label>
            <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} rows={8} style={{ width: "100%" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? "발송 중..." : "메일 발송"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div style={{ display: "grid", gap: 12 }}>
          {mailLogs.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>발송 이력이 없습니다</div>
          )}
          {mailLogs.map((log: any) => (
            <div
              key={log.id}
              className="card"
              style={{ padding: 16, cursor: "pointer" }}
              onClick={() => showDetail(log.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{log.subject}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {new Date(log.sent_at).toLocaleString("ko-KR")} | 설명회: {log.schedule_names || "전체"} | 지점: {log.branch_names || "전체"}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: "#3b82f6" }}>{log.success_count}/{log.total_count}건</div>
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {log.body?.slice(0, 100)}...
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 상세 모달 */}
      {detailModal && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: 24, maxWidth: 600, maxHeight: "80vh", overflow: "auto" }}>
            <h3 style={{ marginBottom: 12 }}>{detailModal.subject}</h3>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              발송: {new Date(detailModal.sent_at).toLocaleString("ko-KR")} | {detailModal.success_count}/{detailModal.total_count}건
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              설명회: {detailModal.schedule_names || "전체"} | 지점: {detailModal.branch_names || "전체"}
            </div>
            <div style={{ whiteSpace: "pre-wrap", marginBottom: 16, padding: 12, backgroundColor: "#f9fafb", borderRadius: 8, fontSize: 14 }}>
              {detailModal.body}
            </div>
            <div>
              <h4 style={{ marginBottom: 8 }}>수신자 목록</h4>
              {(() => {
                try {
                  const recipients = JSON.parse(detailModal.recipients || "[]");
                  return (
                    <table className="table" style={{ fontSize: 13 }}>
                      <thead><tr><th>지점명</th><th>이메일</th></tr></thead>
                      <tbody>
                        {recipients.map((r: any, i: number) => <tr key={i}><td>{r.branch_name}</td><td>{r.email}</td></tr>)}
                      </tbody>
                    </table>
                  );
                } catch { return <span style={{ color: "#9ca3af" }}>수신자 정보 없음</span>; }
              })()}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setDetailModal(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
