/**
 * Sentry 서버 런타임 (Node.js) 초기화.
 * instrumentation.ts 의 register() 가 NEXT_PUBLIC_SENTRY_DSN 있을 때만 import.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development",
  tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
  // PII 자동 전송 차단 — admin 화면이 학생 정보 다루므로 보수적
  sendDefaultPii: false,
});
