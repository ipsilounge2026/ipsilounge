"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { fetchAdmissionResult, AdmissionResultItem, AdmissionResultResponse } from "@/lib/api";

export default function AdmissionResultPage() {
  const router = useRouter();
  const params = useParams();
  const unvCd = String(params.unvCd || "");
  const displayYear = Number(params.year || 0);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdmissionResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recruitmentTab, setRecruitmentTab] = useState<string>(""); // "" = 전체
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [openedRow, setOpenedRow] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!unvCd || !displayYear) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdmissionResult({
        university_code: unvCd,
        display_year: displayYear,
        recruitment_type: recruitmentTab || undefined,
        admission_category: categoryFilter || undefined,
        search: search || undefined,
      });
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("로드 실패: " + msg);
    } finally {
      setLoading(false);
    }
  }, [unvCd, displayYear, recruitmentTab, categoryFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const fmt = (v: number | null | undefined, suffix = "") => {
    if (v === null || v === undefined) return "-";
    return `${v}${suffix}`;
  };

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
            <p style={{ fontSize: 16, marginBottom: 8 }}>📋 이 대학의 {data.data_year}학년도 입결 데이터가 아직 준비되지 않았습니다.</p>
            <p style={{ fontSize: 13, color: "#9CA3AF" }}>관리자에서 입결 데이터를 업로드하면 자동으로 표시됩니다.</p>
          </div>
        )}

        {/* 데이터 있음 */}
        {data && data.total > 0 && (
          <>
            {/* 수시/정시 탭 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "2px solid #E5E7EB" }}>
              <TabButton active={recruitmentTab === ""} onClick={() => setRecruitmentTab("")}>
                전체
              </TabButton>
              {data.available_recruitment_types.map((t) => (
                <TabButton key={t} active={recruitmentTab === t} onClick={() => setRecruitmentTab(t)}>
                  {t}
                </TabButton>
              ))}
            </div>

            {/* 필터 */}
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
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                  background: "#fff",
                }}
              >
                <option value="">전형유형 전체</option>
                {data.available_categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: "1 1 240px" }}>
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

              <span style={{ color: "#6B7B98", fontSize: 13 }}>
                총 <strong style={{ color: "#0B1F3F" }}>{data.total}건</strong>
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
                      <th style={thRight()}>
                        50%
                        <div style={{ fontSize: 10, fontWeight: 400, color: "#9CA3AF" }}>수시: 등급 / 정시: 백분위</div>
                      </th>
                      <th style={thRight()}>
                        70%
                        <div style={{ fontSize: 10, fontWeight: 400, color: "#9CA3AF" }}>수시: 등급 / 정시: 백분위</div>
                      </th>
                      <th style={th()}>상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((it) => (
                      <Row
                        key={it.id}
                        item={it}
                        opened={openedRow === it.id}
                        onToggle={() => setOpenedRow(openedRow === it.id ? null : it.id)}
                        fmt={fmt}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 12, textAlign: "right" }}>
              💡 데이터 출처: 대학어디가 입결 자료
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

function Row({
  item,
  opened,
  onToggle,
  fmt,
}: {
  item: AdmissionResultItem;
  opened: boolean;
  onToggle: () => void;
  fmt: (v: number | null | undefined, suffix?: string) => string;
}) {
  const isJeongsi = item.recruitment_type === "정시";
  const avg50 = item.percentile_50?.average_percentile;
  const avg70 = item.percentile_70?.average_percentile;
  const hasPercentile =
    (item.percentile_50 && Object.values(item.percentile_50).some((v) => v !== null && v !== undefined)) ||
    (item.percentile_70 && Object.values(item.percentile_70).some((v) => v !== null && v !== undefined));

  // 수시: 등급, 정시: 평균 백분위
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

  // 정시는 항상 [상세] 버튼 (과목별 백분위), 수시는 노트나 환산점수 있을 때만
  const showDetailButton = isJeongsi ? hasPercentile : (item.gpa_score_50 != null || item.gpa_score_70 != null);

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
      </tr>
      {opened && (
        <tr style={{ background: "#FAFAFA" }}>
          <td colSpan={9} style={{ padding: "12px 16px" }}>
            {isJeongsi ? (
              <>
                <PercentileDetail label="50%" data={item.percentile_50} />
                <PercentileDetail label="70%" data={item.percentile_70} />
              </>
            ) : (
              <div style={{ display: "flex", gap: 24, fontSize: 12 }}>
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
