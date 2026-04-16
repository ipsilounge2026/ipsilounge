# 체크리스트 시스템 (Checklist System)

> **목적**: 기획서(spec) ↔ 구현(implementation) 비교 검증 결과를
> **세션마다 다르게 나오지 않도록** 고정된 항목·고정된 판단 기준으로 관리한다.

이전에는 검증할 때마다 항목 수와 ✅/❌ 판단이 달라지는 문제가 있었다.
이 시스템은 그 문제를 두 축으로 차단한다:

1. **고정된 항목** — 기획서가 바뀌어도 항목 ID는 유지되고, 신규 항목은 별도 절차로 추가된다.
2. **고정된 판단 기준** — 모든 ✅/⚠️/❌ 는 `evidence`(파일경로:라인 / 빌드로그 / 스크린샷) 없이는 달 수 없다.

---

## 1. 폴더 구조

```
docs/checklist/
├── README.md              ← 이 파일
├── _schema.yaml           ← 공통 스키마 (status, levels, methods, priorities, area_codes)
├── _index.yaml            ← 모든 체크리스트 + 출처 spec 파일 + hash 등록부
│
├── survey/                ← 설문 영역
│   ├── high.yaml          ← 고등학교 설문 (high.json)
│   ├── pre-high.yaml      ← 예비고등학교 설문 (preheigh1.json)
│   └── senior.yaml        ← 선배 설문 (senior_pre_survey.json)
│
├── consultation/          ← 상담 영역
│   ├── booking.yaml       ← 상담 예약·취소·완료
│   └── satisfaction.yaml  ← 상담 후 만족도 (P1 #3)
│
├── analyzer/              ← 학생부 분석기 (school-record-analyzer)
│   ├── pipeline.yaml      ← Step 0~9
│   ├── rubric.yaml        ← 세특/창체/행특 평가 루브릭
│   └── report-output.yaml ← Excel 13 시트, PDF, 하이라이트
│
└── cross-cutting/         ← 영역을 가로지르는 공통 정책
    ├── auth.yaml          ← 인증·권한·관리자 역할
    ├── data-sharing.yaml  ← SHARED_DATA_ROOT 등 데이터 공유
    └── ux-policy.yaml     ← 자동저장·무기명·재시도 등 공통 UX
```

### 왜 "기획서별"이 아니라 "기능 영역별"인가
- 한 기획서(예: `CLAUDE.md`)에 여러 기능이 섞여 있다 → 영역별로 분리해야 검증이 깔끔하다.
- 같은 기능이 여러 기획서에 흩어져 있을 수 있다 → `_index.yaml`에서 N:M 매핑한다.
- 새 기획서가 추가돼도 영역이 같으면 기존 yaml에 spec_files 한 줄만 더 등록하면 된다.

---

## 2. 핵심 파일 두 개

### `_schema.yaml`
모든 체크리스트가 따르는 공통 정의:
- **status_legend**: pass / partial / fail / na / unverified / blocked (6종, 각 발급 조건 포함)
- **verification_levels**: L1(파일 존재) / L2(production 호출) / L3(런타임 동작)
- **check_methods**: build / lint / unit_test / preview_mcp / manual / na
- **priority_levels**: P0(블로커) / P1(품질저하) / P2(개선) / P3(선택)
- **id_patterns**: `{AREA}-{SUB}-{ASPECT}` 명명 규칙 + 영역코드 정의
- **item_schema**: 한 항목이 가져야 할 필수/선택 필드
- **needs_user_decision**: 모호한 항목은 사용자 결정 잠금 메커니즘

이 파일이 변하면 모든 체크리스트의 해석이 달라지므로 PR 필수.

### `_index.yaml`
체크리스트 ↔ spec 파일 매핑 + **hash 기반 변경 감지**:
- 각 spec 파일의 SHA256 hash와 마지막 동기화 일자를 기록
- 매 검증 세션 시작 시 현재 hash와 비교 → 차이(drift)가 있으면 사용자에게 보고
- 신규 spec 파일 후보는 `unregistered_spec_candidates` 에 임시 보관

---

## 3. 신규 기획서가 생기면 어떻게 되나? (자동화 워크플로우)

핵심 약속: **사용자가 "검증 항목 추가해줘"라고 매번 말할 필요 없다.**

### 자동 흐름
```
[1] 사용자: 새 spec 파일 작성/수정 (예: docs/new_feature.md)
        ↓
[2] 다음 검증 세션 시작 시, Claude가 자동 실행:
    - _index.yaml의 모든 spec_files 항목 hash 재계산
    - 새 파일 존재 / 기존 파일 변경 감지
        ↓
[3] Claude 자동 보고:
    "다음 변경이 감지되었습니다:
     - [변경] ipsilounge/CLAUDE.md (hash drift, +50줄)
       → consultation/booking.yaml 갱신 필요 (영향 항목 12개 추정)
     - [신규] docs/new_feature.md
       → 어느 영역에 매핑할까요? 후보:
         (a) 신규 yaml 생성 (예: cross-cutting/new-feature.yaml)
         (b) 기존 cross-cutting/ux-policy.yaml 에 통합
         (c) 무시 (체크리스트 대상 아님)"
        ↓
[4] 사용자: 매핑 방식 선택 (a/b/c)
        ↓
[5] Claude 자동 실행:
    - 선택에 따라 yaml 생성/수정 (.draft 파일로 먼저 작성)
    - 변경된 spec에서 신규 요구사항 추출 → 항목 후보 자동 생성
    - 사용자에게 .draft 보여주고 검토 요청
        ↓
[6] 사용자: 항목 검토 → 승인/수정 지시
        ↓
[7] Claude: .draft → 정식 yaml 로 승격, _index.yaml에 hash 갱신
```

### 사용자가 직접 해야 하는 일 vs Claude가 자동으로 하는 일

| 단계 | 누가 |
|------|------|
| spec 파일 변경 감지 | **Claude (자동)** |
| 변경 보고 | **Claude (자동)** |
| 영향받는 yaml 식별 | **Claude (자동)** |
| 신규 항목 후보 추출 | **Claude (자동, .draft에 작성)** |
| 매핑 방식 결정 (어느 yaml에) | 사용자 |
| 항목 최종 승인 | 사용자 |
| 모호한 요구사항 해석 | 사용자 (`needs_user_decision`) |

→ 사용자는 **결정만** 내리면 되고, 항목 enumeration·hash 관리·draft 작성은 Claude가 한다.

---

## 4. 검증 세션 표준 절차

매 검증 세션은 다음 순서로 진행한다.

### Step 1. Drift 체크 (자동)
- `_index.yaml`의 spec_files 전체 hash 재계산 → drift 보고
- drift가 있는 체크리스트 우선 갱신 또는 사용자에게 보류 의사 확인

### Step 2. 검증 대상 선택
- "전체" / "특정 영역" / "특정 yaml" 중 선택
- 기본은 _index.yaml 의 `status: in_progress` 항목 우선

### Step 3. 항목별 evidence 수집
- 각 항목의 `behavior_test` 단계를 따라 실제 검증
- L1: Glob/Grep으로 파일·함수 존재 확인 → `evidence: 파일경로:라인`
- L2: production 호출 경로 확인 → `evidence: 호출 파일경로:라인`
- L3: build / preview_mcp / manual → `evidence: 빌드로그 경로 / 테스트명 / 스크린샷 경로`

### Step 4. status 부여 (엄격 규칙)
- ✅ pass: **모든** behavior_test 단계 통과 + evidence 필드 채워짐
- ⚠️ partial: 일부만 통과 → notes에 미통과 단계 명시
- ❌ fail: 핵심 기대결과 불성립
- — na: 해당 시스템 적용 불가 → reason 필수
- 🔵 unverified: 환경 제약으로 검증 불가 → 사용자 수동 확인 항목으로 분리
- 🚫 blocked: 선결 항목 미해결 → blocked_by 필수

**evidence 필드가 비어 있으면 ✅ 부여 금지.** 이것이 "검증했다 거짓말" 차단의 핵심.

### Step 5. 결과 요약 보고
- 영역별 pass/partial/fail/blocked/unverified 카운트
- P0/P1 fail 항목 우선 나열
- 다음 세션에서 이어갈 항목 목록

---

## 5. 항목 작성 가이드

### ID 명명
형식: `{AREA}-{SUB}-{ASPECT}`
- `HIGH-A-A4-input`     — high.json A 카테고리 A4 질문 입력 동작
- `HIGH-B-B5-calculate` — high.json B 카테고리 B5 자동산출 계산
- `ANALYZER-STEP8-rubric` — CLAUDE.md Step 8 루브릭

### behavior_test (가장 중요)
"이 동작이 일어나야 한다"를 **사람이 따라할 수 있을 정도로** 단계화한다.
모호한 표현 금지 ("잘 작동한다" → "select 변경 시 onChange 호출되어 상태가 변경된다").

```yaml
behavior_test:
  - "B1 학기 그리드 컴포넌트 마운트"
  - "A4 응답 변경 → resolved_semesters 재계산되어 행 수 일치"
  - "각 행 select_dynamic 필드 옵션이 category 의존성에 따라 채워짐"
  - "값 입력 → onChange로 상위 상태에 반영"
```

### 시스템별 status
한 항목은 backend / user_web / mobile / admin_web 4개 시스템에서 각각 평가:
```yaml
backend:
  status: na
  reason: "B는 프론트 입력 위젯이라 backend 적용 없음"
user_web:
  status: pass
  L1: { evidence: "user-web/src/components/survey/heavy/SchoolGradeMatrix.tsx:69" }
  L2: { evidence: "user-web/src/components/survey/QuestionRenderer.tsx:??" }
  L3: { evidence: "build log: 2026-04-15 user-web build OK in 20.1s" }
mobile:
  status: unverified
  note: "Flutter 미구현 영역, 사용자 수동 확인 필요"
admin_web:
  status: na
  reason: "관리자에는 학생 설문 입력 화면 없음"
```

### 모호한 항목
즉시 답할 수 없는 해석 필요 항목은:
```yaml
needs_user_decision: true
interpretation_question: |
  "high.json B5 자동산출은 '실시간(입력시마다)' 인지 '제출시점 1회' 인지
   기획서에 명시되지 않음. 어느 쪽인지 결정 필요."
user_decision: ""    # 사용자가 채워야 잠금
```
사용자가 결정하기 전까지 status 부여 금지.

---

## 6. .draft 파일 규칙

자동 생성된 항목 후보는 `*.yaml.draft` 로 먼저 저장한다.

```
docs/checklist/survey/high.yaml          ← 사용자 승인 완료된 정식 항목
docs/checklist/survey/high.yaml.draft    ← Claude가 자동 추출한 미승인 후보
```

- 정식 yaml에는 사용자가 승인한 항목만 들어간다.
- .draft는 자유롭게 갱신/삭제 가능 (commit 가능, 단 검증 결과에 영향 없음).
- 사용자가 ".draft 항목 N번을 정식으로 승격"이라고 지시하면 Claude가 이동시킨다.

---

## 7. 자주 묻는 것

**Q. 같은 spec 파일이 여러 yaml에 등록될 수 있나?**
A. 가능하다. `_index.yaml`에서 한 spec_file이 여러 checklist의 spec_files 배열에 들어가도 된다. 예: `ipsilounge/CLAUDE.md`는 booking·satisfaction·auth 셋에 동시 등록.

**Q. yaml 항목이 너무 많아지면?**
A. 영역 yaml 안에서 카테고리별로 yaml 분할 가능 (예: `survey/high/A.yaml`, `survey/high/B.yaml`). 단 분할 시 `_index.yaml` 매핑도 갱신해야 한다.

**Q. 환경 제약(서버 미가동 등)으로 L3 검증이 불가능하면?**
A. status를 `unverified` 로 두고 note에 사유 기록. "사용자 수동 확인 필요" 보고서에 포함되어 다음 세션에서 사용자가 직접 확인하도록 안내한다.

**Q. 한 항목이 일부 시스템만 통과하면 전체 status는?**
A. 시스템별 status는 독립적이다. 항목 전체의 종합 등급은 보고서 생성 시 시스템별 status 분포로 표시한다 (예: `user_web: ✅ / mobile: 🔵 / admin_web: —`).

---

## 8. 운영 체크리스트 (관리자용)

- [ ] 신규 spec 파일을 만들면 다음 세션에서 Claude의 drift 보고를 확인한다
- [ ] 매핑 결정 후 Claude가 생성한 .draft를 검토한다
- [ ] 검증 세션 결과 보고에서 P0 fail 항목은 즉시 처리한다
- [ ] 분기마다 `_index.yaml`의 last_audited 갱신
- [ ] 6개월 이상 `unverified` 상태인 항목은 manual 검증 일정 수립
