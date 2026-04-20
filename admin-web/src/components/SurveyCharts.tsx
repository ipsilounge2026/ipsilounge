"use client";

/**
 * 설문 자동 분석 차트 컴포넌트 (recharts 기반)
 *
 * - 내신 추이 라인 차트
 * - 등급 분포 바 차트 (고등학생)
 * - 모의고사 추이 라인 차트
 * - 학습 시간 파이/레이더 차트
 */

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell,
  ReferenceArea,
} from "recharts";

// ── 색상 팔레트 ──
const COLORS = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"];
const PIE_COLORS = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47", "#BF4B4B", "#8B5CF6"];

const trendBadgeColor: Record<string, string> = {
  상승: "#10B981", 하락: "#EF4444", 유지: "#6B7280", 등락: "#F59E0B",
  V자반등: "#3B82F6", 역V자: "#F97316", 데이터부족: "#D1D5DB",
};

interface RadarAreaScore {
  score: number;
  grade: string;
}

interface RadarScores {
  radar: Record<string, RadarAreaScore>;
  overall_score: number;
  overall_grade: string;
  naesin?: any;
  mock?: any;
  study?: any;
  career?: any;
}

interface ComputedStats {
  grade_trend?: {
    data: { semester: string; avg_grade?: number; avg_score?: number; subject_count: number }[];
    trend_badge: string;
    subject_trends: Record<string, any[]>;
    grade_distribution?: any[];
    // V2_2 §3-2 자유학기제 구간 점선 표시용 메타 (예비고1 전용)
    semester_meta?: {
      key: string;
      semester: string;
      exempt: boolean;
      exempt_reason: string | null;
      exempt_label: string | null;
    }[];
  };
  mock_trend?: {
    avg_trend: { session: string; avg_rank: number }[];
    trend_badge: string;
    area_trends: Record<string, { session: string; rank: number }[]>;
    weak_areas: { area: string; avg_rank: number; gap: number }[];
  };
  study_analysis?: {
    total_weekly_hours: number;
    by_subject: Record<string, number>;
    by_type: Record<string, number>;
    self_study_ratio: number;
    subject_balance: number;
  };
  // V3 §5-⑤ E4 수능 최저 자가 평가 (T2~T4 고등 설문)
  e4_summary?: {
    awareness: string | null;
    feasibility: string | null;
    focus_areas: string[];
    score: number;
    max: number;
    awareness_points: number;
    feasibility_points: number;
    focus_points: number;
    is_answered: boolean;
  };
  radar_scores?: RadarScores;
}

function TrendBadge({ badge }: { badge: string }) {
  return (
    <span style={{
      padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600,
      color: "white", background: trendBadgeColor[badge] || "#6B7280",
    }}>
      {badge}
    </span>
  );
}

function SectionTitle({ children, badge }: { children: React.ReactNode; badge?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, margin: 0 }}>{children}</h3>
      {badge && <TrendBadge badge={badge} />}
    </div>
  );
}

// ═══════════════════════════════════════
// 1. 내신 추이 차트
// ═══════════════════════════════════════

export function GradeTrendChart({ computed, surveyType }: { computed: ComputedStats; surveyType: string }) {
  const gt = computed.grade_trend;
  if (!gt || !gt.data.length) return <EmptyState text="성적 데이터가 없습니다" />;

  const isHigh = surveyType === "high";
  const valueKey = isHigh ? "avg_grade" : "avg_score";
  const label = isHigh ? "평균 등급" : "평균 점수";

  // V2_2 §3-2 "자유학기제 구간 점선 표시": 예비고1 은 semester_meta 로 6학기
  // 전부 x축에 표기하고, exempt 학기는 별도 영역 표시 + 점수는 null.
  const meta = gt.semester_meta;
  const useFullTimeline = !isHigh && Array.isArray(meta) && meta.length > 0;

  // 평균 추이 데이터: 예비고1 full timeline 이면 meta 기반, 아니면 기존 data
  const avgChartData = useFullTimeline
    ? meta!.map((m) => {
        const scored = gt.data.find((d) => d.semester === m.semester);
        return {
          semester: m.semester,
          avg_score: scored?.avg_score ?? null,
          exempt: m.exempt,
          exempt_label: m.exempt_label,
        };
      })
    : gt.data;

  // 과목별 추이: 동일하게 full timeline 기반 pivot
  const subjectNames = Object.keys(gt.subject_trends);
  const semesters = useFullTimeline
    ? meta!.map((m) => m.semester)
    : gt.data.map((d) => d.semester);
  const subjectChartData = semesters.map((sem) => {
    const row: Record<string, any> = { semester: sem };
    for (const [subj, arr] of Object.entries(gt.subject_trends)) {
      const found = arr.find((d: any) => d.semester === sem);
      row[subj] = found ? (isHigh ? found.grade : found.raw_score) : null;
    }
    return row;
  });

  // 연속된 exempt 학기들을 하나의 ReferenceArea 로 묶기
  // (예: C1+C2 자유학기제 구간, C5+C6 미진행 구간)
  const exemptRanges: { start: string; end: string; label: string; reason: string }[] = [];
  if (useFullTimeline) {
    let cur: { start: string; end: string; label: string; reason: string } | null = null;
    for (const m of meta!) {
      if (m.exempt) {
        const label = m.exempt_label || "해당 없음";
        const reason = m.exempt_reason || "exempt";
        if (cur && cur.reason === reason) {
          cur.end = m.semester;
        } else {
          if (cur) exemptRanges.push(cur);
          cur = { start: m.semester, end: m.semester, label, reason };
        }
      } else {
        if (cur) {
          exemptRanges.push(cur);
          cur = null;
        }
      }
    }
    if (cur) exemptRanges.push(cur);
  }

  const renderExemptAreas = () =>
    exemptRanges.map((r, idx) => (
      <ReferenceArea
        key={`${r.reason}-${idx}`}
        x1={r.start}
        x2={r.end}
        strokeOpacity={0}
        fill={r.reason === "free_semester" ? "#FEF3C7" : "#F3F4F6"}
        fillOpacity={0.7}
        label={{
          value: r.label,
          position: "insideTop",
          fill: r.reason === "free_semester" ? "#92400E" : "#6B7280",
          fontSize: 10,
        }}
      />
    ));

  return (
    <div>
      <SectionTitle badge={gt.trend_badge}>{isHigh ? "내신 등급 추이" : "성적 추이"}</SectionTitle>

      {/* 평균 추이 라인 차트 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>학기별 {label}</div>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={avgChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="semester" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              reversed={isHigh}
              domain={isHigh ? [1, 5] : [0, 100]}
            />
            <Tooltip
              formatter={(value: number) => [isHigh ? `${value}등급` : `${value}점`, label]}
              contentStyle={{ fontSize: 12 }}
            />
            {renderExemptAreas()}
            <Line
              type="monotone" dataKey={valueKey} stroke="#4472C4" strokeWidth={2.5}
              dot={{ r: 5, fill: "#4472C4" }} name={label} connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 과목별 추이 라인 차트 */}
      {subjectNames.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>과목별 추이</div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={subjectChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="semester" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                reversed={isHigh}
                domain={isHigh ? [1, 5] : [0, 100]}
              />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {renderExemptAreas()}
              {subjectNames.map((subj, i) => (
                <Line
                  key={subj} type="monotone" dataKey={subj}
                  stroke={COLORS[i % COLORS.length]} strokeWidth={2}
                  dot={{ r: 4 }} connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {/* 자유학기제/미진행 범례 (예비고1 full timeline 일 때만) */}
          {useFullTimeline && exemptRanges.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "#6B7280" }}>
              {exemptRanges.some((r) => r.reason === "free_semester") && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 12, height: 12, background: "#FEF3C7", border: "1px solid #FDE68A" }} />
                  <span>자유학기제 (성적 미산출)</span>
                </div>
              )}
              {exemptRanges.some((r) => r.reason === "not_graded") && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 12, height: 12, background: "#F3F4F6", border: "1px solid #E5E7EB" }} />
                  <span>미진행</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 등급 분포 스택 바 차트 (고등학생) */}
      {isHigh && gt.grade_distribution && gt.grade_distribution.length > 0 && (
        <GradeDistributionChart data={gt.grade_distribution} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// 2. 등급 분포 바 차트
// ═══════════════════════════════════════

function GradeDistributionChart({ data }: { data: any[] }) {
  const gradeColors: Record<string, string> = {
    "1": "#10B981", "2": "#3B82F6", "3": "#F59E0B", "4": "#F97316", "5": "#EF4444",
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>등급 분포 (과목 수)</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis dataKey="semester" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {["1", "2", "3", "4", "5"].map((g) => (
            <Bar key={g} dataKey={g} name={`${g}등급`} stackId="a" fill={gradeColors[g]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════
// 3. 모의고사 추이 차트
// ═══════════════════════════════════════

export function MockTrendChart({ computed }: { computed: ComputedStats }) {
  const mt = computed.mock_trend;
  if (!mt || !mt.avg_trend.length) return null;

  // 영역별 데이터 피벗
  const sessions = mt.avg_trend.map((d) => d.session);
  const areaNames = Object.keys(mt.area_trends);

  const areaChartData = sessions.map((sess) => {
    const row: Record<string, any> = { session: sess };
    row["평균"] = mt.avg_trend.find((d) => d.session === sess)?.avg_rank ?? null;
    for (const [area, arr] of Object.entries(mt.area_trends)) {
      const found = arr.find((d) => d.session === sess);
      row[area] = found ? found.rank : null;
    }
    return row;
  });

  return (
    <div style={{ marginTop: 32 }}>
      <SectionTitle badge={mt.trend_badge}>모의고사 추이</SectionTitle>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={areaChartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis dataKey="session" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} reversed domain={[1, 9]} />
          <Tooltip
            formatter={(value: number, name: string) => [`${value}등급`, name]}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone" dataKey="평균" stroke="#111827" strokeWidth={3}
            dot={{ r: 5, fill: "#111827" }} strokeDasharray="5 5"
          />
          {areaNames.map((area, i) => (
            <Line
              key={area} type="monotone" dataKey={area}
              stroke={COLORS[i % COLORS.length]} strokeWidth={2}
              dot={{ r: 4 }} connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* 취약 영역 */}
      {mt.weak_areas.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: "#FEF2F2", borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: "#991B1B", fontWeight: 600, marginBottom: 6 }}>취약 영역</div>
          {mt.weak_areas.map((w) => (
            <div key={w.area} style={{ fontSize: 12, color: "#7F1D1D" }}>
              {w.area}: 평균 {w.avg_rank}등급 (전체 평균 대비 +{w.gap})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// 4. 학습 시간 분석 (파이 + 레이더)
// ═══════════════════════════════════════

export function StudyAnalysisChart({ computed }: { computed: ComputedStats }) {
  const sa = computed.study_analysis;
  if (!sa || !sa.total_weekly_hours) return null;

  // 과목별 시간 → 파이차트 데이터
  const pieData = Object.entries(sa.by_subject).map(([name, value]) => ({ name, value }));

  // 과목별 시간 → 레이더 차트 데이터
  const maxHours = Math.max(...Object.values(sa.by_subject), 1);
  const radarData = Object.entries(sa.by_subject).map(([subject, hours]) => ({
    subject,
    hours,
    pct: Math.round((hours / maxHours) * 100),
  }));

  // 유형별 시간 → 파이차트 데이터
  const typeData = Object.entries(sa.by_type).map(([name, value]) => ({ name, value }));

  return (
    <div style={{ marginTop: 32 }}>
      <SectionTitle>학습 시간 분석</SectionTitle>

      {/* 요약 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="주간 총 학습시간" value={`${sa.total_weekly_hours}h`} color="#1E40AF" bg="#EFF6FF" />
        <StatCard label="자기주도 비율" value={`${sa.self_study_ratio}%`} color="#166534" bg="#F0FDF4" />
        <StatCard label="과목 밸런스" value={`${sa.subject_balance}`} color="#7C3AED" bg="#FDF4FF" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* 과목별 학습 시간 레이더 */}
        {radarData.length >= 3 && (
          <div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>과목별 학습 시간</div>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fontSize: 10 }} />
                <Radar
                  dataKey="hours" stroke="#4472C4" fill="#4472C4" fillOpacity={0.3}
                  name="시간(h)"
                />
                <Tooltip formatter={(value: number) => [`${value}h`, "학습시간"]} contentStyle={{ fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 과목별 파이 (레이더가 3개 미만이면 파이로 대체) */}
        {radarData.length < 3 && pieData.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>과목별 학습 시간</div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name} ${value}h`}
                >
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value}h`, "학습시간"]} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 유형별 비율 파이 */}
        {typeData.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>학습 유형별 비율</div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={typeData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={90}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value}h`, "학습시간"]} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// 유틸 컴포넌트
// ═══════════════════════════════════════

function StatCard({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ padding: 12, background: bg, borderRadius: 6, textAlign: "center" }}>
      <div style={{ fontSize: 11, color }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ color: "#9CA3AF", fontSize: 13 }}>{text}</div>;
}

// ═══════════════════════════════════════
// 4. 종합 진단 — 4각형 레이더 차트
// ═══════════════════════════════════════

const GRADE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: "#EEF2FF", text: "#4338CA", border: "#A5B4FC" },
  A: { bg: "#ECFDF5", text: "#059669", border: "#6EE7B7" },
  B: { bg: "#FFF7ED", text: "#D97706", border: "#FCD34D" },
  C: { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5" },
  D: { bg: "#F3F4F6", text: "#6B7280", border: "#D1D5DB" },
};

const RADAR_LABELS: Record<string, string> = {
  // 고등 설문 (4각형)
  "내신_경쟁력": "내신 경쟁력",
  "모의고사_역량": "모의고사 역량",
  "학습습관_전략": "학습 습관·전략",
  "진로전형_전략": "진로·전형 전략",
  // 예비고1 설문 (5각형) — 기획서 V2_2 §3-1
  "학업기초력": "학업 기초력",
  "학습습관_자기주도력": "학습 습관·자기주도력",
  "교과선행도": "교과 선행도",
  "진로방향성": "진로 방향성",
  "비교과역량": "비교과 역량",
};

function GradeBadge({ grade, size = "normal" }: { grade: string; size?: "normal" | "large" }) {
  const c = GRADE_COLORS[grade] || GRADE_COLORS.D;
  const isLarge = size === "large";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: isLarge ? 44 : 28, height: isLarge ? 44 : 28,
      borderRadius: isLarge ? 12 : 6, fontSize: isLarge ? 22 : 13, fontWeight: 800,
      color: c.text, background: c.bg, border: `2px solid ${c.border}`,
    }}>
      {grade}
    </span>
  );
}

export function RadarScoreChart({ computed }: { computed: ComputedStats }) {
  const rs = computed.radar_scores;
  if (!rs || !rs.radar) return null;

  const radarData = Object.entries(rs.radar).map(([key, val]) => ({
    area: RADAR_LABELS[key] || key.replace(/_/g, " "),
    score: val.score,
    fullMark: 100,
  }));

  const areaEntries = Object.entries(rs.radar);

  return (
    <div style={{ background: "white", borderRadius: 12, border: "1px solid #E5E7EB", padding: 20, marginBottom: 20 }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>종합 진단</h3>
        <GradeBadge grade={rs.overall_grade} size="large" />
        <span style={{ fontSize: 22, fontWeight: 700, color: "#1F2937" }}>{rs.overall_score}점</span>
        <span style={{ fontSize: 13, color: "#6B7280" }}>/ 100</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* 왼쪽: 레이더 차트 */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#E5E7EB" />
              <PolarAngleAxis dataKey="area" tick={{ fontSize: 12, fill: "#374151" }} />
              <PolarRadiusAxis angle={45} domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar
                dataKey="score"
                stroke="#4472C4"
                fill="#4472C4"
                fillOpacity={0.25}
                strokeWidth={2}
                dot={{ r: 4, fill: "#4472C4" }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* 오른쪽: 영역별 점수 카드 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {areaEntries.map(([key, val]) => {
            const c = GRADE_COLORS[val.grade] || GRADE_COLORS.D;
            return (
              <div key={key} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg,
              }}>
                <GradeBadge grade={val.grade} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>
                    {RADAR_LABELS[key] || key}
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.text }}>
                  {val.score}<span style={{ fontSize: 12, fontWeight: 400 }}>/100</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 등급 범례 */}
      <div style={{ display: "flex", gap: 16, marginTop: 16, justifyContent: "center" }}>
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

// 영역 상세 점수 테이블
export function RadarDetailTable({ computed }: { computed: ComputedStats }) {
  const rs = computed.radar_scores;
  if (!rs) return null;

  const sections = [
    { key: "naesin", label: "내신 경쟁력" },
    { key: "mock", label: "모의고사 역량" },
    { key: "study", label: "학습 습관·전략" },
    { key: "career", label: "진로·전형 전략" },
  ] as const;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {sections.map(({ key, label }) => {
        const data = rs[key];
        if (!data || !data.details) return null;
        const c = GRADE_COLORS[data.grade] || GRADE_COLORS.D;
        return (
          <div key={key} style={{
            background: "white", borderRadius: 10, border: "1px solid #E5E7EB", padding: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <GradeBadge grade={data.grade} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
              <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, color: c.text }}>
                {data.total}점
              </span>
            </div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                {Object.entries(data.details).map(([item, info]: [string, any]) => (
                  <tr key={item} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "6px 4px", color: "#374151" }}>{item.replace(/_/g, " ")}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 600 }}>
                      {info.score}/{info.max}
                    </td>
                    <td style={{ padding: "6px 4px", width: 80 }}>
                      <div style={{
                        height: 6, borderRadius: 3, background: "#F3F4F6", overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%", borderRadius: 3,
                          width: `${(info.score / info.max) * 100}%`,
                          background: c.text,
                        }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════
// 과목별 고등 준비율 (예비고1 V2_2 §3-3)
// ═══════════════════════════════════════

/**
 * 수학·영어·국어·과학 각각의 고등 준비율을 바 차트로 표시하고,
 * 과목 클릭 시 하위 항목(진도/레벨/어휘/독해/문법 등) 세부 비율 펼치기.
 */

const SUBJECT_PREP_KEYS: { detailKey: string; label: string; emoji: string }[] = [
  { detailKey: "수학_선행", label: "수학", emoji: "➗" },
  { detailKey: "영어_역량", label: "영어", emoji: "🇬🇧" },
  { detailKey: "국어_역량", label: "국어", emoji: "📖" },
  { detailKey: "과학_선행", label: "과학", emoji: "🧪" },
];

export function SubjectPrepBreakdown({ computed }: { computed: ComputedStats }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const rs = (computed.radar_scores as Record<string, unknown> | undefined);
  const prep = rs?.prep as
    | { total?: number; details?: Record<string, { score: number; max: number; sub?: Record<string, number> }> }
    | undefined;
  if (!prep || !prep.details) return null;

  return (
    <div style={{ marginBottom: 24 }} id="section-subject-prep">
      <SectionTitle>📚 과목별 고등 준비율 (V2_2 §3-3)</SectionTitle>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
        수학·영어·국어·과학 각각의 고등 학습 준비율. 과목을 클릭하면 하위 항목 세부 비율이 펼쳐집니다.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SUBJECT_PREP_KEYS.map(({ detailKey, label, emoji }) => {
          const d = prep.details?.[detailKey];
          if (!d) return null;
          const pct = d.max > 0 ? Math.round((d.score / d.max) * 100) : 0;
          const color = pct >= 75 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444";
          // 방어: d.sub 가 null/undefined/비객체(직렬화 오류) 여도 Object.keys 가 throw 하지 않도록
          const subIsObject = d.sub && typeof d.sub === "object" && !Array.isArray(d.sub);
          const hasSub = subIsObject && Object.keys(d.sub as Record<string, unknown>).length > 0;
          const isOpen = expanded === detailKey;
          return (
            <div
              key={detailKey}
              style={{
                background: "white",
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => hasSub && setExpanded(isOpen ? null : detailKey)}
                disabled={!hasSub}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "none",
                  background: "transparent",
                  cursor: hasSub ? "pointer" : "default",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>{emoji}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>
                    {d.score}/{d.max}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 700, color }}>{pct}%</span>
                  {hasSub && (
                    <span style={{ fontSize: 12, color: "#9CA3AF", minWidth: 20 }}>
                      {isOpen ? "▲" : "▼"}
                    </span>
                  )}
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "#F3F4F6", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: color,
                      transition: "width 0.4s",
                    }}
                  />
                </div>
              </button>
              {hasSub && isOpen && (
                <div style={{ padding: "10px 16px 14px 16px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB" }}>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>하위 항목별 점수</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                    {Object.entries(d.sub || {}).map(([subKey, subScore]) => (
                      <div key={subKey} style={{ padding: "6px 10px", background: "white", borderRadius: 6, border: "1px solid #E5E7EB" }}>
                        <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>{subKey}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{subScore}점</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// 학습 습관 매트릭스 (예비고1 V2_2 §3-4)
// ═══════════════════════════════════════

/**
 * 4축 학습 습관 레이더:
 *   - 자기주도 비율 (D1 분석)
 *   - 계획 실행력 (D2)
 *   - 오답 관리 (D3)
 *   - 문제 해결 적극성 (D4)
 * 각 축을 0~100 으로 정규화하여 한눈에 파악.
 */

const HABIT_AXES: { detailKey: string; label: string }[] = [
  { detailKey: "자기주도_비율", label: "자기주도 비율" },
  { detailKey: "학습계획_실행력", label: "계획 실행력" },
  { detailKey: "오답관리_품질", label: "오답 관리" },
  { detailKey: "문제해결_적극성", label: "문제해결 적극성" },
];

export function StudyHabitMatrix({ computed }: { computed: ComputedStats }) {
  const rs = (computed.radar_scores as Record<string, unknown> | undefined);
  const study = rs?.study as
    | { total?: number; grade?: string; details?: Record<string, { score: number; max: number; value?: string }> }
    | undefined;
  if (!study || !study.details) return null;

  const data = HABIT_AXES.map((ax) => {
    const d = study.details?.[ax.detailKey];
    if (!d) return { axis: ax.label, pct: 0, raw: "-" };
    const pct = d.max > 0 ? Math.round((d.score / d.max) * 100) : 0;
    return {
      axis: ax.label,
      pct,
      raw: `${d.score}/${d.max}${d.value ? ` (${d.value})` : ""}`,
    };
  });

  return (
    <div style={{ marginBottom: 24 }} id="section-habit-matrix">
      <SectionTitle>🧭 학습 습관 매트릭스 (V2_2 §3-4)</SectionTitle>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
        4개 축(자기주도/계획 실행/오답 관리/문제해결) 각각 0~100% 로 정규화한 습관 프로필.
        낮은 축이 우선 개선 영역입니다.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "center" }}>
        {/* 4축 레이더 */}
        <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 10, padding: 12 }}>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={data}>
              <PolarGrid stroke="#E5E7EB" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12, fill: "#374151" }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: "#9CA3AF" }} />
              <Radar
                name="현재 습관"
                dataKey="pct"
                stroke="#8B5CF6"
                fill="#8B5CF6"
                fillOpacity={0.35}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(v: number) => [`${v}%`, "정규화 점수"]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        {/* 항목별 상세 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.map((d) => {
            const color = d.pct >= 75 ? "#10B981" : d.pct >= 50 ? "#F59E0B" : "#EF4444";
            return (
              <div
                key={d.axis}
                style={{
                  background: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: 8,
                  padding: "10px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>{d.axis}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color }}>{d.pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#F3F4F6", overflow: "hidden", marginBottom: 4 }}>
                  <div style={{ height: "100%", width: `${d.pct}%`, background: color, transition: "width 0.4s" }} />
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{d.raw}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// 수능 최저 시뮬레이션 (V3 §4-8 T2~T4, §5-⑤)
// ═══════════════════════════════════════

/**
 * 대학 라인별 수능 최저 충족 가능성 시뮬레이션.
 *
 * 입력: 모의고사 영역별 최고 등급 (area_trends 에서 min rank 추출)
 * 계산: 각 라인의 전형적 "N개 영역 합 ≤ K" 조건 대입
 * 출력: 충족 / 근접 (1등급 차이) / 불충족 + 어느 조합이 가장 현실적인지
 */

// 대학 라인별 전형적 수능 최저 (공통적으로 통용되는 평균치 — 정확한 학교별 최저는 모의고사 성적표와 함께 상담사가 최종 확인)
const MINIMUM_LINES: {
  name: string;
  examples: string;
  rules: { label: string; count: number; sum_lte: number }[];
  color: string;
  bg: string;
}[] = [
  {
    name: "최상위",
    examples: "서울대 · 의대 · 치대 · 한의대",
    rules: [
      { label: "4개 영역 합 ≤ 6", count: 4, sum_lte: 6 },
      { label: "3개 영역 합 ≤ 4", count: 3, sum_lte: 4 },
    ],
    color: "#991B1B",
    bg: "#FEF2F2",
  },
  {
    name: "상위권",
    examples: "연세 · 고려 · 성균관 · 서강 · 한양 인기학과",
    rules: [
      { label: "3개 영역 합 ≤ 7", count: 3, sum_lte: 7 },
      { label: "2개 영역 합 ≤ 4", count: 2, sum_lte: 4 },
    ],
    color: "#9A3412",
    bg: "#FFF7ED",
  },
  {
    name: "중상위권",
    examples: "중앙 · 경희 · 이화 · 한국외대 · 건국 · 동국",
    rules: [
      { label: "2개 영역 합 ≤ 5", count: 2, sum_lte: 5 },
      { label: "3개 영역 합 ≤ 9", count: 3, sum_lte: 9 },
    ],
    color: "#92400E",
    bg: "#FFFBEB",
  },
  {
    name: "중위권",
    examples: "수도권 일반 대학",
    rules: [
      { label: "2개 영역 합 ≤ 7", count: 2, sum_lte: 7 },
      { label: "1개 영역 ≤ 3", count: 1, sum_lte: 3 },
    ],
    color: "#166534",
    bg: "#F0FDF4",
  },
];

interface MinimumRule {
  label: string;
  count: number;
  sum_lte: number;
}

interface AreaBest {
  area: string;
  best_rank: number;
}

/** 조건: N개 영역 중 최상위 N개의 합이 sum_lte 이하 */
function evaluateRule(
  bestRanks: AreaBest[],
  rule: MinimumRule,
): { met: boolean; gap: number; picked: AreaBest[]; picked_sum: number } {
  if (bestRanks.length < rule.count) {
    return { met: false, gap: 999, picked: [], picked_sum: 0 };
  }
  // 최상위 N개 영역 (가장 낮은 rank 번호)
  const sorted = [...bestRanks].sort((a, b) => a.best_rank - b.best_rank);
  const picked = sorted.slice(0, rule.count);
  const sum = picked.reduce((acc, p) => acc + p.best_rank, 0);
  return {
    met: sum <= rule.sum_lte,
    gap: Math.max(0, sum - rule.sum_lte),
    picked,
    picked_sum: sum,
  };
}

// V3 §5-⑤ E4 자가 평가 vs 객관 시뮬레이션 비교 카드
function E4SelfAssessmentCard({
  e4,
  bestRanks,
}: {
  e4: NonNullable<ComputedStats["e4_summary"]>;
  bestRanks: AreaBest[];
}) {
  const awarenessLabel: Record<string, { label: string; color: string }> = {
    "구체적파악": { label: "구체적으로 파악", color: "#059669" },
    "일부확인": { label: "일부 확인", color: "#D97706" },
    "모름": { label: "모름", color: "#DC2626" },
  };
  const feasibilityLabel: Record<string, { label: string; color: string; implies_ok: boolean }> = {
    "여유있음": { label: "여유 있음", color: "#059669", implies_ok: true },
    "충족가능": { label: "충족 가능", color: "#10B981", implies_ok: true },
    "1_2영역부족": { label: "1~2개 영역 부족", color: "#D97706", implies_ok: false },
    "불가": { label: "불가", color: "#DC2626", implies_ok: false },
  };
  const aw = e4.awareness ? awarenessLabel[e4.awareness] : null;
  const fe = e4.feasibility ? feasibilityLabel[e4.feasibility] : null;

  // 자가 판단 vs 객관 괴리 감지
  // 학생이 "충족 가능/여유 있음" 이라고 자평했는데 객관 시뮬레이션에서
  // 상위권 조건조차 통과 못 하면 '자가 과신' 경고
  let selfVsObjectiveGap: { kind: "과신" | "과소"; message: string } | null = null;
  if (fe && bestRanks.length > 0) {
    // 상위권 라인의 가장 쉬운 조건으로 객관 평가 (2개 영역 합 ≤ 4)
    const sorted = [...bestRanks].sort((a, b) => a.best_rank - b.best_rank);
    const top2Sum = sorted.slice(0, 2).reduce((s, r) => s + r.best_rank, 0);
    const objectivelyTopTier = sorted.length >= 2 && top2Sum <= 4;
    const objectivelyMidTier = sorted.length >= 2 && top2Sum <= 7;
    if (fe.implies_ok && !objectivelyMidTier) {
      selfVsObjectiveGap = {
        kind: "과신",
        message: `학생은 '${fe.label}' 으로 자평했으나, 객관 모의고사 기준으로는 중위권 조건(2개 합 ≤ 7)도 아직 충족하지 못합니다. 현실 점검 필요.`,
      };
    } else if (!fe.implies_ok && objectivelyTopTier) {
      selfVsObjectiveGap = {
        kind: "과소",
        message: `학생은 '${fe.label}' 으로 자평했으나, 객관 모의고사 기준으로는 이미 상위권 조건(2개 합 ≤ 4)도 충족합니다. 자신감 부여 필요.`,
      };
    }
  }

  // focus_areas(학생이 꼽은 집중 영역) vs 실제 취약 영역 비교
  // 실제 취약 = rank 가 높은 (숫자가 큰) 영역
  const sortedWeak = [...bestRanks].sort((a, b) => b.best_rank - a.best_rank);
  const objectiveWeakTop2 = sortedWeak.slice(0, 2).map((r) => r.area);
  const focusMismatch = e4.focus_areas.length > 0
    ? objectiveWeakTop2.filter((a) => !e4.focus_areas.includes(a))
    : [];

  return (
    <div style={{
      marginBottom: 16,
      padding: 14,
      background: "#FFFBEB",
      border: "1px solid #FDE68A",
      borderRadius: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#92400E" }}>
          📝 학생 자가 평가 (E4, {e4.score}/{e4.max}점)
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        {/* 인지 수준 */}
        <div style={{ background: "white", padding: 10, borderRadius: 6, border: "1px solid #FDE68A" }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>최저 인지</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: aw?.color || "#9CA3AF" }}>
            {aw?.label || "미응답"}
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF" }}>{e4.awareness_points}/5점</div>
        </div>
        {/* 충족 가능성 자가 판단 */}
        <div style={{ background: "white", padding: 10, borderRadius: 6, border: "1px solid #FDE68A" }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>충족 가능성 자가 판단</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: fe?.color || "#9CA3AF" }}>
            {fe?.label || "미응답"}
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF" }}>{e4.feasibility_points}/5점</div>
        </div>
        {/* 집중 영역 */}
        <div style={{ background: "white", padding: 10, borderRadius: 6, border: "1px solid #FDE68A" }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>집중 영역</div>
          <div style={{ fontSize: 12, color: "#374151", fontWeight: 600, minHeight: 18 }}>
            {e4.focus_areas.length > 0 ? e4.focus_areas.join(", ") : "미선택"}
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF" }}>{e4.focus_points}/5점</div>
        </div>
      </div>
      {/* 괴리 경고 (자가 vs 객관) */}
      {selfVsObjectiveGap && (
        <div style={{
          padding: "8px 12px",
          background: selfVsObjectiveGap.kind === "과신" ? "#FEE2E2" : "#DBEAFE",
          border: `1px solid ${selfVsObjectiveGap.kind === "과신" ? "#FCA5A5" : "#93C5FD"}`,
          borderRadius: 6,
          fontSize: 12,
          color: selfVsObjectiveGap.kind === "과신" ? "#991B1B" : "#1E3A8A",
          marginBottom: focusMismatch.length > 0 ? 8 : 0,
        }}>
          ⚠️ <strong>자가 {selfVsObjectiveGap.kind} 가능성</strong>: {selfVsObjectiveGap.message}
        </div>
      )}
      {/* 집중영역 미스매치: 학생이 꼽지 않은 영역이 실제 취약인 경우 */}
      {focusMismatch.length > 0 && (
        <div style={{
          padding: "8px 12px",
          background: "#FEF2F2",
          border: "1px solid #FECACA",
          borderRadius: 6,
          fontSize: 12,
          color: "#991B1B",
        }}>
          🎯 <strong>놓친 취약 영역</strong>: 학생이 집중 영역으로 꼽지 않았으나 실제 모의 최저 등급이 낮은 영역 —{" "}
          <strong>{focusMismatch.join(", ")}</strong>. 이 영역도 학습 계획에 포함해야 합니다.
        </div>
      )}
    </div>
  );
}

export function SuneungMinimumSimulation({ computed }: { computed: ComputedStats }) {
  const mock = computed.mock_trend;
  const e4 = computed.e4_summary;
  const hasMock = !!(mock && mock.area_trends && Object.keys(mock.area_trends).length > 0);
  const hasE4 = !!(e4 && e4.is_answered);
  // 둘 다 없으면 렌더하지 않음 (T1 등 최저 기준이 해당되지 않는 시점)
  if (!hasMock && !hasE4) {
    return null;
  }

  // 영역별 최고 등급 (가장 작은 rank 숫자) 추출
  // 방어적 가드: points 가 빈 배열이면 Math.min(...[]) = Infinity 라
  // Number.isFinite 에서 걸러지지만, rank 가 undefined/NaN/null 인
  // 잘못된 레코드도 Infinity 를 유발하므로 명시적으로 필터링
  const bestRanks: AreaBest[] = [];
  if (hasMock && mock) {
    for (const [area, points] of Object.entries(mock.area_trends)) {
      if (!Array.isArray(points) || points.length === 0) continue;
      const validRanks = points
        .map((p) => (typeof p?.rank === "number" ? p.rank : Number.NaN))
        .filter((r) => Number.isFinite(r));
      if (validRanks.length === 0) continue;
      const minRank = Math.min(...validRanks);
      if (Number.isFinite(minRank)) {
        bestRanks.push({ area, best_rank: minRank });
      }
    }
  }

  // 모의도 E4 도 모두 없으면 렌더 안 함 (이미 위에서 처리)
  // 모의는 없고 E4 만 있는 경우 — E4 카드만 노출, 라인 시뮬레이션 섹션은 안내 메시지
  const hasRanks = bestRanks.length > 0;

  return (
    <div style={{ marginBottom: 24 }} id="section-suneung-minimum">
      <SectionTitle>🎯 수능 최저 충족 시뮬레이션 (V3 §5-⑤)</SectionTitle>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
        학생이 현재까지 응시한 모의고사 중 <strong>영역별 최고 등급</strong> 기준으로,
        대학 라인별 전형적 수능 최저 조건에 대한 충족 가능성을 시뮬레이션한 결과입니다.
        실제 학교별 최저는 상담사가 모의고사 성적표와 함께 최종 확인하세요.
      </div>

      {/* V3 §4-8 "수시 방향이어도 수능 최저를 위한 수능 학습 필요성 강조" */}
      <div style={{
        marginBottom: 16,
        padding: "10px 14px",
        background: "#EFF6FF",
        border: "1px solid #BFDBFE",
        borderRadius: 6,
        fontSize: 12,
        color: "#1E3A8A",
      }}>
        💡 <strong>수시 방향이어도 수능 최저는 중요</strong>: 학생부교과·학생부종합 상당수가
        수능 최저를 요구하므로, 수시 주력이어도 목표 라인에 맞는 수능 학습을 병행해야 합니다.
      </div>

      {/* V3 §5-⑤ E4 자가 평가 vs 객관 시뮬레이션 */}
      {computed.e4_summary && computed.e4_summary.is_answered && (
        <E4SelfAssessmentCard e4={computed.e4_summary} bestRanks={bestRanks} />
      )}

      {/* 모의고사 미응시 안내 (E4 만 있는 경우) */}
      {!hasRanks && (
        <div style={{
          padding: "10px 14px",
          background: "#F9FAFB",
          border: "1px dashed #E5E7EB",
          borderRadius: 6,
          fontSize: 12,
          color: "#6B7280",
          marginBottom: 8,
        }}>
          📌 모의고사 성적 데이터가 없어 객관 시뮬레이션은 표시하지 않습니다.
          학생 자가 평가(위 E4 카드) 만으로 상담 진행하시고, 다음 모의 응시 후 재검토 권장.
        </div>
      )}

      {/* 현재 최고 등급 요약 */}
      {hasRanks && (
        <>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 6, fontWeight: 600 }}>객관 (모의고사) 영역별 최고 등급</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {bestRanks.sort((a, b) => a.best_rank - b.best_rank).map((ar) => (
              <div
                key={ar.area}
                style={{
                  padding: "6px 12px",
                  background: "#EFF6FF",
                  border: "1px solid #BFDBFE",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <span style={{ color: "#1E40AF", fontWeight: 600 }}>{ar.area}</span>{" "}
                <span style={{ color: "#1D4ED8", fontWeight: 700 }}>{ar.best_rank}등급</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 라인별 시뮬레이션 결과 (모의 데이터 있을 때만) */}
      {hasRanks && (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {MINIMUM_LINES.map((line) => {
          const results = line.rules.map((r) => ({ rule: r, eval: evaluateRule(bestRanks, r) }));
          const anyMet = results.some((r) => r.eval.met);
          const closest = results.reduce(
            (best, cur) => (cur.eval.gap < best.eval.gap ? cur : best),
            results[0],
          );
          const statusLabel = anyMet
            ? "충족 가능"
            : closest.eval.gap <= 1
            ? "근접 (1등급 차이)"
            : `불충족 (${closest.eval.gap}등급 부족)`;
          const statusColor = anyMet ? "#059669" : closest.eval.gap <= 1 ? "#D97706" : "#DC2626";
          return (
            <div
              key={line.name}
              style={{
                background: line.bg,
                border: `1px solid ${line.color}33`,
                borderRadius: 10,
                padding: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: line.color }}>{line.name}</span>
                <span style={{ fontSize: 12, color: "#6B7280" }}>{line.examples}</span>
                <span style={{
                  marginLeft: "auto",
                  fontSize: 13, fontWeight: 700, color: statusColor,
                  padding: "3px 10px",
                  borderRadius: 12,
                  background: "white",
                  border: `1px solid ${statusColor}55`,
                }}>
                  {anyMet ? "✓ " : closest.eval.gap <= 1 ? "⚠ " : "✗ "}{statusLabel}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                {results.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, color: "#374151" }}>
                    <span style={{ minWidth: 110 }}>{r.rule.label}</span>
                    {r.eval.picked.length > 0 ? (
                      <>
                        <span style={{ color: "#6B7280" }}>
                          = {r.eval.picked.map((p) => `${p.area}(${p.best_rank})`).join(" + ")} = {r.eval.picked_sum}
                        </span>
                        <span style={{
                          marginLeft: "auto",
                          color: r.eval.met ? "#059669" : "#DC2626",
                          fontWeight: 600,
                        }}>
                          {r.eval.met ? "충족" : `부족 ${r.eval.gap}`}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: "#9CA3AF" }}>응시 영역 수 부족</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// 고교유형 적합도 바 차트 (예비고1 V2_2 §3-5)
// ═══════════════════════════════════════

interface SchoolTypeRecommendation {
  school_type: string;
  score: number;
  grade: string;
  is_desired: boolean;
}

interface SchoolTypeDetail {
  score: number;
  grade: string;
  base_score: number;
  bonus: number;
  bonus_reason: string;
  penalty: number;
  penalty_reason: string;
  is_desired: boolean;
}

export function SchoolTypeCompatibilityChart({ computed }: { computed: ComputedStats }) {
  const compat = (computed.radar_scores as Record<string, unknown> | undefined)?.school_type_compatibility as
    | { recommendations?: SchoolTypeRecommendation[]; details?: Record<string, SchoolTypeDetail> }
    | undefined;

  // 방어적 가드: 구버전 설문(backend 스코어링이 school_type_compatibility 미생성) 또는
  // 직렬화 오류(recommendations 가 배열이 아님) 에서도 안전하게 null 반환
  if (
    !compat ||
    !Array.isArray(compat.recommendations) ||
    compat.recommendations.length === 0
  ) {
    return null;
  }
  const details: Record<string, SchoolTypeDetail> = compat.details || {};

  // 희망 유형 우선, 그 다음 점수 순
  const sorted = [...compat.recommendations].sort((a, b) => {
    if (a.is_desired && !b.is_desired) return -1;
    if (!a.is_desired && b.is_desired) return 1;
    return b.score - a.score;
  });

  return (
    <div style={{ marginBottom: 24 }} id="section-school-type-compatibility">
      <SectionTitle>🎓 고교유형 적합도 (V2_2 §3-5)</SectionTitle>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
        4축(학업기초력·교과선행도·학습습관·진로방향성)의 가중합산으로 산출한 유형별 적합도. ⭐ 는 학생이 희망한 고교 유형.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map((rec) => {
          const detail = details[rec.school_type];
          const c = GRADE_COLORS[rec.grade] || GRADE_COLORS.D;
          const pct = Math.max(0, Math.min(100, rec.score));
          return (
            <div
              key={rec.school_type}
              style={{
                background: rec.is_desired ? "#FFFBEB" : "white",
                border: rec.is_desired ? "2px solid #F59E0B" : "1px solid #E5E7EB",
                borderRadius: 10,
                padding: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                {rec.is_desired && <span style={{ fontSize: 16 }}>⭐</span>}
                <span style={{ fontWeight: 700, fontSize: 14, minWidth: 80 }}>{rec.school_type}</span>
                <GradeBadge grade={rec.grade} />
                <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, color: c.text }}>
                  {rec.score}점
                </span>
              </div>
              {/* 점수 바 */}
              <div style={{ height: 10, borderRadius: 5, background: "#F3F4F6", overflow: "hidden", marginBottom: 6 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: c.text,
                    borderRadius: 5,
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
              {/* 보정 내역 */}
              {detail && (detail.bonus !== 0 || detail.penalty !== 0) && (
                <div style={{ fontSize: 11, color: "#6B7280", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>기본 {detail.base_score}점</span>
                  {detail.bonus !== 0 && (
                    <span style={{ color: "#059669" }}>+{detail.bonus} ({detail.bonus_reason})</span>
                  )}
                  {detail.penalty !== 0 && (
                    <span style={{ color: "#DC2626" }}>{detail.penalty} ({detail.penalty_reason})</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
