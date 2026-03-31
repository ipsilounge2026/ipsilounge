"use client";

import { useEffect, useState } from "react";

interface AdmissionCase {
  id: string;
  university: string;
  major: string;
  admission_year: number;
  admission_type: string;
  grade_average: number | null;
  setuek_grade: string | null;
  changche_grade: string | null;
  haengtuk_grade: string | null;
  strengths: string | null;
  key_activities: string | null;
  notes: string | null;
  is_public: boolean;
}

const EMPTY_FORM = {
  university: "",
  major: "",
  admission_year: new Date().getFullYear(),
  admission_type: "학생부종합",
  grade_average: "",
  setuek_grade: "",
  changche_grade: "",
  haengtuk_grade: "",
  strengths: "",
  key_activities: "",
  notes: "",
  is_public: true,
};

export default function AdmissionCasesAdminPage() {
  const [cases, setCases] = useState<AdmissionCase[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(true);

  function authHeader() {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  async function fetchCases() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/admission-cases`, {
      headers: authHeader(),
    });
    setCases(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchCases(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitCase() {
    const body = {
      ...form,
      grade_average: form.grade_average ? parseFloat(String(form.grade_average)) : null,
      setuek_grade: form.setuek_grade || null,
      changche_grade: form.changche_grade || null,
      haengtuk_grade: form.haengtuk_grade || null,
    };
    const url = editId
      ? `${process.env.NEXT_PUBLIC_API_URL}/admin/admission-cases/${editId}`
      : `${process.env.NEXT_PUBLIC_API_URL}/admin/admission-cases`;
    const method = editId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: authHeader(), body: JSON.stringify(body) });
    if (res.ok) {
      setShowForm(false);
      setEditId(null);
      setForm({ ...EMPTY_FORM });
      fetchCases();
    }
  }

  function startEdit(c: AdmissionCase) {
    setEditId(c.id);
    setForm({
      university: c.university,
      major: c.major,
      admission_year: c.admission_year,
      admission_type: c.admission_type,
      grade_average: c.grade_average?.toString() ?? "",
      setuek_grade: c.setuek_grade ?? "",
      changche_grade: c.changche_grade ?? "",
      haengtuk_grade: c.haengtuk_grade ?? "",
      strengths: c.strengths ?? "",
      key_activities: c.key_activities ?? "",
      notes: c.notes ?? "",
      is_public: c.is_public,
    });
    setShowForm(true);
  }

  async function deleteCase(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/admission-cases/${id}`, {
      method: "DELETE",
      headers: authHeader(),
    });
    fetchCases();
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">합격 사례 관리</h1>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm({ ...EMPTY_FORM }); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
        >
          + 사례 추가
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="font-semibold mb-4">{editId ? "사례 수정" : "새 합격 사례 등록"}</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {[
              { key: "university", label: "대학명", type: "text" },
              { key: "major", label: "학과명", type: "text" },
              { key: "admission_year", label: "입학 연도", type: "number" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                <input
                  type={type}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={(form as Record<string, unknown>)[key] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">전형 유형</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.admission_type}
                onChange={(e) => setForm((f) => ({ ...f, admission_type: e.target.value }))}
              >
                {["학생부교과", "학생부종합", "논술", "기타"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">내신 평균 등급</label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="5"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.grade_average}
                onChange={(e) => setForm((f) => ({ ...f, grade_average: e.target.value }))}
              />
            </div>
            {["setuek_grade", "changche_grade", "haengtuk_grade"].map((key) => (
              <div key={key}>
                <label className="text-xs text-gray-500 mb-1 block">
                  {key === "setuek_grade" ? "세특 등급" : key === "changche_grade" ? "창체 등급" : "행특 등급"}
                </label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                >
                  <option value="">-</option>
                  {["S", "A", "B", "C", "D"].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            ))}
          </div>
          {[
            { key: "strengths", label: "합격 강점" },
            { key: "key_activities", label: "주요 활동 특징" },
            { key: "notes", label: "관리자 메모" },
          ].map(({ key, label }) => (
            <div key={key} className="mb-3">
              <label className="text-xs text-gray-500 mb-1 block">{label}</label>
              <textarea
                rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_public}
                onChange={(e) => setForm((f) => ({ ...f, is_public: e.target.checked }))}
              />
              사용자에게 공개
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={submitCase} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
              {editId ? "수정" : "등록"}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="border px-4 py-2 rounded-lg text-sm">
              취소
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">불러오는 중...</div>
      ) : cases.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl shadow">
          등록된 합격 사례가 없습니다.
        </div>
      ) : (
        <div className="grid gap-4">
          {cases.map((c) => (
            <div key={c.id} className="bg-white rounded-xl shadow p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="font-bold">{c.university}</span>
                  <span className="text-gray-500 ml-2">{c.major}</span>
                  <span className="ml-2 text-sm text-gray-400">{c.admission_year}학년도 {c.admission_type}</span>
                </div>
                <div className="flex gap-2">
                  {!c.is_public && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">비공개</span>
                  )}
                  <button onClick={() => startEdit(c)} className="text-xs text-blue-600 hover:underline">
                    수정
                  </button>
                  <button onClick={() => deleteCase(c.id)} className="text-xs text-red-400 hover:text-red-600">
                    삭제
                  </button>
                </div>
              </div>
              <div className="flex gap-3 text-sm text-gray-600 mb-2">
                {c.grade_average && <span>내신 {c.grade_average.toFixed(1)}</span>}
                {c.setuek_grade && <span>세특 {c.setuek_grade}</span>}
                {c.changche_grade && <span>창체 {c.changche_grade}</span>}
                {c.haengtuk_grade && <span>행특 {c.haengtuk_grade}</span>}
              </div>
              {c.strengths && <p className="text-sm text-gray-700">{c.strengths}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
