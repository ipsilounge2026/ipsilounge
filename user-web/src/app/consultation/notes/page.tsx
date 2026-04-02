"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getMyConsultationNotes } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

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

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  학생부분석: { bg: "#EFF6FF", color: "#2563EB" },
  입시전략: { bg: "#F3E8FF", color: "#7C3AED" },
  학교생활: { bg: "#F0FDF4", color: "#16A34A" },
  공부법: { bg: "#FEFCE8", color: "#CA8A04" },
  진로: { bg: "#FFF7ED", color: "#EA580C" },
  심리정서: { bg: "#FDF2F8", color: "#DB2777" },
  기타: { bg: "#F3F4F6", color: "#6B7280" },
};

export default function ConsultationNotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<ConsultationNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    getMyConsultationNotes()
      .then((data) => setNotes(Array.isArray(data) ? data : []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = selectedCategory === "전체"
    ? notes
    : notes.filter((n) => n.category === selectedCategory);

  const categoryCounts = notes.reduce<Record<string, number>>((acc, n) => {
    acc[n.category] = (acc[n.category] ?? 0) + 1;
    return acc;
  }, {});

  const categories = ["전체", ...Object.keys(CATEGORY_LABEL)];

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="page-header">
          <div>
            <h1>상담 기록</h1>
            <p style={{ fontSize: 14, color: "var(--gray-500)", marginTop: 4 }}>
              총 {notes.length}회의 상담 기록이 있습니다
            </p>
          </div>
          <button className="btn btn-outline" onClick={() => router.push("/consultation/my")}>
            내 예약 보기
          </button>
        </div>

        {/* 카테고리 통계 */}
        {notes.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {Object.entries(categoryCounts).map(([cat, cnt]) => {
              const c = CATEGORY_COLORS[cat] || CATEGORY_COLORS["기타"];
              return (
                <span key={cat} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 12, backgroundColor: c.bg, color: c.color }}>
                  {CATEGORY_LABEL[cat] || cat} {cnt}회
                </span>
              );
            })}
          </div>
        )}

        {/* 카테고리 필터 */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 16 }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                whiteSpace: "nowrap",
                fontSize: 13,
                padding: "6px 14px",
                borderRadius: 20,
                border: selectedCategory === cat ? "1px solid var(--primary)" : "1px solid var(--gray-200)",
                backgroundColor: selectedCategory === cat ? "var(--primary)" : "white",
                color: selectedCategory === cat ? "white" : "var(--gray-600)",
                cursor: "pointer",
              }}
            >
              {cat === "전체" ? `전체 ${notes.length}` : `${CATEGORY_LABEL[cat]} ${categoryCounts[cat] ?? 0}`}
            </button>
          ))}
        </div>

        {/* 기록 목록 */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--gray-400)" }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <p style={{ color: "var(--gray-500)", marginBottom: 4 }}>
              {selectedCategory === "전체"
                ? "아직 공유된 상담 기록이 없습니다"
                : `${CATEGORY_LABEL[selectedCategory]} 기록이 없습니다`}
            </p>
            <p style={{ fontSize: 13, color: "var(--gray-400)" }}>
              상담 완료 후 선생님이 기록을 공유해드립니다
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((note) => {
              const isExpanded = expandedId === note.id;
              const catColor = CATEGORY_COLORS[note.category] || CATEGORY_COLORS["기타"];
              return (
                <div key={note.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {/* 헤더 */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : note.id)}
                    style={{ padding: 16, cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 10, backgroundColor: catColor.bg, color: catColor.color, fontWeight: 600 }}>
                          {CATEGORY_LABEL[note.category] || note.category}
                        </span>
                        {note.student_grade && (
                          <span style={{ fontSize: 12, color: "var(--gray-400)" }}>{note.student_grade}</span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "var(--gray-400)" }}>
                          {new Date(note.consultation_date).toLocaleDateString("ko-KR")}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--gray-400)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                      </div>
                    </div>
                    {!isExpanded && (
                      <p style={{ fontSize: 14, color: "var(--gray-600)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {note.goals || note.main_content}
                      </p>
                    )}
                  </div>

                  {/* 펼친 내용 */}
                  {isExpanded && (
                    <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--gray-100)" }}>
                      {note.goals && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-400)", marginBottom: 4 }}>상담 목표 / 요청사항</div>
                          <p style={{ fontSize: 14, color: "var(--gray-700)" }}>{note.goals}</p>
                        </div>
                      )}

                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-400)", marginBottom: 4 }}>상담 내용</div>
                        <p style={{ fontSize: 14, color: "var(--gray-700)", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{note.main_content}</p>
                      </div>

                      {note.advice_given && (
                        <div style={{ marginTop: 12, padding: 12, backgroundColor: "#EFF6FF", borderRadius: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#2563EB", marginBottom: 4 }}>💡 조언</div>
                          <p style={{ fontSize: 14, color: "#1E40AF", whiteSpace: "pre-wrap" }}>{note.advice_given}</p>
                        </div>
                      )}

                      {note.next_steps && (
                        <div style={{ marginTop: 12, padding: 12, backgroundColor: "#F0FDF4", borderRadius: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#16A34A", marginBottom: 4 }}>✅ 실행 계획</div>
                          <p style={{ fontSize: 14, color: "#166534", whiteSpace: "pre-wrap" }}>{note.next_steps}</p>
                        </div>
                      )}

                      {note.next_topic && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--gray-100)" }}>
                          <span style={{ fontSize: 12, color: "var(--gray-400)" }}>다음 상담 주제</span>
                          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--gray-700)", marginTop: 2 }}>📌 {note.next_topic}</p>
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
      <Footer />
    </>
  );
}
