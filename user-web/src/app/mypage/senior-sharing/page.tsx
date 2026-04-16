"use client";

/**
 * 선배상담 연계 관리 페이지 (연계규칙 V1 §10-1 학생 사후 철회)
 *
 * 회원가입 시 이용약관·개인정보처리방침 통합 동의로 기본 공유 동의는 받았음.
 * 이 페이지에서는 이미 공유 중인 개별 상담사 설문/상담기록을 건별로
 *   - 🛑 공유 중단 (철회)
 *   - ✅ 공유 다시 허용 (복구)
 * 할 수 있다. 상담사 측 원본은 삭제되지 않고, 선배에게만 비노출된다.
 *
 * 민감 카테고리(D8/F/G)는 시스템적으로 항상 비공개이며 여기서 토글 대상이 아니다.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  getSeniorSharingStatus,
  revokeSeniorSharing,
  restoreSeniorSharing,
  type SeniorSharingStatusItem,
} from "@/lib/api";
import { isLoggedIn, getMemberType } from "@/lib/auth";

type BadgeColor = { bg: string; color: string; border: string };

const BADGES: Record<string, { label: string } & BadgeColor> = {
  shared: {
    label: "공유 중",
    bg: "#D1FAE5",
    color: "#065F46",
    border: "#6EE7B7",
  },
  revoked: {
    label: "내가 중단함",
    bg: "#FEE2E2",
    color: "#991B1B",
    border: "#FCA5A5",
  },
  pending: {
    label: "관리자 검토 대기",
    bg: "#FEF3C7",
    color: "#92400E",
    border: "#FCD34D",
  },
  revision: {
    label: "수정 요청됨",
    bg: "#F3F4F6",
    color: "#4B5563",
    border: "#D1D5DB",
  },
};

function classifyBadge(item: SeniorSharingStatusItem) {
  if (item.revoked_at) return BADGES.revoked;
  if (item.effectively_shared) return BADGES.shared;
  if (item.senior_review_status === "revision_requested") return BADGES.revision;
  return BADGES.pending;
}

function formatItemDate(item: SeniorSharingStatusItem): string {
  const raw =
    item.consultation_date ||
    item.submitted_at ||
    item.created_at ||
    null;
  if (!raw) return "-";
  try {
    const d = new Date(raw);
    return d.toLocaleDateString("ko-KR");
  } catch {
    return raw;
  }
}

function typeLabel(item: SeniorSharingStatusItem): string {
  return item.source_type === "survey" ? "상담 설문" : "상담 기록";
}

function timingLabel(item: SeniorSharingStatusItem): string {
  if (item.timing) return item.timing;
  if (item.source_type === "survey" && item.survey_type) return item.survey_type;
  if (item.source_type === "note" && item.category) return item.category;
  return "-";
}

export default function SeniorSharingPage() {
  const router = useRouter();
  const [items, setItems] = useState<SeniorSharingStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [bulkActioning, setBulkActioning] = useState<"revoke" | "restore" | null>(
    null,
  );
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  // 철회 사유 입력 모달
  const [revokeTarget, setRevokeTarget] = useState<SeniorSharingStatusItem | null>(
    null,
  );
  const [revokeReason, setRevokeReason] = useState("");

  // 일괄 철회 사유 입력 모달
  const [bulkRevokeOpen, setBulkRevokeOpen] = useState(false);
  const [bulkRevokeReason, setBulkRevokeReason] = useState("");

  const loadItems = async () => {
    try {
      const data = await getSeniorSharingStatus();
      setItems(data.items || []);
    } catch (e) {
      setMessage({
        kind: "err",
        text: e instanceof Error ? e.message : "불러오기에 실패했습니다",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    const memberType = getMemberType();
    if (memberType && memberType !== "student") {
      router.push("/mypage");
      return;
    }
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showOk = (text: string) => setMessage({ kind: "ok", text });
  const showErr = (text: string) => setMessage({ kind: "err", text });

  const openRevoke = (item: SeniorSharingStatusItem) => {
    setRevokeTarget(item);
    setRevokeReason("");
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    const item = revokeTarget;
    const key = `${item.source_type}:${item.id}`;
    setActioning(key);
    try {
      await revokeSeniorSharing({
        scope: "by_id",
        source_type: item.source_type,
        source_id: item.id,
        reason: revokeReason.trim() || undefined,
      });
      setRevokeTarget(null);
      setRevokeReason("");
      showOk("해당 기록의 선배 공유를 중단했습니다.");
      await loadItems();
    } catch (e) {
      showErr(e instanceof Error ? e.message : "공유 중단에 실패했습니다");
    } finally {
      setActioning(null);
    }
  };

  const handleRestore = async (item: SeniorSharingStatusItem) => {
    if (
      !window.confirm(
        `${typeLabel(item)} (${timingLabel(item)}, ${formatItemDate(item)}) 의 선배 공유를 다시 허용합니다. 계속할까요?`,
      )
    ) {
      return;
    }
    const key = `${item.source_type}:${item.id}`;
    setActioning(key);
    try {
      await restoreSeniorSharing({
        scope: "by_id",
        source_type: item.source_type,
        source_id: item.id,
      });
      showOk("해당 기록의 선배 공유를 다시 허용했습니다.");
      await loadItems();
    } catch (e) {
      showErr(e instanceof Error ? e.message : "공유 복구에 실패했습니다");
    } finally {
      setActioning(null);
    }
  };

  const openBulkRevoke = () => {
    setBulkRevokeOpen(true);
    setBulkRevokeReason("");
  };

  const confirmBulkRevoke = async () => {
    setBulkActioning("revoke");
    try {
      const result = await revokeSeniorSharing({
        scope: "all",
        reason: bulkRevokeReason.trim() || undefined,
      });
      setBulkRevokeOpen(false);
      setBulkRevokeReason("");
      showOk(`전체 공유를 중단했습니다 (${result.revoked_count}건 처리).`);
      await loadItems();
    } catch (e) {
      showErr(e instanceof Error ? e.message : "일괄 공유 중단에 실패했습니다");
    } finally {
      setBulkActioning(null);
    }
  };

  const handleBulkRestore = async () => {
    if (
      !window.confirm(
        "내가 공유 중단한 모든 상담 기록의 선배 공유를 다시 허용합니다. 계속할까요?",
      )
    ) {
      return;
    }
    setBulkActioning("restore");
    try {
      const result = await restoreSeniorSharing({ scope: "all" });
      showOk(`전체 공유를 복구했습니다 (${result.restored_count}건 처리).`);
      await loadItems();
    } catch (e) {
      showErr(e instanceof Error ? e.message : "일괄 공유 복구에 실패했습니다");
    } finally {
      setBulkActioning(null);
    }
  };

  const sharedCount = items.filter((it) => it.effectively_shared).length;
  const revokedCount = items.filter((it) => it.revoked_at).length;
  const pendingCount = items.filter(
    (it) =>
      !it.revoked_at &&
      !it.effectively_shared &&
      it.senior_review_status !== "revision_requested",
  ).length;

  return (
    <>
      <Navbar />
      <main
        style={{
          maxWidth: 960,
          margin: "32px auto",
          padding: "0 20px",
          minHeight: "70vh",
        }}
      >
        <button
          onClick={() => router.push("/mypage")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "#6B7280",
            marginBottom: 8,
            padding: 0,
          }}
        >
          ← 마이페이지로
        </button>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, color: "#111827" }}>
          선배상담 연계 관리
        </h1>
        <p style={{ color: "#6B7280", margin: "0 0 20px", fontSize: 13 }}>
          상담사와의 상담 중 관리자 검토를 통과한 내용만 담당 선배에게 공유됩니다.
          건별로 공유 중단·재허용이 가능하며, 원본 상담 기록은 삭제되지 않습니다.
        </p>

        {/* 안내 박스 */}
        <div
          style={{
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: 8,
            padding: 16,
            fontSize: 13,
            lineHeight: 1.7,
            color: "#1E3A8A",
            marginBottom: 20,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>공유 원칙 요약</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>관리자 검토가 완료된 내용만 선배에게 공유됩니다.</li>
            <li>공유 중단 후에도 언제든 다시 허용할 수 있습니다.</li>
            <li>
              민감 카테고리(심리·학부모 관점·고3 직전 준비)는 <strong>시스템적으로
              항상 비공개</strong>이며 토글 대상이 아닙니다.
            </li>
            <li>
              상담사 측 원본 기록은 공유 중단과 무관하게 보존되며, 선배에게만 비노출됩니다.
            </li>
          </ul>
        </div>

        {message && (
          <div
            style={{
              background: message.kind === "ok" ? "#D1FAE5" : "#FEE2E2",
              color: message.kind === "ok" ? "#065F46" : "#991B1B",
              border: `1px solid ${message.kind === "ok" ? "#6EE7B7" : "#FCA5A5"}`,
              borderRadius: 6,
              padding: 10,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {message.text}
            <button
              onClick={() => setMessage(null)}
              style={{
                float: "right",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "inherit",
                fontSize: 13,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* 카운터 + 일괄 버튼 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 12,
          }}
        >
          {[
            {
              label: "공유 중",
              value: sharedCount,
              bg: "#D1FAE5",
              color: "#065F46",
            },
            {
              label: "내가 중단함",
              value: revokedCount,
              bg: "#FEE2E2",
              color: "#991B1B",
            },
            {
              label: "관리자 검토 중",
              value: pendingCount,
              bg: "#FEF3C7",
              color: "#92400E",
            },
          ].map((c) => (
            <div
              key={c.label}
              style={{
                background: c.bg,
                color: c.color,
                borderRadius: 8,
                padding: 14,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 12 }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                {c.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={openBulkRevoke}
            disabled={
              bulkActioning !== null || sharedCount === 0 || loading
            }
            style={{
              background: "#EF4444",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: "10px 14px",
              fontSize: 13,
              cursor:
                bulkActioning !== null || sharedCount === 0 || loading
                  ? "not-allowed"
                  : "pointer",
              opacity:
                bulkActioning !== null || sharedCount === 0 || loading
                  ? 0.5
                  : 1,
            }}
          >
            🛑 전체 공유 중단
          </button>
          <button
            onClick={handleBulkRestore}
            disabled={
              bulkActioning !== null || revokedCount === 0 || loading
            }
            style={{
              background: "white",
              color: "#059669",
              border: "1px solid #059669",
              borderRadius: 6,
              padding: "10px 14px",
              fontSize: 13,
              cursor:
                bulkActioning !== null || revokedCount === 0 || loading
                  ? "not-allowed"
                  : "pointer",
              opacity:
                bulkActioning !== null || revokedCount === 0 || loading
                  ? 0.5
                  : 1,
            }}
          >
            ✅ 전체 복구
          </button>
        </div>

        {/* 목록 */}
        {loading ? (
          <div
            style={{
              textAlign: "center",
              color: "#9CA3AF",
              padding: 40,
            }}
          >
            불러오는 중…
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              background: "#F9FAFB",
              border: "1px dashed #E5E7EB",
              borderRadius: 8,
              padding: 32,
              textAlign: "center",
              color: "#6B7280",
              fontSize: 13,
            }}
          >
            아직 선배 공유 대상이 되는 상담 기록이 없습니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((item) => {
              const badge = classifyBadge(item);
              const key = `${item.source_type}:${item.id}`;
              const isActing = actioning === key;
              const canRevoke = item.effectively_shared && !isActing;
              const canRestore = !!item.revoked_at && !isActing;
              const actionable = canRevoke || canRestore;

              return (
                <div
                  key={key}
                  style={{
                    background: "white",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          background: "#F3F4F6",
                          color: "#374151",
                          padding: "2px 8px",
                          borderRadius: 4,
                        }}
                      >
                        {typeLabel(item)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: badge.color,
                          background: badge.bg,
                          border: `1px solid ${badge.border}`,
                          padding: "2px 8px",
                          borderRadius: 4,
                        }}
                      >
                        {badge.label}
                      </span>
                      <span style={{ fontSize: 12, color: "#6B7280" }}>
                        · 시점 {timingLabel(item)}
                      </span>
                      <span style={{ fontSize: 12, color: "#6B7280" }}>
                        · 작성 {formatItemDate(item)}
                      </span>
                    </div>
                    {!actionable && !item.effectively_shared && !item.revoked_at && (
                      <div style={{ fontSize: 12, color: "#6B7280" }}>
                        관리자 검토를 기다리는 중이므로 아직 선배에게 공유되지 않았습니다.
                      </div>
                    )}
                    {item.revoked_at && item.revoke_reason && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#991B1B",
                          marginTop: 4,
                        }}
                      >
                        중단 사유: {item.revoke_reason}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {canRevoke && (
                      <button
                        onClick={() => openRevoke(item)}
                        style={{
                          background: "#EF4444",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
                          padding: "8px 12px",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        🛑 공유 중단
                      </button>
                    )}
                    {canRestore && (
                      <button
                        onClick={() => handleRestore(item)}
                        style={{
                          background: "white",
                          color: "#059669",
                          border: "1px solid #059669",
                          borderRadius: 6,
                          padding: "8px 12px",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        ✅ 공유 다시 허용
                      </button>
                    )}
                    {isActing && (
                      <span style={{ fontSize: 12, color: "#6B7280" }}>
                        처리 중…
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 개별 철회 모달 */}
        {revokeTarget && (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
            }}
            onClick={() => {
              if (actioning) return;
              setRevokeTarget(null);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "white",
                borderRadius: 10,
                padding: 22,
                width: "min(480px, 92vw)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                선배 공유 중단
              </div>
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 12 }}>
                {typeLabel(revokeTarget)} · 시점 {timingLabel(revokeTarget)} ·{" "}
                작성 {formatItemDate(revokeTarget)} 을/를 더 이상 담당 선배에게
                공유하지 않습니다.
              </div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "#6B7280",
                  marginBottom: 6,
                }}
              >
                중단 사유 (선택, 관리자 검토 시 참고됩니다)
              </label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="예: 해당 회차 내용을 다시 정리한 뒤 공유하고 싶어서"
                style={{
                  width: "100%",
                  minHeight: 70,
                  border: "1px solid #D1D5DB",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 13,
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 14,
                }}
              >
                <button
                  onClick={() => setRevokeTarget(null)}
                  disabled={!!actioning}
                  style={{
                    background: "white",
                    border: "1px solid #D1D5DB",
                    borderRadius: 6,
                    padding: "8px 14px",
                    fontSize: 13,
                    cursor: actioning ? "not-allowed" : "pointer",
                  }}
                >
                  취소
                </button>
                <button
                  onClick={confirmRevoke}
                  disabled={!!actioning}
                  style={{
                    background: "#EF4444",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 14px",
                    fontSize: 13,
                    cursor: actioning ? "not-allowed" : "pointer",
                    opacity: actioning ? 0.6 : 1,
                  }}
                >
                  {actioning ? "처리 중…" : "공유 중단"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 일괄 철회 모달 */}
        {bulkRevokeOpen && (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
            }}
            onClick={() => {
              if (bulkActioning) return;
              setBulkRevokeOpen(false);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "white",
                borderRadius: 10,
                padding: 22,
                width: "min(520px, 92vw)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                전체 선배 공유 중단
              </div>
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 12 }}>
                현재 공유 중인 <strong>{sharedCount}건</strong>의 상담 설문·기록을
                모두 담당 선배에게 비노출합니다. 언제든 개별 또는 일괄로 다시 허용할
                수 있습니다.
              </div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "#6B7280",
                  marginBottom: 6,
                }}
              >
                중단 사유 (선택)
              </label>
              <textarea
                value={bulkRevokeReason}
                onChange={(e) => setBulkRevokeReason(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 70,
                  border: "1px solid #D1D5DB",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 13,
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 14,
                }}
              >
                <button
                  onClick={() => setBulkRevokeOpen(false)}
                  disabled={!!bulkActioning}
                  style={{
                    background: "white",
                    border: "1px solid #D1D5DB",
                    borderRadius: 6,
                    padding: "8px 14px",
                    fontSize: 13,
                    cursor: bulkActioning ? "not-allowed" : "pointer",
                  }}
                >
                  취소
                </button>
                <button
                  onClick={confirmBulkRevoke}
                  disabled={!!bulkActioning}
                  style={{
                    background: "#EF4444",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 14px",
                    fontSize: 13,
                    cursor: bulkActioning ? "not-allowed" : "pointer",
                    opacity: bulkActioning ? 0.6 : 1,
                  }}
                >
                  {bulkActioning === "revoke" ? "처리 중…" : "전체 공유 중단"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
