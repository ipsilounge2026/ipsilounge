"use client";

/**
 * 설문 자동 분석 차트 컴포넌트 (recharts 기반)
 *
 * - 내신 추이 라인 차트
 * - 등급 분포 바 차트 (고등학생)
 * - 모의고사 추이 라인 차트
 * - 학습 시간 파이/레이더 차트
 */

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell,
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

  // 과목별 추이를 라인차트 데이터로 변환
  const subjectNames = Object.keys(gt.subject_trends);
  const semesters = gt.data.map((d) => d.semester);

  // 과목별 데이터를 학기 기준으로 피벗
  const subjectChartData = semesters.map((sem) => {
    const row: Record<string, any> = { semester: sem };
    for (const [subj, arr] of Object.entries(gt.subject_trends)) {
      const found = arr.find((d: any) => d.semester === sem);
      row[subj] = found ? (isHigh ? found.grade : found.raw_score) : null;
    }
    return row;
  });

  return (
    <div>
      <SectionTitle badge={gt.trend_badge}>{isHigh ? "내신 등급 추이" : "성적 추이"}</SectionTitle>

      {/* 평균 추이 라인 차트 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>학기별 {label}</div>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={gt.data}>
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
            <Line
              type="monotone" dataKey={valueKey} stroke="#4472C4" strokeWidth={2.5}
              dot={{ r: 5, fill: "#4472C4" }} name={label}
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
              {subjectNames.map((subj, i) => (
                <Line
                  key={subj} type="monotone" dataKey={subj}
                  stroke={COLORS[i % COLORS.length]} strokeWidth={2}
                  dot={{ r: 4 }} connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
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
  "내신_경쟁력": "내신 경쟁력",
  "모의고사_역량": "모의고사 역량",
  "학습습관_전략": "학습 습관·전략",
  "진로전형_전략": "진로·전형 전략",
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
