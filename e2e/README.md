# e2e — Playwright E2E 테스트 스위트

admin-web + user-web 통합 E2E 테스트. backend 를 DEV_MODE(SQLite) 로 자동 기동한 뒤 실제 브라우저(Chromium) 로 사용자 흐름을 재현한다.

## 현재 커버리지 (Sprint 1, 2026-04-19)

| 파일 | 테스트 | 통과 |
|------|--------|------|
| `tests/01-login.spec.ts` | 로그인 폼 성공 / 잘못된 비밀번호 | 2/2 |
| `tests/02-consultation-entry.spec.ts` | 상담 페이지 유형 6개 렌더 / 학습 상담 선택 전환 / 비로그인 리다이렉트 | 3/3 |

**합계: 5/5 pass** (로컬 검증 완료)

## 스프린트 로드맵

- **Sprint 1** (완료): 로그인 + 상담 진입
- **Sprint 2** (예정): 학생부 분석 업로드, 고등/예비고1/선배 설문 제출, 만족도 제출, 회원가입, 비밀번호 재설정, 리포트 조회(권한 차단)

## 실행 방법

### 사전 요구사항

- Python 3.12+ (backend 실행)
- Node.js 18+ / npm
- backend 와 user-web 의 의존성이 각각 설치되어 있어야 함:
  ```bash
  cd backend && pip install -r requirements.txt
  cd user-web && npm install
  ```

### 설치 (1회)

```bash
cd e2e
npm install
npm run install-browsers   # Chromium 다운로드 (≈90MB)
```

### 실행

```bash
cd e2e

# 모든 테스트 실행 (backend + user-web 자동 기동)
npm test

# 헤드풀 모드 (브라우저 창 표시)
npm run test:headed

# UI 모드 (인터랙티브 디버깅)
npm run test:ui

# 특정 테스트만
npx playwright test 01-login
npx playwright test 01-login:20    # 특정 라인
```

### 리포트 보기

```bash
npm run report
```

HTML 리포트가 브라우저에서 열림. 실패 시 스크린샷·비디오·trace 자동 첨부.

## 환경 구성

### Playwright webServer 자동 기동

`playwright.config.ts` 가 두 서버를 자동으로 띄움:

- **backend**: `DEV_MODE=true python -m uvicorn app.main:app --port 8000`
  - SQLite `backend/dev.db` 사용 (운영 DB 영향 없음)
- **user-web**: `npm run dev` (port 3000)
  - `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` 주입

이미 기동된 서버가 있으면 재사용 (`reuseExistingServer: !CI`).

### globalSetup

`helpers/global-setup.ts` 가 테스트 실행 전 1회 수행:

1. `backend/scripts/seed_l3_test_data.py` 실행 → 테스트 사용자 7명 + 가족 + 설문 4개 주입 (멱등)
2. `/api/auth/register` 호출 → e2e 전용 로그인 테스트 사용자 생성
   (`e2e-login@example.com` / `E2eTest123!`)
   - 이미 존재하면 400 수용 후 진행

### 인증 전략

두 가지 병행:

1. **실제 로그인 폼** (`01-login.spec.ts`):
   - `e2e-login@example.com` 사용
   - seed 의 `@test.local` 은 pydantic `EmailStr` 이 reserved TLD 로 거부하므로 별도 사용자 필요
2. **dev login 우회** (`02-consultation-entry.spec.ts` 외 모든 테스트):
   - `POST /api/dev/login-as/student_t1` → JWT 획득
   - `page.addInitScript` 로 `localStorage.user_token` 주입
   - 페이지 네비게이션 전에 이미 인증된 상태

`helpers/auth.ts` 의 `authenticateAs(page, request, identifier)` 헬퍼 사용.

## 데이터 초기화

backend 모델이 변경되어 기존 `dev.db` 스키마와 어긋나면 테스트 실패 발생. 그럴 땐:

```bash
# backend 프로세스 종료 후
rm backend/dev.db
```

다음 실행 시 backend 가 `create_all()` 로 최신 스키마 생성.

CI 환경에서는 매 실행마다 fresh runner 이므로 별도 초기화 불필요.

## 주의 사항

- **Windows 파일 잠금**: Playwright 가 비정상 종료되면 Next.js `.next/` 폴더 캐시가 잠겨 다음 실행에서 Module not found 에러. 해결: `rm -rf user-web/.next` 후 재실행.
- **백그라운드 서버 정리**: `npm test` 후에도 node/python 프로세스가 살아있을 수 있음. PowerShell 로 정리:
  ```powershell
  Get-Process node,python | Stop-Process -Force
  ```
- **순차 실행 (`fullyParallel: false`)**: SQLite 동시 쓰기 충돌 방지를 위해 `workers: 1`. 성능보다 안정성 우선.

## 구조

```
e2e/
├── package.json
├── playwright.config.ts       # webServer + projects + reporter 설정
├── tsconfig.json
├── helpers/
│   ├── global-setup.ts        # seed + e2e login user 등록
│   └── auth.ts                # devLogin / authenticateAs / SEED_USERS
└── tests/
    ├── 01-login.spec.ts
    └── 02-consultation-entry.spec.ts
```

## CI (GitHub Actions)

`.github/workflows/e2e.yml` — `backend/**`, `user-web/**`, `e2e/**`, 본 워크플로우 자체 변경 시 자동 실행.

**트리거**:
- `main` 브랜치 push
- PR to `main`
- 수동 실행 (workflow_dispatch)

**잡 구성**:
1. Python 3.12 + Node 20 설치 (pip/npm 캐시)
2. `backend/requirements.txt` + `user-web/package-lock.json` + `e2e/package-lock.json` 설치
3. Playwright Chromium 설치 (브라우저 바이너리 캐시 — 첫 실행 ≈90s, 캐시 히트 ≈5s)
4. Playwright 실행 (list/html/junit 리포터 3종)
5. 실패 시 HTML 리포트 + 스크린샷/비디오/trace 아티팩트 업로드 (7일 보관)
6. 항상 JUnit XML 업로드 (30일 보관, 테스트 히스토리 추적)

**동시 실행 방지**: `concurrency.group = e2e-${ref}` — 동일 PR/브랜치 새 푸시 시 기존 실행 취소.

**예상 실행 시간**: 2~3분 (서버 기동 + 5 테스트 실행)

### 실패 시 디버깅

1. Actions 탭에서 실패한 job 클릭
2. 좌측 Artifacts 에서 `playwright-report` 또는 `playwright-test-results` 다운로드
3. `playwright-report/index.html` 을 브라우저로 열면 각 테스트의 스크린샷/비디오/trace 확인 가능

---

## 향후 과제

- [ ] Sprint 2 테스트 작성 (5개)
- [x] ~~GitHub Actions 워크플로우~~ (2026-04-19 완료, `.github/workflows/e2e.yml`)
- [ ] backend 의 bcrypt + passlib 버전 호환성 정리 (현재 WARN 로 로그됨, 기능엔 영향 없음)
- [ ] Windows 의 `.next` 잠금 회피 (혹은 CI 만 사용하도록 정책화)
