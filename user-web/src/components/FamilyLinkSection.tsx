"use client";

/**
 * 학생-학부모 가족 연결 섹션 (마이페이지용)
 *
 * 동작:
 * - 학생/학부모 양쪽 모두에서 사용
 * - "코드 만들기": 8자리 코드 생성, 7일 만료
 * - "코드 입력하기": 상대방이 만든 코드로 연결 활성화
 * - 연결 해제: 학부모 계정만 가능 (백엔드에서도 검증)
 *
 * 결과 가시성:
 * - 학생: 연결된 학부모 목록
 * - 학부모: 연결된 자녀 목록
 */

import { useEffect, useState } from "react";
import {
  FamilyLinkItem,
  connectFamilyByCode,
  createFamilyInvite,
  listFamilyLinks,
  revokeFamilyLink,
} from "@/lib/api";

interface Props {
  memberType: "student" | "parent";
}

export default function FamilyLinkSection({ memberType }: Props) {
  const [links, setLinks] = useState<FamilyLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // 코드 생성 모달
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedExpiresAt, setGeneratedExpiresAt] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // 코드 입력 모달
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [connecting, setConnecting] = useState(false);

  const isParent = memberType === "parent";
  const otherLabel = isParent ? "자녀" : "학부모";

  useEffect(() => {
    loadLinks();
  }, []);

  const loadLinks = async () => {
    try {
      setLoading(true);
      const res = await listFamilyLinks();
      setLinks(res.items || []);
    } catch (e: any) {
      setMessage({ kind: "error", text: e.message || "연결 목록을 불러오지 못했습니다" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvite = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const res = await createFamilyInvite();
      setGeneratedCode(res.code);
      setGeneratedExpiresAt(res.expires_at);
      setShowCreateModal(true);
    } catch (e: any) {
      setMessage({ kind: "error", text: e.message || "코드 생성에 실패했습니다" });
    } finally {
      setCreating(false);
    }
  };

  const handleCopyCode = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setMessage({ kind: "success", text: "코드가 클립보드에 복사되었습니다" });
    } catch {
      setMessage({ kind: "error", text: "복사에 실패했습니다. 직접 코드를 입력해주세요." });
    }
  };

  const handleConnect = async () => {
    const trimmed = codeInput.trim().toUpperCase();
    if (!trimmed) {
      setMessage({ kind: "error", text: "코드를 입력해주세요" });
      return;
    }
    setConnecting(true);
    setMessage(null);
    try {
      await connectFamilyByCode(trimmed);
      setMessage({ kind: "success", text: `${otherLabel} 연결이 완료되었습니다` });
      setShowConnectModal(false);
      setCodeInput("");
      await loadLinks();
    } catch (e: any) {
      setMessage({ kind: "error", text: e.message || "연결에 실패했습니다" });
    } finally {
      setConnecting(false);
    }
  };

  const handleRevoke = async (link: FamilyLinkItem) => {
    if (!confirm(`${link.member.name} 님과의 연결을 해제하시겠습니까?\n해제 후에는 서로의 신청 내역이 보이지 않습니다.`)) {
      return;
    }
    try {
      await revokeFamilyLink(link.link_id);
      setMessage({ kind: "success", text: "연결이 해제되었습니다" });
      await loadLinks();
    } catch (e: any) {
      setMessage({ kind: "error", text: e.message || "연결 해제에 실패했습니다" });
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>
          연결된 {otherLabel}
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "var(--gray-500)" }}>
            ({links.length}명)
          </span>
        </h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => { setShowConnectModal(true); setMessage(null); }}
          >
            코드 입력
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleCreateInvite}
            disabled={creating}
          >
            {creating ? "생성 중..." : "코드 만들기"}
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: "10px 12px",
          background: message.kind === "success" ? "#D1FAE5" : "#FEE2E2",
          color: message.kind === "success" ? "#065F46" : "#991B1B",
          borderRadius: 6,
          fontSize: 13,
          marginBottom: 12,
        }}>
          {message.text}
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 12, lineHeight: 1.5 }}>
        {isParent
          ? "자녀 계정과 연결하면 자녀의 신청·결제 내역을 함께 볼 수 있고, 자녀 명의로 학생부 라운지·학종 라운지·상담 라운지를 신청할 수 있습니다."
          : "학부모님 계정과 연결하면 학부모님이 본인의 신청·결제 내역을 보실 수 있고, 학부모님 관점 사전조사를 작성하실 수 있습니다."}
      </p>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--gray-500)" }}>불러오는 중...</p>
      ) : links.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--gray-500)" }}>
          아직 연결된 {otherLabel}이 없습니다.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {links.map((link) => (
            <div
              key={link.link_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                border: "1px solid var(--gray-200)",
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isParent ? "#3B82F6" : "#8B5CF6",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 600, fontSize: 13,
                }}>
                  {link.member.name.charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{link.member.name}</div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    {link.member.email}
                    {link.member.school_name && ` · ${link.member.school_name}`}
                    {link.member.grade != null && ` · ${link.member.grade}학년`}
                  </div>
                </div>
              </div>
              {link.can_revoke ? (
                <button
                  onClick={() => handleRevoke(link)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    border: "1px solid #FCA5A5",
                    background: "#fff",
                    color: "#DC2626",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  연결 해제
                </button>
              ) : (
                <span style={{ fontSize: 11, color: "var(--gray-400)" }}>해제는 학부모만</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 코드 생성 결과 모달 */}
      {showCreateModal && generatedCode && (
        <div
          onClick={() => setShowCreateModal(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 400, width: "90%" }}
          >
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>가족 연결 코드</h3>
            <p style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 16, lineHeight: 1.5 }}>
              아래 코드를 {isParent ? "자녀" : "학부모님"}께 전달해주세요.
              <br />
              {isParent ? "자녀가" : "학부모님이"} 마이페이지에서 "코드 입력"을 통해 입력하시면 연결됩니다.
            </p>
            <div style={{
              padding: "16px 20px",
              background: "#F3F4F6",
              borderRadius: 8,
              fontSize: 24,
              fontWeight: 700,
              fontFamily: "monospace",
              textAlign: "center",
              letterSpacing: 4,
              marginBottom: 12,
            }}>
              {generatedCode}
            </div>
            {generatedExpiresAt && (
              <p style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 16, textAlign: "center" }}>
                만료: {new Date(generatedExpiresAt).toLocaleString("ko-KR")}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCopyCode}>
                코드 복사
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowCreateModal(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 코드 입력 모달 */}
      {showConnectModal && (
        <div
          onClick={() => setShowConnectModal(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 400, width: "90%" }}
          >
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>{otherLabel} 코드 입력</h3>
            <p style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 16, lineHeight: 1.5 }}>
              {isParent ? "자녀가" : "학부모님이"} 만든 8자리 코드를 입력해주세요.
            </p>
            <input
              type="text"
              className="form-control"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="예: K7M9XP2A"
              maxLength={8}
              style={{
                fontSize: 20,
                fontFamily: "monospace",
                textAlign: "center",
                letterSpacing: 4,
                marginBottom: 16,
              }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? "연결 중..." : "연결하기"}
              </button>
              <button
                className="btn btn-outline"
                style={{ flex: 1 }}
                onClick={() => { setShowConnectModal(false); setCodeInput(""); }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
