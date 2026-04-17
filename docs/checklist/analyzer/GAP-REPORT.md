# analyzer CLAUDE.md ↔ 실구현 Gap 보고서

- **작성일**: 2026-04-17
- **검증자**: Claude (C-안 전체 섹션 순회)
- **대상**: `ipsilounge/analyzer/CLAUDE.md` vs `ipsilounge/analyzer/` 실제 구현
- **범위**: 현재 운영 버전 (`generate_report.py` + `modules/report_logic.py` + `modules/qa_validator.py`) 기준
- **제외**: 구버전 모듈 (`modules/report_generator.py`, `modules/extractor.py`, `modules/comprehensive_analyzer.py` 등) — 현재 파이프라인에서 호출되지 않음

---

## 0. 요약

| 구분 | 건수 | 진척 |
|---|---|---|
| **일치 (PASS)** | 9 영역 | - |
| **명시적 Gap (미구현)** | 7 건 | 2026-04-17 G5/G7/G3+G4 해소 → **2 건** (내신/입결/전형적합도는 대학 DB 선행, G6 남음) |
| **부분 구현 / 운영 모드 차이** | 3 건 | 2026-04-17 세특 7/6 항목, 척도 1~10 해소 → **1 건** (미사용 패키지만 잔여) |
| **스펙-구현 불일치 (문서 업데이트 필요)** | 3 건 | 2026-04-17 D1/D2/D3 전부 해소 ✅ → **0 건** |

운영에는 지장 없는 상태(Claude 대화형 수동 워크플로우로 실질 기능 제공 중). C안 로드맵 기준 **G5 키워드분석 + 워드클라우드** 완전 구현 완료 (2026-04-17). 나머지 미구현 항목은 각 선행 의존성에 따라 순차 진행 중.

---

## 1. 일치 확인 (PASS)

| 섹션 | 항목 | 상태 |
|---|---|---|
| §1 | 2022 개정교육과정, Claude Code 기반, PDF+이미지 혼용 입력, Excel+PDF 출력 | ✅ 일치 |
| §3 | 디렉토리 구조 (데이터/로직 분리 방식 B) | ✅ 일치 |
| §5 Step 3 | 성적 추이 5유형 (상승/V/역V/안정/하락) | ✅ 명세 존재 |
| §5 Step 3-6 | 교과이수 5점 만점 배점 | ✅ 명세 존재 |
| §6 교과 이수 기준표 | Wide 포맷 + 쉼표 구분 + `SHARED_DATA_ROOT` 연동 원칙 | ✅ 일치 |
| §7 창체·행특 루브릭 | 5항목, 각 20% | ✅ 구현 (CHANGCHE_ITEMS, HAENGTUK_ITEMS) |
| §10 종합 공식 | 내신30/세특30/창체25/행특10/출결5 | ✅ config.yaml overall_weights |
| §11 3대 역량 매핑 | 학업·진로·공동체 | ✅ eval_data, fix_data 구조로 구현 |
| §14 Excel 출력 규칙 | merge_cells / wrap_text 금지, auto_filter / freeze_panes 사용, 4472C4 헤더, Arial | ✅ report_logic.py 에서 100% 준수 |

---

## 2. Gap 상세

### G1 (P1) §12 Excel 시트 13개 명세 → 실제 10개 구현 (2026-04-17 키워드분석 추가)

**CLAUDE.md §12 명시 13 시트** vs **실제 구현**:

| CLAUDE.md 명세 | report_logic.py 구현 | 상태 |
|---|---|---|
| 종합요약 | 종합요약 (`wb.active`) | ✅ |
| 내신분석 | — | ❌ 미구현 (대학별 내신 DB 선행) |
| 입결비교 | — | ❌ 미구현 (대학별 내신 DB 선행) |
| 세특분석 | 세특분석 + 세특코멘트 + 핵심평가문장 (3개로 분리) | ✅ (분리 구현) |
| 창체분석 | 창체분석 | ✅ |
| 행특분석 | 행특분석 | ✅ |
| 연계성분석 | 연계성분석 | ✅ |
| **키워드분석** | **키워드분석** | ✅ **(G5 해소, 2026-04-17)** |
| 전형적합도 | — | ❌ 미구현 (내신분석 선행) |
| 대학평가요소 | 대학평가요소 | ✅ |
| 역량별보완법 | 역량별보완법 | ✅ |
| **이전분석대비변화** | **이전분석대비변화** | ✅ **(G3+G4 해소, 2026-04-17)** |
| **출결·봉사** | **출결·봉사** | ✅ **(G7 해소, 2026-04-17)** |

**영향**: CLAUDE.md 는 "전체 분석" 모드 기준으로 기술되어 있으나, 실제 운영은 "내신/입결 제외 모드"가 사실상 기본값.

**조치 권고**:
- (A) CLAUDE.md §12 를 "현재 운영 모드: 9개 시트" + "향후 확장: 내신·입결·키워드·전형적합도·출결봉사 추가" 로 업데이트
- (B) 5개 미구현 시트를 향후 과제로 `future-tasks.md` 에 분리

---

### G2 (P1) §13 실행 모드별 처리 (전체/내신 제외/특정 영역) 미구현

**CLAUDE.md §13 실행 모드별 처리 표** 3가지:
- 전체 분석 (내신+세특+창체+행특+입결)
- 내신 제외 분석
- 특정 영역 분석

**실제 generate_report.py**:
- 인자는 `<학생명>` 하나뿐 (`sys.argv[1]`)
- 모드 스위칭 로직 없음
- 항상 동일한 9개 시트 생성

**조치 권고**: CLAUDE.md §13 의 "실행 모드별 처리" 섹션을 "현재는 단일 모드만 지원. 모드별 분기는 향후 CLI 옵션(`--mode full|no-grade|partial`)으로 확장 예정" 으로 업데이트.

---

### G3+G4+G1-이전분석대비변화 — 해소 완료 ✅ (2026-04-17)

C안 로드맵 세 번째 과제로 **G3 (기존 리포트 자동 탐색) + G4 (`_v{N}` 접미사) + G1-이전분석대비변화 시트** 동시 구현.

**추가된 파일**:
- `modules/compare_generator.py` (신규, ~300 lines):
  - `find_previous_reports()`: output/ 탐색, date/version 오름차순
  - `extract_previous_info()`: 이전 Excel 파싱 (종합요약·역량별보완법·각 영역 시트 대표 등급)
  - `compute_grade_changes()`: 이전 vs 현재 영역별 등급 자동 diff
  - `build_tracking_targets()`: 판정 대상 리스트 생성 (핵심강점 3 + 보완영역 3 + fix_items 전체)
  - `get_next_version_number()`: `_v{N}` 자동 번호 결정
  - `has_compare_data()`: 역호환 체크
  - CLI: `python -m modules.compare_generator <학생명>`
- `docs/checklist/analyzer/compare-data.yaml` (신규): 판정 기준 enum + QA 연동 명시
  - strengths_tracking: 강화됨/유지됨/약화됨
  - issues_tracking: 반영됨/부분반영/미반영
  - 각 판정별 필수조건 + 예시

**수정된 파일**:
- `modules/qa_validator.py`:
  - `check_compare_data_structure()` 신규 (P1-G-001~005 + P2-G-001/002)
  - `run_full_qa()` 에 `compare_data`, `expected_*_count` 인자 추가
- `generate_report.py`:
  - 이전 리포트 자동 탐색 → `expected_*_count` 계산 → QA 전달
  - `_v{N}` 접미사 자동 부여 (`get_next_version_number()`)
  - compare_data 비어있는데 이전 리포트 있을 때 경고 안내
- `_template.py`: `compare_data` 선택 필드 + 상세 사용 예시
- `의대샘플.py`, `연승훈.py`: 빈 dict `compare_data = {}` 역호환
- `modules/report_logic.py`:
  - `_write_compare_sheet()`: Excel "이전분석대비변화" 시트 자동 생성
  - `_append_pdf_compare_section()`: PDF 섹션 (종합의견 직후)
  - 섹션 번호 동적 할당 확장 (compare + attendance 동시 고려)
  - 색상 강조 (↑/↓, 강화됨/약화됨, 반영됨/미반영/부분반영)

**해결된 사용자 지적사항**:
1. **보완점 범위**: 종합요약 3개만 → **종합요약 3개 + 역량별보완법 fix_items 전체** 추적
2. **강점 변화**: 새 강점만 → **이전 핵심강점 전부 강화/유지/약화 추적 + 새 강점**
3. **Claude 기준 흔들림**: **체크리스트 enum + QA 자동 검증** 으로 강제

**검증 완료 (3 시나리오)**:
- 역호환: 의대샘플 (compare_data={}) → 10시트 유지 (기존 9 + 출결봉사 1), PDF 섹션 2~9 ✓
- E2E 2회차: compare_data 완전 작성 → 이전분석대비변화 시트 37행, PDF 섹션 추가, `_v{N}` 자동 ✓
- QA FAIL: issues_tracking 에 "유지됨" 잘못된 enum 삽입 → P1-G-004 FAIL 정상 감지 ✓

---

### G5 (P1) §5 Step 8-4 워드클라우드 + §12 키워드분석 시트 — 해소 완료 ✅

**[2026-04-17 해소]** C안 로드맵 첫 번째 과제로 완전 구현:

**추가된 파일**:
- `modules/keyword_extractor.py` (신규, ~320 lines): kiwipiepy 형태소 분석 + 명사 빈도 + 카테고리 분류 + 학년별 추이 + `generate_wordcloud_image()`
- `config/keyword_categories.yaml` (신규): 4개 역량 카테고리별 키워드 사전 (학업·진로·공동체·일반, contains 매칭)

**수정된 파일**:
- `requirements.txt`: `kiwipiepy==0.23.1`, `wordcloud==1.9.6`, `matplotlib==3.10.8` 추가
- `config/config.yaml`: `wordcloud:` 섹션 DEAD CONFIG → 활성 (keyword_extractor 가 읽음)
- `_template.py`: `raw_texts` 선택 필드 추가 (빈 dict 이면 스킵)
- `modules/report_logic.py`:
  - Excel: `키워드분석` 시트 자동 생성 (빈도표 + 카테고리 + 학년별 빈도 + 변화 추이)
  - PDF: `8. 키워드분석` 섹션 (워드클라우드 이미지 + 카테고리별 상위 키워드 + 학년별 변화)

**기능**:
- `raw_texts` 필드에 원본 세특/창체/행특 텍스트 저장 시 자동 분석
- 형태소 분석 → 명사(NNG/NNP, 2글자↑) 추출 → 빈도 집계
- 사전 기반 카테고리 매핑 (학업>진로>공동체>일반 우선순위)
- 학년별 신규 등장/사라진 키워드 자동 비교
- 워드클라우드 PNG (`output/{STUDENT}_wordcloud_{TODAY}.png`) + PDF 삽입

**역호환**:
- `raw_texts` 미정의 또는 모든 영역 empty → 키워드분석 시트/섹션 생성 스킵
- 기존 학생 파일(연승훈, 의대샘플)은 빈 dict 로 유지 (9개 시트 보존)

**검증 완료**: 샘플 raw_texts 로 키워드분석 시트 10행 × 7열, 워드클라우드 79KB PNG 생성 확인.

---

### G6 (P1) §5 Step 9-4 상담용 학생부 하이라이트 PDF 미구현

**CLAUDE.md**: 학생부 원본에 번호 태그 + 반투명 형광(노랑/초록/주황) 하이라이트 + 범례 페이지.

**실제**: `create_pdf()` 는 분석 리포트 PDF 1개만 생성. 하이라이트 PDF 별도 생성 없음.

**조치 권고**: CLAUDE.md §5 Step 9-4 를 "향후 구현 예정 (P2)" 으로 표시.

---

### G7 (P2) §4 봉사활동 시수 + §12 출결·봉사 시트 — 해소 완료 ✅

**[2026-04-17 해소]** C안 로드맵 두 번째 과제로 완전 구현:

**추가된 파일**:
- `modules/attendance_calculator.py` (신규): 출결 집계 + 미인정 감점 공식 + 봉사시수 요약
  - `calculate_attendance_score()` → `AttendanceReport` (score, base, deductions, total_counts, by_year)
  - `summarize_volunteer()` → `VolunteerSummary`
  - `has_attendance_or_volunteer()` 헬퍼

**수정된 파일**:
- `config/config.yaml` `attendance_scoring`: DEAD CONFIG → 활성화.
  미인정결석 -5/일, 미인정지각/조퇴/결과 -0.5/건 (질병/기타 감점 없음)
- `_template.py`: `attendance_data`, `volunteer_data` 선택 필드 + 사용 예시
- `modules/qa_validator.py`:
  - `check_attendance_structure()` (P1-F-001) 신규: 음수/이상치 자동 검증
  - `run_full_qa()` 에 `attendance_data`, `volunteer_data` 인자 추가
- `generate_report.py`: QA 호출 시 attendance/volunteer 전달
- `modules/report_logic.py`:
  - Excel: "출결·봉사" 시트 자동 생성 (학년별 12칸 매트릭스 + 점수 요약 + 감점 내역 + 봉사시수/활동)
  - PDF: "2. 출결 및 봉사활동" 섹션 (종합의견 직후 삽입, Q3-B안)
  - 기존 섹션 번호 2~8 → 3~9 로 동적 rename (섹션 번호 변수화)
  - 2-row 헤더 매트릭스 (결석/지각/조퇴/결과 × 질병/미인정/기타), 미인정만 붉은색 강조

**학생부 출결 기재 정확성** (교육부 학교생활기록부 기재요령):
- 4종(결석/지각/조퇴/결과) × 3사유(질병/미인정/기타) 12칸 기재
- 입시 평가에서 "미인정" 만 성실성·규칙준수 역량 감점 요인

**역호환**:
- `attendance_data = {}` / `volunteer_data = {}` → 출결·봉사 시트/섹션 생략
- 기존 학생(연승훈, 의대샘플) 빈 dict 유지 → 9개 시트 보존, PDF 섹션 번호 변화 없음 (출결 섹션 없으면 기존 2~8 그대로)

**검증 완료**:
- 역호환: 의대샘플 (빈 dict) → 9시트 유지, PDF 섹션 번호 2~8 유지 ✓
- 실데이터 E2E: 출결 점수 산출 공식 정확 (미인정결석 1×5 + 미인정지각 1×0.5 + 미인정조퇴 1×0.5 = -6, 최종 94점) ✓
- QA P1-F-001 통과 (음수 없음) ✓

---

## 3. 부분 구현 / 운영 모드 차이

### P1 (P2) §5 Step 5 세특 루브릭 7항목 vs 6항목 — 해소 완료 ✅

**[2026-04-17 해소]** B안 (동적 전환 모드) 로 구현 완료:

- `SETUEK_ITEMS_NO_MAJOR` (6항목) + `SETUEK_ITEMS_WITH_MAJOR` (7항목) 양쪽 상수 정의
- `is_major_mode(sd)`: 학생 데이터의 `TARGET_MAJOR` 값 유무로 자동 판별
- `resolve_setuek_items(sd)` / `resolve_setuek_weights(sd)` / `setuek_score_slice_end(sd)` 헬퍼
- `report_logic.create_excel/create_pdf`, `qa_validator.run_full_qa` 모두 동적 분기 적용
- QA P1-E-001: `TARGET_MAJOR` ↔ `setuek_data` 튜플 길이 일관성 자동 검증 (미지정=10, 지정=11)
- `_template.py` 에 `TARGET_UNIV`, `TARGET_MAJOR` 필수 메타 추가
- 기존 학생(연승훈, 의대샘플)은 `TARGET_MAJOR=""` 로 미지정 모드 유지 (역호환)
- `REQUIRED_VARS` 15개 → 17개 (TARGET_UNIV, TARGET_MAJOR 추가)

---

### P2 (P2) §5 Step 5~8 세특 루브릭 척도: 1~10 통일 완료 ✅

**[2026-04-17 해소]** 기존 불일치 상태:
- CLAUDE.md 본문: 1~10점
- 프롬프트 3개 (analyze_setuek/changche/haengtuk): 1~5점 ❌
- config.yaml rubric_grades: 5점 만점 ❌
- report_logic.py score_to_grade(): 1~10 스케일 (S≥8.5)
- 구버전 modules (_rubric_to_100, clamp): 1~5 공식 ❌

**조치 완료**:
1. `prompts/analyze_setuek.md`: 각 항목을 5단계(9~10/7~8/5~6/3~4/1~2)로 재작성, JSON 예시도 1~10 스케일
2. `prompts/analyze_changche.md`: 3영역 표를 9~10/5~6/1~2 기준으로 재작성, JSON 예시 업데이트, 보조 주석 추가
3. `prompts/analyze_haengtuk.md`: 표 기준 1~10 재작성, JSON 예시 업데이트
4. `config/config.yaml`:
   - `rubric_grades`: S≥8.5 / A≥7.0 / B≥5.0 / C≥3.5 / D≥1.0 (10점 스케일, score_to_grade 와 일치)
   - `remedial_threshold: 3.0 → 6.0` (CLAUDE.md §8-7 "6점 이하 보완" 기준)
5. 구버전 모듈 3종:
   - `setuek_analyzer.py`: clamp 1~5→1~10, `(w-1)/4*100 → (w-1)/9*100`
   - `changche_analyzer.py`: 동일
   - `haengtuk_analyzer.py`: 동일

※ `rubric.yaml RUB-G1` 및 `prompts.yaml PROMPT-C2` 는 "해소" 로 상태 업데이트 완료.

**잔여 사항 (별도 리팩터 과제)**:
- config.yaml rubric_grades / grades / remedial_threshold 는 값은 1~10 스케일로 일치시켰으나 여전히 코드가 읽지 않는 dead config. 향후 `read_from_config` 리팩터 필요.

---

### P3 (P3) §2 기술 스택 — 5종 미사용 패키지

**CLAUDE.md §2 명시**: openpyxl, reportlab, **pdf2image, kiwipiepy, wordcloud, matplotlib**, PyYAML (pandas 암시)

**실제 requirements.txt**: openpyxl, reportlab, PyYAML 3종만 pin

**참조처**: pdf2image/kiwipiepy/wordcloud/matplotlib/pandas 는 구버전 모듈(`extractor.py`, `comprehensive_analyzer.py`, `report_generator.py`) 에서만 import 되며, 현재 파이프라인에서는 호출되지 않음.

※ 이미 `analyzer/dependencies.yaml` P1 gap 으로 문서화됨.

**조치 권고** (택 1):
- (A) CLAUDE.md §2 기술 스택 에서 5종 제거 + "향후 워드클라우드·형태소 분석 기능 도입 시 재추가" 주석
- (B) 구버전 모듈 3종을 `modules/legacy/` 로 이동 + requirements.txt 에 extras 섹션으로 분리

---

## 4. 스펙-구현 불일치 (문서 업데이트 필요)

### D1 CLAUDE.md §5 Step 9 "필수 단계" 표현 — 해소 완료 ✅

**[2026-04-17 해소]**:
- 헤더 문구 수정: "사용자의 추가 지시를 기다리지 않고 자동 진행한다"
  → "Step 8.5 QA P1 전체 PASS 후, Claude 대화 세션에서 리포트 생성까지 자동 진행한다."
- Step 9-0 "학생 데이터 파일 작성" 을 **Claude 수동 선행 작업**으로 명시
  (`9-0. 학생 데이터 파일 작성 (Claude 수동 선행 작업)` 라벨링)
- Step 9-1 CLI 실행 이후 자동화 범위 명확화 (QA → Excel → PDF → 완료)
- 진입점 검증 변수 개수 "15개 → 17개" 업데이트 (TARGET_UNIV/TARGET_MAJOR 포함)

---

### D2 CLAUDE.md §3 디렉토리 구조 — input/, output/ 주석 — 해소 완료 ✅

**[2026-04-17 해소]**:
- `input/`, `output/` 뒤에 `(gitignore, 개발용 임시 워크스페이스)` 주석 추가
- 디렉토리 트리 아래 blockquote 로 운영 환경 분리 설명 추가:
  - 운영 환경 업로드는 `ipsilounge/uploads/` (dev) / `s3://ipsilounge-files/` (prod)
  - `backend/app/services/file_service.py` 가 담당
  - analyzer 의 input/output 은 로컬 워크스페이스 전용이므로 gitignore

---

### D3 config.yaml dead config 섹션 명시 — 해소 완료 ✅

**[2026-04-17 해소]** 3개 섹션에 `[DEAD CONFIG - 2026-04-17]` 주석 일괄 추가:
- `grades` (100점 만점): 하드코딩 기준과 값 동일 유지, 코드 미참조
- `rubric_grades` (10점 만점): score_to_grade 하드코딩과 값 동일 유지, 코드 미참조
- `wordcloud`: 워드클라우드 기능(§8-4) 미구현 — 도입 시 활성화 예정
- `remedial_threshold: 6.0`: fix_data 를 학생 파일에서 직접 읽으므로 코드 미참조
- 각 섹션에 "향후 config 참조 전환 리팩터 시 활성화 예정" 명시

---

## 5. 결론 및 조치 우선순위

### 즉시 조치 (문서 정합성 확보)
1. CLAUDE.md §12 "시트 13개" → "현재 9개 / 향후 5개 추가" 업데이트
2. CLAUDE.md §13 "실행 모드별 처리" → "현재 단일 모드" 주석
3. CLAUDE.md §5 Step 0 / 0-4 / 8-4 / 9-4 → "현재 대화형 수동 / 향후 자동화 과제" 주석
4. CLAUDE.md §4 봉사활동 → "현재 미반영" 주석
5. config.yaml wordcloud 섹션 주석 처리

### 중기 과제 (향후 구현)
- 내신분석 / 입결비교 / 키워드분석 / 전형적합도 / 출결·봉사 시트 추가
- 실행 모드 CLI 옵션 (`--mode`)
- 2회차 분석 `_v{N}` 자동 접미사
- Step 0 기존 리포트 자동 탐색 / 동일 인물 확인
- 워드클라우드 + 형태소 분석 파이프라인
- 상담용 학생부 하이라이트 PDF

### 장기 과제 (확장)
- 구버전 모듈 3종 `modules/legacy/` 분리 또는 삭제
- 다수 학생 비교 분석, 합격 사례 매칭, 면접 예상 질문 생성 (CLAUDE.md §향후 확장 그대로)
