"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { getConsultationNotes, createConsultationNote, updateConsultationNote, deleteConsultationNote, getUsers } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

interface Note {
  id: string;
  user_id: string;
  booking_id: string | null;
  admin_id: string | null;
  category: string;
  consultation_date: string;
  student_grade: string | null;
  goals: string | null;
  main_content: string;
  advice_given: string | null;
  next_steps: string | null;
  next_topic: string | null;
  admin_private_notes: string | null;
  is_visible_to_user: boolean;
  created_at: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
}

const CATEGORIES = ["학생부분석", "입시전략", "학교생활", "공부법", "진로", "심리정서", "기타"];
const GRADES = ["고1", "고2", "고3", "재수생", "기타"];

const CATEGORY_MAP: Record<string, string> = {
  "학생부분석": "analysis",
  "입시전략": "strategy",
  "학교생활": "school_life",
  "공부법": "study_method",
  "진로": "career",
  "심리정서": "mental",
  "기타": "other",
};
const CATEGORY_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([k, v]) => [v, k])
);
const GRADE_MAP: Record<string, string> = {
  "고1": "grade1", "고2": "grade2", "고3": "grade3", "재수생": "reexam", "기타": "other",
};
const GRADE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(GRADE_MAP).map(([k, v]) => [v, k])
);

function displayCategory(val: string) { return CATEGORY_REVERSE[val] || val; }
function displayGrade(val: string | null) { return val ? (GRADE_REVERSE[val] || val) : ""; }

function ConsultationNotesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preUserId = searchParams.get("user_id") || "";
  const preBookingId = searchParams.get("booking_id") || "";
  const preUserName = searchParams.get("user_name") || "";
  const preDate = searchParams.get("date") || "";

  const [notes, setNotes] = useState<Note[]>([]);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(!!preUserId);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 사용자 검색
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserItem[]>([]);
  const [searching, setSearching] = useState(false);

  // 폼 상태
  const [form, setForm] = useState({
    user_id: preUserId,
    user_name: preUserName,
    booking_id: preBookingId || "",
    category: "학생부분석",
    consultation_date: preDate || new Date().toISOString().split("T")[0],
    student_grade: "",
    goals: "",
    main_content: "",
    advice_given: "",
    next_steps: "",
    next_topic: "",
    admin_private_notes: "",
    is_visible_to_user: false,
  });

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const data = await getConsultationNotes();
      setNotes(data);
    } catch {}
  };

  const handleUserSearch = async () => {
    if (!userSearch.trim()) return;
    setSearching(true);
    try {
      const res = await getUsers(1, userSearch.trim());
      setUserResults(res.items?.map((u: any) => ({ id: u.id, name: u.name, email: u.email })) || []);
    } catch { setUserResults([]); }
    setSearching(false);
  };

  const selectUser = (user: UserItem) => {
    setForm(prev => ({ ...prev, user_id: user.id, user_name: `${user.name} (${user.email})` }));
    setUserResults([]);
    setUserSearch("");
  };

  const resetForm = () => {
    setForm({
      user_id: "", user_name: "", booking_id: "", category: "학생부분석",
      consultation_date: new Date().toISOString().split("T")[0],
      student_grade: "", goals: "", main_content: "", advice_given: "",
      next_steps: "", next_topic: "", admin_private_notes: "", is_visible_to_user: false,
    });
    setEditingNote(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.user_id || !form.main_content) {
      setMessage("대상 학생과 상담 내용은 필수입니다");
      return;
    }
    try {
      const payload = {
        user_id: form.user_id,
        booking_id: form.booking_id || undefined,
        category: CATEGORY_MAP[form.category] || form.category,
        consultation_date: form.consultation_date,
        student_grade: form.student_grade ? (GRADE_MAP[form.student_grade] || form.student_grade) : undefined,
        goals: form.goals || undefined,
        main_content: form.main_content,
        advice_given: form.advice_given || undefined,
        next_steps: form.next_steps || undefined,
        next_topic: form.next_topic || undefined,
        admin_private_notes: form.admin_private_notes || undefined,
        is_visible_to_user: form.is_visible_to_user,
      };

      if (editingNote) {
        await updateConsultationNote(editingNote.id, payload);
        setMessage("상담 기록이 수정되었습니다");
      } else {
        await createConsultationNote(payload as any);
        setMessage("상담 기록이 작성되었습니다");
      }
      resetForm();
      loadNotes();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleEdit = (note: Note) => {
    setForm({
      user_id: note.user_id,
      user_name: note.user_id,
      booking_id: note.booking_id || "",
      category: displayCategory(note.category),
      consultation_date: note.consultation_date,
      student_grade: displayGrade(note.student_grade),
      goals: note.goals || "",
      main_content: note.main_content,
      advice_given: note.advice_given || "",
      next_steps: note.next_steps || "",
      next_topic: note.next_topic || "",
      admin_private_notes: note.admin_private_notes || "",
      is_visible_to_user: note.is_visible_to_user,
    });
    setEditingNote(note);
    setShowForm(true);
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm("이 상담 기록을 삭제하시겠습니까?")) return;
    try {
      await deleteConsultationNote(noteId);
      setMessage("삭제되었습니다");
      loadNotes();
    } catch (err: any) { setMessage(err.message); }
  };

  const handleVisibilityToggle = async (note: Note) => {
    try {
      await updateConsultationNote(note.id, { is_visible_to_user: !note.is_visible_to_user });
      setMessage(note.is_visible_to_user ? "학생에게 비공개로 변경" : "학생에게 공개로 변경");
      loadNotes();
    } catch (err: any) { setMessage(err.message); }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1>상담 기록 관리</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/consultation" className="btn btn-outline">상담 예약 관리</Link>
            <button className="btn btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}>
              {showForm ? "취소" : "새 기록 작성"}
            </button>
          </div>
        </div>

        {message && (
          <div style={{ padding: "12px 16px", background: "#d4edda", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {message}
            <button onClick={() => setMessage("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer" }}>x</button>
          </div>
        )}

        {/* 기록 작성/수정 폼 */}
        {showForm && (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ marginBottom: 16 }}>{editingNote ? "상담 기록 수정" : "상담 기록 작성"}</h3>

            {/* 학생 선택 */}
            {!form.user_id ? (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>대상 학생 검색</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="form-control" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleUserSearch()} placeholder="이름 또는 이메일" style={{ flex: 1 }} />
                  <button className="btn btn-primary" onClick={handleUserSearch} disabled={searching}>검색</button>
                </div>
                {userResults.length > 0 && (
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginTop: 8, overflow: "hidden" }}>
                    {userResults.map(u => (
                      <div key={u.id} onClick={() => selectUser(u)} style={{ padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                        onMouseOver={e => (e.currentTarget.style.background = "#eff6ff")}
                        onMouseOut={e => (e.currentTarget.style.background = "")}>
                        <strong>{u.name}</strong> <span style={{ color: "#6b7280", fontSize: 13 }}>{u.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 12, background: "#eff6ff", borderRadius: 8, marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
                <span><strong>대상:</strong> {form.user_name}</span>
                {!editingNote && (
                  <button onClick={() => setForm(prev => ({ ...prev, user_id: "", user_name: "" }))}
                    style={{ fontSize: 13, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>변경</button>
                )}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div className="form-group">
                <label>카테고리</label>
                <select className="form-control" value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>상담일</label>
                <input className="form-control" type="date" value={form.consultation_date} onChange={e => setForm(prev => ({ ...prev, consultation_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>학년</label>
                <select className="form-control" value={form.student_grade} onChange={e => setForm(prev => ({ ...prev, student_grade: e.target.value }))}>
                  <option value="">선택</option>
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>상담 목표/요청사항</label>
              <textarea className="form-control" rows={2} value={form.goals} onChange={e => setForm(prev => ({ ...prev, goals: e.target.value }))} placeholder="학생/학부모가 요청한 내용" />
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>상담 내용 *</label>
              <textarea className="form-control" rows={5} value={form.main_content} onChange={e => setForm(prev => ({ ...prev, main_content: e.target.value }))} placeholder="주요 상담 내용을 기록하세요" />
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>조언</label>
              <textarea className="form-control" rows={3} value={form.advice_given} onChange={e => setForm(prev => ({ ...prev, advice_given: e.target.value }))} placeholder="제공한 조언" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div className="form-group">
                <label>실행 계획</label>
                <textarea className="form-control" rows={2} value={form.next_steps} onChange={e => setForm(prev => ({ ...prev, next_steps: e.target.value }))} placeholder="학생이 실행할 내용" />
              </div>
              <div className="form-group">
                <label>다음 상담 주제</label>
                <textarea className="form-control" rows={2} value={form.next_topic} onChange={e => setForm(prev => ({ ...prev, next_topic: e.target.value }))} placeholder="다음 상담에서 다룰 주제" />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>관리자 메모 (학생 비공개)</label>
              <textarea className="form-control" rows={2} value={form.admin_private_notes} onChange={e => setForm(prev => ({ ...prev, admin_private_notes: e.target.value }))} placeholder="내부용 메모 (학생에게 보이지 않음)" />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={form.is_visible_to_user} onChange={e => setForm(prev => ({ ...prev, is_visible_to_user: e.target.checked }))} />
                학생에게 공개
              </label>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>체크하면 학생의 "상담 기록" 페이지에서 볼 수 있습니다</span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSubmit}>{editingNote ? "수정 저장" : "기록 저장"}</button>
              <button className="btn btn-outline" onClick={resetForm}>취소</button>
            </div>
          </div>
        )}

        {/* 기록 목록 */}
        <div style={{ fontSize: 14, color: "var(--gray-600)", marginBottom: 12 }}>총 {notes.length}건의 상담 기록</div>
        {notes.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--gray-500)" }}>아직 작성된 상담 기록이 없습니다</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>상담일</th>
                  <th>카테고리</th>
                  <th>학년</th>
                  <th>내용 요약</th>
                  <th>공개</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {notes.map(note => (
                  <tr key={note.id}>
                    <td>{note.consultation_date}</td>
                    <td><span className="badge badge-processing">{displayCategory(note.category)}</span></td>
                    <td>{displayGrade(note.student_grade) || "-"}</td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {note.main_content.slice(0, 60)}{note.main_content.length > 60 ? "..." : ""}
                    </td>
                    <td>
                      <button
                        onClick={() => handleVisibilityToggle(note)}
                        className={`btn btn-sm ${note.is_visible_to_user ? "btn-success" : ""}`}
                        style={note.is_visible_to_user ? {} : { background: "#f3f4f6", color: "#9ca3af" }}
                      >
                        {note.is_visible_to_user ? "공개" : "비공개"}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => handleEdit(note)}>수정</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(note.id)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ConsultationNotesPage() {
  return (
    <Suspense fallback={<div className="admin-layout"><Sidebar /><main className="admin-main"><p>로딩 중...</p></main></div>}>
      <ConsultationNotesInner />
    </Suspense>
  );
}
