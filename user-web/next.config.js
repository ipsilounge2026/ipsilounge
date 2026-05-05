/** @type {import('next').NextConfig} */
const { withSentryConfig } = require("@sentry/nextjs");

const nextConfig = {
  output: "standalone",
};

// withSentryConfig 가 sentry.client.config.ts 를 클라이언트 번들에 주입.
// 이 wrapper 없으면 SDK 초기화 코드가 빌드 결과물에 포함되지 않아 이벤트 전송 불가.
// SENTRY_AUTH_TOKEN 미설정 시 source map 업로드만 silent 스킵, 런타임 SDK 동작은 정상.
module.exports = withSentryConfig(nextConfig, {
  org: "ipsilounge",
  project: "ipsilounge-user",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
