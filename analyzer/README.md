# 학생부 분석기 (analyzer)

학생부 PDF·이미지를 입력받아 내신·세특·창체·행특·입결을 종합한 **학생부 경쟁력 리포트**를 Excel + PDF로 자동 생성한다.

- **상세 설계서**: `CLAUDE.md` (프로젝트 설계서, 데이터 구조, 루브릭, 파이프라인)
- **통합 이식 배경**: `../docs/integration-plan.md` (이 폴더가 ipsilounge 안에 들어온 경위)
- **관련 체크리스트**: `../docs/checklist/analyzer/{pipeline,rubric,report-output}.yaml`

---

## 설치

```bash
cd ipsilounge/analyzer
pip install -r requirements.txt
```

CLAUDE.md 에 명시된 `pdf2image`·`kiwipiepy`·`wordcloud`·`matplotlib`·`pandas` 는 **현재 코드에서 미사용** — 향후 §8-4 워드클라우드 키워드 추출 등 확장 기능 구현 시 추가 예정.

---

## 개발 모드 사용법 (CLI 직접 실행)

### 1. 학생부 파일 Claude 에게 전달 → 학생 데이터 파일 생성
Claude Code 세션에 학생부 PDF/이미지를 드래그하고 "분석해줘" 요청하면, Claude 가 
`data/students/<학생이름>.py` 에 15개 필수 변수(세특·창체·행특·연계성·종합 등) 를 
채워 넣는다. 템플릿은 `data/students/_template.py`.

### 2. 리포트 생성 CLI

```bash
# 이식 후 실행 경로
cd ipsilounge/analyzer

python generate_report.py 연승훈
python generate_report.py 의대샘플

# 학생 목록 확인
python generate_report.py
```

### 3. 결과 확인
`output/` 폴더에 다음 파일이 생성된다:

```
output/<학생이름>_학생부분석_<YYYYMMDD>.xlsx
output/<학생이름>_학생부분석_<YYYYMMDD>.pdf
```

열어서 검토 후 수정사항이 있으면 `modules/report_logic.py` · `modules/report_constants.py` 를 수정하고 재실행.

---

## 폴더 구조

```
analyzer/
├── CLAUDE.md              ← 프로젝트 설계서 (파이프라인, 루브릭, DB 등 상세)
├── generate_report.py     ← CLI 진입점
├── analyze.py             ← (구버전, 참고만)
├── assets/
│   └── logo.png
├── config/
│   ├── config.yaml            ← 루브릭 가중치, 등급 기준, 소인수 기준 등
│   └── grade_conversion.xlsx  ← 5등급 ↔ 9등급 환산표
├── data/
│   ├── admission_db.xlsx           ← 수시 입결 DB
│   ├── course_requirements.xlsx    ← 권장 이수 과목 DB
│   ├── university_grading.xlsx     ← 대학별 내신 산출 DB
│   ├── 수능최저_db.xlsx              ← 수능 최저 기준 DB
│   └── students/
│       ├── _template.py      ← 학생 데이터 작성용 템플릿
│       ├── 의대샘플.py        ← 결과 리포트 샘플 (git 포함)
│       └── <실제 학생>.py     ← gitignore (민감)
├── fonts/                 ← NanumSquareRound (PDF 한글)
├── modules/               ← 12개 분석 모듈
├── prompts/               ← 8개 추출·분석 프롬프트
├── input/                 ← 학생부 원본 파일 투입 (gitignore)
├── output/                ← 생성된 리포트 (gitignore)
├── docs/                  ← 개발 메모
└── requirements.txt
```

---

## 주의: 민감 데이터

다음은 **git 추적 대상이 아니며 개발자 로컬에만 존재**한다:

- `input/` — 학생부 원본 PDF/이미지
- `output/` — 생성된 리포트
- `data/students/*.py` — 실제 학생 데이터 (단, `_template.py`·`의대샘플.py` 는 예외적으로 포함)

개인정보를 포함하므로 절대 git 커밋·외부 공유하지 말 것.

---

## 운영 모드 (향후)

이식 후 상담사 검수 UI 가 준비되면 `backend/app/services/analyzer_service.py` 
wrapper 를 통해 자동 분석 파이프라인이 연결된다.

```
사용자 학생부 업로드
    ↓
backend/app/services/analyzer_service.py::run_analyzer_for_order(order_id)
    ↓
analyzer/generate_report.py 호출
    ↓
S3 업로드 + 상담사 검수 큐 등록
    ↓
상담사 승인 시 사용자 다운로드 가능
```

이번 이식 범위에는 포함되지 않으며, 별도 기획·구현·검증 단계로 진행.
