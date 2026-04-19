import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * Playwright E2E 설정
 * - 루트: e2e/
 * - 타깃: user-web (http://localhost:3000) + backend (http://127.0.0.1:8000)
 * - 백엔드는 DEV_MODE=true + SQLite 로 구동 (운영 DB 영향 없음)
 * - globalSetup 에서 seed_l3_test_data.py 를 실행해 테스트 사용자/설문 주입
 */

const REPO_ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(REPO_ROOT, "backend");
const USER_WEB_DIR = path.join(REPO_ROOT, "user-web");

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // SQLite dev.db 동시 쓰기 충돌 방지를 위해 순차 실행
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // globalSetup: seed 데이터 주입 (1회)
  globalSetup: require.resolve("./helpers/global-setup"),

  // 테스트 실행 전 자동으로 backend + user-web 기동
  webServer: [
    {
      // DEV_MODE=true 환경변수로 backend 를 SQLite 모드로 기동
      // 127.0.0.1 로 바인드해서 외부 노출 방지
      command: "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000",
      cwd: BACKEND_DIR,
      url: "http://127.0.0.1:8000/api/dev/health",
      env: {
        DEV_MODE: "true",
        DEV_SQLITE_PATH: "./dev.db",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run dev",
      cwd: USER_WEB_DIR,
      url: "http://localhost:3000",
      env: {
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:8000",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
