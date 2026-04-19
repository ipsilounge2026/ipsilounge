import { FullConfig, request as pwRequest } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";

import { BACKEND_URL, E2E_LOGIN_TEST_USER } from "./auth";

/**
 * globalSetup — 모든 테스트 실행 전 1회 실행.
 * 1) seed_l3_test_data.py 로 테스트 사용자 7명 + 가족 + 설문 시드
 * 2) 유효한 email TLD 를 가진 e2e 전용 테스트 사용자 1명 API 등록
 *    (seed 사용자는 `@test.local` 인데 pydantic EmailStr 이 reserved TLD 로 거부하여
 *     실제 /api/auth/login 폼 로그인이 실패함 → e2e 전용 사용자 별도 생성)
 *
 * 멱등: seed 는 --reset 없이 재실행 안전. register 는 409 (중복) 수용.
 */
async function globalSetup(_config: FullConfig) {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const backendDir = path.join(repoRoot, "backend");

  // Seed 는 이미 backend 가 기동되어 dev.db 를 열고 있는 상태에서 실행됨.
  // → Windows 에서 --reset 은 파일 lock 으로 실패하므로 사용 불가.
  // 스키마 drift 가 우려되면 테스트 실행 전 dev.db 를 수동 삭제 (backend 재기동 시 create_all 이 최신 스키마 생성).
  // CI 에서는 매 실행마다 fresh runner 라서 자동으로 fresh DB.
  const cmd = `python scripts/seed_l3_test_data.py`;
  console.log(`\n[e2e globalSetup] Seeding test data: ${cmd}`);
  try {
    const output = execSync(
      cmd,
      {
        cwd: backendDir,
        env: {
          ...process.env,
          DEV_MODE: "true",
          DEV_SQLITE_PATH: "./dev.db",
          PYTHONIOENCODING: "utf-8",
        },
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    // seed 스크립트는 stdout 으로 JSON 을 뱉음. 성공만 확인.
    if (output.includes("default_password")) {
      console.log("[e2e globalSetup] Seed OK.");
    } else {
      console.warn("[e2e globalSetup] Seed output unexpected:", output.slice(0, 200));
    }
  } catch (err: any) {
    console.error("[e2e globalSetup] Seed FAILED:", err.message);
    if (err.stdout) console.error("stdout:", err.stdout.toString?.() ?? err.stdout);
    if (err.stderr) console.error("stderr:", err.stderr.toString?.() ?? err.stderr);
    throw err;
  }

  // ── e2e 전용 login-test 사용자 등록 ────────────────────────────
  // seed 사용자(@test.local) 는 실제 login 폼에서 422 (reserved TLD) 로 거부되므로,
  // 유효한 TLD (@example.com) 를 쓰는 별도 사용자 1명을 register 엔드포인트로 생성.
  // 이미 존재하면 409 (또는 422 duplicate) 를 수용하고 진행.
  const api = await pwRequest.newContext();
  try {
    console.log(`[e2e globalSetup] Ensuring e2e login user: ${E2E_LOGIN_TEST_USER.email}`);
    const resp = await api.post(`${BACKEND_URL}/api/auth/register`, {
      data: {
        email: E2E_LOGIN_TEST_USER.email,
        password: E2E_LOGIN_TEST_USER.password,
        name: E2E_LOGIN_TEST_USER.name,
        phone: "010-1234-5678",
        member_type: "student",
        birth_date: "2008-03-15",
        school_name: "테스트고등학교",
        grade: 1,
        agree_terms: true,
        agree_privacy: true,
      },
      failOnStatusCode: false,
    });
    const body = await resp.text();
    if (resp.status() === 200 || resp.status() === 201) {
      console.log("[e2e globalSetup] e2e login user created.");
    } else if (
      resp.status() === 400 &&
      /이미 (가입|등록|존재)|already exist|중복/i.test(body)
    ) {
      console.log("[e2e globalSetup] e2e login user already exists (OK).");
    } else {
      console.error(
        `[e2e globalSetup] register FAILED with status ${resp.status()}:`,
        body.slice(0, 500)
      );
      throw new Error(
        `e2e login user register failed (${resp.status()}): ${body.slice(0, 200)}`
      );
    }
  } finally {
    await api.dispose();
  }
}

export default globalSetup;
