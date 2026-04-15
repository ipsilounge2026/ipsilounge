# 상담 사전조사(학습상담) 시스템 구축 계획

> **작성일**: 2026-04-09
> **목표 완료일**: 2026-06-04 (약 8주)
> **실사용 시작 목표**: 2026-06-04 ~
> **기반 기획서**:
> - `고등학교 상담시스템_기획서_V3.md` (1,174줄)
> - `예비고1 상담시스템_기획서_V2_2.md` (518줄)

---

## 0. 왜 이 문서를 작성하는가

현재 `user-web/src/app/consultation/page.tsx`의 `step === "survey"` 단계가 플레이스홀더("사전 조사 페이지는 준비 중입니다")로만 존재하며, 기획서가 정의한 학습상담 진행 프로세스가 거의 미구현 상태이다. 5월 1일 원래 실사용 목표는 현실적으로 불가능하므로, **기획서 최종 완료 상태 + 모바일 동시 지원** 을 목표로 8주 로드맵을 세운다.

---

## 1. 구현 범위 (기획서 최종 완료 상태)

### 1-1. 학생/학부모 입력 영역
- **예비고1 상담 설문**: 카테고리 A~G (합산 34~52분)
- **고등학교 상담 설문**: 카테고리 A~G + T1~T4 자동 판정 + Full/Delta 분기
- 이전 답변 자동 채움 (Delta 설문)
- 변경 여부 체크 UI (D/E 카테고리)

### 1-2. 백엔드 자동 계산 영역
- 내신 성적 추이 자동 산출 (B5)
- 과목별 평균/표준편차 자동 계산
- 취약 유형 분석
- 학습법 변경 감지 (Delta diff)

### 1-3. 상담사 리뷰 대시보드
- 학생 답변 조회 (카테고리별 보기)
- 시각화: 내신 추이, 과목별 분포, 모의고사 추이, 학습법 레이더 차트 등
- Delta 비교: 이전 상담 답변 대비 변경점 하이라이트
- 상담사 메모 작성/저장
- 자동 생성된 리포트 (PDF 출력 가능)

### 1-4. 상담 중 사용 화면
- 50분 상담 진행 중 주제별 타이머/체크리스트
- 상담 액션 플랜 입력

---

## 2. 플랫폼 전략 (카테고리별 분리 + 이어쓰기)

### 2-1. 원칙
- **가벼운 카테고리** (선택/드롭다운/라디오 위주) → 모바일 + 웹 모두 지원
- **무거운 카테고리** (학기×과목 행렬, 긴 텍스트, 슬라이더 다수) → 웹 전용 권장
- **카테고리 순서는 강제** (A→G), 단 **모든 카테고리에서 "건너뛰기" 허용** (모바일·웹 양쪽)
- **모바일에서 무거운 카테고리 진입 시** → 4가지 옵션 제시:
  1. **계속 모바일에서 하기** (가능하지만 비권장)
  2. **웹 링크 복사** (지금 다른 디바이스에서 작성)
  3. **이메일로 링크 받기** (나중에 PC에서 작성)
  4. **건너뛰기 (나중에 입력하기)** ← 권장 동선
- **모바일에서 가벼운 카테고리** 또는 **웹에서 모든 카테고리** → 입력 화면에 작은 "나중에 입력" 버튼 제공 (건너뛰기)
- 최종 제출 전에 **미완료/건너뛴 카테고리가 있으면 제출 차단** + 안내
- **이어쓰기** 기능으로 플랫폼 간 자유 전환 지원

### 2-2. 카테고리별 플랫폼 분류

| 플랫폼 | 고등학교 설문 | 예비고1 설문 | 이유 |
|---|---|---|---|
| 📱 **모바일 + 웹** | A 기본정보 | A 기본정보 | 드롭다운/선택형 |
| 📱 **모바일 + 웹** | E 진로·전형 | B 진로·대입 | 라디오/체크박스 |
| 📱 **모바일 + 웹** | F 학부모 | F 비교과 | 선택형 |
| 📱 **모바일 + 웹** | G (T4 전용) | G 학부모 | 선택형 |
| 💻 **웹 전용** | **B 내신 (학기×과목)** | **C 중학 학기별 성적** | 행렬 입력 |
| 💻 **웹 전용** | **C 모의고사·취약 유형** | **D 학습 습관** | 긴 텍스트 |
| 💻 **웹 전용** | **D 학습법·스케줄** | **E 과목별 준비율** | 슬라이더 다수 |

### 2-3. 카테고리 순서
- **순서 강제** (A → B → C → D → E → F → G)
- 기획서의 피로도 설계를 준수
- 단, 모바일에서는 무거운 카테고리 "건너뛰기" 허용 (순서는 유지하되 임시 패스)

### 2-4. 이어쓰기 링크 전달
- **딥링크 버튼** (앱에서 클릭하면 웹 브라우저로 전환)
- **이메일 전송** (나중에 PC에서 작업 시)
- 둘 다 제공

### 2-5. 사용자 흐름 예시 (모바일 → 웹 단방향)

```
[모바일 앱]
  학생이 설문 시작
  ↓
  A (기본정보) 입력 → 저장
  ↓
  B (진로) 입력 → 저장
  ↓
  C (중학 성적) 진입 → "건너뛰기" 선택
  ↓
  D (학습 습관) 진입 → "건너뛰기" 선택
  ↓
  E (과목별 준비율) 진입 → "건너뛰기" 선택
  ↓
  F (비교과) 입력 → 저장
  ↓
  G (학부모) 입력 → 저장
  ↓
  최종 제출 시도
  ↓
  ┌──────────────────────────────────────┐
  │ 미완료 카테고리 3개가 남아있습니다:   │
  │   • C 중학 성적                        │
  │   • D 학습 습관                        │
  │   • E 과목별 준비율                    │
  │                                        │
  │ 입력이 많아 웹에서 진행하시는 게      │
  │ 편리합니다.                            │
  │                                        │
  │ [💻 웹 링크 복사]                      │
  │ [📧 이메일로 링크 받기]                │
  └──────────────────────────────────────┘

[웹 브라우저]
  로그인
  ↓
  "작성 중인 설문이 있습니다 (3/7 미완료)"
  ↓
  미완료 카테고리부터 자동 진입 (C → D → E 순)
  ↓
  C → D → E 입력 → 저장
  ↓
  최종 제출 → ✅ 완료
```

**핵심 원칙: 모바일 → 웹은 단방향 동선** (왔다갔다 혼란 방지)

---

## 3. 기술 설계

### 3-1. 질문 스키마는 JSON 선언형으로 관리

- 위치: `backend/app/surveys/schemas/preheigh1.json`, `high.json`
- 질문 추가/변경 시 **코드 수정 없이 JSON만 변경**
- 백엔드와 프론트 모두 동일한 JSON을 참조

#### 스키마 예시
```json
{
  "id": "preheigh1",
  "version": "1.0",
  "title": "예비고1 고등학교 지원 전략 & 학습 준비 상담",
  "target": "중학교 3학년",
  "estimated_time_minutes": [34, 52],
  "categories": [
    {
      "id": "A",
      "order": 1,
      "title": "기본 정보",
      "description": "학생 기본 정보와 희망 고등학교",
      "estimated_time_minutes": [2, 3],
      "fatigue": "light",
      "platforms": ["web", "mobile"],
      "questions": [
        {
          "id": "A1",
          "type": "text",
          "label": "학생 이름",
          "required": true
        }
      ]
    }
  ]
}
```

### 3-2. 질문 타입 (renderer가 지원해야 할 것)

| 타입 | 설명 | 예시 |
|---|---|---|
| `text` | 한 줄 텍스트 | 학생 이름 |
| `textarea` | 긴 텍스트 | 학습 고민 서술 |
| `select` | 단일 선택 드롭다운 | 계열 선택 |
| `multi_select` | 다중 선택 드롭다운 | 희망 고교 유형 |
| `radio` | 라디오 버튼 | 학교 유형 |
| `checkbox` | 단일 체크박스 | 자유학기제 여부 |
| `checkboxes` | 다중 체크박스 | 관심 진로 분야 |
| `slider` | 1~10점 슬라이더 | 대입 전형 이해도 |
| `number` | 숫자 | 원점수 |
| `rank` | 순위 선택 | 준비하고 싶은 것 상위 5개 |
| `group_select` | 그룹별 1개 선택 | 고교 선택 기준 5개 그룹 |
| `subject_grade_row` | 과목별 성적 행 | 학기 × 과목 × 여러 필드 |
| `conditional` | 조건부 표시 | 자유학기제 체크 시 입력 생략 |
| `delta_change_check` | 변경 여부 확인 | "이전과 동일/변경" |

### 3-3. 백엔드 DB 스키마

```python
class ConsultationSurvey(Base):
    __tablename__ = "consultation_surveys"

    id: UUID = Column(primary_key=True)
    user_id: UUID = FK(users.id)

    survey_type: str           # "preheigh1" | "high"
    timing: Optional[str]       # "T1" | "T2" | "T3" | "T4" (고등만)
    mode: str                   # "full" | "delta"

    # 답변 저장 (JSONB)
    answers: dict               # {"A1": "홍길동", "A2": "..." ...}

    # 카테고리별 진행 상태 (JSONB)
    # {"A": "completed", "B": "completed", "C": "skipped",
    #  "D": "skipped", "E": "skipped", "F": "completed", "G": "in_progress"}
    category_status: dict

    # 상태 관리
    status: str                 # "draft" | "submitted"
    last_category: Optional[str]  # 이어쓰기용 마지막 작성 카테고리

    # 시작/마지막 작성 플랫폼 (분석용)
    started_platform: str       # "web" | "mobile"
    last_edited_platform: str   # "web" | "mobile"

    # 연결
    booking_id: Optional[UUID]   # consultation_bookings와 연결

    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime]
```

### 3-4. 백엔드 API 엔드포인트

```
# 학생/학부모용
GET    /api/consultation-surveys/schema/{type}      # 스키마 JSON 조회
POST   /api/consultation-surveys                    # 새 설문 생성 (draft)
GET    /api/consultation-surveys/me                 # 내 설문 목록 (이어쓰기용)
GET    /api/consultation-surveys/{id}               # 특정 설문 조회
PATCH  /api/consultation-surveys/{id}               # 답변 부분 저장
POST   /api/consultation-surveys/{id}/submit        # 최종 제출
GET    /api/consultation-surveys/{id}/deeplink      # 이어쓰기 링크 생성
POST   /api/consultation-surveys/{id}/send-email    # 이어쓰기 이메일 전송

# 자동 계산
GET    /api/consultation-surveys/{id}/analysis      # 자동 분석 결과 (내신 추이 등)

# 상담사용
GET    /api/admin/consultation-surveys              # 전체 조회
GET    /api/admin/consultation-surveys/{id}         # 특정 학생 답변 상세
GET    /api/admin/consultation-surveys/{id}/delta   # 이전 상담 대비 diff
POST   /api/admin/consultation-surveys/{id}/memo    # 상담사 메모 저장
GET    /api/admin/consultation-surveys/{id}/report  # 자동 리포트 PDF
```

### 3-5. 프론트 동적 폼 렌더러 구조 (웹)

```
DynamicSurvey (컨테이너)
  ├─ ProgressBar (카테고리 진행도)
  ├─ CategoryNav (A~G 탭, 완료 표시)
  ├─ CategoryPage (현재 카테고리)
  │   ├─ QuestionRenderer (질문 타입별 컴포넌트)
  │   │   ├─ TextInput
  │   │   ├─ SelectInput
  │   │   ├─ SliderInput
  │   │   ├─ SubjectGradeRow
  │   │   └─ ... (타입별)
  │   └─ SaveButton (부분 저장)
  └─ SubmitButton (최종 제출)
```

### 3-6. 모바일 구조 (Flutter)
- 동일한 JSON 스키마 참조
- 각 질문 타입별 Flutter 위젯 구현
- 무거운 카테고리 진입 시 `WebViewScreen` 또는 딥링크로 웹 전환

---

## 4. 로드맵 (8주)

### Week 1 (4/10~4/16) — 스키마 + 공통 인프라
| Day | 작업 |
|---|---|
| 1~3 | 기획서 → JSON 스키마 변환 (예비고1 + 고등학교) |
| 4 | 백엔드 DB 모델 + migration |
| 5 | 기본 CRUD API |
| 6 | T1~T4 판정 + Full/Delta 로직 |
| 7 | 이어쓰기 API (draft 저장, 딥링크, 이메일) |

### Week 2 (4/17~4/23) — 프론트 폼 엔진 + 예비고1 학생 UI (웹)
| Day | 작업 |
|---|---|
| 1~2 | 동적 폼 렌더러 기반 + 질문 타입 10+개 |
| 3 | 예비고1 카테고리 A, B (가벼움, 모바일도 가능) |
| 4 | 예비고1 카테고리 C (중학 성적, 웹 전용) |
| 5 | 예비고1 카테고리 D (학습 습관, 웹 전용) |
| 6 | 예비고1 카테고리 E (과목별 준비율, 웹 전용) |
| 7 | 예비고1 카테고리 F, G (가벼움) |

### Week 3 (4/24~4/30) — 고등학교 학생 UI (웹)
| Day | 작업 |
|---|---|
| 1 | T1~T4 자동 판정 + Full/Delta 분기 UI |
| 2 | 카테고리 A (기본) |
| 3 | 카테고리 B (내신, 학기×과목 행렬) |
| 4 | 카테고리 C (모의고사, 취약 유형) |
| 5 | 카테고리 D (학습법) + Delta 변경 여부 UI |
| 6 | 카테고리 E, F, G |
| 7 | 예비고1 + 고등학교 통합 테스트 |

### Week 4 (5/1~5/7) — 모바일 학생 UI (Flutter)
| Day | 작업 |
|---|---|
| 1~2 | 동적 폼 렌더러 Flutter 버전 + 질문 타입 구현 |
| 3 | 예비고1 가벼운 카테고리 (A, B, F, G) |
| 4 | 고등학교 가벼운 카테고리 (A, E, F, G) |
| 5 | 무거운 카테고리 → 웹 전환 안내 + 딥링크 |
| 6 | 이어쓰기 동작 테스트 (앱→웹→앱 왕복) |
| 7 | 앱 통합 테스트 + 버그 수정 |

### Week 5 (5/8~5/14) — 상담사 조회 대시보드 + 자동 계산
| Day | 작업 |
|---|---|
| 1 | 자동 계산 백엔드 (내신 추이, 평균 등) |
| 2 | Delta diff 계산 로직 |
| 3~4 | 상담사 조회 UI (카테고리별 보기) |
| 5 | 상담사 메모 UI |
| 6~7 | 학생 답변 검색/필터 |

### Week 6 (5/15~5/21) — 시각화 + Delta 비교
| Day | 작업 |
|---|---|
| 1 | 차트 라이브러리 세팅 (recharts 또는 chart.js) |
| 2 | 내신 추이 차트 |
| 3 | 과목별 분포 차트 |
| 4 | 모의고사 추이 차트 |
| 5 | 학습법 레이더 차트 |
| 6 | Delta 비교 하이라이트 UI |
| 7 | 시각화 QA |

### Week 7 (5/22~5/28) — 자동 리포트 + 상담 진행 화면
| Day | 작업 |
|---|---|
| 1~2 | 자동 리포트 생성 로직 (PDF) |
| 3 | 리포트 템플릿 디자인 |
| 4 | 상담 진행 중 타이머/체크리스트 UI |
| 5 | 상담 액션 플랜 입력 UI |
| 6~7 | 리포트 QA + 상담 진행 화면 QA |

### Week 8 (5/29~6/4) — 통합 테스트 + 배포
| Day | 작업 |
|---|---|
| 1~2 | 전체 E2E 테스트 (학생 입력 → 제출 → 상담사 조회 → 상담 진행 → 리포트) |
| 3 | 버그 수정 |
| 4 | 성능 최적화 (긴 설문 저장 속도 등) |
| 5 | 최종 배포 + 모바일 앱 빌드 |
| 6~7 | 내부 리뷰 + 사용자 가이드 문서 작성 |

### 실사용 시작: **2026-06-04 ~**

---

## 5. 원칙 요약

1. **스키마 먼저, 코드는 그 위에** — JSON 스키마가 진실의 원천. 백엔드·웹·모바일 모두 동일 스키마 참조.
2. **웹/모바일 동시 개발** — 모바일 드리프트를 구조적으로 차단.
3. **이어쓰기로 플랫폼 경계 허물기** — 모바일 사용자도 Feature 완결성 확보.
4. **무거운 입력은 웹에서** — UX 우선, 억지로 모바일에 구겨넣지 않음.
5. **카테고리 순서 강제** — 기획서의 피로도 설계 존중.

---

## 6. 예약 리드타임 정책 (공통)

학생부분석·학종전략·학습상담 **3개 상담 유형 모두 동일 원칙: 사전 자료 제출일 기준 7일 이후부터 예약 가능**.

| 상담 유형 | 기준일 | 산식 | 근거 |
|---|---|---|---|
| 학생부분석 라운지 | 학생부 PDF 업로드일 (`AnalysisOrder.created_at`) | uploaded_at + 7 days | 상담사 분석·리포트 준비 시간 |
| 학종전략 라운지 | 학생부 PDF 업로드일 (`AnalysisOrder.created_at`) | uploaded_at + 7 days | 상담사 분석·입결 조회 시간 |
| **학습상담 라운지** | **사전 설문 제출일** (`ConsultationSurvey.submitted_at`) | **submitted_at + 7 days** | **상담사가 자동 계산 결과를 검토·분석 코멘트 작성할 시간** |

**구현 위치:**
- 자격 사전 조회: `GET /api/analysis/consultation-eligible?type=학습상담` → `earliest_date` 반환
- 예약 시 강제 검증: `POST /api/consultation/book` 내부 `_check_lead_time()` (backend/app/routers/consultation.py)
- 위반 시 HTTP 400 + 한국어 사유 메시지

**UI 표시:**
- 예약 캘린더 상단 파란색 배너에 "${earliest_date} 이후부터 예약 가능" 안내
- 학습상담의 경우 문구를 "사전 설문 제출일 기준 7일 이후(${earliest_date})부터 예약 가능합니다. (상담사 분석 검토 시간 확보)"로 변형
- 캘린더에서 `earliest_date` 이전 날짜는 선택 불가(회색)

---

## 7. 자동 분석 결과 검증 규칙 (Auto-Repair + 4-State)

### 7.1 문제의식

상담사가 관리자 웹에서 자동 계산 결과를 확인할 때 점수·등급·코멘트 불일치가 발견되는 경우가 있다. **상담사가 일일이 override로 덮어쓰는 방식은 비효율적이며, 오류가 리포트에 그대로 실리는 사고를 낳는다.** 따라서 **시스템이 자동 복구를 시도하고, 복구 불가한 항목만 상담 진행을 차단**하는 구조로 전환한다.

### 7.2 4-상태 모델

| 상태 | 의미 | 상담사 UI | 상담 진행 | 리포트 작성 | 학생 전달 |
|---|---|---|---|---|---|
| `pass` | 모든 검증 통과 | 초록 뱃지 | ✅ | ✅ | ✅ |
| `repaired` | P1/P2 이슈를 자동 복구 완료 | 파란 뱃지 + 복구 로그 표시 | ✅ | ✅ | ✅ |
| `warn` | 자동 복구 후에도 P2 이슈 잔존 | 노랑 뱃지 + 점프 링크 | ✅ (주의) | ✅ | ⚠️ 상담사 승인 후 |
| `blocked` | P1(필수) 이슈가 자동 복구 실패 | 빨강 뱃지 + 잠금 메시지 | 🔒 차단 | 🔒 차단 | 🔒 차단 |

### 7.3 자동 복구 대상

`modules/survey_qa_validator.py`의 `try_auto_repair()`:

| 이슈 코드 | 복구 방식 |
|---|---|
| `score_out_of_range` | 0~100 범위로 clamp |
| `grade_inconsistent` | score로부터 등급 재계산 (S≥8.5/A≥7.0/B≥5.0/C≥3.5) |
| `overall_score_mismatch` | 4개 영역 평균으로 재계산 |
| `comment_missing` / `comment_too_short` | `comment_generation_service`로 재생성 |

복구는 **최대 1회 재시도**. 재시도 후에도 P1이 남으면 `blocked`.

### 7.4 P1(필수) vs P2(권장)

- **P1 (blocked 트리거)**: 구조 완전성, 점수 범위, 가중합 수학 검증, 등급-점수 정합
- **P2 (warn 트리거)**: 코멘트 최소 글자수, 핵심 근거 문장 존재, 교차 참조 일관성

### 7.5 데이터 모델

`consultation_surveys` 테이블:
- `analysis_status VARCHAR(20) DEFAULT 'pending'` — pending/pass/repaired/warn/blocked (인덱스)
- `analysis_validation JSONB` — 검증 상세(상태, 이슈 리스트, 복구 로그, 타임스탬프)

자동 계산(`GET /api/admin/consultation-surveys/{id}/computed`) 응답 시점에 계산 후 저장.

### 7.6 차단 cascade

`analysis_status == 'blocked'`일 때:

| 동작 | 차단 방식 | super_admin 예외 |
|---|---|---|
| 상담 예약(학습상담) | `analysis_blocked: true`로 클라이언트 비활성화 | ❌ 동일 차단 |
| 상담사 액션플랜 저장 | HTTP 423 Locked | ✅ 통과 |
| 리포트 PDF 다운로드 | HTTP 423 Locked | ✅ 통과 |
| 학생에게 자동 공개 | 비활성 | ✅ 수동 공개 가능 |

### 7.7 상담사 UI (관리자 웹 `/surveys/[id]`)

- 상단 `QaValidationBadge` 4-상태 컬러 팔레트
- `repaired`일 때: "어떤 필드가 자동 복구되었는지" 리스트 + 점프 링크
- `warn`/`blocked`일 때: 문제 필드 클릭 시 해당 섹션으로 스크롤 + 하이라이트 (1.5초)
  - `radar_scores.*` → `#section-radar-scores`
  - `auto_comments.X` → `#comment-X`
  - `roadmap.*` → `#section-roadmap`
  - `c4_type` → `#section-c4-type`
- `blocked` 시 "🔒 상담 진행 잠김", "🔒 리포트 잠김" 버튼

### 7.8 운영 지침

1. `blocked` 발생 시 상담사는 override가 아닌 **원본 답변을 재점검**. 실제 데이터 오류면 학생에게 수정 요청.
2. `repaired`는 `pass`와 동일하게 진행 가능. 복구 로그는 감사 추적용으로 DB에 남음.
3. `warn` 상태는 상담사가 코멘트/근거 수정으로 `pass`로 올릴 수 있음 (override 후 재검증).
4. `super_admin`만 긴급 상황에서 `blocked`를 우회 가능 — 일반 상담사는 불가.
6. **점진적 배포보다 일괄 완성 후 런칭** — 사용자가 "반쪽짜리 기능"을 보지 않도록.
