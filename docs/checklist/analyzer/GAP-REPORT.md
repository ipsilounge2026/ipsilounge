# analyzer CLAUDE.md ↔ 실구현 Gap 보고서

- **작성일**: 2026-04-17
- **검증자**: Claude (C-안 전체 섹션 순회)
- **대상**: `ipsilounge/analyzer/CLAUDE.md` vs `ipsilounge/analyzer/` 실제 구현
- **범위**: 현재 운영 버전 (`generate_report.py` + `modules/report_logic.py` + `modules/qa_validator.py`) 기준
- **제외**: 구버전 모듈 (`modules/report_generator.py`, `modules/extractor.py`, `modules/comprehensive_analyzer.py` 등) — 현재 파이프라인에서 호출되지 않음

---

## 0. 요약

| 구분 | 건수 |
|---|---|
| **일치 (PASS)** | 9 영역 |
| **명시적 Gap (미구현)** | 7 건 |
| **부분 구현 / 운영 모드 차이** | 3 건 |
| **스펙-구현 불일치 (문서 업데이트 필요)** | 3 건 |

운영에는 지장 없는 상태(Claude 대화형 수동 워크플로우로 실질 기능 제공 중). 단, CLAUDE.md 는 "완전 자동 파이프라인" 으로 기술되어 있어 문서-구현 간 기대 불일치가 있음.

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

### G1 (P1) §12 Excel 시트 13개 명세 → 실제 9개 구현

**CLAUDE.md §12 명시 13 시트** vs **실제 구현 9 시트**:

| CLAUDE.md 명세 | report_logic.py 구현 | 상태 |
|---|---|---|
| 종합요약 | 종합요약 (`wb.active`) | ✅ |
| 내신분석 | — | ❌ 미구현 |
| 입결비교 | — | ❌ 미구현 |
| 세특분석 | 세특분석 + 세특코멘트 + 핵심평가문장 (3개로 분리) | ✅ (분리 구현) |
| 창체분석 | 창체분석 | ✅ |
| 행특분석 | 행특분석 | ✅ |
| 연계성분석 | 연계성분석 | ✅ |
| 키워드분석 | — | ❌ 미구현 |
| 전형적합도 | — | ❌ 미구현 |
| 대학평가요소 | 대학평가요소 | ✅ |
| 역량별보완법 | 역량별보완법 | ✅ |
| 이전분석대비변화 | — | ❌ 미구현 (2회차 전용) |
| 출결·봉사 | — | ❌ 미구현 |

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

### G3 (P1) §5 Step 0 기존 리포트 자동 확인 미구현

**CLAUDE.md §5 Step 0 명세**:
- output/ 폴더 자동 탐색
- 동일 인물 확인 (학교명 / 생년월일 / 학년 대조)
- 이전 리포트 검토 (이전 보완점, 강점 메모리 로드)

**실제 generate_report.py**: Step 0 로직 없음.

**실제 운영 방식**: Claude 대화형 세션에서 수동으로 output/ 폴더 탐색 + 이전 리포트 대조. 진입점 자동화 아님.

**조치 권고**: CLAUDE.md §5 Step 0 에 `※ 현재는 Claude 대화형 수동 처리. 진입점 자동화는 향후 과제.` 주석 추가.

---

### G4 (P1) §5 Step 0-4 / §13 2회차 이상 분석 `_v{N}` 접미사 미구현

**CLAUDE.md**: `연승훈_학생부분석_20260407_v2.xlsx` 자동 접미사.

**실제**: generate_report.py L154~155:
```python
xlsx_path = OUTPUT_DIR / f"{sd.STUDENT}_학생부분석_{sd.TODAY}.xlsx"
pdf_path  = OUTPUT_DIR / f"{sd.STUDENT}_학생부분석_{sd.TODAY}.pdf"
```
단순히 `{STUDENT}_학생부분석_{TODAY}.xlsx` 형식. `_v2`, `_v3` 로직 없음.

**조치 권고**: CLAUDE.md 에 "현재는 Claude 대화형 수동 파일명 지정" 주석 + 향후 과제로 분리.

---

### G5 (P1) §5 Step 8-4 워드클라우드 + §12 키워드분석 시트 미구현

**CLAUDE.md §5 Step 8-4**:
- 형태소 분석 (konlpy / kiwi) → 빈도 추출 → 카테고리 분류 → 워드클라우드 PNG → PDF 삽입
- 키워드 빈도표 (빈도수/카테고리/출현영역)
- 학년별 키워드 변화 추이

**실제**:
- `ipsilounge/analyzer/modules/report_logic.py`: 워드클라우드/키워드 관련 코드 없음
- `requirements.txt`: wordcloud, matplotlib, konlpy/kiwipiepy 등 미포함
- `config.yaml`: `wordcloud:` 섹션 존재하나 dead config (아무도 읽지 않음)

**조치 권고**:
- CLAUDE.md §5 Step 8-4 를 "향후 구현 예정" 으로 표시
- config.yaml 의 `wordcloud:` 섹션은 제거하거나 `# 향후 워드클라우드 기능용` 주석 추가

---

### G6 (P1) §5 Step 9-4 상담용 학생부 하이라이트 PDF 미구현

**CLAUDE.md**: 학생부 원본에 번호 태그 + 반투명 형광(노랑/초록/주황) 하이라이트 + 범례 페이지.

**실제**: `create_pdf()` 는 분석 리포트 PDF 1개만 생성. 하이라이트 PDF 별도 생성 없음.

**조치 권고**: CLAUDE.md §5 Step 9-4 를 "향후 구현 예정 (P2)" 으로 표시.

---

### G7 (P2) §4 봉사활동 시수 별도 표기 미구현

**CLAUDE.md §4**: "봉사시간만 별도 정리하여 리포트에 표기"

**실제**:
- `_template.py`: 봉사 관련 변수 없음 (15개 필수 변수에 포함 안 됨)
- `report_logic.py`: 봉사 섹션 없음
- `REQUIRED_VARS` 리스트에도 없음

**조치 권고**: 봉사 변수를 template 에 추가하거나, CLAUDE.md §4 에서 "현재 미반영 — 향후 출결·봉사 시트 구현 시 추가" 로 업데이트.

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
