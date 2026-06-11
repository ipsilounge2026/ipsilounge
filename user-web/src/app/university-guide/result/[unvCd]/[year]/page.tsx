"use client";

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  fetchAdmissionResult,
  fetchAdmissionTimeline,
  AdmissionResultItem,
  AdmissionResultResponse,
  AdmissionTimelinePoint,
} from "@/lib/api";

const isJeongsiType = (rt: string | null | undefined): boolean =>
  !!rt && rt.includes("정시");

type SortMode = "major" | "category";

export default function AdmissionResultPage() {
  // useSearchParams 는 Suspense boundary 필요 (Next.js 정적 빌드)
  return (
    <Suspense fallback={null}>
      <AdmissionResultContent />
    </Suspense>
  );
}

function AdmissionResultContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const unvCd = String(params.unvCd || "");
  const displayYear = Number(params.year || 0);
  // 자료 출처: ?source=자체발표 일 때만 자체발표, 그 외 대교협
  const source = searchParams.get("source") === "자체발표" ? "자체발표" : "대교협";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdmissionResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 기본 탭: "수시" (전체 탭 제거)
  const [recruitmentTab, setRecruitmentTab] = useState<string>("수시");
  // 전형명(admission_name) 기반 필터 — 탭 변경 시 리셋
  const [admissionNameFilter, setAdmissionNameFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [openedRow, setOpenedRow] = useState<string | null>(null);
  const [openedTimeline, setOpenedTimeline] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("major");

  // timeline 클라이언트 캐시 (학과+전형 키별)
  const timelineCache = useRef<Map<string, AdmissionTimelinePoint[]>>(new Map());

  const load = useCallback(async () => {
    if (!unvCd || !displayYear) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdmissionResult({
        university_code: unvCd,
        display_year: displayYear,
        recruitment_type: recruitmentTab || undefined,
        admission_name: admissionNameFilter || undefined,
        search: search || undefined,
        source,
      });
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("로드 실패: " + msg);
    } finally {
      setLoading(false);
    }
  }, [unvCd, displayYear, recruitmentTab, admissionNameFilter, search, source]);

  useEffect(() => {
    load();
  }, [load]);

  // 정렬 적용
  const sortedItems = useMemo(() => {
    if (!data) return [];
    const items = [...data.items];
    if (sortMode === "category") {
      items.sort((a, b) => {
        const c = (a.admission_category || "").localeCompare(b.admission_category || "");
        if (c !== 0) return c;
        const n = (a.admission_name || "").localeCompare(b.admission_name || "");
        if (n !== 0) return n;
        return (a.major || "").localeCompare(b.major || "");
      });
    } else {
      items.sort((a, b) => {
        const m = (a.major || "").localeCompare(b.major || "");
        if (m !== 0) return m;
        const c = (a.admission_category || "").localeCompare(b.admission_category || "");
        if (c !== 0) return c;
        return (a.admission_name || "").localeCompare(b.admission_name || "");
      });
    }
    return items;
  }, [data, sortMode]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const fmt = (v: number | null | undefined) => {
    if (v === null || v === undefined) return "-";
    return String(v);
  };

  // 탭 옵션: 수시 + 정시 종류들 (전체 탭 제거)
  const tabs = useMemo(() => {
    if (!data) return ["수시"];
    return data.available_recruitment_types.length > 0
      ? data.available_recruitment_types
      : ["수시"];
  }, [data]);

  // 현재 탭이 정시 계열인지
  const isJeongsiTab = isJeongsiType(recruitmentTab);

  // 현재 탭에서 선택 가능한 전형명 (admission_name) 목록
  const admissionNameOptions = useMemo(() => {
    if (!data?.available_admission_names_by_type) return [] as string[];
    return data.available_admission_names_by_type[recruitmentTab] || [];
  }, [data, recruitmentTab]);

  // 탭 변경 핸들러 — 전형명 필터 리셋
  const handleTabChange = useCallback((t: string) => {
    setRecruitmentTab(t);
    setAdmissionNameFilter("");
    setOpenedRow(null);
    setOpenedTimeline(null);
  }, []);

  return (
    <>
      <Navbar />
      <main className="lp-wrap" style={{ padding: "32px 20px 60px", minHeight: "60vh" }}>
        {/* 헤더 */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => router.push("/university-guide")}
            style={{
              background: "none",
              border: "none",
              color: "#1A8F8B",
              fontSize: 13,
              cursor: "pointer",
              padding: 0,
              marginBottom: 12,
            }}
          >
            ← 대학모집요강으로 돌아가기
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0B1F3F", margin: "0 0 4px" }}>
            {data?.university || unvCd}
          </h1>
          <p style={{ color: "#6B7B98", fontSize: 14, margin: 0 }}>
            {displayYear}학년도 전년도 입시결과
            <span
              style={{
                marginLeft: 8,
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 700,
                background: source === "자체발표" ? "#EDE9FE" : "#DBEAFE",
                color: source === "자체발표" ? "#6D28D9" : "#1D4ED8",
              }}
            >
              {source}
            </span>
            {data?.data_year && (
              <span style={{ marginLeft: 8, fontSize: 12, color: "#9CA3AF" }}>
                (실제 입결 연도: {data.data_year}학년도)
              </span>
            )}
          </p>
        </div>

        {/* 데이터 없음 */}
        {!loading && data && data.total === 0 && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: 40,
              textAlign: "center",
              color: "#6B7B98",
            }}
          >
            <p style={{ fontSize: 16, marginBottom: 8 }}>📋 이 대학의 {data.data_year}학년도 {source} 입결 데이터가 아직 준비되지 않았습니다.</p>
            <p style={{ fontSize: 13, color: "#9CA3AF" }}>관리자에서 입결 데이터를 업로드하면 자동으로 표시됩니다.</p>
          </div>
        )}

        {/* 데이터 있음 */}
        {data && data.total > 0 && (
          <>
            {/* 수시/정시 탭 (전체 제거) */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "2px solid #E5E7EB" }}>
              {tabs.map((t) => (
                <TabButton key={t} active={recruitmentTab === t} onClick={() => handleTabChange(t)}>
                  {t}
                </TabButton>
              ))}
            </div>

            {/* 필터 + 정렬 */}
            <div
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 20,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <select
                value={admissionNameFilter}
                onChange={(e) => setAdmissionNameFilter(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                  background: "#fff",
                  maxWidth: 320,
                }}
              >
                <option value="">전형유형 전체</option>
                {admissionNameOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>

              <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: "1 1 220px" }}>
                <input
                  type="text"
                  placeholder="학과명 검색"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 14,
                    flex: 1,
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #0B1F3F",
                    background: "#0B1F3F",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  검색
                </button>
              </form>

              {/* 정렬 옵션 */}
              <div style={{ display: "flex", gap: 4, padding: 2, background: "#F3F4F6", borderRadius: 8 }}>
                <SortButton active={sortMode === "major"} onClick={() => setSortMode("major")}>
                  학과 순
                </SortButton>
                <SortButton active={sortMode === "category"} onClick={() => setSortMode("category")}>
                  전형 순
                </SortButton>
              </div>

              <span style={{ color: "#6B7B98", fontSize: 13 }}>
                총 <strong style={{ color: "#0B1F3F" }}>{sortedItems.length}건</strong>
              </span>
            </div>

            {/* 표 */}
            <div
              style={{
                background: "#fff",
                border: "1px solid #E5E7EB",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F9FAFB", color: "#374151" }}>
                      <th style={th()}>구분</th>
                      <th style={th()}>전형유형</th>
                      <th style={thLeft()}>전형명 / 학과</th>
                      <th style={thRight()}>모집</th>
                      <th style={thRight()}>경쟁률</th>
                      <th style={thRight()}>충원</th>
                      <th style={thRight()}>{isJeongsiTab ? "50% 평균 백분위" : "50% 등급"}</th>
                      <th style={thRight()}>{isJeongsiTab ? "70% 평균 백분위" : "70% 등급"}</th>
                      <th style={th()}>상세</th>
                      <th style={th()}>추이<br/>그래프</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((it) => (
                      <Row
                        key={it.id}
                        item={it}
                        unvCd={unvCd}
                        source={source}
                        opened={openedRow === it.id}
                        timelineOpened={openedTimeline === it.id}
                        onToggle={() => setOpenedRow(openedRow === it.id ? null : it.id)}
                        onToggleTimeline={() => setOpenedTimeline(openedTimeline === it.id ? null : it.id)}
                        fmt={fmt}
                        timelineCache={timelineCache.current}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 12, textAlign: "right" }}>
              💡 데이터 출처: {source === "자체발표" ? "대학 입학처 자체발표 자료" : "대학어디가(대교협) 공시 자료"}
            </p>
          </>
        )}

        {/* 로딩·에러 */}
        {loading && <p style={{ color: "#6B7B98", textAlign: "center", padding: 40 }}>로딩 중...</p>}
        {error && (
          <p
            style={{
              color: "#B91C1C",
              background: "#FEF2F2",
              padding: 16,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: "10px 16px",
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        color: active ? "#0B1F3F" : "#6B7B98",
        borderBottom: active ? "2px solid #0B1F3F" : "2px solid transparent",
        marginBottom: -2,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "#fff" : "transparent",
        border: "none",
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        color: active ? "#0B1F3F" : "#6B7B98",
        borderRadius: 6,
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function Row({
  item,
  unvCd,
  source,
  opened,
  timelineOpened,
  onToggle,
  onToggleTimeline,
  fmt,
  timelineCache,
}: {
  item: AdmissionResultItem;
  unvCd: string;
  source: string;
  opened: boolean;
  timelineOpened: boolean;
  onToggle: () => void;
  onToggleTimeline: () => void;
  fmt: (v: number | null | undefined) => string;
  timelineCache: Map<string, AdmissionTimelinePoint[]>;
}) {
  const isJeongsi = isJeongsiType(item.recruitment_type);
  const avg50 = item.percentile_50?.average_percentile;
  const avg70 = item.percentile_70?.average_percentile;
  const hasPercentile =
    (item.percentile_50 && Object.values(item.percentile_50).some((v) => v !== null && v !== undefined)) ||
    (item.percentile_70 && Object.values(item.percentile_70).some((v) => v !== null && v !== undefined));

  // 셀 표시: 수시 = 등급, 정시 = 평균 백분위
  const cell50 = isJeongsi
    ? avg50 != null
      ? <><span style={{ fontWeight: 600 }}>{avg50}</span><span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 2 }}>%</span></>
      : "-"
    : item.gpa_grade_50 != null
    ? <><span style={{ fontWeight: 600 }}>{item.gpa_grade_50}</span><span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 2 }}>등급</span></>
    : "-";
  const cell70 = isJeongsi
    ? avg70 != null
      ? <><span style={{ fontWeight: 600 }}>{avg70}</span><span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 2 }}>%</span></>
      : "-"
    : item.gpa_grade_70 != null
    ? <><span style={{ fontWeight: 600 }}>{item.gpa_grade_70}</span><span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 2 }}>등급</span></>
    : "-";

  // 상세 버튼: 정시는 백분위 + 환산점수/GPA/비고, 수시는 환산점수/비고
  const hasExtraJeongsiDetail =
    item.conv_score_50 != null ||
    item.conv_score_70 != null ||
    item.gpa_score_50 != null ||
    item.gpa_score_70 != null ||
    item.gpa_grade_50 != null ||
    item.gpa_grade_70 != null ||
    !!item.note;
  const showDetailButton = isJeongsi
    ? hasPercentile || hasExtraJeongsiDetail
    : (item.gpa_score_50 != null || item.gpa_score_70 != null || item.conv_score_50 != null || item.conv_score_70 != null || !!item.note);

  return (
    <>
      <tr style={{ borderTop: "1px solid #F3F4F6" }}>
        <td style={tdCenter()}>{item.recruitment_type || "-"}</td>
        <td style={tdCenter()}>{item.admission_category || "-"}</td>
        <td style={tdLeft()}>
          <div style={{ fontWeight: 600, color: "#0B1F3F" }}>{item.major}</div>
          {item.admission_name && (
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{item.admission_name}</div>
          )}
        </td>
        <td style={tdRight()}>{fmt(item.recruit_count)}</td>
        <td style={tdRight()}>{fmt(item.competition_rate)}</td>
        <td style={tdRight()}>{fmt(item.additional_count)}</td>
        <td style={tdRight()}>{cell50}</td>
        <td style={tdRight()}>{cell70}</td>
        <td style={tdCenter()}>
          {showDetailButton ? (
            <button
              onClick={onToggle}
              style={{
                background: "none",
                border: "1px solid #D1D5DB",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 11,
                cursor: "pointer",
                color: "#374151",
              }}
            >
              {opened ? "닫기" : "상세"}
            </button>
          ) : item.note ? (
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>{item.note}</span>
          ) : (
            "-"
          )}
        </td>
        <td style={tdCenter()}>
          <button
            onClick={onToggleTimeline}
            style={{
              background: "none",
              border: "1px solid #D1D5DB",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 11,
              lineHeight: 1.2,
              cursor: "pointer",
              color: "#374151",
              fontFamily: "inherit",
              minWidth: 56,
            }}
          >
            {timelineOpened ? (
              "닫기"
            ) : (
              <>
                추이
                <br />
                그래프
              </>
            )}
          </button>
        </td>
      </tr>
      {timelineOpened && (
        <tr style={{ background: "#F0F9FF" }}>
          <td colSpan={10} style={{ padding: "12px 16px" }}>
            <TimelineChart
              universityCode={unvCd}
              major={item.major}
              source={source}
              recruitmentType={item.recruitment_type || undefined}
              admissionCategory={item.admission_category || undefined}
              admissionName={item.admission_name || undefined}
              isJeongsi={isJeongsi}
              cache={timelineCache}
            />
          </td>
        </tr>
      )}
      {opened && (
        <tr style={{ background: "#FAFAFA" }}>
          <td colSpan={10} style={{ padding: "12px 16px" }}>
            {isJeongsi ? (
              <>
                <PercentileDetail label="50%" data={item.percentile_50} />
                <PercentileDetail label="70%" data={item.percentile_70} />
                {hasExtraJeongsiDetail && (
                  <div style={{ display: "flex", gap: 24, fontSize: 12, flexWrap: "wrap", marginTop: hasPercentile ? 8 : 0 }}>
                    {item.gpa_grade_50 != null && (
                      <div>
                        <span style={{ color: "#6B7B98" }}>50% 등급: </span>
                        <span style={{ color: "#0B1F3F", fontWeight: 600 }}>{item.gpa_grade_50}</span>
                      </div>
                    )}
                    {item.gpa_grade_70 != null && (
                      <div>
                        <span style={{ color: "#6B7B98" }}>70% 등급: </span>
                        <span style={{ color: "#0B1F3F", fontWeight: 600 }}>{item.gpa_grade_70}</span>
                      </div>
                    )}
                    {item.gpa_score_50 != null && (
                      <div>
                        <span style={{ color: "#6B7B98" }}>50% 학생부 환산점수: </span>
                        <span style={{ color: "#0B1F3F", fontWeight: 600 }}>{item.gpa_score_50}</span>
                      </div>
                    )}
                    {item.gpa_score_70 != null && (
                      <div>
                        <span style={{ color: "#6B7B98" }}>70% 학생부 환산점수: </span>
                        <span style={{ color: "#0B1F3F", fontWeight: 600 }}>{item.gpa_score_70}</span>
                      </div>
                    )}
                    {item.conv_score_50 != null && (
                      <div>
                        <span style={{ color: "#6B7B98" }}>50% 환산점수: </span>
                        <span style={{ color: "#0B1F3F", fontWeight: 600 }}>{item.conv_score_50}</span>
                      </div>
                    )}
                    {item.conv_score_70 != null && (
                      <div>
                        <span style={{ color: "#6B7B98" }}>70% 환산점수: </span>
                        <span style={{ color: "#0B1F3F", fontWeight: 600 }}>{item.conv_score_70}</span>
                      </div>
                    )}
                    {item.note && (
                      <div>
                        <span style={{ color: "#6B7B98" }}>비고: </span>
                        <span style={{ color: "#0B1F3F" }}>{item.note}</span>
                      </div>
                    )}
                  </div>
                )}
                {!hasPercentile && !hasExtraJeongsiDetail && (
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>표시할 상세 데이터가 없습니다.</div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", gap: 24, fontSize: 12, flexWrap: "wrap" }}>
                {item.gpa_score_50 != null && (
                  <div>
                    <span style={{ color: "#6B7B98" }}>50% 환산점수: </span>
                    <span style={{ color: "#0B1F3F", fontWeight: 600 }}>{item.gpa_score_50}</span>
                  </div>
                )}
                {item.gpa_score_70 != null && (
                  <div>
                    <span style={{ color: "#6B7B98" }}>70% 환산점수: </span>
                    <span style={{ color: "#0B1F3F", fontWeight: 600 }}>{item.gpa_score_70}</span>
                  </div>
                )}
                {item.conv_score_50 != null && (
                  <div>
                    <span style={{ color: "#6B7B98" }}>50% 환산: </span>
                    <span style={{ color: "#0B1F3F", fontWeight: 600 }}>{item.conv_score_50}</span>
                  </div>
                )}
                {item.conv_score_70 != null && (
                  <div>
                    <span style={{ color: "#6B7B98" }}>70% 환산: </span>
                    <span style={{ color: "#0B1F3F", fontWeight: 600 }}>{item.conv_score_70}</span>
                  </div>
                )}
                {item.note && (
                  <div>
                    <span style={{ color: "#6B7B98" }}>비고: </span>
                    <span style={{ color: "#0B1F3F" }}>{item.note}</span>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function PercentileDetail({
  label,
  data,
}: {
  label: string;
  data: Record<string, number | null> | null;
}) {
  if (!data) return null;
  const KEY_LABELS: Record<string, string> = {
    korean: "국어",
    math: "수학",
    investigation1: "탐구1",
    investigation2: "탐구2",
    investigation1_social: "탐구1 사탐",
    investigation1_science: "탐구1 과탐",
    investigation1_vocational: "탐구1 직탐",
    investigation2_social: "탐구2 사탐",
    investigation2_science: "탐구2 과탐",
    investigation2_vocational: "탐구2 직탐",
    average_percentile: "평균 백분위",
    korean_history_grade: "한국사 등급",
    english_grade: "영어 등급",
  };
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7B98", marginBottom: 4 }}>
        백분위 {label}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
        {entries.map(([k, v]) => (
          <div key={k}>
            <span style={{ color: "#6B7B98" }}>{KEY_LABELS[k] || k}: </span>
            <span style={{ color: "#0B1F3F", fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function th(): React.CSSProperties {
  return {
    padding: "10px 12px",
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}
function thLeft(): React.CSSProperties {
  return { ...th(), textAlign: "left" };
}
function thRight(): React.CSSProperties {
  return { ...th(), textAlign: "right" };
}
function tdCenter(): React.CSSProperties {
  return { padding: "10px 12px", textAlign: "center", verticalAlign: "top" };
}
function tdLeft(): React.CSSProperties {
  return { ...tdCenter(), textAlign: "left" };
}
function tdRight(): React.CSSProperties {
  return { ...tdCenter(), textAlign: "right" };
}

function TimelineChart({
  universityCode,
  major,
  source,
  recruitmentType,
  admissionCategory,
  admissionName,
  isJeongsi,
  cache,
}: {
  universityCode: string;
  major: string;
  source: string;
  recruitmentType?: string;
  admissionCategory?: string;
  admissionName?: string;
  isJeongsi: boolean;
  cache: Map<string, AdmissionTimelinePoint[]>;
}) {
  const cacheKey = `${universityCode}|${source}|${major}|${recruitmentType || ""}|${admissionCategory || ""}|${admissionName || ""}`;
  const [points, setPoints] = useState<AdmissionTimelinePoint[] | null>(
    cache.get(cacheKey) || null
  );
  const [loading, setLoading] = useState(!cache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache.has(cacheKey)) {
      setPoints(cache.get(cacheKey)!);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchAdmissionTimeline({
          university_code: universityCode,
          major,
          recruitment_type: recruitmentType,
          admission_category: admissionCategory,
          admission_name: admissionName,
          source,
        });
        if (!cancelled) {
          cache.set(cacheKey, res.points);
          setPoints(res.points);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, universityCode, major, recruitmentType, admissionCategory, admissionName, source, cache]);

  if (loading) return <div style={{ fontSize: 12, color: "#6B7B98" }}>추이 데이터 로딩 중...</div>;
  if (error) return <div style={{ fontSize: 12, color: "#B91C1C" }}>로드 실패: {error}</div>;
  if (!points || points.length === 0) return <div style={{ fontSize: 12, color: "#6B7B98" }}>해당 학과·전형의 다른 학년도 데이터가 없습니다.</div>;

  // 최근 3개년만 (data_year 기준 정렬 후 마지막 3개)
  const sortedPoints = [...points].sort((a, b) => a.data_year - b.data_year);
  const recentPoints = sortedPoints.slice(-3);

  const chartData = recentPoints.map((p) => ({
    year: `${p.data_year}학년도`,
    경쟁률: p.competition_rate,
    [isJeongsi ? "50% 백분위" : "50% 등급"]: isJeongsi ? p.avg_percentile_50 : p.gpa_grade_50,
    [isJeongsi ? "70% 백분위" : "70% 등급"]: isJeongsi ? p.avg_percentile_70 : p.gpa_grade_70,
  }));

  if (recentPoints.length < 2) {
    return (
      <div>
        <div style={{ marginBottom: 8, padding: 8, background: "#FEF3C7", borderRadius: 4, fontSize: 12, color: "#92400E" }}>
          📊 추이 비교는 2학년도 이상 데이터가 있어야 의미가 있어요. 현재 {recentPoints.length}학년도 데이터만 있습니다.
        </div>
        <SinglePointTable points={recentPoints} isJeongsi={isJeongsi} />
      </div>
    );
  }

  const scoreReversed = !isJeongsi;
  const dataLabel = recentPoints.length === sortedPoints.length
    ? `${recentPoints.length}학년도 데이터`
    : `최근 ${recentPoints.length}학년도 데이터 (전체 ${sortedPoints.length}학년도 중)`;

  return (
    <div>
      <div style={{ marginBottom: 6, fontSize: 12, color: "#6B7B98" }}>
        <strong style={{ color: "#0B1F3F" }}>{major}</strong> — {recruitmentType || "전체"} / {admissionCategory || "전형 전체"}
        {admissionName && <> / {admissionName}</>}
        <span style={{ marginLeft: 8 }}>({dataLabel})</span>
      </div>

      {/* 경쟁률 차트 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>경쟁률 추이</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="경쟁률" stroke="#1A8F8B" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 등급/백분위 차트 */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
          {isJeongsi ? "평균 백분위 추이 (높을수록 우수)" : "등급 추이 (낮을수록 우수)"}
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              reversed={scoreReversed}
              domain={isJeongsi ? [0, 100] : [1, 9]}
            />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey={isJeongsi ? "50% 백분위" : "50% 등급"}
              stroke="#0B1F3F"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey={isJeongsi ? "70% 백분위" : "70% 등급"}
              stroke="#6B7B98"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SinglePointTable({
  points,
  isJeongsi,
}: {
  points: AdmissionTimelinePoint[];
  isJeongsi: boolean;
}) {
  return (
    <table style={{ fontSize: 12, width: "100%", marginTop: 4 }}>
      <thead>
        <tr style={{ color: "#6B7B98" }}>
          <th style={{ textAlign: "left", padding: 4 }}>학년도</th>
          <th style={{ textAlign: "right", padding: 4 }}>모집</th>
          <th style={{ textAlign: "right", padding: 4 }}>경쟁률</th>
          <th style={{ textAlign: "right", padding: 4 }}>충원</th>
          <th style={{ textAlign: "right", padding: 4 }}>{isJeongsi ? "50% 평균 백분위" : "50% 등급"}</th>
          <th style={{ textAlign: "right", padding: 4 }}>{isJeongsi ? "70% 평균 백분위" : "70% 등급"}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.data_year} style={{ borderTop: "1px solid #E5E7EB" }}>
            <td style={{ padding: 4 }}>{p.data_year}학년도</td>
            <td style={{ textAlign: "right", padding: 4 }}>{p.recruit_count ?? "-"}</td>
            <td style={{ textAlign: "right", padding: 4 }}>{p.competition_rate ?? "-"}</td>
            <td style={{ textAlign: "right", padding: 4 }}>{p.additional_count ?? "-"}</td>
            <td style={{ textAlign: "right", padding: 4 }}>
              {(isJeongsi ? p.avg_percentile_50 : p.gpa_grade_50) ?? "-"}
            </td>
            <td style={{ textAlign: "right", padding: 4 }}>
              {(isJeongsi ? p.avg_percentile_70 : p.gpa_grade_70) ?? "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
