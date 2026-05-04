/**
 * Sentry 클라이언트(브라우저) 초기화.
 * NEXT_PUBLIC_SENTRY_DSN 미설정 시 init 호출하지 않음 → graceful 비활성.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development",
    tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    sendDefaultPii: false,
    // user-web 도 학생부 PDF·점수 등 PII 가 화면에 노출되므로 리플레이 비활성
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
  });
}
