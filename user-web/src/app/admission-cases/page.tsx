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
}

const ADMISSION_TYPE_LABEL: Record<string, string> = {
  학생부교과: "교과",
  학생부종합: "학종",
  논술: "논술",
  기타: "기타",
};

export default function AdmissionCasesPage() {
  const [cases, setCases] = useState<AdmissionCase[]>([]);
  const [search, setSearch] = useState({ university: "", major: "" });
  const [loading, setLoading] = useState(true);

  async function fetchCases() {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const params = new URLSearchParams();
      if (search.university) params.set("university", search.university);
      if (search.major) params.set("major", search.major);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/admission-cases?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      setCases(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCases(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">합격 사례 DB</h1>

      {/* 검색 */}
      <div className="flex gap-3 mb-6">
        <input
          className="border rounded-lg px-3 py-2 flex-1"
          placeholder="대학명 검색"
          value={search.university}
          onChange={(e) => setSearch((s) => ({ ...s, university: e.target.value }))}
        />
        <input
          className="border rounded-lg px-3 py-2 flex-1"
          placeholder="학과명 검색"
          value={search.major}
          onChange={(e) => setSearch((s) => ({ ...s, major: e.target.value }))}
        />
        <button
          onClick={fetchCases}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          검색
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">불러오는 중...</div>
      ) : cases.length === 0 ? (
        <div className="text-center py-12 text-gray-400">등록된 합격 사례가 없습니다.</div>
      ) : (
        <div className="grid gap-4">
          {cases.map((c) => (
            <div key={c.id} className="bg-white rounded-xl shadow p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="font-bold text-lg">{c.university}</span>
                  <span className="text-gray-500 ml-2">{c.major}</span>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                    {c.admission_year}학년도
                  </span>
                  <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                    {ADMISSION_TYPE_LABEL[c.admission_type] ?? c.admission_type}
                  </span>
                </div>
              </div>

              <div className="flex gap-4 text-sm text-gray-600 mb-3">
                {c.grade_average && <span>내신 {c.grade_average.toFixed(1)}등급</span>}
                {c.setuek_grade && <span>세특 {c.setuek_grade}</span>}
                {c.changche_grade && <span>창체 {c.changche_grade}</span>}
                {c.haengtuk_grade && <span>행특 {c.haengtuk_grade}</span>}
              </div>

              {c.strengths && (
                <div className="mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">합격 강점</span>
                  <p className="text-sm mt-1">{c.strengths}</p>
                </div>
              )}
              {c.key_activities && (
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">주요 활동</span>
                  <p className="text-sm mt-1 text-gray-700">{c.key_activities}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
