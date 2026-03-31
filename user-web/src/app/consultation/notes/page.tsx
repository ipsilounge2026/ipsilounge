"use client";

import { useEffect, useState } from "react";

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

const CATEGORY_COLOR: Record<string, string> = {
  학생부분석: "bg-blue-100 text-blue-700",
  입시전략: "bg-purple-100 text-purple-700",
  학교생활: "bg-green-100 text-green-700",
  공부법: "bg-yellow-100 text-yellow-700",
  진로: "bg-orange-100 text-orange-700",
  심리정서: "bg-pink-100 text-pink-700",
  기타: "bg-gray-100 text-gray-600",
};

export default function ConsultationNotesPage() {
  const [notes, setNotes] = useState<ConsultationNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("전체");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/consultation-notes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setNotes(data))
      .finally(() => setLoading(false));
  }, []);

  // 카테고리 필터
  const filtered =
    selectedCategory === "전체"
      ? notes
      : notes.filter((n) => n.category === selectedCategory);

  // 카테고리별 횟수 집계
  const categoryCounts = notes.reduce<Record<string, number>>((acc, n) => {
    const key = n.category;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const categories = ["전체", ...Object.keys(CATEGORY_LABEL)];

  return (
    <div className="max-w-2xl mx-auto p-6">

      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">상담 기록</h1>
        <p className="text-sm text-gray-500">
          총 {notes.length}회의 상담 기록이 있습니다.
        </p>
      </div>

      {/* 카테고리 통계 칩 */}
      {notes.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.entries(categoryCounts).map(([cat, cnt]) => (
            <span
              key={cat}
              className={`text-xs px-3 py-1 rounded-full ${CATEGORY_COLOR[cat] ?? "bg-gray-100 text-gray-600"}`}
            >
              {CATEGORY_LABEL[cat] ?? cat} {cnt}회
            </span>
          ))}
        </div>
      )}

      {/* 카테고리 필터 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`whitespace-nowrap text-sm px-4 py-1.5 rounded-full border transition-colors ${
              selectedCategory === cat
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
            }`}
          >
            {cat === "전체" ? `전체 ${notes.length}` : `${CATEGORY_LABEL[cat]} ${categoryCounts[cat] ?? 0}`}
          </button>
        ))}
      </div>

      {/* 기록 목록 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500">
            {selectedCategory === "전체"
              ? "아직 공유된 상담 기록이 없습니다."
              : `${CATEGORY_LABEL[selectedCategory]} 기록이 없습니다.`}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            상담 완료 후 선생님이 기록을 공유해드립니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((note) => {
            const isExpanded = expandedId === note.id;
            return (
              <div
                key={note.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                {/* 기록 헤더 — 클릭으로 펼치기/접기 */}
                <button
                  className="w-full text-left p-4"
                  onClick={() => setExpandedId(isExpanded ? null : note.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          CATEGORY_COLOR[note.category] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {CATEGORY_LABEL[note.category] ?? note.category}
                      </span>
                      {note.student_grade && (
                        <span className="text-xs text-gray-400">{note.student_grade}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400">
                        {new Date(note.consultation_date).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* 접힌 상태: 내용 미리보기 */}
                  {!isExpanded && (
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                      {note.goals || note.main_content}
                    </p>
                  )}
                </button>

                {/* 펼친 상태: 전체 내용 */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-50 pt-3">

                    {note.goals && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                          상담 목표 / 요청사항
                        </p>
                        <p className="text-sm text-gray-700">{note.goals}</p>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        상담 내용
                      </p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {note.main_content}
                      </p>
                    </div>

                    {note.advice_given && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-500 mb-1">💡 조언</p>
                        <p className="text-sm text-blue-800 whitespace-pre-wrap">{note.advice_given}</p>
                      </div>
                    )}

                    {note.next_steps && (
                      <div className="bg-green-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-green-600 mb-1">✅ 실행 계획</p>
                        <p className="text-sm text-green-800 whitespace-pre-wrap">{note.next_steps}</p>
                      </div>
                    )}

                    {note.next_topic && (
                      <div className="border-t pt-3">
                        <p className="text-xs text-gray-400">다음 상담 주제</p>
                        <p className="text-sm font-medium text-gray-700 mt-0.5">
                          📌 {note.next_topic}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
