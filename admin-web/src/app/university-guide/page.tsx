"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isLoggedIn, hasMenuAccess, getDefaultRoute } from "@/lib/auth";
import {
  listUniversityGuides,
  createUniversityGuide,
  updateUniversityGuide,
  deleteUniversityGuide,
  bulkCopyUniversityGuides,
} from "@/lib/api";

interface Guide {
  id: string;
  university: string;
  university_code: string | null;
  year: number;
  official_admission_url: string | null;
  official_jonghap_guidebook_url: string | null;
  official_result_url: string | null;
  adiga_admission_plan_url: string | null;
  adiga_susi_guide_url: string | null;
  adiga_jeongsi_guide_url: string | null;
  adiga_result_url: string | null;
  adiga_prior_learning_eval_url: string | null;
  is_active: boolean;
  sort_order: number;
  last_checked: string | null;
  created_at: string;
  updated_at: string | null;
}

const URL_FIELDS: Array<{ key: keyof Guide; label: string; source: "대학어디가" | "대학 입학처" }> = [
  { key: "official_admission_url", label: "입학처 바로가기", source: "대학 입학처" },
  { key: "adiga_admission_plan_url", label: "대입전형시행계획", source: "대학어디가" },
  { key: "adiga_susi_guide_url", label: "수시모집요강", source: "대학어디가" },
  { key: "official_jonghap_guidebook_url", label: "학생부종합 가이드북", source: "대학 입학처" },
  { key: "adiga_jeongsi_guide_url", label: "정시모집요강", source: "대학어디가" },
  { key: "adiga_result_url", label: "입시결과 (대교협)", source: "대학어디가" },
  { key: "official_result_url", label: "입시결과 (자체발표)", source: "대학 입학처" },
  { key: "adiga_prior_learning_eval_url", label: "선행학습영향평가", source: "대학어디가" },
];

export default function UniversityGuidePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Guide[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [editing, setEditing] = useState<Guide | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkCopy, setShowBulkCopy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUniversityGuides({
        year: year ?? undefined,
        search: search || undefined,
      });
      setItems(res.items || []);
      setAvailableYears(res.available_years || []);
      if (year === null && res.available_years && res.available_years.length > 0) {
        setYear(res.available_years[0]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("목록을 불러오지 못했습니다: " + msg);
    } finally {
      setLoading(false);
    }
  }, [year, search]);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    if (!hasMenuAccess("university_guide")) {
      router.push(getDefaultRoute());
      return;
    }
    load();
  }, [router, load]);

  const handleDelete = async (g: Guide) => {
    if (!confirm(`${g.university} ${g.year}학년도 항목을 삭제하시겠습니까?`)) return;
    try {
      await deleteUniversityGuide(g.id);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("삭제 실패: " + msg);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-main">
        <div className="page-header">
          <h1 className="page-title">대학모집요강 관리</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setShowBulkCopy(true)}>
              학년도 일괄 복사
            </button>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + 새 대학 추가
            </button>
          </div>
        </div>

        {/* 필터 */}
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>학년도</label>
            <select
              className="form-control"
              value={year ?? ""}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ minWidth: 130 }}
            >
              {availableYears.length === 0 && <option value="">학년도 없음</option>}
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}학년도
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>대학명</label>
            <input
              className="form-control"
              placeholder="대학명 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
          </div>
          <button className="btn btn-primary" onClick={load}>
            검색
          </button>
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#6b7280" }}>총 {items.length}건</span>
        </div>

        {/* 목록 */}
        {loading ? (
          <p>로딩 중...</p>
        ) : items.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
            등록된 대학모집요강이 없습니다.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((g) => (
              <GuideCard
                key={g.id}
                guide={g}
                onEdit={() => setEditing(g)}
                onDelete={() => handleDelete(g)}
              />
            ))}
          </div>
        )}

        {/* 새 대학 추가 모달 */}
        {showCreate && year !== null && (
          <GuideFormModal
            initial={null}
            year={year}
            onClose={() => setShowCreate(false)}
            onSubmit={async (data) => {
              try {
                await createUniversityGuide(data);
                setShowCreate(false);
                await load();
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                alert("생성 실패: " + msg);
              }
            }}
          />
        )}

        {/* 수정 모달 */}
        {editing && (
          <GuideFormModal
            initial={editing}
            year={editing.year}
            onClose={() => setEditing(null)}
            onSubmit={async (data) => {
              try {
                await updateUniversityGuide(editing.id, data);
                setEditing(null);
                await load();
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                alert("수정 실패: " + msg);
              }
            }}
          />
        )}

        {/* 학년도 일괄 복사 모달 */}
        {showBulkCopy && (
          <BulkCopyModal
            availableYears={availableYears}
            onClose={() => setShowBulkCopy(false)}
            onSubmit={async (data) => {
              try {
                const res = await bulkCopyUniversityGuides(data);
                alert(`복사 완료: ${res.created}건 생성, ${res.skipped}건 건너뜀`);
                setShowBulkCopy(false);
                await load();
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                alert("일괄 복사 실패: " + msg);
              }
            }}
          />
        )}
      </main>
    </div>
  );
}

function GuideCard({ guide, onEdit, onDelete }: { guide: Guide; onEdit: () => void; onDelete: () => void }) {
  const filledCount = URL_FIELDS.filter((f) => guide[f.key]).length;
  return (
    <div className="card" style={{ padding: 16, opacity: guide.is_active ? 1 : 0.5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{guide.university}</span>
          {!guide.is_active && (
            <span style={{ marginLeft: 8, fontSize: 11, color: "#ef4444" }}>(비활성)</span>
          )}
          <span style={{ marginLeft: 12, fontSize: 12, color: "#6b7280" }}>
            URL {filledCount}/8건 입력
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-sm btn-outline" onClick={onEdit}>
            수정
          </button>
          <button className="btn btn-sm btn-danger" onClick={onDelete}>
            삭제
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6, fontSize: 12 }}>
        {URL_FIELDS.map((f) => (
          <div key={f.key as string} style={{ color: guide[f.key] ? "#10b981" : "#9ca3af" }}>
            {guide[f.key] ? "✓" : "✗"} {f.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function GuideFormModal({
  initial,
  year,
  onClose,
  onSubmit,
}: {
  initial: Guide | null;
  year: number;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void | Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, unknown>>(() => ({
    university: initial?.university || "",
    university_code: initial?.university_code || "",
    year: initial?.year ?? year,
    is_active: initial?.is_active ?? true,
    sort_order: initial?.sort_order ?? 0,
    official_admission_url: initial?.official_admission_url || "",
    official_jonghap_guidebook_url: initial?.official_jonghap_guidebook_url || "",
    official_result_url: initial?.official_result_url || "",
    adiga_admission_plan_url: initial?.adiga_admission_plan_url || "",
    adiga_susi_guide_url: initial?.adiga_susi_guide_url || "",
    adiga_jeongsi_guide_url: initial?.adiga_jeongsi_guide_url || "",
    adiga_result_url: initial?.adiga_result_url || "",
    adiga_prior_learning_eval_url: initial?.adiga_prior_learning_eval_url || "",
  }));

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = () => {
    if (!String(form.university || "").trim()) {
      alert("대학명을 입력하세요");
      return;
    }
    const payload: Record<string, unknown> = { ...form };
    Object.keys(payload).forEach((k) => {
      const v = payload[k];
      if (typeof v === "string" && v.trim() === "") {
        payload[k] = null;
      }
    });
    void onSubmit(payload);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: 24, maxWidth: 720, width: "90vw", maxHeight: "90vh", overflowY: "auto" }}>
        <h2>{initial ? `${initial.university} 수정` : "대학 추가"}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280" }}>대학명 *</label>
            <input
              className="form-control"
              type="text"
              value={String(form.university || "")}
              onChange={(e) => set("university", e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280" }}>학년도</label>
            <input
              className="form-control"
              type="number"
              value={Number(form.year || 0)}
              onChange={(e) => set("year", Number(e.target.value))}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280" }}>정렬 순서</label>
            <input
              className="form-control"
              type="number"
              value={Number(form.sort_order || 0)}
              onChange={(e) => set("sort_order", Number(e.target.value))}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={Boolean(form.is_active)}
              onChange={(e) => set("is_active", e.target.checked)}
              style={{ marginRight: 6 }}
            />
            활성 (사용자에게 노출)
          </label>
          <input
            className="form-control"
            type="text"
            placeholder="대학 코드 (선택)"
            value={String(form.university_code || "")}
            onChange={(e) => set("university_code", e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
        </div>

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0 }}>외부 URL 매핑</h3>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 12px" }}>
            각 자료의 외부 출처 URL을 입력하세요. 빈 칸은 사용자 카드에서 버튼이 비활성화됩니다.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {URL_FIELDS.map((f) => (
              <div key={f.key as string}>
                <label style={{ fontSize: 12, color: "#6b7280", display: "block" }}>
                  {f.label}{" "}
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 3,
                      background: f.source === "대학어디가" ? "#dbeafe" : "#fef3c7",
                      color: f.source === "대학어디가" ? "#1e40af" : "#92400e",
                      marginLeft: 4,
                    }}
                  >
                    {f.source}
                  </span>
                </label>
                <input
                  className="form-control"
                  type="url"
                  placeholder="https://..."
                  value={String(form[f.key as string] || "")}
                  onChange={(e) => set(f.key as string, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkCopyModal({
  availableYears,
  onClose,
  onSubmit,
}: {
  availableYears: number[];
  onClose: () => void;
  onSubmit: (data: { from_year: number; to_year: number; copy_urls: boolean }) => void | Promise<void>;
}) {
  const defaultFromYear = availableYears[0] ?? new Date().getFullYear() + 1;
  const [fromYear, setFromYear] = useState<number>(defaultFromYear);
  const [toYear, setToYear] = useState<number>(defaultFromYear + 1);
  const [copyUrls, setCopyUrls] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: 24, maxWidth: 480 }}>
        <h2>학년도 일괄 복사</h2>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          기존 학년도의 대학 목록을 새 학년도로 복사합니다. 대상 학년도에 이미 존재하는 대학은 건너뜁니다.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280" }}>원본 학년도</label>
            <select
              className="form-control"
              value={fromYear}
              onChange={(e) => setFromYear(Number(e.target.value))}
            >
              {availableYears.length === 0 && <option value="">데이터 없음</option>}
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}학년도
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280" }}>대상 학년도</label>
            <input
              className="form-control"
              type="number"
              value={toYear}
              onChange={(e) => setToYear(Number(e.target.value))}
            />
          </div>
        </div>

        <label style={{ display: "block", fontSize: 13, marginTop: 16 }}>
          <input
            type="checkbox"
            checked={copyUrls}
            onChange={(e) => setCopyUrls(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          URL 까지 복사 (체크 안 하면 대학명·코드·순서만 복사)
        </label>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn-primary"
            disabled={availableYears.length === 0}
            onClick={() => onSubmit({ from_year: fromYear, to_year: toYear, copy_urls: copyUrls })}
          >
            복사 실행
          </button>
        </div>
      </div>
    </div>
  );
}
