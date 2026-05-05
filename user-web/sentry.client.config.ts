/**
 * Sentry 클라이언트(브라우저) 초기화.
 * NEXT_PUBLIC_SENTRY_DSN 미설정 시 init 호출하지 않음 → graceful 비활성.
 *
 * 진단 모드: NEXT_PUBLIC_SENTRY_DEBUG=true 시 debug 로그 + window.Sentry 노출.
 * production 검증 완료 후 환경변수 제거하면 자동으로 진단 모드 꺼짐.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const debugMode = process.env.NEXT_PUBLIC_SENTRY_DEBUG === "true";

if (debugMode) {
  console.log("[Sentry] client config loaded", { dsnConfigured: !!dsn, env: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT });
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development",
    tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    sendDefaultPii: false,
    // user-web 도 학생부 PDF·점수 등 PII 가 화면에 노출되므로 리플레이 비활성
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    debug: debugMode,
  });
  if (debugMode && typeof window !== "undefined") {
    (window as unknown as { Sentry: typeof Sentry }).Sentry = Sentry;
    console.log("[Sentry] init 완료, window.Sentry 노출됨");
  }
}
