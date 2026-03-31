"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Question {
  id: string;
  question: string;
  category: string;
  hint: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  세특기반: "세특 기반",
  창체기반: "창체 기반",
  행특기반: "행특 기반",
  지원동기: "지원 동기",
  진로계획: "진로 계획",
  종합: "종합",
};

const CATEGORY_COLOR: Record<string, string> = {
  세특기반: "bg-blue-100 text-blue-700",
  창체기반: "bg-green-100 text-green-700",
  행특기반: "bg-purple-100 text-purple-700",
  지원동기: "bg-orange-100 text-orange-700",
  진로계획: "bg-pink-100 text-pink-700",
  종합: "bg-gray-100 text-gray-700",
};

export default function InterviewQuestionsPage() {
  const params = useParams();
  const orderId = params.id as string;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedHints, setExpandedHints] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/analysis/${orderId}/interview-questions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setQuestions(data))
      .finally(() => setLoading(false));
  }, [orderId]);

  function toggleHint(id: string) {
    setExpandedHints((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // 카테고리별 그룹핑
  const grouped = questions.reduce<Record<string, Question[]>>((acc, q) => {
    const key = q.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(q);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <a href={`/analysis/${orderId}`} className="text-gray-400 hover:text-gray-600">←</a>
        <h1 className="text-2xl font-bold">면접 예상 질문</h1>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">불러오는 중...</div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-2">아직 면접 질문이 준비되지 않았습니다.</p>
          <p className="text-sm">분석 완료 후 관리자가 면접 질문을 등록합니다.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, qs]) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                {CATEGORY_LABEL[category] ?? category} ({qs.length}개)
              </h2>
              <div className="space-y-3">
                {qs.map((q, idx) => (
                  <div key={q.id} className="bg-white rounded-xl shadow p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-gray-400 text-sm font-mono mt-0.5">Q{idx + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium leading-relaxed">{q.question}</p>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                              CATEGORY_COLOR[category] ?? "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {CATEGORY_LABEL[category] ?? category}
                          </span>
                        </div>

                        {q.hint && (
                          <div className="mt-2">
                            <button
                              onClick={() => toggleHint(q.id)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {expandedHints.has(q.id) ? "힌트 숨기기" : "답변 힌트 보기"}
                            </button>
                            {expandedHints.has(q.id) && (
                              <div className="mt-2 bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
                                {q.hint}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
