"use client";

/**
 * Sentry 통합 검증용 임시 버튼.
 * URL 에 ?sentry-test=1 이 있을 때만 노출 → 일반 사용자에게는 보이지 않음.
 *
 * 사용법:
 *   1. https://ipsilounge.co.kr/?sentry-test=1 접속
 *   2. 푸터의 노란 박스에 "Sentry 테스트" 버튼 클릭
 *   3. eventId 가 표시되면 전송 성공 → Sentry 대시보드에서 확인
 *
 * 검증 완료 후 이 파일 + Footer 의 import 제거 권장.
 */
import * as Sentry from "@sentry/nextjs";
import { useState, useEffect } from "react";

export default function SentryTestButton() {
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    setShow(window.location.search.includes("sentry-test"));
  }, []);

  if (!show) return null;

  const handleClick = () => {
    try {
      const id = Sentry.captureException(
        new Error(`Sentry 테스트 버튼 클릭 - 무시하세요 (${new Date().toISOString()})`),
      );
      setStatus(`전송 시도 완료. eventId: ${id || "(빈 값)"}`);
    } catch (e) {
      setStatus(`예외 발생: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        background: "#fef3c7",
        border: "1px solid #fcd34d",
        borderRadius: 6,
        textAlign: "center",
        fontSize: 12,
        color: "#78350f",
      }}
    >
      <strong>Sentry 진단 버튼 (운영자용 임시)</strong>
      <div style={{ marginTop: 6 }}>
        <button
          onClick={handleClick}
          style={{
            padding: "4px 12px",
            background: "#f59e0b",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Sentry 테스트 에러 전송
        </button>
      </div>
      {status && <div style={{ marginTop: 8 }}>{status}</div>}
    </div>
  );
}
