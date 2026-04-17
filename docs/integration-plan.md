# school-record-analyzer → ipsilounge 통합 이식 계획서

작성일: 2026-04-17
상태: 승인 완료 (실행 대기)

---

## 1. 목적과 배경

### 1-1. 현재 상황
- 학생부 분석기(`school-record-analyzer`)와 운영 서비스(`ipsilounge`)가 별도 디렉토리로 분리되어 있음
- 상담사가 분석기에서 리포트를 수동 생성한 뒤 ipsilounge에 수동 업로드하여 사용자에게 전달
- 사용자가 늘어날수록 수동 프로세스의 누락 가능성 및 업무 부담 증가

### 1-2. 장기 목표
```
[사용자: 학생부 업로드]
   ↓
[ipsilounge: 자동 분석 트리거]
   ↓
[analyzer: 리포트 생성]
   ↓
[상담사: 검수 (admin-web)]
   ↓
[이상 없음 체크]
   ↓
[사용자 다운로드 가능]
```

### 1-3. 이번 이식의 범위
- **이번 작업**: `school-record-analyzer/*` 를 `ipsilounge/analyzer/` 로 물리적 이식
- **이번 작업 제외**: 자동 분석 wrapper 연결, 상담사 검수 UI는 **별도 단계**로 분리 (이식 후 상담사 UI 준비 시점에 진행)

### 1-4. 핵심 원칙
1. **기존 ipsilounge 본체 코드 변경 최소화** — 실제 수정은 `backend/app/config.py` 1줄 + 주석 2곳
2. **개발 모드 100% 보존** — CLI(`generate_report.py`) + 학생부 드래그 + `output/` 검토 흐름 유지
3. **민감 데이터 격리** — `input/`, `output/`, 실제 학생 `.py` 파일, `uploads/` 모두 git 제외
4. **운영 wrapper는 나중** — 이번 이식은 파일 이동만

---

## 2. 현황 조사 결과

### 2-1. 저장소 상태
| 항목 | 상태 |
|---|---|
| `school-record-analyzer` | **git 저장소 아님** (단순 파일 디렉토리) — 이력 보존 고민 불필요 |
| `ipsilounge` | git 저장소 — 여기로 파일이 편입됨 |

### 2-2. 용량 분석 (총 107MB)
| 폴더 | 크기 | git 포함 |
|---|---|---|
| `tools/poppler-24.08.0/` | 49MB | ❌ Windows 바이너리, OS별 상이 |
| `input/` | 44MB | ❌ 학생부 원본, 민감 |
| `output/` | 3.6MB | ❌ 생성된 리포트, 민감 |
| `fonts/` | 7.2MB | ✅ 필수 |
| `data/` | 4.4MB | 혼합 (공용 DB ✅, 학생별 .py 파일 중 `_template.py` + `의대샘플.py`만 포함) |
| 코드·config·prompts·docs | < 200KB | ✅ |

### 2-3. 내부 경로 참조 (Python)
- 모든 모듈이 `Path(__file__).resolve().parent` 또는 `os.path.dirname(__file__)` 기반 **상대 경로**
- 폴더 통째로 옮겨도 내부 자동 정합 → **analyzer 내부 코드 수정 0줄**

### 2-4. 외부(ipsilounge) → analyzer 참조 지점
| 파일 | 위치 | 수정 유형 |
|---|---|---|
| `backend/app/config.py` | L10~11 `_DEFAULT_DATA_ROOT` | **경로 1줄 수정** (핵심) |
| `backend/app/config.py` | L7~9 주석 | 주석 동기화 |
| `backend/app/services/course_requirement_service.py` | L15~16 주석 | 주석 동기화 |
| `backend/app/services/counselor_type_service.py` | L64 주석 | 주석 동기화 |

### 2-5. Python 의존성 (분리 관리 방침)
- analyzer: `openpyxl`, `reportlab`, `pdf2image`, `kiwipiepy`, `wordcloud`, `matplotlib`, `pandas`, `PyYAML`
- ipsilounge backend: `fastapi`, `sqlalchemy`, `openpyxl` 등 (겹침은 `openpyxl` 하나)
- **관리 전략**: `analyzer/requirements.txt`와 `backend/requirements.txt` 독립 유지 (겹치지 않음)
- **버전 방식**: **Pin (`==`)** — analyzer는 독립 CLI 프로그램이므로 버전 고정이 안전

---

## 3. 최종 구조 (After)

```
ipsilounge/                                (git 저장소)
├── backend/                               ← 변경 없음 (config.py 1줄 제외)
├── admin-web/                             ← 변경 없음
├── user-web/                              ← 변경 없음
├── mobile/                                ← 변경 없음
├── docs/
│   ├── checklist/
│   │   └── analyzer/                      ← 기존 3개 + 신규 6개 = 9개 한곳 관리
│   └── integration-plan.md                ← 이 계획서
│
├── analyzer/                              ← 🆕 school-record-analyzer 이식
│   ├── CLAUDE.md                          (analyzer 내부 가이드)
│   ├── generate_report.py                 (CLI 진입점, 유지)
│   ├── analyze.py                         (구버전 스크립트)
│   ├── assets/                            (logo.png)
│   ├── config/
│   │   ├── config.yaml
│   │   └── grade_conversion.xlsx
│   ├── data/
│   │   ├── admission_db.xlsx              ✅ git 포함 (공용 DB)
│   │   ├── course_requirements.xlsx       ✅
│   │   ├── university_grading.xlsx        ✅
│   │   ├── 수능최저_db.xlsx                 ✅
│   │   └── students/
│   │       ├── _template.py               ✅ git 포함
│   │       ├── 의대샘플.py                  ✅ git 포함 (결과 리포트 샘플)
│   │       └── <신규 학생>.py                ❌ gitignore (자동 제외)
│   ├── docs/
│   │   └── vibeon-comparison.md
│   ├── fonts/                             (NanumSquareRound)
│   ├── modules/                           (12개 분석 모듈)
│   ├── prompts/                           (8개 md 프롬프트)
│   ├── input/                             ❌ gitignore (민감)
│   ├── output/                            ❌ gitignore (민감)
│   ├── tools/                             ❌ gitignore (OS별 상이)
│   ├── requirements.txt                   🆕 신규 작성
│   ├── setup_tools.ps1                    🆕 Windows용 poppler 자동 설치
│   └── README.md                          🆕 개발 모드 사용법 요약
│
├── uploads/                               ❌ gitignore (별도 커밋으로 분리)
│   ├── school-records/                    (사용자 업로드)
│   └── reports/                           (분석 리포트)
│
└── school-record-analyzer/                ← 당분간 유지, 추후 삭제
```

### 3-1. `.gitignore` 규칙 (이식용)

**이식 커밋 (`analyzer/` 관련)**:
```gitignore
# analyzer — 민감 데이터 및 OS별 바이너리
analyzer/input/
analyzer/output/
analyzer/tools/
analyzer/__pycache__/
analyzer/**/__pycache__/

# 학생 데이터 (실제 학생만 제외, 샘플은 포함)
analyzer/data/students/*.py
!analyzer/data/students/_template.py
!analyzer/data/students/의대샘플.py
!analyzer/data/students/__init__.py
```

**별도 커밋 (기존 이슈 수정)**:
```gitignore
# 웹 업로드 파일 (민감 정보)
uploads/
```

### 3-2. 파일 저장 흐름 (운영 wrapper 연결 후 작동 예정)

| 단계 | 파일 | 저장 위치 (개발) | 저장 위치 (운영) | DB 필드 |
|---|---|---|---|---|
| 업로드 | 학생부 원본 | `ipsilounge/uploads/school-records/` | `s3://ipsilounge-files/school-records/` | `school_record_url` |
| 분석 중 | 임시 작업 파일 | `ipsilounge/analyzer/input/`, `output/` | 분석 서버의 임시 디스크 | — (임시) |
| 분석 완료 | 리포트 xlsx/pdf | `ipsilounge/uploads/reports/` | `s3://ipsilounge-files/reports/` | `report_excel_url`, `report_pdf_url` |
| 사용자 다운로드 | Presigned URL | 1시간 만료 | 1시간 만료 | — |

- **Presigned URL 1시간은 "발급 시점 기준"** — 사용자가 다시 클릭하면 새 URL 자동 발급
- **파일 자체는 S3에 영구 보관**

---

## 4. Phase별 실행 계획

### Phase 0 — 사전 확인 (5분)
- [ ] ipsilounge 작업 트리 clean 상태 확인
- [ ] `analyzer/` 폴더명이 ipsilounge에 이미 존재하지 않는지 확인 (충돌 방지)
- [ ] `output/` 의 보존 필요 리포트 백업 여부 결정

### Phase 1 — 파일 이식 (10분)
```bash
cd ipsilounge
mkdir analyzer

# 파일 복사 (민감 제외 파일 포함 전체)
cp -r ../school-record-analyzer/CLAUDE.md analyzer/
cp -r ../school-record-analyzer/analyze.py analyzer/
cp -r ../school-record-analyzer/assets analyzer/
cp -r ../school-record-analyzer/config analyzer/
cp -r ../school-record-analyzer/data analyzer/
cp -r ../school-record-analyzer/docs analyzer/
cp -r ../school-record-analyzer/fonts analyzer/
cp -r ../school-record-analyzer/generate_report.py analyzer/
cp -r ../school-record-analyzer/modules analyzer/
cp -r ../school-record-analyzer/prompts analyzer/

# 민감 폴더는 빈 폴더만 생성 (이식 대상 아님)
mkdir analyzer/input analyzer/output

# __pycache__ 정리
find analyzer -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null

# .gitignore 먼저 작성 → git add 전 필수
# (민감 파일이 staged 되는 것 방지)
```

### Phase 2 — 경로 참조 수정 (5분)
**1곳만 수정**: `backend/app/config.py`
```python
# Before
_DEFAULT_DATA_ROOT = (
    Path(__file__).resolve().parents[3] / "school-record-analyzer" / "data"
)

# After
_DEFAULT_DATA_ROOT = (
    Path(__file__).resolve().parents[2] / "analyzer" / "data"
)
# 경로: config.py → app → backend → ipsilounge → analyzer → data
```

**주석 동기화** (3곳):
- `backend/app/config.py` L7~9
- `backend/app/services/course_requirement_service.py` L15~16
- `backend/app/services/counselor_type_service.py` L64

### Phase 3 — 의존성·도구 정비 (10분)
- [ ] `analyzer/requirements.txt` 작성 — 현재 설치된 버전을 `pip show`로 조회해 `==` 로 pin
- [ ] `analyzer/setup_tools.ps1` 작성 — Windows용 poppler 자동 다운로드·설치
- [ ] `analyzer/README.md` 작성 — 개발 모드 사용법 (CLI 실행, 학생부 드래그, output 검토)
- [ ] ipsilounge backend `requirements.txt`는 **건드리지 않음**

### Phase 4 — 체크리스트 정비 (10분)
- [ ] `ipsilounge/docs/checklist/_index.yaml` 의 analyzer/*.yaml 3개 항목에서 spec_ref 경로 갱신
  ```yaml
  # Before
  path: "school-record-analyzer/CLAUDE.md"
  # After
  path: "ipsilounge/analyzer/CLAUDE.md"
  ```
- [ ] CLAUDE.md 해시 재계산 + `last_known_hash` 갱신
- [ ] `ipsilounge/CLAUDE.md` Directory 구조 섹션에 `analyzer/` 추가

### Phase 5 — 동작 검증 (15분)

**개발 모드 smoke test**:
- [ ] `cd ipsilounge/analyzer && python generate_report.py 연승훈` → 에러 없이 리포트 생성
- [ ] `analyzer/output/연승훈_학생부분석_*.xlsx` 생성 확인
- [ ] `analyzer/output/연승훈_학생부분석_*.pdf` 생성 확인
- [ ] 한글 폰트 렌더 정상

**ipsilounge backend smoke test**:
- [ ] `cd ipsilounge/backend && python -c "from app.main import app; print(len(app.routes))"` — 기존 224 routes 유지
- [ ] `python -m pytest tests/` 기존 22개 테스트 통과
- [ ] `settings.DATA_ROOT` 가 `.../ipsilounge/analyzer/data` 로 해석되는지 확인

### Phase 6 — 커밋 분할 (10분)

**총 4개 커밋**으로 분할:

1. **`chore: uploads/ gitignore 추가 — 기존 미흡점 보강`** (별도 분리)
   - `.gitignore` 에 `uploads/` 추가만

2. **`feat(analyzer): school-record-analyzer 통합 이식 — 파일 이동 + gitignore`**
   - `analyzer/*` 전체 파일
   - `.gitignore` 에 analyzer 관련 규칙 추가

3. **`refactor(backend): SHARED_DATA_ROOT 경로 재조정 — analyzer/data 기준`**
   - `backend/app/config.py` 경로 수정 + 주석 동기화 (3곳)

4. **`docs: 통합 이식 계획서 + 체크리스트 경로 업데이트 + analyzer README`**
   - `docs/integration-plan.md` (이 파일)
   - `docs/checklist/_index.yaml` 경로 갱신
   - `analyzer/README.md`
   - `ipsilounge/CLAUDE.md` 디렉토리 트리에 `analyzer/` 추가
   - `CHANGELOG.md` 업데이트

### Phase 7 — 기존 저장소 정리 (선택, 추후)
- [ ] `school-record-analyzer/` 폴더는 당분간 유지 (결국 삭제)
- [ ] 2~4주 운영 후 문제 없으면 삭제

---

## 5. 민감 데이터 취급 정리

| 대상 | 처리 |
|---|---|
| 학생부 PDF/이미지 (`analyzer/input/`) | gitignore. 개발자 로컬에만 보관 |
| 생성된 리포트 (`analyzer/output/`) | gitignore. 필요 시 수동 S3 업로드 |
| 학생별 데이터 파일 | **whitelist 방식**: `_template.py`, `의대샘플.py`, `__init__.py`만 git 포함 |
| Windows poppler 바이너리 (`analyzer/tools/`) | gitignore. `setup_tools.ps1`로 자동 설치 |
| 폰트 (`analyzer/fonts/NanumSquareRound*.ttf`) | git 포함 (재배포 가능 + 공개 라이선스) |
| 공용 DB (`analyzer/data/*.xlsx`) | git 포함 |
| 웹 업로드 파일 (`uploads/`) | gitignore (별도 커밋으로 분리) |

---

## 6. 위험 요소와 대응

| 위험 | 발생 가능성 | 대응 |
|---|---|---|
| `SHARED_DATA_ROOT` 경로 오류로 backend가 DB 못 찾음 | 중 | Phase 5 smoke test에서 잡힘. 잡히면 config.py 경로 재확인 |
| poppler 바이너리 없이 pdf2image 실행 실패 | 중 | 이식 후 처음 실행 시 `setup_tools.ps1` 안내 |
| `__pycache__/` 폴더가 git에 들어감 | 낮 | gitignore 사전 제외 + Phase 1에서 사전 정리 |
| 민감 학생 데이터가 실수로 커밋됨 | 낮 | whitelist gitignore + `git status --ignored=no` 확인 |
| 기존 ipsilounge 테스트 깨짐 | 극히 낮음 | Phase 5에서 pytest 22/22 확인 |
| 운영 서버(EC2) 배포 시 경로 문제 | 중 | `SHARED_DATA_ROOT` 환경변수 이미 지원. `.env`로 명시적 지정 권장 |
| `uploads/` gitignore 누락 이슈 발견 | 기존 취약점 | 별도 커밋으로 즉시 수정 |

---

## 7. 검증 체크리스트 (이식 완료 판정)

### 7-1. 기능 검증
- [ ] `python ipsilounge/analyzer/generate_report.py 연승훈` → 기존과 동일 리포트
- [ ] `python ipsilounge/analyzer/generate_report.py 의대샘플` → 기존과 동일 리포트
- [ ] 새 학생부 파일 드래그 → Claude 분석 → `analyzer/data/students/` 에 .py 생성 확인

### 7-2. 격리 검증
- [ ] `ipsilounge/backend` 내에서 `analyzer.*` import 코드 없음 (`grep -r "from analyzer" backend/` → 0건)
- [ ] `admin-web`, `user-web`, `mobile`에도 analyzer 참조 없음
- [ ] analyzer 코드만 바뀔 때 ipsilounge 본체 pytest/tsc 영향 없음

### 7-3. 데이터 안전
- [ ] `git status --ignored=no` 에 민감 파일 없음
- [ ] `git ls-files analyzer/data/students/` 에 `_template.py`, `의대샘플.py`, `__init__.py`만 존재
- [ ] `analyzer/input/`, `analyzer/output/`, `analyzer/tools/`, `uploads/` 는 git 추적 안 됨

### 7-4. 체크리스트
- [ ] `ipsilounge/docs/checklist/analyzer/*.yaml` 3개의 spec_ref가 새 경로 가리킴
- [ ] CLAUDE.md 해시 재계산 + `_index.yaml` 갱신

---

## 8. 롤백 전략

이식 후 치명적 문제 발견 시:

```bash
# 4개 커밋이 분리되어 있으므로 역순 revert
cd ipsilounge
git revert <docs 커밋>
git revert <config 커밋>
git revert <analyzer 파일 이식 커밋>
git revert <uploads gitignore 커밋>

# 또는 푸시 전이면 통째로 reset
git reset --hard <이식 전 commit>
```

원본 `school-record-analyzer/` 폴더는 **Phase 7까지 유지**하므로 최악의 경우 복원 가능.

---

## 9. 예상 타임라인

총 작업 시간: **약 1시간**
- Phase 0~1 (사전 + 파일 이동): 15분
- Phase 2~3 (경로 수정 + 의존성): 15분
- Phase 4 (체크리스트): 10분
- Phase 5 (검증): 15분
- Phase 6 (커밋): 5분

Phase 7 (기존 폴더 정리)은 운영 2~4주 후 별도 수행.

---

## 10. 이후 작업 (이번 범위 밖)

이식 완료 후 점진 진행:

### 10-1. analyzer 체크리스트 보완 (Phase 4 확장)
`ipsilounge/docs/checklist/analyzer/` 에 신규 6개 체크리스트 추가:
- `structure.yaml` — 디렉토리/파일 구조
- `dependencies.yaml` — 기술 스택·requirements
- `config.yaml` — config.yaml / grade_conversion.xlsx 스키마
- `prompts.yaml` — 8개 prompts/*.md 파일
- `entry-point.yaml` — generate_report.py CLI 동작
- `student-data.yaml` — data/students/_template.py + 15개 필수 변수

### 10-2. 운영 wrapper 스켈레톤 (상담사 검수 UI 준비 시점)
`backend/app/services/analyzer_service.py` 신규 작성:
```python
async def run_analyzer_for_order(order_id: UUID) -> AnalysisResult:
    """자동 분석 wrapper. subprocess 또는 import 방식으로 generate_report.py 호출."""
    pass
```

### 10-3. 상담사 검수 UI (admin-web)
- 자동 분석 완료 → 상담사 검수 큐 진입
- 리포트 미리보기 + 승인/반려
- 승인 시 사용자 노출 활성화

### 10-4. 자동 분석 파이프라인 연결
- 사용자 학생부 업로드 시 자동 트리거
- 분석 상태 추적 (`analysis_orders.status` = `processing`)
- 완료 시 검수 큐 알림

이후 작업은 본 계획서 범위 밖이며, 각 단계마다 별도 기획·구현·검증.

---

## 11. 승인 내역

| 항목 | 결정 | 일시 |
|---|---|---|
| `uploads/` gitignore 추가 | 별도 커밋으로 분리 | 2026-04-17 |
| 학생 데이터 gitignore 패턴 | whitelist 방식 | 2026-04-17 |
| Presigned URL 만료 시간 | 1시간 유지 | 2026-04-17 |
| `school-record-analyzer/` 폴더 처리 | 당분간 유지, 추후 삭제 | 2026-04-17 |
| `의대샘플.py` git 포함 여부 | 포함 | 2026-04-17 |
| requirements.txt 버전 방식 | Pin (`==`) | 2026-04-17 |
