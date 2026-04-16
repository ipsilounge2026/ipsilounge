"use client";

/**
 * HSGAP-P2-senior-counselor-context-share-ui
 *
 * 선배 상담사 전용 "담당 학생 요약" 페이지.
 * - /api/admin/admins/my-students 로 담당 학생 목록 로드
 * - 각 학생 카드 선택 시 /api/admin/senior-consultation/student/{id}/counselor-summary 호출
 *   (추상화된 상담사 요약 + 상담사가 작성한 next_senior_context 표시)
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getMyStudents, getCounselorSummaryForSenior } from "@/lib/api";
import { getAdminInfo, isLoggedIn } from "@/lib/auth";

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  member_type: string | null;
  student_name: string | null;
  created_at: string;
}

interface CounselorSummary {
  user_id: string;
  survey_type: string;
  timing: string | null;
  abstracted_summary: Record<string, any>;
  prev_senior_context: string | null;
  prev_senior_session: string | null;
  counselor_next_senior_context: string | null;
  counselor_note_date: string | null;
  counselor_note_category: string | null;
}

function summaryLine(label: string, value: any, indent = 0) {
  if (value === null || value === undefined || value === "" ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)) {
    return null;
  }
  const text = Array.isArray(value)
    ? value.join(", ")
    : (typeof value === "object" ? JSON.stringify(value) : String(value));
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px dashed #E5E7EB", paddingLeft: indent * 12 }}>
      <div style={{ flex: "0 0 160px", fontSize: 12, fontWeight: 600, color: "#6B7280" }}>{label}</div>
      <div style={{ flex: 1, fontSize: 13, color: "#111827", whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  );
}

export default function MyStudentsForSeniorPage() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<CounselorSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    const admin = getAdminInfo();
    if (!admin || admin.role !== "senior") {
      // 선배가 아닌 경우 접근 차단
      setError("이 페이지는 선배 상담사 전용입니다.");
      setLoadingList(false);
      return;
    }
    loadStudents();
  }, []);

  async function loadStudents() {
    try {
      setLoadingList(true);
      const list = await getMyStudents();
      setStudents(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || "담당 학생 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingList(false);
    }
  }

  async function handleSelect(s: Student) {
    setSelectedId(s.id);
    setSummary(null);
    setLoadingSummary(true);
    try {
      const data = await getCounselorSummaryForSenior(s.id);
      setSummary(data);
    } catch (e: any) {
      // 404 등 상담사 설문이 없는 경우
      setSummary(null);
      setError(e?.detail || e?.message || "요약 정보를 불러오지 못했습니다.");
    } finally {
      setLoadingSummary(false);
    }
  }

  const selected = students.find((s) => s.id === selectedId);
  const abs = summary?.abstracted_summary || {};

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24, background: "#F9FAFB", minHeight: "100vh" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>담당 학생 요약</h1>
        <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 20 }}>
          상담사가 공유한 핵심 맥락만 노출됩니다. 민감정보(가족·재정·심리)는 비공유 처리되어 조회할 수 없습니다.
        </div>

        {error && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", color: "#991B1B", padding: 12, borderRadius: 6, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
          {/* 좌측: 담당 학생 목록 */}
          <div style={{ background: "white", borderRadius: 8, border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: "#F3F4F6", fontSize: 13, fontWeight: 600, color: "#374151" }}>
              담당 학생 ({students.length}명)
            </div>
            {loadingList ? (
              <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>로딩 중...</div>
            ) : students.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>
                배정된 담당 학생이 없습니다.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {students.map((s) => {
                  const isActive = s.id === selectedId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelect(s)}
                      style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        border: "none",
                        borderBottom: "1px solid #F3F4F6",
                        background: isActive ? "#EFF6FF" : "white",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: isActive ? "#1D4ED8" : "#111827" }}>
                        {s.student_name || s.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#6B7280" }}>{s.email}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 우측: 선택된 학생의 요약 */}
          <div style={{ background: "white", borderRadius: 8, border: "1px solid #E5E7EB", padding: 20, minHeight: 480 }}>
            {!selected ? (
              <div style={{ textAlign: "center", padding: 60, color: "#9CA3AF" }}>
                좌측에서 학생을 선택하면 추상화된 상담사 요약을 볼 수 있습니다.
              </div>
            ) : loadingSummary ? (
              <div style={{ textAlign: "center", padding: 60, color: "#9CA3AF" }}>요약 로딩 중...</div>
            ) : !summary ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                <div>해당 학생의 상담사 설문 데이터가 아직 없습니다.</div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>
                    {selected.student_name || selected.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>
                    설문 유형: {summary.survey_type} {summary.timing && `· ${summary.timing}`}
                  </div>
                </div>

                {/* 상담사가 전달한 맥락 (직접 공유) */}
                {summary.counselor_next_senior_context && (
                  <div style={{ marginBottom: 20, padding: 14, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>
                      🎓 상담사가 전달한 맥락
                    </div>
                    {(summary.counselor_note_date || summary.counselor_note_category) && (
                      <div style={{ fontSize: 11, color: "#B45309", marginBottom: 6 }}>
                        {summary.counselor_note_date} · {summary.counselor_note_category}
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: "#78350F", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                      {summary.counselor_next_senior_context}
                    </div>
                  </div>
                )}

                {/* 이전 선배 기록의 다음 맥락 */}
                {summary.prev_senior_context && (
                  <div style={{ marginBottom: 20, padding: 14, background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1E40AF", marginBottom: 6 }}>
                      🔁 이전 선배 기록 ({summary.prev_senior_session || "?"})
                    </div>
                    <div style={{ fontSize: 13, color: "#1E3A8A", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                      {summary.prev_senior_context}
                    </div>
                  </div>
                )}

                {/* 추상화된 상담사 설문 요약 */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
                    상담사 설문 추상 요약
                  </div>
                  <div style={{ background: "#F9FAFB", borderRadius: 6, padding: "4px 12px" }}>
                    {summaryLine("내신 대략 티어", abs.naesin_tier)}
                    {summaryLine("내신 추이", abs.naesin_trend)}
                    {summaryLine("모의 티어", abs.mock_tier)}
                    {summaryLine("모의 유형", abs.mock_type)}
                    {summaryLine("과목별 난점", abs.subject_difficulties)}
                    {summaryLine("주된 학습 방법", abs.study_methods)}
                    {summaryLine("진로 방향", abs.career_direction)}
                    {summaryLine("목표 수준", abs.target_level)}
                    {summaryLine("과목 선택", abs.subject_selection)}
                    {summaryLine("레이더 등급", abs.radar_grades)}
                    {Object.keys(abs).length === 0 && (
                      <div style={{ fontSize: 12, color: "#9CA3AF", padding: "8px 0" }}>
                        공유 가능한 요약 정보가 없습니다.
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 10 }}>
                    ※ 민감 영역(D8 / F / G 등)은 비공유 정책에 따라 본 요약에서 제외됩니다.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
