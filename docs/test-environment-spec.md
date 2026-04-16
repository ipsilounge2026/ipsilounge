# 검증 환경(Test Environment) 명세서

> **목적**: 체크리스트 시스템의 **L3 런타임 검증**이 매 세션마다 5분 이내에 시작될 수
> 있도록, 재현 가능한 dev 환경 4개 자산을 정의한다.
>
> 이 문서가 정의하는 요구사항을 `cross-cutting/test-environment.yaml` 체크리스트가
> 검증한다. 이 4개 자산이 모두 ✅ pass 상태여야 다른 영역(survey/, consultation/,
> analyzer/)의 L3 검증이 의미 있는 수준으로 진행 가능하다.

**버전**: 1.0.0
**최초 작성**: 2026-04-15
**대상 환경**: Windows + Git Bash + Python 3.14 + Node.js (Docker 미설치 가정)

---

## 1. 배경 — 왜 만드는가

현재 L3(런타임) 검증을 시도하면 매번 다음 4개 벽에 부딪힌다:

1. **PostgreSQL 부재** — 사용자 환경에 DB가 없어 backend 기동 불가
2. **테스트 데이터 부재** — 사용자/설문 인스턴스를 매번 수동 생성
3. **인증 플로우 부담** — 로그인 → 토큰 → API 호출을 매 세션 반복
4. **검증 절차의 비표준성** — preview_mcp 호출 패턴이 매번 다름

이 4개를 1회만 정비하면, 이후 모든 영역의 L3 검증이 다음 한 줄로 시작된다:

```bash
python ipsilounge/docs/checklist/_runners/l3_<area>.py
```

---

## 2. 자산 1 — Dev 모드 SQLite 분기 (DEV_MODE 환경 변수)

### 2-1. 요구사항

**요구 ID**: `TEST-ENV-DEV-MODE-001`

backend(`ipsilounge/backend/app/`)는 환경 변수 `DEV_MODE`가 `"true"`로 설정되었을 때
다음과 같이 동작해야 한다:

1. **DB**: PostgreSQL 대신 SQLite(`sqlite+aiosqlite:///./dev.db`)를 사용
2. **JSONB → JSON**: `Column(JSONB)` 사용 컬럼이 SQLite에서도 동작 (SQLAlchemy `JSON` 타입으로 분기, 또는 `JSONB().with_variant(JSON, "sqlite")`)
3. **테이블 자동 생성**: 기동 시 `Base.metadata.create_all()` 호출 (마이그레이션 없이 즉시 사용)
4. **CORS**: `localhost:3000` 허용 유지
5. **dev 전용 라우터 마운트**: `/api/dev/*` 엔드포인트 활성화 (자산 3)

`DEV_MODE`가 미설정이거나 `"true"`가 아니면 운영 코드와 100% 동일하게 동작
(PostgreSQL, dev 라우터 비노출).

### 2-2. 영향 범위

- `app/config.py` — `DEV_MODE: bool = False` 필드 추가
- `app/database.py` — `DEV_MODE` 참조하여 engine URL 분기, `create_all` 분기
- `app/main.py` — `DEV_MODE`일 때 `dev_router` include
- `app/models/*.py` — JSONB 컬럼은 `JSON().with_variant(JSONB, "postgresql")` 패턴으로 변경
- 신규 의존성: `aiosqlite`

### 2-3. 비요구사항 (지금 단계에서 안 함)

- 운영 backend의 PostgreSQL 동작 변경 (절대 금지)
- alembic 마이그레이션 SQLite 호환성 (dev에서는 create_all로 충분)
- 데이터 영속성 (dev DB는 매 검증마다 삭제 후 재생성)

---

## 3. 자산 2 — 시드 스크립트 (`scripts/seed_l3_test_data.py`)

### 3-1. 요구사항

**요구 ID**: `TEST-ENV-SEED-001`

`ipsilounge/backend/scripts/seed_l3_test_data.py` 는 다음을 수행한다:

1. **사전 조건**: `DEV_MODE=true`, dev SQLite 파일이 없거나 비어 있음 (있으면 삭제 옵션 제공)
2. **테이블 생성**: backend의 모든 모델로 `create_all()` 실행
3. **테스트 사용자 7명 생성**:
   | 식별자 | 이메일 | member_type / role | 메모 |
   |--------|--------|---------------------|------|
   | student_t1 | student.t1@test.local | student | A4 시점 = T1 (예비 고1) |
   | student_t2 | student.t2@test.local | student | A4 시점 = T2 (고1~고2) |
   | student_t3 | student.t3@test.local | student | A4 시점 = T3 (고2~고3) |
   | student_t4 | student.t4@test.local | student | A4 시점 = T4 (고3 진입) |
   | parent_a | parent.a@test.local | parent | student_t2의 학부모 |
   | admin_a | admin.a@test.local | admin (super_admin) | 관리자 |
   | counselor_a | counselor.a@test.local | admin (counselor) | 상담사 |
4. **학부모-자녀 연결**: parent_a ↔ student_t2 (`FamilyLink`, status=active)
5. **설문 인스턴스 생성**: 각 학생당 `ConsultationSurvey` 1개씩
   - survey_type="high", timing=학생의 시점(T1/T2/T3/T4), mode="full", status="draft"
   - answers = {} (빈 객체) — L3 검증이 채울 자리
6. **A4 사전 응답 주입**: 각 학생의 설문에 `answers["A"]["A4"]` = 시점 값을 미리 넣어둠 (timings 필터 동작 검증용)
7. **출력**: 각 사용자의 ID, 이메일, 설문 인스턴스 ID를 JSON으로 stdout 출력
8. **멱등성**: 같은 이메일이 있으면 skip (중복 생성 방지)

### 3-2. 사용 예시

```bash
cd ipsilounge/backend
DEV_MODE=true python scripts/seed_l3_test_data.py --reset
# 출력:
# {
#   "users": {
#     "student_t1": {"id": "uuid", "email": "...", "survey_id": "uuid"},
#     ...
#   }
# }
```

이 출력은 자산 4(L3 harness)가 입력으로 사용한다.

---

## 4. 자산 3 — Dev 전용 인증 우회 (`POST /api/dev/login-as/{identifier}`)

### 4-1. 요구사항

**요구 ID**: `TEST-ENV-DEV-LOGIN-001`

backend에 다음 라우터를 신설:

- **파일**: `app/routers/dev_routes.py`
- **마운트 조건**: `DEV_MODE=true`일 때만 `app/main.py`에서 include (운영 빌드에는 노출 0)
- **엔드포인트**: `POST /api/dev/login-as/{identifier}`
  - `identifier` = 시드 스크립트가 만든 식별자 (`student_t1` 등)
  - 인증 불필요 (DEV_MODE 자체가 게이트)
  - 동작: 해당 사용자/관리자 조회 → 정상 JWT(access + refresh) 발급 → 응답
  - 응답 형식: 운영 `/api/auth/login`과 100% 동일 (`{access_token, refresh_token, user_info}`)

### 4-2. 보안 가드 (필수)

1. `DEV_MODE != "true"` 시 라우터 자체가 마운트되지 않음
2. 라우터 내부에서 한 번 더 `settings.DEV_MODE` 체크 (이중 가드)
3. 모든 응답 헤더에 `X-Dev-Mode: true` 추가 (운영 트래픽 혼동 방지)
4. 운영 빌드 CI/CD에서 `DEV_MODE=true` 환경 변수가 없음을 검증하는 테스트 추가 (Phase 6 과제)

### 4-3. 사용 예시

```bash
curl -X POST http://localhost:8000/api/dev/login-as/student_t2
# {
#   "access_token": "eyJ...",
#   "refresh_token": "eyJ...",
#   "user_info": {"id": "...", "member_type": "student", ...}
# }
```

---

## 5. 자산 4 — L3 검증 Harness (`docs/checklist/_runners/l3_high.py`)

### 5-1. 요구사항

**요구 ID**: `TEST-ENV-L3-HARNESS-001`

`ipsilounge/docs/checklist/_runners/l3_high.py` 는 다음을 수행한다:

1. **사전 점검**:
   - backend가 `localhost:8000`에서 응답하는지 health check
   - user-web이 `localhost:3000`에서 응답하는지 health check
   - DEV_MODE 활성화 여부 확인 (`/api/dev/health` 엔드포인트로)
2. **로드 대상 yaml**: `survey/high.yaml` 의 `items:` 리스트
3. **각 항목별 실행**:
   - `behavior_test` 단계 1개씩을 preview_mcp 호출로 실행
   - 단계별로 screenshot 저장 (`docs/checklist/_evidence/high/{item_id}/{step_n}.png`)
   - 콘솔 로그/네트워크 로그 캡처
4. **결과 기록**:
   - 각 항목의 `user_web.L3.evidence` 필드를 자동 갱신
   - 통과 시: `evidence: "preview_mcp run 2026-04-15 14:30, screenshots: docs/checklist/_evidence/high/HIGH-A-A1-input/"`
   - 실패 시: `status: fail`로 변경 + `note: "단계 N 실패: <오류 메시지>"`
5. **요약 보고**:
   - 전체 N개 항목 중 pass M개 / fail K개 / skipped J개
   - 실패 항목별 상세 (어느 step에서 왜 실패했는지)
6. **재실행 안전성**: 같은 항목을 다시 실행하면 evidence 갱신 (덮어쓰기 OK)

### 5-2. preview_mcp 호출 패턴 (표준화)

각 behavior_test 단계는 다음 4단계 중 하나로 매핑:

```python
def step_navigate(url): ...        # mcp__Claude_Preview__preview_start / 페이지 이동
def step_fill(selector, value): ... # mcp__Claude_Preview__preview_fill
def step_click(selector): ...      # mcp__Claude_Preview__preview_click
def step_assert(predicate): ...    # mcp__Claude_Preview__preview_eval / preview_inspect
```

각 항목의 `behavior_test` 자연어 단계를 위 4가지 중 하나로 매핑하는 메타데이터를
yaml 내에 추가 (`l3_steps:` 필드 신설).

### 5-3. 출력 디렉토리

- `docs/checklist/_evidence/high/{item_id}/` — screenshot, console.log, network.log
- `docs/checklist/_runs/high_{timestamp}.json` — 전체 실행 결과 요약 (CI 통합 대비)

### 5-4. 비요구사항 (지금 단계에서 안 함)

- 다른 영역(preheigh1, senior, booking 등) harness — 동일 패턴으로 복제 가능하므로 high 완성 후 스크립트 복제
- 시각적 회귀(visual regression) — Phase 후속 과제
- CI/CD 자동화 — 로컬 수동 실행 우선

---

## 6. 4개 자산 간 의존 관계

```
[자산 1: DEV_MODE 분기]
        │
        ↓
[자산 2: seed 스크립트]  ←─  자산 1이 있어야 SQLite에 시드 가능
        │
        ↓
[자산 3: dev_login_as]   ←─  자산 1+2가 있어야 의미 있음 (DEV_MODE에서만 노출, 시드 사용자가 있어야 발급 가능)
        │
        ↓
[자산 4: L3 harness]     ←─  자산 3으로 인증 우회한 뒤 검증 수행
```

→ 구현 순서: **자산 1 → 자산 2 → 자산 3 → 자산 4** (Phase 3-1 ~ 3-4)

---

## 7. 완료 기준 (Phase 4 자체 검증)

`cross-cutting/test-environment.yaml` 의 4개 항목이 모두 다음 상태일 때 인프라 완성:

- `backend.status: pass` + L1 + L2 + L3 evidence 채워짐
- 4개 항목의 `behavior_test` 모든 단계가 실제 동작 확인됨

이후 Phase 5(`high.yaml` 36항목 L3 검증)는 다음 한 줄로 시작:

```bash
DEV_MODE=true python ipsilounge/docs/checklist/_runners/l3_high.py
```

---

## 8. 향후 확장

- **다른 영역 harness 복제**: `l3_pre_high.py`, `l3_senior.py`, `l3_booking.py` …
- **CI 통합**: GitHub Actions에서 `DEV_MODE=true` 자동 검증 후 evidence를 PR comment로 게시
- **시각적 회귀**: screenshot 비교로 UI 변경 감지
- **mobile harness**: Flutter 앱은 별도 harness (driver/integration_test 기반) — 본 문서 범위 외
