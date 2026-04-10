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
  Cell,
} from "recharts";
import { getSurveyComputed, getSurvey } from "@/lib/api";

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

      {/* 과목별 준비율 차트 (예비고1만) */}
      {isPreheigh1 && rs.prep && <PrepRateChart prep={rs.prep} />}

      {/* 영역별 상세 점수 */}
      <DetailSection rs={rs} sections={detailSections} />

      {/* 로드맵 자동 초안 (예비고1만) */}
      {isPreheigh1 && rs.roadmap && <RoadmapSection roadmap={rs.roadmap} />}

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

function RoadmapSection({ roadmap }: { roadmap: any }) {
  if (!roadmap?.items?.length) return null;

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>고교 준비 로드맵</h2>
      <p style={{ fontSize: 12, color: "var(--gray-500)", margin: "0 0 16px" }}>
        {roadmap.summary}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {roadmap.items.map((item: any, i: number) => {
          const pc = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS["하"];
          const gc = GRADE_COLORS[item.current_grade] || GRADE_COLORS.D;
          return (
            <div key={i} style={{
              borderRadius: 12, border: "1px solid var(--gray-200)",
              overflow: "hidden",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 16px", background: "var(--gray-50)",
              }}>
                <span style={{
                  padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                  color: pc.text, background: pc.bg,
                }}>
                  {item.priority === "상" ? "최우선" : item.priority === "중" ? "중요" : "참고"}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{item.title}</span>
                <GradeBadge grade={item.current_grade} />
              </div>
              <div style={{ padding: "12px 16px" }}>
                <p style={{ fontSize: 13, color: "var(--gray-700)", margin: "0 0 8px", lineHeight: 1.6 }}>
                  {item.description}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gray-500)" }}>
                  <span>📅</span>
                  <span>{item.period}</span>
                  <span style={{ marginLeft: "auto" }}>{item.area}</span>
                  <span style={{ fontWeight: 600, color: gc.text }}>{item.current_score}점</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
