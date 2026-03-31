"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface StudentProfile {
  user: { id: string; name: string; email: string; phone: string; created_at: string };
  total_count: number;
  category_summary: Record<string, number>;
  notes: ConsultationNote[];
}

interface ConsultationNote {
  id: string;
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

const CATEGORY_LABEL: Record<string, string> = {
  학생부분석: "학생부분석",
  입시전략: "입시전략",
  학교생활: "학교생활",
  공부법: "공부법",
  진로: "진로",
  심리정서: "심리정서",
  기타: "기타",
};

export default function StudentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({
    category: "학생부분석",
    consultation_date: new Date().toISOString().split("T")[0],
    student_grade: "",
    goals: "",
    main_content: "",
    advice_given: "",
    next_steps: "",
    next_topic: "",
    admin_private_notes: "",
    is_visible_to_user: false,
  });

  function authHeader() {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  async function fetchProfile() {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/admin/consultation-notes/user/${userId}`,
      { headers: authHeader() }
    );
    const data = await res.json();
    setProfile(data);
    setLoading(false);
  }

  useEffect(() => { fetchProfile(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitNote() {
    const body = { ...noteForm, user_id: userId };
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/consultation-notes`, {
      method: "POST",
      headers: authHeader(),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setShowNoteForm(false);
      fetchProfile();
    }
  }

  async function deleteNote(noteId: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/consultation-notes/${noteId}`, {
      method: "DELETE",
      headers: authHeader(),
    });
    fetchProfile();
  }

  if (loading) return <div className="p-6 text-gray-400">불러오는 중...</div>;
  if (!profile) return <div className="p-6 text-gray-400">학생 정보를 찾을 수 없습니다.</div>;

  return (
    <div className="p-6 max-w-4xl">
      <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 mb-4 text-sm">
        ← 뒤로
      </button>

      {/* 학생 기본 정보 */}
      <div className="bg-white rounded-xl shadow p-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{profile.user.name}</h1>
            <p className="text-gray-500">{profile.user.email}</p>
            {profile.user.phone && <p className="text-gray-500">{profile.user.phone}</p>}
            <p className="text-xs text-gray-400 mt-1">
              가입일: {new Date(profile.user.created_at).toLocaleDateString("ko-KR")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-blue-600">{profile.total_count}</p>
            <p className="text-sm text-gray-500">총 상담 횟수</p>
          </div>
        </div>

        {/* 카테고리별 통계 */}
        {Object.keys(profile.category_summary).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
            {Object.entries(profile.category_summary).map(([cat, cnt]) => (
              <span key={cat} className="bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full">
                {CATEGORY_LABEL[cat] ?? cat} {cnt}회
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 상담 기록 추가 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">상담 기록</h2>
        <button
          onClick={() => setShowNoteForm(true)}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700"
        >
          + 기록 추가
        </button>
      </div>

      {showNoteForm && (
        <div className="bg-white rounded-xl shadow p-5 mb-4">
          <h3 className="font-semibold mb-4">새 상담 기록</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">상담 유형</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={noteForm.category}
                onChange={(e) => setNoteForm((f) => ({ ...f, category: e.target.value }))}
              >
                {Object.keys(CATEGORY_LABEL).map((k) => (
                  <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">상담 일자</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={noteForm.consultation_date}
                onChange={(e) => setNoteForm((f) => ({ ...f, consultation_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">학생 현황</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={noteForm.student_grade}
                onChange={(e) => setNoteForm((f) => ({ ...f, student_grade: e.target.value }))}
              >
                <option value="">선택</option>
                {["고1", "고2", "고3", "재수생", "기타"].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={noteForm.is_visible_to_user}
                  onChange={(e) => setNoteForm((f) => ({ ...f, is_visible_to_user: e.target.checked }))}
                />
                학생에게 공개
              </label>
            </div>
          </div>
          {[
            { key: "goals", label: "상담 목표/요청사항" },
            { key: "main_content", label: "주요 상담 내용 *" },
            { key: "advice_given", label: "제공한 조언" },
            { key: "next_steps", label: "다음 실행 계획" },
            { key: "next_topic", label: "다음 상담 예정 주제" },
            { key: "admin_private_notes", label: "관리자 전용 메모" },
          ].map(({ key, label }) => (
            <div key={key} className="mb-3">
              <label className="text-xs text-gray-500 mb-1 block">{label}</label>
              <textarea
                rows={key === "main_content" ? 4 : 2}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                value={(noteForm as Record<string, string>)[key]}
                onChange={(e) => setNoteForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={submitNote} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
              저장
            </button>
            <button onClick={() => setShowNoteForm(false)} className="border px-4 py-2 rounded-lg text-sm">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 상담 기록 목록 */}
      {profile.notes.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl shadow">
          상담 기록이 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {profile.notes.map((note) => (
            <div key={note.id} className="bg-white rounded-xl shadow p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex gap-2 items-center">
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">
                    {CATEGORY_LABEL[note.category] ?? note.category}
                  </span>
                  {note.student_grade && (
                    <span className="text-xs text-gray-500">{note.student_grade}</span>
                  )}
                  {note.is_visible_to_user && (
                    <span className="text-xs text-green-600">학생공개</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {new Date(note.consultation_date).toLocaleDateString("ko-KR")}
                  </span>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    삭제
                  </button>
                </div>
              </div>

              {note.goals && (
                <div className="mb-2">
                  <span className="text-xs font-semibold text-gray-400">요청사항</span>
                  <p className="text-sm mt-0.5">{note.goals}</p>
                </div>
              )}
              <div className="mb-2">
                <span className="text-xs font-semibold text-gray-400">상담 내용</span>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{note.main_content}</p>
              </div>
              {note.advice_given && (
                <div className="mb-2">
                  <span className="text-xs font-semibold text-gray-400">조언</span>
                  <p className="text-sm mt-0.5">{note.advice_given}</p>
                </div>
              )}
              {note.next_steps && (
                <div className="mb-2">
                  <span className="text-xs font-semibold text-gray-400">실행 계획</span>
                  <p className="text-sm mt-0.5">{note.next_steps}</p>
                </div>
              )}
              {note.next_topic && (
                <div className="pt-2 border-t">
                  <span className="text-xs text-blue-600">다음 상담: {note.next_topic}</span>
                </div>
              )}
              {note.admin_private_notes && (
                <div className="mt-2 bg-yellow-50 rounded-lg p-2">
                  <span className="text-xs font-semibold text-yellow-700">관리자 메모</span>
                  <p className="text-sm mt-0.5 text-yellow-800">{note.admin_private_notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
