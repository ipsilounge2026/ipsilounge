"use client";

/**
 * 예비고1 / 고등학생 설문 분석 리포트 뷰어
 *
 * - 5축(예비고1) / 4축(고등) 레이더 차트
 * - 과목별 준비율 차트 (예비고1)
 * - 영역별 상세 점수 카드
 * - 로드맵 자동 초안 (예비고1)
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, LineChart, Line, Legend, PieChart, Pie,
} from "recharts";
import { getSurveyComputed, getSurvey, getStudyMethodMatrix, getSuneungMinimumSimulation, getSubjectCompetitiveness } from "@/lib/api";

// ── 색상/등급 상수 ──

const GRADE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: "#EEF2FF", text: "#4338CA", border: "#A5B4FC" },
  A: { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7" },
  B: { bg: "#FFF7ED", text: "#D97706", border: "#FCD34D" },
  C: { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5" },
  D: { bg: "#F3F4F6", text: "#6B7280", border: "#D1D5DB" },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  "상": { bg: "#FEE2E2", text: "#DC2626" },
  "중": { bg: "#FEF3C7", text: "#D97706" },
  "하": { bg: "#DBEAFE", text: "#2563EB" },
};

const PH1_RADAR_LABELS: Record<string, string> = {
  "학업기초력": "학업기초력",
  "학습습관_자기주도력": "학습습관·자기주도력",
  "교과선행도": "교과선행도",
  "진로방향성": "진로방향성",
  "비교과역량": "비교과역량",
};

const HIGH_RADAR_LABELS: Record<string, string> = {
  "내신_경쟁력": "내신 경쟁력",
  "모의고사_역량": "모의고사 역량",
  "학습습관_전략": "학습 습관·전략",
  "진로전형_전략": "진로·전형 전략",
};

const PH1_DETAIL_SECTIONS = [
  { key: "academic", label: "학업기초력" },
  { key: "study", label: "학습습관·자기주도력" },
  { key: "prep", label: "교과선행도" },
  { key: "career", label: "진로방향성" },
  { key: "extracurricular", label: "비교과역량" },
];

const HIGH_DETAIL_SECTIONS = [
  { key: "naesin", label: "내신 경쟁력" },
  { key: "mock", label: "모의고사 역량" },
  { key: "study", label: "학습 습관·전략" },
  { key: "career", label: "진로·전형 전략" },
];

// ── 유틸 컴포넌트 ──

function GradeBadge({ grade, size = "normal" }: { grade: string; size?: "normal" | "large" }) {
  const c = GRADE_COLORS[grade] || GRADE_COLORS.D;
  const isLarge = size === "large";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: isLarge ? 48 : 30, height: isLarge ? 48 : 30,
      borderRadius: isLarge ? 14 : 8, fontSize: isLarge ? 24 : 14, fontWeight: 800,
      color: c.text, background: c.bg, border: `2px solid ${c.border}`,
    }}>
      {grade}
    </span>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ height: 8, borderRadius: 4, background: "#F3F4F6", overflow: "hidden", flex: 1 }}>
      <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: color, transition: "width 0.5s" }} />
    </div>
  );
}

// ── 메인 페이지 ──

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const surveyId = params.id as string;

  const [survey, setSurvey] = useState<any>(null);
  const [computed, setComputed] = useState<any>(null);
  const [studyMatrix, setStudyMatrix] = useState<any>(null);
  const [suneungSim, setSuneungSim] = useState<any>(null);
  const [subjComp, setSubjComp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!surveyId) return;
    (async () => {
      try {
        const [sv, cp] = await Promise.all([
          getSurvey(surveyId),
          getSurveyComputed(surveyId),
        ]);
        setSurvey(sv);
        setComputed(cp);
        // Load study method matrix separately (non-blocking)
        getStudyMethodMatrix(surveyId).then(setStudyMatrix).catch(() => {});
        // Load suneung minimum simulation (non-blocking, high only)
        getSuneungMinimumSimulation(surveyId).then(setSuneungSim).catch(() => {});
        // Load subject competitiveness (non-blocking, high only)
        getSubjectCompetitiveness(surveyId).then(setSubjComp).catch(() => {});
      } catch (e: any) {
        setError(e?.message || "리포트를 불러올 수 없습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, [surveyId]);

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "var(--gray-500)" }}>분석 결과를 불러오는 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#DC2626", marginBottom: 16 }}>{error}</div>
        <button onClick={() => router.back()} style={linkBtnStyle}>돌아가기</button>
      </div>
    );
  }

  const isPreheigh1 = survey?.survey_type === "preheigh1";
  const rs = computed?.radar_scores;
  if (!rs) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "var(--gray-500)" }}>분석 결과가 아직 준비되지 않았습니다.</div>
      </div>
    );
  }

  const radarLabels = isPreheigh1 ? PH1_RADAR_LABELS : HIGH_RADAR_LABELS;
  const detailSections = isPreheigh1 ? PH1_DETAIL_SECTIONS : HIGH_DETAIL_SECTIONS;
  const typeLabel = isPreheigh1 ? "예비고1" : "고등학생";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 80px" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--gray-500)" }}>
          &larr;
        </button>
        <span style={{ fontSize: 13, color: "var(--gray-500)" }}>{typeLabel} 사전 조사</span>
      </div>

      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 24px" }}>분석 리포트</h1>

      {/* 종합 등급 */}
      <OverallSection rs={rs} />

      {/* 레이더 차트 */}
      <RadarSection rs={rs} labels={radarLabels} />

      {/* 성적 추이 차트 */}
      {isPreheigh1 && computed?.grade_trend && (
        <GradeTrendSection data={computed.grade_trend} />
      )}
      {!isPreheigh1 && computed?.grade_trend && (
        <HighGradeTrendSection data={computed.grade_trend} />
      )}

      {/* 모의고사 추이 차트 (고등학생만) */}
      {!isPreheigh1 && computed?.mock_trend && (
        <MockTrendSection data={computed.mock_trend} />
      )}

      {/* 내신 vs 모의 비교 (고등학생만) */}
      {!isPreheigh1 && computed?.grade_trend && computed?.mock_trend && (
        <NaesinMockCompareSection gradeTrend={computed.grade_trend} mockTrend={computed.mock_trend} />
      )}

      {/* 과목별 경쟁력 (고등학생만) */}
      {!isPreheigh1 && subjComp && subjComp.subjects && Object.keys(subjComp.subjects).length > 0 && (
        <SubjectCompetitivenessSection data={subjComp} />
      )}

      {/* 과목별 준비율 차트 (예비고1만) */}
      {isPreheigh1 && rs.prep && <PrepRateChart prep={rs.prep} />}

      {/* 학습 습관 분석 */}
      {computed?.study_analysis && Object.keys(computed.study_analysis).length > 0 && (
        <StudyAnalysisSection data={computed.study_analysis} />
      )}

      {/* 학습 방법 진단 매트릭스 */}
      {studyMatrix && studyMatrix.subjects?.length > 0 && (
        <StudyMethodMatrixSection data={studyMatrix} />
      )}

      {/* 수능 최저학력기준 충족 시뮬레이션 (고등학생만) */}
      {!isPreheigh1 && suneungSim && suneungSim.simulations?.length > 0 && (
        <SuneungMinimumSection data={suneungSim} />
      )}

      {/* 영역별 상세 점수 */}
      <DetailSection rs={rs} sections={detailSections} />

      {/* 고교유형 적합도 (예비고1만) */}
      {isPreheigh1 && rs.school_type_compatibility && (
        <CompatibilitySection data={rs.school_type_compatibility} />
      )}

      {/* 로드맵 — 예비고1: 4단계×6트랙 / 고등학생: timing별 Phase×4트랙 */}
      {rs.roadmap && <RoadmapSection roadmap={rs.roadmap} isPreheigh1={isPreheigh1} />}

      {/* 등급 범례 */}
      <GradeLegend />
    </div>
  );
}

// ── 종합 등급 섹션 ──

function OverallSection({ rs }: { rs: any }) {
  const c = GRADE_COLORS[rs.overall_grade] || GRADE_COLORS.D;
  return (
    <div style={{
      background: c.bg, border: `2px solid ${c.border}`, borderRadius: 16,
      padding: "24px 20px", marginBottom: 20, textAlign: "center",
    }}>
      <div style={{ fontSize: 13, color: c.text, marginBottom: 8, fontWeight: 600 }}>종합 등급</div>
      <GradeBadge grade={rs.overall_grade} size="large" />
      <div style={{ fontSize: 28, fontWeight: 800, color: c.text, marginTop: 8 }}>
        {rs.overall_score}<span style={{ fontSize: 14, fontWeight: 400 }}>점 / 100</span>
      </div>
    </div>
  );
}

// ── 레이더 차트 섹션 ──

function RadarSection({ rs, labels }: { rs: any; labels: Record<string, string> }) {
  if (!rs.radar) return null;

  const radarData = Object.entries(rs.radar).map(([key, val]: [string, any]) => ({
    area: labels[key] || key.replace(/_/g, " "),
    score: val.score,
    fullMark: 100,
  }));

  const entries = Object.entries(rs.radar) as [string, { score: number; grade: string }][];

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>영역별 진단</h2>

      {/* 레이더 차트 */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="#E5E7EB" />
            <PolarAngleAxis dataKey="area" tick={{ fontSize: 11, fill: "#374151" }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
            <Radar
              dataKey="score" stroke="#4472C4" fill="#4472C4"
              fillOpacity={0.25} strokeWidth={2}
              dot={{ r: 4, fill: "#4472C4" }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* 영역별 점수 카드 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {entries.map(([key, val]) => {
          const gc = GRADE_COLORS[val.grade] || GRADE_COLORS.D;
          return (
            <div key={key} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 10, border: `1px solid ${gc.border}`, background: gc.bg,
            }}>
              <GradeBadge grade={val.grade} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1F2937" }}>
                {labels[key] || key}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: gc.text }}>
                {val.score}<span style={{ fontSize: 11, fontWeight: 400 }}>/100</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 과목별 준비율 차트 (예비고1) ──

function PrepRateChart({ prep }: { prep: any }) {
  if (!prep?.details) return null;

  const SUBJECT_COLORS: Record<string, string> = {
    "수학_선행도": "#4472C4",
    "영어_역량": "#ED7D31",
    "국어_역량": "#70AD47",
    "사회_역량": "#FFC000",
    "과학_역량": "#5B9BD5",
  };

  const SUBJECT_LABELS: Record<string, string> = {
    "수학_선행도": "수학",
    "영어_역량": "영어",
    "국어_역량": "국어",
    "사회_역량": "사회",
    "과학_역량": "과학",
  };

  const barData = Object.entries(prep.details).map(([key, info]: [string, any]) => ({
    subject: SUBJECT_LABELS[key] || key,
    score: info.score,
    max: info.max,
    pct: Math.round((info.score / info.max) * 100),
    color: SUBJECT_COLORS[key] || "#6B7280",
  }));

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>과목별 준비율</h2>
      <p style={{ fontSize: 12, color: "var(--gray-500)", margin: "0 0 16px" }}>
        각 과목의 고교 학습 준비 수준을 배점 대비 달성률로 표시합니다
      </p>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="subject" tick={{ fontSize: 12, fontWeight: 600 }} width={40} />
          <Tooltip formatter={(value: number) => [`${value}%`, "달성률"]}
            contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="pct" radius={[0, 6, 6, 0]} barSize={28}>
            {barData.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* 과목별 점수 상세 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        {barData.map((d) => (
          <div key={d.subject} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderRadius: 8, background: "var(--gray-50)",
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "var(--gray-700)", flex: 1 }}>{d.subject}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gray-800)" }}>
              {d.score}/{d.max}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 영역별 상세 점수 ──

function DetailSection({ rs, sections }: { rs: any; sections: { key: string; label: string }[] }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>영역별 상세 분석</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sections.map(({ key, label }) => {
          const data = rs[key];
          if (!data?.details) return null;
          const gc = GRADE_COLORS[data.grade] || GRADE_COLORS.D;
          return (
            <div key={key} style={{
              borderRadius: 12, border: `1px solid ${gc.border}`, overflow: "hidden",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 16px", background: gc.bg,
              }}>
                <GradeBadge grade={data.grade} />
                <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{label}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: gc.text }}>
                  {data.total}<span style={{ fontSize: 12, fontWeight: 400 }}>점</span>
                </span>
              </div>
              <div style={{ padding: "8px 16px 12px" }}>
                {Object.entries(data.details).map(([item, info]: [string, any]) => (
                  <div key={item} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 0", borderBottom: "1px solid #F3F4F6",
                  }}>
                    <span style={{ fontSize: 12, color: "#374151", flex: 1, minWidth: 0 }}>
                      {item.replace(/_/g, " ")}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: gc.text, whiteSpace: "nowrap" }}>
                      {info.score}/{info.max}
                    </span>
                    <div style={{ width: 80 }}>
                      <ProgressBar value={info.score} max={info.max} color={gc.text} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 로드맵 자동 초안 ──

function RoadmapSection({ roadmap, isPreheigh1 = false }: { roadmap: any; isPreheigh1?: boolean }) {
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  if (!roadmap?.items?.length && !roadmap?.matrix) return null;

  const matrix = roadmap.matrix as { phases: any[]; tracks: any[]; cells: Record<string, Record<string, string>> } | undefined;
  const priorityItems = (roadmap.items as any[] || []).filter((it: any) => it.priority === "상" || it.priority === "중");
  const title = isPreheigh1 ? "고교 준비 로드맵" : "학습 로드맵";

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{title}</h2>
      <p style={{ fontSize: 12, color: "var(--gray-500)", margin: "0 0 16px" }}>
        {roadmap.summary}
      </p>

      {/* 우선 과제 요약 */}
      {priorityItems.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 8 }}>우선 과제</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {priorityItems.map((item: any, i: number) => {
              const pc = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS["하"];
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: "var(--gray-50)" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, color: pc.text, background: pc.bg }}>
                    {item.priority === "상" ? "최우선" : "중요"}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{item.title}</span>
                  <GradeBadge grade={item.current_grade} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4단계 × 6트랙 매트릭스 */}
      {matrix && matrix.phases?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 4 }}>단계별 로드맵</div>
          {matrix.phases.map((phase: any) => {
            const isOpen = expandedPhase === phase.key;
            return (
              <div key={phase.key} style={{ borderRadius: 12, border: "1px solid var(--gray-200)", overflow: "hidden" }}>
                {/* Phase 헤더 (클릭 토글) */}
                <div
                  onClick={() => setExpandedPhase(isOpen ? null : phase.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
                    background: isOpen ? "#EEF2FF" : "var(--gray-50)", cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  <span style={{ fontSize: 12, transform: isOpen ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>▶</span>
                  <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{phase.label}</span>
                  <span style={{ fontSize: 11, color: "var(--gray-500)" }}>{phase.theme}</span>
                </div>
                {/* 6트랙 내용 */}
                {isOpen && (
                  <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {matrix.tracks.map((track: any) => {
                      const content = matrix.cells?.[phase.key]?.[track.key];
                      if (!content) return null;
                      return (
                        <div key={track.key} style={{ padding: "10px 12px", borderRadius: 10, background: "var(--gray-50)", border: "1px solid var(--gray-100)" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gray-700)", marginBottom: 4 }}>
                            {track.icon} {track.label}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--gray-600)", lineHeight: 1.5 }}>{content}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        marginTop: 16, padding: "12px 16px", borderRadius: 10,
        background: "#FFFBEB", border: "1px solid #FCD34D", fontSize: 12, color: "#92400E", lineHeight: 1.6,
      }}>
        이 로드맵은 설문 응답 기반 자동 생성 초안입니다.
        상담을 통해 학생 상황에 맞게 구체적인 계획을 수립할 수 있습니다.
      </div>
    </div>
  );
}

// ── 성적 추이 차트 ──

const SUBJECT_LINE_COLORS: Record<string, string> = {
  "국어": "#70AD47",
  "영어": "#ED7D31",
  "수학": "#4472C4",
  "사회": "#FFC000",
  "과학": "#5B9BD5",
};

const TREND_BADGE_LABELS: Record<string, { label: string; color: string }> = {
  "상승": { label: "↑ 상승", color: "#16A34A" },
  "유지": { label: "→ 유지", color: "#6B7280" },
  "등락": { label: "↕ 등락", color: "#D97706" },
  "하락": { label: "↓ 하락", color: "#DC2626" },
};

function GradeTrendSection({ data }: { data: any }) {
  const trendData = data?.data as any[] | undefined;
  const subjectTrends = data?.subject_trends as Record<string, any[]> | undefined;
  const badge = data?.trend_badge as string | undefined;

  if (!trendData?.length) return null;

  const badgeInfo = badge ? TREND_BADGE_LABELS[badge] || { label: badge, color: "#6B7280" } : null;

  // 과목별 라인차트 데이터: semester → {semester, 국어, 영어, ...}
  const subjectLineData: any[] = [];
  if (subjectTrends) {
    const allSemesters = new Set<string>();
    Object.values(subjectTrends).forEach((arr: any[]) =>
      arr.forEach((p: any) => allSemesters.add(p.semester))
    );
    const semesters = Array.from(allSemesters).sort();
    for (const sem of semesters) {
      const row: any = { semester: sem };
      for (const [subj, arr] of Object.entries(subjectTrends)) {
        const pt = (arr as any[]).find((p: any) => p.semester === sem);
        if (pt) row[subj] = pt.raw_score;
      }
      subjectLineData.push(row);
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>성적 추이</h2>
        {badgeInfo && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: badgeInfo.color,
            padding: "2px 10px", borderRadius: 10, background: `${badgeInfo.color}15`,
          }}>
            {badgeInfo.label}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--gray-500)", margin: "0 0 16px" }}>
        학기별 전과목 평균 및 과목별 원점수 추이
      </p>

      {/* 전과목 평균 추이 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 8 }}>전과목 평균</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={trendData} margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="semester" tick={{ fontSize: 11 }} />
          <YAxis domain={[50, 100]} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="avg_score" stroke="#4472C4" strokeWidth={2.5}
            dot={{ r: 5, fill: "#4472C4" }} name="평균 원점수" />
        </LineChart>
      </ResponsiveContainer>

      {/* 과목별 추이 */}
      {subjectLineData.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", margin: "16px 0 8px" }}>과목별 추이</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={subjectLineData} margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="semester" tick={{ fontSize: 11 }} />
              <YAxis domain={[50, 100]} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {Object.keys(subjectTrends || {}).map((subj) => (
                <Line key={subj} type="monotone" dataKey={subj} stroke={SUBJECT_LINE_COLORS[subj] || "#6B7280"}
                  strokeWidth={2} dot={{ r: 3 }} name={subj} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

// ── 학습 습관 분석 ──

const STUDY_TYPE_COLORS: Record<string, string> = {
  "학원수업": "#4472C4",
  "학원과제": "#ED7D31",
  "자기주도": "#70AD47",
};

function StudyAnalysisSection({ data }: { data: any }) {
  const totalHours = data.total_weekly_hours ?? 0;
  const byType = data.by_type as Record<string, number> | undefined;
  const bySubject = data.by_subject as Record<string, number> | undefined;
  const selfRatio = data.self_study_ratio ?? 0;
  const balance = data.subject_balance ?? 0;

  // Pie data for study type
  const typeData = byType
    ? Object.entries(byType).map(([name, value]) => ({
        name,
        value,
        fill: STUDY_TYPE_COLORS[name] || "#9CA3AF",
      }))
    : [];

  // Bar data for subject hours
  const subjectData = bySubject
    ? Object.entries(bySubject).map(([name, value]) => ({ name, hours: value }))
    : [];

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>학습 습관 분석</h2>
      <p style={{ fontSize: 12, color: "var(--gray-500)", margin: "0 0 16px" }}>
        주간 학습 스케줄 기반 분석 결과
      </p>

      {/* 요약 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <div style={{ textAlign: "center", padding: "12px 8px", borderRadius: 10, background: "var(--gray-50)" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#4472C4" }}>{totalHours}</div>
          <div style={{ fontSize: 11, color: "var(--gray-500)" }}>주간 총 시간</div>
        </div>
        <div style={{ textAlign: "center", padding: "12px 8px", borderRadius: 10, background: "var(--gray-50)" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: selfRatio >= 40 ? "#16A34A" : selfRatio >= 20 ? "#D97706" : "#DC2626" }}>
            {selfRatio}%
          </div>
          <div style={{ fontSize: 11, color: "var(--gray-500)" }}>자기주도 비율</div>
        </div>
        <div style={{ textAlign: "center", padding: "12px 8px", borderRadius: 10, background: "var(--gray-50)" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: balance >= 70 ? "#16A34A" : balance >= 40 ? "#D97706" : "#DC2626" }}>
            {Math.round(balance)}
          </div>
          <div style={{ fontSize: 11, color: "var(--gray-500)" }}>과목 밸런스</div>
        </div>
      </div>

      {/* 학습 유형 비율 + 과목별 시간 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 유형별 비율 파이차트 */}
        {typeData.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 8 }}>유형별 비율</div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={55} innerRadius={25} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                  labelLine={false}>
                  {typeData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v}시간`, ""]} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* 과목별 시간 바차트 */}
        {subjectData.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 8 }}>과목별 시간</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={subjectData} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={35} />
                <Tooltip formatter={(v: number) => [`${v}시간`, ""]} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="hours" fill="#4472C4" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 학습 방법 진단 매트릭스 ──

const SATISFACTION_COLORS: Record<string, { bg: string; text: string }> = {
  "만족": { bg: "#ECFDF5", text: "#059669" },
  "보통": { bg: "#FFF7ED", text: "#D97706" },
  "불만족": { bg: "#FEF2F2", text: "#DC2626" },
};

const GRADE_RANK_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: "#EEF2FF", text: "#4338CA" },
  2: { bg: "#EEF2FF", text: "#4338CA" },
  3: { bg: "#ECFDF5", text: "#059669" },
  4: { bg: "#FFF7ED", text: "#D97706" },
  5: { bg: "#FEF2F2", text: "#DC2626" },
};

const MATCH_ICONS: Record<string, { icon: string; color: string }> = {
  "효율적": { icon: "\u2713", color: "#059669" },
  "적정": { icon: "\u2713", color: "#4472C4" },
  "비효율": { icon: "\u25B2", color: "#DC2626" },
  "-": { icon: "-", color: "#9CA3AF" },
};

const PSYCH_COLORS: Record<string, string> = {
  "매우 긴장": "#DC2626",
  "가끔 긴장": "#D97706",
  "긴장하지 않음": "#059669",
  "높음": "#059669",
  "보통": "#D97706",
  "낮음": "#DC2626",
  "매우 부담": "#DC2626",
  "약간 부담": "#D97706",
  "적당함": "#059669",
  "부담 없음": "#059669",
};

function StudyMethodMatrixSection({ data }: { data: any }) {
  const subjects = data.subjects as any[] || [];
  const weekly = data.weekly_summary || {};
  const psych = data.psychology || {};

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>학습 방법 진단 매트릭스</h2>
      <p style={{ fontSize: 12, color: "var(--gray-500)", margin: "0 0 16px" }}>
        과목별 학습 방법과 성적의 연계 분석
      </p>

      {/* a) 과목별 학습 방법 매트릭스 (가로 스크롤) */}
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F9FAFB" }}>
              {["과목", "학습 방법", "수업 활용도", "만족도", "교재", "인강", "등급", "매칭"].map((h) => (
                <th key={h} style={{
                  padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "#374151",
                  borderBottom: "2px solid #E5E7EB", whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjects.map((subj: any, i: number) => {
              const satColor = SATISFACTION_COLORS[subj.satisfaction] || { bg: "#F3F4F6", text: "#6B7280" };
              const gradeRank = subj.grade?.rank ? Math.round(subj.grade.rank) : null;
              const gradeColor = gradeRank ? (GRADE_RANK_COLORS[gradeRank] || { bg: "#F3F4F6", text: "#6B7280" }) : { bg: "#F3F4F6", text: "#6B7280" };
              const matchInfo = MATCH_ICONS[subj.method_grade_match] || MATCH_ICONS["-"];
              return (
                <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "10px 8px", fontWeight: 700, color: "#1F2937", whiteSpace: "nowrap" }}>
                    {subj.name}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {(subj.study_methods || []).map((m: string, j: number) => (
                        <span key={j} style={{
                          padding: "2px 8px", borderRadius: 10, fontSize: 11,
                          background: "#EEF2FF", color: "#4338CA", whiteSpace: "nowrap",
                        }}>{m}</span>
                      ))}
                      {(!subj.study_methods || subj.study_methods.length === 0) && (
                        <span style={{ color: "#9CA3AF", fontSize: 11 }}>-</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "center", fontSize: 11, color: "#374151" }}>
                    {subj.class_engagement || "-"}
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    {subj.satisfaction ? (
                      <span style={{
                        padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                        background: satColor.bg, color: satColor.text,
                      }}>{subj.satisfaction}</span>
                    ) : <span style={{ color: "#9CA3AF", fontSize: 11 }}>-</span>}
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "center", fontSize: 11, color: "#374151" }}>
                    {subj.textbook || "-"}
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "center", fontSize: 11 }}>
                    {subj.lecture?.has ? (
                      <div>
                        <div style={{ fontWeight: 600, color: "#374151" }}>{subj.lecture.instructor || "O"}</div>
                        {subj.lecture.platform && (
                          <div style={{ fontSize: 10, color: "#9CA3AF" }}>{subj.lecture.platform}</div>
                        )}
                      </div>
                    ) : <span style={{ color: "#9CA3AF" }}>-</span>}
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    {gradeRank ? (
                      <span style={{
                        display: "inline-block", padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                        background: gradeColor.bg, color: gradeColor.text,
                      }}>{gradeRank}등급</span>
                    ) : <span style={{ color: "#9CA3AF", fontSize: 11 }}>-</span>}
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: matchInfo.color }}>
                      {matchInfo.icon}
                    </span>
                    <div style={{ fontSize: 10, color: matchInfo.color }}>{subj.method_grade_match}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* b) 학습법-성적 연계 분석 */}
      <div style={{
        padding: "16px", borderRadius: 12, background: "#F9FAFB",
        border: "1px solid #E5E7EB", marginBottom: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 10 }}>
          학습법-성적 연계 분석
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {subjects.map((subj: any, i: number) => {
            const methods = subj.study_methods || [];
            const grade = subj.grade?.rank;
            const matchInfo = MATCH_ICONS[subj.method_grade_match] || MATCH_ICONS["-"];
            if (!grade && methods.length === 0) return null;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                borderRadius: 8, background: "white", border: "1px solid #F3F4F6",
              }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#1F2937", minWidth: 40 }}>{subj.name}</span>
                <span style={{ fontSize: 12, color: "#6B7280", flex: 1 }}>
                  학습법 {methods.length}개 사용
                  {grade ? ` → ${Math.round(grade)}등급` : ""}
                </span>
                <span style={{
                  padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                  color: matchInfo.color,
                  background: subj.method_grade_match === "비효율" ? "#FEF2F2"
                    : subj.method_grade_match === "효율적" ? "#ECFDF5"
                    : "#F3F4F6",
                }}>
                  {subj.method_grade_match}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* c) 주간 스케줄 요약 + d) 학습 심리 상태 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* 주간 스케줄 요약 */}
        {weekly.total_hours != null && (
          <div style={{
            padding: "16px", borderRadius: 12, background: "#F9FAFB",
            border: "1px solid #E5E7EB",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 10 }}>
              주간 스케줄 요약
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ textAlign: "center", flex: 1, padding: "8px 0", borderRadius: 8, background: "white" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#4472C4" }}>{weekly.total_hours}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF" }}>총 시간</div>
              </div>
              <div style={{ textAlign: "center", flex: 1, padding: "8px 0", borderRadius: 8, background: "white" }}>
                <div style={{
                  fontSize: 20, fontWeight: 800,
                  color: weekly.self_study_ratio >= 40 ? "#16A34A" : weekly.self_study_ratio >= 20 ? "#D97706" : "#DC2626",
                }}>{weekly.self_study_ratio}%</div>
                <div style={{ fontSize: 10, color: "#9CA3AF" }}>자기주도</div>
              </div>
            </div>
            {/* 과목별 시간 바 */}
            {weekly.by_subject && Object.keys(weekly.by_subject).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {Object.entries(weekly.by_subject).map(([subj, hrs]: [string, any]) => {
                  const maxHrs = Math.max(...Object.values(weekly.by_subject).map(Number), 1);
                  return (
                    <div key={subj} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "#374151", width: 32, textAlign: "right" }}>{subj}</span>
                      <div style={{ flex: 1, height: 10, borderRadius: 5, background: "#E5E7EB", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 5, background: "#4472C4",
                          width: `${(Number(hrs) / maxHrs) * 100}%`, transition: "width 0.5s",
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: "#6B7280", width: 24 }}>{hrs}h</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 학습 심리 상태 */}
        {Object.values(psych).some(Boolean) && (
          <div style={{
            padding: "16px", borderRadius: 12, background: "#F9FAFB",
            border: "1px solid #E5E7EB",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 10 }}>
              학습 심리 상태
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { key: "test_anxiety", label: "시험 불안" },
                { key: "motivation", label: "학습 동기" },
                { key: "study_load", label: "학습 부담" },
                { key: "sleep_hours", label: "수면 시간" },
                { key: "subject_giveup", label: "포기 과목" },
              ].map(({ key, label }) => {
                const val = psych[key];
                if (!val) return null;
                const color = PSYCH_COLORS[val] || "#6B7280";
                return (
                  <div key={key} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px", borderRadius: 8, background: "white",
                  }}>
                    <span style={{ fontSize: 12, color: "#6B7280", flex: 1 }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{val}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 범례 */}
      <div style={{
        marginTop: 12, padding: "10px 14px", borderRadius: 8,
        background: "#FFFBEB", border: "1px solid #FCD34D",
        fontSize: 11, color: "#92400E", lineHeight: 1.5,
      }}>
        매칭 평가: <strong>{"\u2713"} 효율적</strong> = 적은 학습법으로 높은 성적 |{" "}
        <strong>{"\u2713"} 적정</strong> = 학습법과 성적 균형 |{" "}
        <strong>{"\u25B2"} 비효율</strong> = 많은 학습법 대비 낮은 성적 (전략 개선 필요)
      </div>
    </div>
  );
}

// ── 고등학생 내신 등급 추이 ──

const HIGH_SUBJECT_COLORS: Record<string, string> = {
  "국어": "#70AD47", "영어": "#ED7D31", "수학": "#4472C4",
  "탐구1": "#FFC000", "탐구2": "#5B9BD5", "사회": "#9DC3E6",
};

function HighGradeTrendSection({ data }: { data: any }) {
  const trendData = data?.data as any[] | undefined;
  const subjectTrends = data?.subject_trends as Record<string, any[]> | undefined;
  const badge = data?.trend_badge as string | undefined;
  const gradeDist = data?.grade_distribution as any[] | undefined;

  if (!trendData?.length) return null;

  const badgeInfo = badge ? TREND_BADGE_LABELS[badge] || { label: badge, color: "#6B7280" } : null;

  // 과목별 라인차트 데이터
  const subjectLineData: any[] = [];
  if (subjectTrends) {
    const allSems = new Set<string>();
    Object.values(subjectTrends).forEach((arr: any[]) => arr.forEach((p: any) => allSems.add(p.semester)));
    const semesters = Array.from(allSems).sort();
    for (const sem of semesters) {
      const row: any = { semester: sem };
      for (const [subj, arr] of Object.entries(subjectTrends)) {
        const pt = (arr as any[]).find((p: any) => p.semester === sem);
        if (pt) row[subj] = pt.grade;
      }
      subjectLineData.push(row);
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>내신 등급 추이</h2>
        {badgeInfo && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: badgeInfo.color,
            padding: "2px 10px", borderRadius: 10, background: `${badgeInfo.color}15`,
          }}>
            {badgeInfo.label}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--gray-500)", margin: "0 0 16px" }}>
        학기별 전과목 평균 등급 및 과목별 등급 추이 (낮을수록 우수)
      </p>

      {/* 전과목 평균 등급 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 8 }}>전과목 평균 등급</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={trendData} margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="semester" tick={{ fontSize: 11 }} />
          <YAxis domain={[1, 5]} reversed tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="avg_grade" stroke="#4472C4" strokeWidth={2.5}
            dot={{ r: 5, fill: "#4472C4" }} name="평균 등급" />
        </LineChart>
      </ResponsiveContainer>

      {/* 과목별 추이 */}
      {subjectLineData.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", margin: "16px 0 8px" }}>과목별 등급 추이</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={subjectLineData} margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="semester" tick={{ fontSize: 11 }} />
              <YAxis domain={[1, 5]} reversed tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {Object.keys(subjectTrends || {}).map((subj) => (
                <Line key={subj} type="monotone" dataKey={subj} stroke={HIGH_SUBJECT_COLORS[subj] || "#6B7280"}
                  strokeWidth={2} dot={{ r: 3 }} name={subj} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      {/* 등��� 분포 변�� (누적 바) */}
      {gradeDist && gradeDist.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", margin: "16px 0 8px" }}>등급 분포 변화</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={gradeDist} margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="semester" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="1" stackId="g" fill="#4338CA" name="1등급" />
              <Bar dataKey="2" stackId="g" fill="#059669" name="2등급" />
              <Bar dataKey="3" stackId="g" fill="#D97706" name="3등급" />
              <Bar dataKey="4" stackId="g" fill="#DC2626" name="4등급" />
              <Bar dataKey="5" stackId="g" fill="#6B7280" name="5등급" />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

// ── 모의고사 추이 차트 (고등학생) ──

const MOCK_AREA_COLORS: Record<string, string> = {
  "국어": "#70AD47", "수학": "#4472C4", "영어": "#ED7D31",
  "탐구1": "#FFC000", "탐구2": "#5B9BD5",
};

function MockTrendSection({ data }: { data: any }) {
  const avgTrend = data?.avg_trend as any[] | undefined;
  const areaTrends = data?.area_trends as Record<string, any[]> | undefined;
  const badge = data?.trend_badge as string | undefined;
  const weakAreas = data?.weak_areas as any[] | undefined;

  if (!avgTrend?.length) return null;

  const badgeInfo = badge ? TREND_BADGE_LABELS[badge] || { label: badge, color: "#6B7280" } : null;

  // 영역별 라인차트 데이터
  const areaLineData: any[] = [];
  if (areaTrends) {
    const allSessions = new Set<string>();
    Object.values(areaTrends).forEach((arr: any[]) => arr.forEach((p: any) => allSessions.add(p.session)));
    const sessions = Array.from(allSessions).sort();
    for (const ses of sessions) {
      const row: any = { session: ses };
      for (const [area, arr] of Object.entries(areaTrends)) {
        const pt = (arr as any[]).find((p: any) => p.session === ses);
        if (pt) row[area] = pt.rank;
      }
      areaLineData.push(row);
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>모의고사 추이</h2>
        {badgeInfo && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: badgeInfo.color,
            padding: "2px 10px", borderRadius: 10, background: `${badgeInfo.color}15`,
          }}>
            {badgeInfo.label}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--gray-500)", margin: "0 0 16px" }}>
        모의고사 회차별 평균 등급 및 영역별 등급 추이 (낮을수록 우수)
      </p>

      {/* 전 영역 평균 등급 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 8 }}>전 영역 평균 등급</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={avgTrend} margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="session" tick={{ fontSize: 11 }} />
          <YAxis domain={[1, 9]} reversed tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="avg_rank" stroke="#4472C4" strokeWidth={2.5}
            dot={{ r: 5, fill: "#4472C4" }} name="평균 등급" />
        </LineChart>
      </ResponsiveContainer>

      {/* 영역별 추이 */}
      {areaLineData.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", margin: "16px 0 8px" }}>영역별 등급 추이</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={areaLineData} margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="session" tick={{ fontSize: 11 }} />
              <YAxis domain={[1, 9]} reversed tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {Object.keys(areaTrends || {}).map((area) => (
                <Line key={area} type="monotone" dataKey={area} stroke={MOCK_AREA_COLORS[area] || "#6B7280"}
                  strokeWidth={2} dot={{ r: 3 }} name={area} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      {/* 취약 영역 하이라이트 */}
      {weakAreas && weakAreas.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 8 }}>취약 영역</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {weakAreas.map((w: any, i: number) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderRadius: 10, background: "#FEF2F2", border: "1px solid #FCA5A5",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>{w.area}</span>
                <span style={{ fontSize: 12, color: "#DC2626" }}>평균 {w.avg_rank}등급</span>
                <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto" }}>
                  전��� 대비 +{w.gap.toFixed(1)}등급 낮음
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 내신 vs 모의 비교 테이블 (고등학생) ──

function NaesinMockCompareSection({ gradeTrend, mockTrend }: { gradeTrend: any; mockTrend: any }) {
  // 최근 학기 내신 데이터
  const gradeData = gradeTrend?.data as any[] | undefined;
  const subjectTrends = gradeTrend?.subject_trends as Record<string, any[]> | undefined;
  // 최근 모의 데이터
  const areaTrends = mockTrend?.area_trends as Record<string, any[]> | undefined;

  if (!gradeData?.length || !areaTrends) return null;

  // 최근 ������ 과목별 등급
  const latestGrade: Record<string, number> = {};
  if (subjectTrends) {
    for (const [subj, arr] of Object.entries(subjectTrends)) {
      const last = (arr as any[]).at(-1);
      if (last) latestGrade[subj] = last.grade;
    }
  }

  // 최근 모의 영역별 등급
  const latestMock: Record<string, number> = {};
  for (const [area, arr] of Object.entries(areaTrends)) {
    const last = (arr as any[]).at(-1);
    if (last) latestMock[area] = last.rank;
  }

  // 매핑: 내�� 과목명 → 모의 영역명
  const compareRows = [
    { label: "���어", naesin: latestGrade["국어"], mock: latestMock["국어"] },
    { label: "수학", naesin: latestGrade["수학"], mock: latestMock["수학"] },
    { label: "영어", naesin: latestGrade["영어"], mock: latestMock["영어"] },
    { label: "탐구1", naesin: latestGrade["탐구1"], mock: latestMock["탐구1"] },
    { label: "탐구2", naesin: latestGrade["탐구2"], mock: latestMock["탐구2"] },
  ].filter(r => r.naesin != null || r.mock != null);

  if (compareRows.length === 0) return null;

  // 전체 평균
  const lastGradeAvg = gradeData.at(-1)?.avg_grade;
  const mockAvgData = mockTrend?.avg_trend as any[] | undefined;
  const lastMockAvg = mockAvgData?.at(-1)?.avg_rank;

  // 유형 자동 ���정 (참고용)
  let typeHint = "";
  if (lastGradeAvg != null && lastMockAvg != null) {
    const naesinConverted = lastGradeAvg * 2 - 1; // 5등급→9등급 대략 환산
    const diff = lastMockAvg - naesinConverted;
    if (diff > 1.5) typeHint = "내신형 (내신 우위)";
    else if (diff < -1.5) typeHint = "수능형 (모의 우위)";
    else typeHint = "균형형";
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>내신 vs 모의고사 비교</h2>
      <p style={{ fontSize: 12, color: "var(--gray-500)", margin: "0 0 16px" }}>
        최근 학기 내신 등급(5���급제)과 최근 모의 등급(9등급제)을 과목별로 비교합니다
      </p>

      {/* 비교 테이블 */}
      <div style={{ borderRadius: 10, border: "1px solid var(--gray-200)", overflow: "hidden" }}>
        {/* 헤더 */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 0,
          background: "#4472C4", color: "white", fontSize: 12, fontWeight: 700, textAlign: "center",
        }}>
          <div style={{ padding: "8px 0" }}>과목</div>
          <div style={{ padding: "8px 0" }}>내신 (5등급)</div>
          <div style={{ padding: "8px 0" }}>모의 (9등급)</div>
          <div style={{ padding: "8px 0" }}>Gap</div>
        </div>
        {/* 행 */}
        {compareRows.map((r, i) => {
          const gap = r.naesin != null && r.mock != null
            ? r.mock - (r.naesin * 2 - 1) // 5등급→9등급 대략 환산 후 비교
            : null;
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 0,
              fontSize: 13, textAlign: "center", borderTop: "1px solid var(--gray-100)",
              background: i % 2 === 0 ? "white" : "var(--gray-50)",
            }}>
              <div style={{ padding: "8px 0", fontWeight: 600 }}>{r.label}</div>
              <div style={{ padding: "8px 0" }}>{r.naesin != null ? `${r.naesin.toFixed(1)}` : "-"}</div>
              <div style={{ padding: "8px 0" }}>{r.mock != null ? `${r.mock.toFixed(1)}` : "-"}</div>
              <div style={{
                padding: "8px 0", fontWeight: 600,
                color: gap == null ? "#6B7280" : gap > 1 ? "#DC2626" : gap < -1 ? "#16A34A" : "#6B7280",
              }}>
                {gap != null ? (gap > 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1)) : "-"}
              </div>
            </div>
          );
        })}
      </div>

      {/* 평균 비교 + 유형 참고 */}
      <div style={{
        marginTop: 12, display: "flex", alignItems: "center", gap: 16,
        padding: "12px 16px", borderRadius: 10, background: "var(--gray-50)", border: "1px solid var(--gray-200)",
      }}>
        {lastGradeAvg != null && (
          <div style={{ fontSize: 12 }}>
            <span style={{ color: "var(--gray-500)" }}>내신 평균</span>{" "}
            <span style={{ fontWeight: 700 }}>{lastGradeAvg.toFixed(2)}등급</span>
          </div>
        )}
        {lastMockAvg != null && (
          <div style={{ fontSize: 12 }}>
            <span style={{ color: "var(--gray-500)" }}>모의 평균</span>{" "}
            <span style={{ fontWeight: 700 }}>{lastMockAvg.toFixed(2)}등급</span>
          </div>
        )}
        {typeHint && (
          <div style={{
            marginLeft: "auto", fontSize: 12, fontWeight: 700, padding: "4px 12px",
            borderRadius: 10,
            color: typeHint.includes("내신") ? "#4338CA" : typeHint.includes("수능") ? "#059669" : "#D97706",
            background: typeHint.includes("내신") ? "#EEF2FF" : typeHint.includes("수능") ? "#ECFDF5" : "#FFF7ED",
          }}>
            {typeHint}
          </div>
        )}
      </div>

      <div style={{
        marginTop: 10, fontSize: 11, color: "var(--gray-400)", lineHeight: 1.5,
      }}>
        ※ Gap은 5등급 내신을 9등급 상당으로 환산한 참고값입니다. 정확한 유형 판정은 상담사가 확정합니다.
      </div>
    </div>
  );
}

// ── 고교유형 적합도 ──

const SCHOOL_TYPE_ICONS: Record<string, string> = {
  "과고": "🔬",
  "외고": "🌐",
  "국제고": "🌍",
  "자사고": "🏫",
  "일반고": "📚",
};

function CompatibilitySection({ data }: { data: any }) {
  if (!data?.recommendations?.length) return null;

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>고교유형 적합도</h2>
      <p style={{ fontSize: 12, color: "var(--gray-500)", margin: "0 0 16px" }}>
        4축(학업기초력·교과선행도·학습습관·진로방향성) 기반 유형별 적합도 분석
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.recommendations.map((rec: any) => {
          const detail = data.details[rec.school_type];
          const gc = GRADE_COLORS[rec.grade] || GRADE_COLORS.D;
          const icon = SCHOOL_TYPE_ICONS[rec.school_type] || "🏫";
          return (
            <div key={rec.school_type} style={{
              borderRadius: 12,
              border: rec.is_desired ? `2px solid ${gc.border}` : "1px solid var(--gray-200)",
              overflow: "hidden",
              background: rec.is_desired ? gc.bg : "white",
            }}>
              {/* 헤더 */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 16px",
              }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>
                  {rec.school_type}
                  {rec.is_desired && (
                    <span style={{
                      marginLeft: 8, fontSize: 10, padding: "2px 8px",
                      borderRadius: 10, background: gc.text, color: "white", fontWeight: 600,
                    }}>
                      희망
                    </span>
                  )}
                </span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: gc.text }}>
                    {rec.score}<span style={{ fontSize: 11, fontWeight: 400 }}>점</span>
                  </div>
                </div>
                <GradeBadge grade={rec.grade} />
              </div>

              {/* 상세 (보정 정보) */}
              {detail && (detail.bonus !== 0 || detail.penalty !== 0) && (
                <div style={{ padding: "0 16px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {detail.bonus > 0 && (
                    <span style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 8,
                      background: "#DCFCE7", color: "#16A34A", fontWeight: 600,
                    }}>
                      +{detail.bonus} {detail.bonus_reason}
                    </span>
                  )}
                  {detail.penalty < 0 && (
                    <span style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 8,
                      background: "#FEE2E2", color: "#DC2626", fontWeight: 600,
                    }}>
                      {detail.penalty} {detail.penalty_reason}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 기준 점수 표시 */}
      {data.subject_scores && Object.keys(data.subject_scores).length > 0 && (
        <div style={{
          marginTop: 16, padding: "12px 16px", borderRadius: 10,
          background: "var(--gray-50)", border: "1px solid var(--gray-200)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-600)", marginBottom: 8 }}>
            보정 기준 원점수 (최근 학기)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {[
              { key: "ko", label: "국어" },
              { key: "en", label: "영어" },
              { key: "ma", label: "수학" },
              { key: "so", label: "사회" },
              { key: "sc", label: "과학" },
            ].map(({ key, label }) => {
              const score = data.subject_scores[key];
              if (score == null) return null;
              return (
                <div key={key} style={{ fontSize: 12, color: "var(--gray-700)" }}>
                  <span style={{ fontWeight: 600 }}>{label}</span>{" "}
                  <span style={{ color: score >= 95 ? "#16A34A" : score <= 90 ? "#DC2626" : "var(--gray-700)" }}>
                    {score}점
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 등급 범례 ──

function GradeLegend() {
  return (
    <div style={{ ...cardStyle }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--gray-600)" }}>등급 기준</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
        {[
          { g: "S", label: "90~100 최상위" },
          { g: "A", label: "75~89 상위" },
          { g: "B", label: "55~74 평균" },
          { g: "C", label: "35~54 보완필요" },
          { g: "D", label: "0~34 미흡" },
        ].map(({ g, label }) => (
          <div key={g} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6B7280" }}>
            <GradeBadge grade={g} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 수능 최저학력기준 충족 시뮬레이션 ──

function SuneungMinimumSection({ data }: { data: any }) {
  const [expandedUniv, setExpandedUniv] = useState<string | null>(null);
  const grades = data.student_mock_grades || {};
  const simulations: any[] = data.simulations || [];
  const summary = data.summary || {};

  // Group by university
  const grouped: Record<string, any[]> = {};
  for (const sim of simulations) {
    const key = sim.university;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(sim);
  }

  const resultColor = (result: string, margin?: number) => {
    if (result === "충족") return { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7" };
    if (result === "미충족" && margin != null && margin >= -2) return { bg: "#FFFBEB", text: "#D97706", border: "#FCD34D" };
    if (result === "미충족") return { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5" };
    if (result === "해당없음") return { bg: "#F3F4F6", text: "#6B7280", border: "#D1D5DB" };
    return { bg: "#F3F4F6", text: "#6B7280", border: "#D1D5DB" };
  };

  const resultLabel = (result: string, margin?: number) => {
    if (result === "충족") return "충족";
    if (result === "미충족" && margin != null && margin >= -2) return "근접";
    if (result === "미충족") return "미충족";
    if (result === "해당없음") return "없음";
    return result;
  };

  const gradeLabel = (key: string) => {
    const m: Record<string, string> = { korean: "국어", math: "수학", english: "영어", inquiry1: "탐구1", inquiry2: "탐구2" };
    return m[key] || key;
  };

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
        수능 최저학력기준 충족 시뮬레이션
      </h2>

      {/* 학생 모의고사 등급 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {(["korean", "math", "english", "inquiry1", "inquiry2"] as const).map((key) => {
          const g = grades[key];
          return (
            <div key={key} style={{
              background: "#F8FAFC", borderRadius: 10, padding: "8px 14px",
              textAlign: "center", minWidth: 56,
            }}>
              <div style={{ fontSize: 11, color: "var(--gray-500)", marginBottom: 2 }}>{gradeLabel(key)}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: g != null ? "var(--gray-900)" : "var(--gray-300)" }}>
                {g != null ? `${g}` : "-"}
              </div>
            </div>
          );
        })}
      </div>

      {/* 요약 카드 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "충족", count: summary.met || 0, color: "#059669", bg: "#ECFDF5" },
          { label: "근접", count: summary.close || 0, color: "#D97706", bg: "#FFFBEB" },
          { label: "미충족", count: summary.not_met || 0, color: "#DC2626", bg: "#FEF2F2" },
        ].map((item) => (
          <div key={item.label} style={{
            flex: 1, minWidth: 80, background: item.bg, borderRadius: 10,
            padding: "10px 12px", textAlign: "center",
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.count}</div>
            <div style={{ fontSize: 11, color: item.color, fontWeight: 600 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* 대학별 결과 */}
      {Object.entries(grouped).map(([univ, sims]) => {
        const isExpanded = expandedUniv === univ;
        const metCount = sims.filter((s: any) => s.result === "충족").length;
        const totalCount = sims.filter((s: any) => s.result !== "해당없음").length;

        return (
          <div key={univ} style={{
            border: "1px solid var(--gray-200)", borderRadius: 12,
            marginBottom: 8, overflow: "hidden",
          }}>
            {/* University header */}
            <button
              onClick={() => setExpandedUniv(isExpanded ? null : univ)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", background: "none", border: "none", cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{univ}</span>
                <span style={{ fontSize: 12, color: "var(--gray-500)", marginLeft: 8 }}>
                  {totalCount > 0 ? `${metCount}/${totalCount} 충족` : ""}
                </span>
              </div>
              <span style={{ fontSize: 12, color: "var(--gray-400)" }}>{isExpanded ? "\u25B2" : "\u25BC"}</span>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ padding: "0 14px 12px" }}>
                {sims.map((sim: any, i: number) => {
                  const rc = resultColor(sim.result, sim.margin);
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 0",
                      borderTop: i > 0 ? "1px solid var(--gray-100)" : "none",
                    }}>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 6,
                        fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                        background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`,
                      }}>
                        {resultLabel(sim.result, sim.margin)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {sim.admission_type}
                          {sim.requirement_label !== "전체" && (
                            <span style={{ fontSize: 11, color: "var(--gray-500)", marginLeft: 4 }}>
                              {sim.requirement_label}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 2, whiteSpace: "pre-line" }}>
                          {sim.requirement_text?.replace(/\n/g, " / ")}
                        </div>
                        {sim.detail && (
                          <div style={{ fontSize: 12, color: rc.text, marginTop: 4, fontWeight: 500 }}>
                            {sim.detail}
                          </div>
                        )}
                        {sim.failures?.length > 0 && (
                          <div style={{ fontSize: 11, color: "#DC2626", marginTop: 2 }}>
                            {sim.failures.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 12, lineHeight: 1.5 }}>
        * 최신 모의고사 등급 기준 시뮬레이션 결과입니다. 실제 수능 성적과 다를 수 있습니다.
        <br />
        * 한국사는 대부분 4등급 이내 충족 가정으로 시뮬레이션합니다.
      </div>
    </div>
  );
}

// ── 과목별 경쟁력 섹션 (고등학생) ──

const TREND_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  improving: { label: "상승", color: "#059669", bg: "#ECFDF5", icon: "▲" },
  declining: { label: "하락", color: "#DC2626", bg: "#FEF2F2", icon: "▼" },
  stable:    { label: "유지", color: "#4B5563", bg: "#F3F4F6", icon: "—" },
  insufficient: { label: "데이터 부족", color: "#9CA3AF", bg: "#F9FAFB", icon: "·" },
};

function gradeTone(grade: number | null | undefined): { color: string; bg: string } {
  if (grade == null) return { color: "#9CA3AF", bg: "#F9FAFB" };
  if (grade <= 2.0) return { color: "#059669", bg: "#ECFDF5" };
  if (grade <= 3.5) return { color: "#D97706", bg: "#FFF7ED" };
  return { color: "#DC2626", bg: "#FEF2F2" };
}

function gapTone(gap: number | null | undefined): { color: string; bg: string; label: string } {
  if (gap == null) return { color: "#9CA3AF", bg: "#F9FAFB", label: "—" };
  if (gap <= 0) return { color: "#059669", bg: "#ECFDF5", label: `목표 달성 (${gap.toFixed(1)})` };
  if (gap <= 1.0) return { color: "#D97706", bg: "#FFF7ED", label: `+${gap.toFixed(1)}등급` };
  return { color: "#DC2626", bg: "#FEF2F2", label: `+${gap.toFixed(1)}등급` };
}

function SubjectCompetitivenessSection({ data }: { data: any }) {
  const subjects = data.subjects || {};
  const targetGrade = data.target_grade;
  const targetLevel = data.target_level;
  const focus = data.strategy?.focus || [];
  const maintain = data.strategy?.maintain || [];
  const consider = data.strategy?.consider || [];

  const subjectOrder = ["ko", "ma", "en", "sc1", "sc2", "so"];
  const orderedKeys = subjectOrder.filter((k) => subjects[k]);

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>과목별 경쟁력</h2>
      <p style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 14, lineHeight: 1.5 }}>
        내신·모의고사 등급을 목표와 비교하여 강점/약점 과목을 분류합니다.
      </p>

      {/* 목표 등급 요약 */}
      {targetGrade != null && (
        <div style={{
          padding: "10px 12px", marginBottom: 12, borderRadius: 10,
          background: "#EEF2FF", border: "1px solid #C7D2FE",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ fontSize: 12, color: "#4338CA" }}>
            목표 대학 수준{targetLevel ? `: ${targetLevel}` : ""}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#4338CA" }}>
            목표 등급 ≈ {targetGrade.toFixed(1)}
          </div>
        </div>
      )}

      {/* 과목별 카드 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {orderedKeys.map((key) => {
          const s = subjects[key];
          const cur = s.current_grade;
          const avg = s.avg_grade;
          const mockCur = s.mock_current;
          const trend = TREND_META[s.trend] || TREND_META.insufficient;
          const curTone = gradeTone(cur);
          const gap = gapTone(s.gap);
          const isStrongest = (data.strongest_subjects || []).includes(s.name);
          const isWeakest = (data.weakest_subjects || []).includes(s.name);

          return (
            <div key={key} style={{
              border: "1px solid var(--gray-200)", borderRadius: 12, padding: "12px 14px",
              background: "white",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1F2937" }}>{s.name}</div>
                {isStrongest && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                    color: "#059669", background: "#ECFDF5", border: "1px solid #6EE7B7",
                  }}>강점</span>
                )}
                {isWeakest && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                    color: "#DC2626", background: "#FEF2F2", border: "1px solid #FCA5A5",
                  }}>약점</span>
                )}
                <span style={{
                  marginLeft: "auto", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                  color: trend.color, background: trend.bg,
                }}>
                  {trend.icon} {trend.label}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
                <MetricCell label="현재 내신" value={cur != null ? `${cur}` : "—"} tone={curTone} />
                <MetricCell label="내신 평균" value={avg != null ? `${avg}` : "—"} />
                <MetricCell label="최근 모의" value={mockCur != null ? `${mockCur}` : "—"} />
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8,
                background: gap.bg,
              }}>
                <span style={{ fontSize: 11, color: "var(--gray-500)" }}>목표 대비</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: gap.color }}>{gap.label}</span>
                {s.within_plus_minus_1 && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#059669", fontWeight: 600 }}>
                    ±1등급 이내
                  </span>
                )}
              </div>

              {s.weakness_types && s.weakness_types.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--gray-500)", marginRight: 4 }}>취약 유형:</span>
                  {s.weakness_types.slice(0, 5).map((t: string) => (
                    <span key={t} style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 999,
                      background: "#F3F4F6", color: "#374151",
                    }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 전략 과목 분류 */}
      {(focus.length > 0 || maintain.length > 0 || consider.length > 0) && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#1F2937" }}>전략 과목 분류</div>
          {focus.length > 0 && (
            <StrategyBlock
              title="집중 공략" subtitle="목표 달성 가능성이 높은 과목"
              entries={focus} accent={{ color: "#D97706", bg: "#FFF7ED", border: "#FCD34D" }}
            />
          )}
          {maintain.length > 0 && (
            <StrategyBlock
              title="유지 관리" subtitle="이미 목표 이내인 과목"
              entries={maintain} accent={{ color: "#059669", bg: "#ECFDF5", border: "#6EE7B7" }}
            />
          )}
          {consider.length > 0 && (
            <StrategyBlock
              title="전략적 배분 고려" subtitle="목표 차이가 크고 본인도 어려운 과목"
              entries={consider} accent={{ color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5" }}
            />
          )}
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 12, lineHeight: 1.5 }}>
        * 목표 등급은 응답한 목표 대학 수준에서 추정한 참고값입니다.
      </div>
    </div>
  );
}

function MetricCell({ label, value, tone }: { label: string; value: string; tone?: { color: string; bg: string } }) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: 8, textAlign: "center",
      background: tone?.bg || "#F9FAFB",
    }}>
      <div style={{ fontSize: 11, color: "var(--gray-500)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone?.color || "#1F2937" }}>{value}</div>
    </div>
  );
}

function StrategyBlock({
  title, subtitle, entries, accent,
}: {
  title: string; subtitle: string; entries: any[];
  accent: { color: string; bg: string; border: string };
}) {
  return (
    <div style={{
      marginBottom: 10, padding: "10px 12px", borderRadius: 10,
      background: accent.bg, border: `1px solid ${accent.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent.color }}>{title}</span>
        <span style={{ fontSize: 11, color: "var(--gray-500)" }}>{subtitle}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map((e, i) => (
          <div key={`${e.key}-${i}`} style={{
            background: "white", borderRadius: 8, padding: "8px 10px",
            border: "1px solid var(--gray-200)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>{e.name}</span>
              {e.current_grade != null && (
                <span style={{ fontSize: 11, color: "var(--gray-500)" }}>현재 {e.current_grade}등급</span>
              )}
              {e.gap != null && (
                <span style={{ fontSize: 11, color: accent.color, fontWeight: 600 }}>
                  · 갭 {e.gap > 0 ? `+${e.gap}` : e.gap}
                </span>
              )}
            </div>
            {e.tip && (
              <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{e.tip}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 공통 스타일 ──

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 14,
  border: "1px solid var(--gray-200)",
  padding: "20px 16px",
};

const linkBtnStyle: React.CSSProperties = {
  background: "var(--primary)",
  color: "white",
  border: "none",
  borderRadius: 10,
  padding: "10px 24px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
