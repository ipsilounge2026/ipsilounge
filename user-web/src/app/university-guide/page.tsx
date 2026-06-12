"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { fetchUniversityGuides, UniversityGuideItem } from "@/lib/api";

type ButtonSpec = {
  key: keyof UniversityGuideItem;
  label: string;
  source: "adiga" | "official";
  group: "primary" | "secondary";
};

// 카드 우측 상단 큰 버튼 4개 (primary) + 하단 작은 항목 3개 (secondary) + 좌측 입학처
const BUTTON_SPECS: ButtonSpec[] = [
  // 우측 상단
  { key: "adiga_admission_plan_url", label: "대입전형시행계획", source: "adiga", group: "primary" },
  { key: "adiga_susi_guide_url", label: "수시모집요강", source: "adiga", group: "primary" },
  { key: "official_jonghap_guidebook_url", label: "학생부종합가이드북", source: "official", group: "primary" },
  { key: "adiga_jeongsi_guide_url", label: "정시모집요강", source: "adiga", group: "primary" },
  // 하단
  { key: "adiga_result_url", label: "전년도 입시결과(대교협)", source: "adiga", group: "secondary" },
  { key: "adiga_prior_learning_eval_url", label: "선행학습영향평가", source: "adiga", group: "secondary" },
];

export default function UniversityGuidePage() {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<UniversityGuideItem[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchUniversityGuides({
        year: year ?? undefined,
        search: search || undefined,
      });
      setItems(res.items || []);
      setAvailableYears(res.available_years || []);
      if (year === null && res.available_years && res.available_years.length > 0) {
        setYear(res.available_years[0]);
      }
    } catch (e) {
      console.error("대학모집요강 로드 실패", e);
    } finally {
      setLoading(false);
    }
  }, [year, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Navbar />
      <main className="lp-wrap" style={{ padding: "32px 20px 60px", minHeight: "60vh" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#0B1F3F" }}>대학모집요강</h1>
        <p style={{ color: "#6B7B98", fontSize: 14, marginBottom: 24 }}>
          대학별 입시 자료를 한 곳에 모았습니다. 각 항목을 클릭하면 공식 출처(대학어디가 또는 대학 입학처)로
          새 창에서 연결됩니다.
        </p>

        {/* 필터 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={year ?? ""}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 14,
              background: "#fff",
              minWidth: 140,
            }}
          >
            {availableYears.length === 0 && <option value="">학년도 없음</option>}
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}학년도
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="대학 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 14,
              flex: 1,
              minWidth: 200,
            }}
          />
          <span style={{ color: "#6B7B98", fontSize: 13 }}>
            입시정보: <strong style={{ color: "#0B1F3F" }}>{items.length}건</strong>
          </span>
        </div>

        {/* 카드 목록 */}
        {loading ? (
          <p style={{ color: "#6B7B98" }}>로딩 중...</p>
        ) : items.length === 0 ? (
          <p style={{ color: "#9ca3af" }}>{search ? "검색 결과가 없습니다." : "등록된 자료가 없습니다."}</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {items.map((g) => (
              <GuideCard key={g.id} guide={g} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

function GuideCard({ guide }: { guide: UniversityGuideItem }) {
  const router = useRouter();
  const open = (url: string | null | undefined) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // 전년도 입시결과(대교협) 클릭은 우리 자체 입결 페이지로 이동 (university_code 있을 때만).
  const handleSecondaryClick = (key: string, url: string | null) => {
    if (key === "adiga_result_url" && guide.university_code) {
      router.push(`/university-guide/result/${guide.university_code}/${guide.year}`);
      return;
    }
    open(url);
  };

  const primary = BUTTON_SPECS.filter((b) => b.group === "primary");
  const secondary = BUTTON_SPECS.filter((b) => b.group === "secondary");

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: "20px 24px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        {/* 좌측: 대학명 + 입학처 */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: "#9CA3AF", fontSize: 16 }}>★</span>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0B1F3F", margin: 0 }}>{guide.university}</h2>
          </div>
          {guide.official_admission_url ? (
            <a
              href={guide.official_admission_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 13,
                color: "#1A8F8B",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              입학처 바로가기 →
            </a>
          ) : (
            <span style={{ fontSize: 13, color: "#9CA3AF" }}>입학처 링크 없음</span>
          )}
        </div>

        {/* 우측 상단: 주요 버튼 4개 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {primary.map((b) => {
            const url = guide[b.key] as string | null;
            const disabled = !url;
            return (
              <button
                key={b.key as string}
                onClick={() => open(url)}
                disabled={disabled}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "1px solid " + (disabled ? "#E5E7EB" : "#D1D5DB"),
                  background: disabled ? "#F9FAFB" : "#fff",
                  color: disabled ? "#D1D5DB" : "#374151",
                  cursor: disabled ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 하단: 부가 항목 3개 */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #F3F4F6", display: "flex", gap: 16, flexWrap: "wrap" }}>
        {secondary.map((b) => {
          const url = guide[b.key] as string | null;
          // 전년도 입시결과(대교협)는 우리 자체 페이지로 이동하므로
          // 외부 URL 없어도 university_code 만 있으면 활성화.
          const isInternal = b.key === "adiga_result_url" && !!guide.university_code;
          const disabled = !url && !isInternal;
          const icon = b.key === "adiga_result_url" ? "📊" : "🎯";
          return (
            <button
              key={b.key as string}
              onClick={() => handleSecondaryClick(b.key as string, url)}
              disabled={disabled}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: disabled ? "not-allowed" : "pointer",
                color: disabled ? "#D1D5DB" : "#6B7B98",
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                whiteSpace: "nowrap",
                fontFamily: "inherit",
              }}
            >
              <span>{icon}</span>
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
