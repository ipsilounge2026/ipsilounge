---
description: 대기 중인 학생부 분석 건을 일괄 처리 (B옵션 배치 반자동)
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /process_pending — 대기 학생부 일괄 분석

관리자 admin-web 에서 "분석 시작" 또는 "재분석 요청" 을 클릭한
건들(analysis_orders.status = "processing")을 일괄 처리합니다.

## 사전 확인 (매 실행)

1. `echo $IPSILOUNGE_ADMIN_TOKEN` 로 토큰 설정 여부 확인
   - 비어있으면 admin-web 에서 관리자 로그인 후 localStorage JWT 추출
   - `export IPSILOUNGE_ADMIN_TOKEN=eyJhbGc...`
2. `echo $IPSILOUNGE_API_BASE` (기본 http://localhost:8000)

## 실행 절차

### Step 1. 대기 목록 조회

```bash
python -m modules.analysis_fetcher --pending
```

출력에서 각 건의:
- `analysis_id` (UUID)
- 학생명
- `is_text_pdf` (⚠️ 스캔 PDF 경고)
- `review_feedback` (재분석 피드백, 있으면 Claude 가 반드시 참고)

을 확인합니다.

### Step 2. 각 건 순차 처리

대기 건 N개 순회. **한 번에 한 건씩** 진행 권장 (대화 컨텍스트 보호).

#### 2-1. fetch: 학생부 + 학생 데이터 템플릿

```bash
python -m modules.analysis_fetcher fetch <ANALYSIS_ID> --student <학생명>
```

결과:
- `input/<ANALYSIS_ID>_<학생명>.pdf` — 학생부 원본
- `data/students/<학생명>.py` — 스캐폴딩 템플릿 (`analysis_id`, `source_pdf_path` 자동 주입)
  - 이전 review_feedback 이 있으면 파일 하단에 주석으로 포함됨

#### 2-2. 학생부 분석 (CLAUDE.md § Step 2~8)

`input/<ANALYSIS_ID>_<학생명>.pdf` 를 Read 도구로 읽고:

- Step 2 데이터 추출 (세특·창체·행특 원본 텍스트)
- Step 3~4 내신·입결 (현재는 생략 가능, A안 보류)
- Step 5 세특 루브릭 6/7항목 채점 (TARGET_MAJOR 유무에 따라)
- Step 6 창체 5항목 × 3영역 채점
- Step 7 행특 5항목 × 학년별 채점
- Step 8 연계성 · 역량별 · 종합 · 키워드 추출

**재분석인 경우** (`review_feedback` 있음):
- 피드백 내용을 최우선 반영하여 분석
- 피드백이 지적한 부분은 반드시 개선된 결과로 작성

#### 2-3. 학생 데이터 파일 완성

`data/students/<학생명>.py` 를 Edit 도구로 수정하여 모든 필수 변수 채움:

- 메타: STUDENT / SCHOOL / TODAY / TARGET_UNIV / TARGET_MAJOR
- 세특 4개: setuek_data / setuek_comments / comment_keys / good_sentences
- 창체 2개: changche_data / changche_comments
- 행특 2개: haengtuk_data / haengtuk_comments
- 종합 4개: linkage_data / eval_data / fix_data / summary_data
- 선택: raw_texts / attendance_data / volunteer_data / compare_data

CLAUDE.md 의 최소 글자수 기준 (세특 200 / 창체 300 / 행특 200 / growth 200) 모두 충족.

#### 2-4. 리포트 생성 + 자동 업로드

```bash
python generate_report.py <학생명> --auto-upload
```

동작:
1. QA 검증 (P1 전체 PASS 필수)
2. Excel + PDF 생성 (output/<학생명>_학생부분석_<TODAY>.{xlsx,pdf})
3. `analysis_fetcher.upload()` 자동 호출
4. backend status: processing → review (검수 대기)

**실패 처리**:
- QA FAIL → 학생 데이터 파일 수정 후 재실행
- 업로드 실패 → IPSILOUNGE_ADMIN_TOKEN 갱신 후 `upload` 단독 실행:
  ```bash
  python -m modules.analysis_fetcher upload <학생명> --analysis-id <ID>
  ```

### Step 3. 전체 완료 후

- 관리자에게 admin-web 분석 접수 목록 확인 요청
- 각 건이 "검수 대기" 상태로 보여야 정상
- 관리자가 "확인 완료" 또는 "재분석 요청" 버튼으로 검수

## 주의사항

- **한 세션에 처리 건수**: 3~5건 권장. 더 많으면 대화 컨텍스트 과부하.
- **이상 발견 시**: 해당 건 처리 중단 후 관리자에게 알림. 학생 데이터 파일은 유지 (재작업 기반).
- **스캔 PDF**: 학생부 분석 자체는 Claude Vision 으로 가능. 다만 Phase D (G6 하이라이트) 는 스킵됨.
- **재분석 반복**: 같은 학생 여러 번 재분석 시 `data/students/<학생명>.py` 의 `compare_data` 는 매번 이전 리포트와의 비교로 갱신되어야 함.

## 환경 점검 커맨드 (troubleshooting)

```bash
# 토큰 만료 확인
python -c "
import os, json, base64
t = os.environ.get('IPSILOUNGE_ADMIN_TOKEN', '')
if not t: print('TOKEN 없음'); exit()
try:
    payload = t.split('.')[1]
    payload += '=' * ((4 - len(payload) % 4) % 4)
    decoded = json.loads(base64.urlsafe_b64decode(payload))
    import datetime
    exp = datetime.datetime.fromtimestamp(decoded.get('exp', 0))
    print(f'토큰 만료: {exp} (현재: {datetime.datetime.now()})')
except Exception as e:
    print(f'토큰 파싱 실패: {e}')
"
```
