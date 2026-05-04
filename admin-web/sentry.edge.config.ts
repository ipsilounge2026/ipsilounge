/**
 * Sentry Edge 런타임 (middleware) 초기화.
 * instrumentation.ts 의 register() 가 NEXT_PUBLIC_SENTRY_DSN 있을 때만 import.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development",
  tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
  sendDefaultPii: false,
});
