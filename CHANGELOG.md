# 변경 이력 (CHANGELOG)

입시라운지 프로젝트의 주요 수정사항을 날짜별로 기록합니다.
기획서가 있는 기능(고등학교 상담 V3 / 예비고1 V2_2 / 선배 상담 V1 / 선배-상담사 연계규칙 V1 / 만족도 설문)의 상세 사양 변경은 각 기획서 파일에 기록되고, 여기에는 커밋 요약만 남깁니다.

---

## 2026-04-17

### 선배상담-상담사 연계 V1 P3 — UX/정책 마무리
기획서: `선배상담_상담사상담_연계규칙_V1.md`
- **P3-① 비공유 필드 명시** — 공유 OFF 처리된 필드를 `_redacted_fields` 메타로 전달하여 "원래 빈 값"과 "의도된 비공유"를 구분
  - backend `_apply_sharing_filter`, `filter_note_for_senior` 양방향 필터에 적용
  - admin-web 세션 화면의 "선배 기록" 탭에 🔒 "선배 비공유" 배지 + 대체 플레이스홀더 블록
  - admin-web counselor-sharing 검토 화면 preview 에서 `_`-prefix 메타 숨김
- **P3-② 전면 철회 안내** — user-web `/mypage/senior-sharing` 하단에 "부분 철회 vs 전면 철회(회원 탈퇴)" 비교 카드 + 고객센터 요청 안내
- 테스트: `test_redacted_fields.py` 6건 신규 (backend pytest 17/17 pass)

### 선배상담-상담사 연계 V1 P2 — 운영 안정화
- **P2-① 사후 철회 API** — `consultation_surveys` / `consultation_notes` 에 `senior_sharing_revoked_at` / `revoke_reason` 필드 + `/api/user/consultation-sharing/{status,revoke,restore}` 3종 신설
- **P2-② 세션 시점 매핑** — `/api/admin/senior-consultation/student/{id}/counselor-timeline` (timing→date→created_at 정렬) + senior 역할은 `SeniorStudentAssignment` 매칭 학생만
- **P2-③ 실시간 미리보기** — `/api/admin/counselor-sharing/{type}/{id}/preview` (DB write 없음) + admin-web 300ms debounce 실시간 호출 · 갱신 중 배지 · D8/F/G 실제 포함 여부 동적 강조 · 공유 토글 카운터

## 2026-04-16

### 선배상담-상담사 연계 V1 P1 — 보안 기반 3단 방어
- **P1-① 관리자 검토 게이트** — `consultation_surveys` / `consultation_notes` 에 `senior_review_status` 등 5개 필드 + `admin_counselor_sharing_review.py` 라우터 (검토 대기/상세/제출)
- **P1-② 시스템 차단 카테고리** — `senior_sharing_service.BLOCKED_CATEGORIES = {D8, F, G}` + 기본 공유 화이트리스트 + `_strip_blocked_categories` 방어
- **P1-③ 공유 이력 감사 로그** — `consultation_data_access_logs` 테이블 + `/api/admin/audit/consultation-data-access` (super_admin 전용)
- 이용약관·개인정보처리방침에 V1 §6 / §6-1 / §10-1 원칙 반영
- admin-web 검토 UI 2페이지 + 감사 로그 뷰어 + 사이드바 메뉴 2개

### 고등학교 상담시스템 V3 gap 보완 (P0·P1·P2)
기획서: `고등학교 상담시스템_기획서_V3.md`
- backend·admin-web·user-web·mobile 4개 surface 동시 보완

### 선배 상담 V1 P1 보완
기획서: `선배상담_프로그램_기획서_V1.md`
- backend: 매칭 검증·timing 통일·가시성 필터
- admin-web: 민감정보 자동탐지·사전설문 전용 뷰
- user-web: 다수 선배 선택·사전설문 게이트·변경요청 이력
- mobile: 상담 기록 진입점·사전설문 자동 연계

## 2026-04-15

### 백엔드 인프라
- **SHARED_DATA_ROOT 도입** (`backend/app/config.py`): `school-record-analyzer/data/` 를 단일 원천으로 지정. 환경변수 `SHARED_DATA_ROOT` 오버라이드 지원. `settings.DATA_ROOT` property 로 일관된 접근.
- **연계규칙 V1 문서 추가**: `선배상담_상담사상담_연계규칙_V1.md`
- **Flutter/Gradle 빌드 인프라 보강**: Android SDK 36, AGP 8.9.1, Kotlin 2.1.0 (CHANGELOG 2026-04-07~08 섹션 참조)
- **.gitignore 보강**: 빌드 캐시 / 로컬 환경 / IDE 설정 / 임시 파일

### 기획서 영역 구현
- 만족도 설문 자동 발송 + 권한/무기명 정책 (만족도 설문 기획서 P1 #3)
- 고등학교 상담 V3 §4-8-1: 자동 분석 결과 검증(4-State) + 권장과목 매칭
- 고등학교 상담 V3: 신규 질문 타입 3종 (school_grade_matrix / mock_exam_session_grid / weak_type_per_subject)

## 2026-04-14

### 전반 기능
- **약관동의 백엔드 저장**: 회원가입 시 이용약관·개인정보처리방침 동의 이력 DB 저장
- **가이드북 시스템** (`guidebook` 모델 + `admin_guidebook` 라우터 + admin-web 페이지): 시점별+항목별 구조로 관리, 선배 상담 세션 패널에 연동
- **학습상담 7일 리드타임 + 선배상담 매칭 전제 예약 흐름**: user-web 상담 라운지에서 상담 유형별로 상이한 예약 가드 적용
- **관리자웹 상담시간 설정에서 선배 슬롯 관리 지원**: super_admin 이 선배 슬롯도 생성/관리
- **user-web 메뉴 정리**: 중복 "상담 관리"·"대입 정보" 제거, `admission-info` 페이지 삭제

### 기획서 영역
- 선배 사전 설문 UI (user-web + mobile)
- 만족도 설문 + 선배 변경 요청 UI
- 선배 품질 대시보드 + 만족도 추이 시각화 보완
- 사용자웹 리포트에 과목별 경쟁력 섹션 추가

## 2026-04-13

### 전반 기능
- **역할별 대시보드 분기 + 메뉴 권한 체계 정립** (super_admin/admin/counselor/senior + student/parent/branch_manager)
- **역할 변경/승격 시 기본 메뉴 권한 자동 설정**
- **관리자 웹 로그인 "아이디 저장" / "로그인 유지"** (admin-web login 페이지 재작성 + 401 자동 재로그인)
- **Navbar에 상담 관리 탭 분리** (상담 슬롯 vs 예약)

### 기획서 영역
- 예비고1 E2 영어 설문 확대 (외고/국제고 판별) + 교과선행도 배점
- 예비고1 고교유형 적합도 분석
- 예비고1 리포트 3대 시각화 (성적추이/학습습관/로드맵)
- 고등학생 리포트 차트 (내신/모의/비교) + 학습 로드맵 자동 생성 (timing별 Phase×4트랙)
- Delta 설문 UI + 선배-상담사 데이터 공유
- 상담사 검토/수정 기능 (C4 유형 판정 + 코멘트 + 로드맵 편집), 최근 3년 평균 기준
- 관리자 선배기록 검토 화면 + 상담사 선배기록 탭
- 시점별 상담 주제 가이드 + 변화 추적 탭
- 10-STEP 설문순서 + 학습방법 매트릭스 + 수능최저 시뮬레이션
- 선배 상담 기록 10-섹션 작성 폼 + 누적 데이터 요약
- 학생용 선배 상담 기록 열람 (API + user-web + mobile)

## 2026-04-10 ~ 2026-04-11

### 전반 기능
- **재원생 여부 + `is_academy_student` 컬럼 추가** (회원가입/마이페이지 편집 UI)
- **5-tab 네비게이션 (mobile)** + 학생부/학종 분리
- **학생-학부모 가족 연결 시스템 Phase A/B/C/D**: 초대 코드 기반 양방향 연결 · 가족 가시성 헬퍼 (read-only 조회) · 학부모 신청 시 자녀 선택 · 사전조사 학부모 카테고리 분리 · 낙관적 잠금(last_known_updated_at)
- **마이페이지 빠른 메뉴 분석 내역 학생부/학종 분리**

### 기획서 영역
- 사전 상담 설문 시스템 Week 1~8 (모델+CRUD+자동판정+이어쓰기 → 동적 폼 렌더러 → 상담사 대시보드 → recharts 시각화 → PDF 리포트)
- 사전조사 검증·게이팅 (빈 조사 제출 차단 + 스킵 차단 + 최종 제출 시 모든 카테고리 검증)
- 빈 사전조사 정리 스크립트 (dry-run 기본, `--apply` 필요)
- Week5 상담사 대시보드 — 자동분석/변경비교/메모
- Week6 시각화 — 내신추이/모의고사/등급분포/학습레이더
- Week7 PDF report, action plan, consultation session page
- Week8 버그 수정 — cancel_reason, PDF error, category enum
- 4영역 점수 산출 엔진 + 4각형 레이더 차트
- 상담사 검토/수정 범위 + 예비고1→고1 전환 데이터 자동 연계 (source_survey_id)
- 상담 기록 불변 정책 적용 (수정/삭제 불가, 추가 기록만 가능)
- **선배 역할/매칭 시스템** + 대면/비대면 상담 방식
- 예비고1 5축 레이더 점수 산출 엔진
- 예비고1 리포트 뷰어 + 과목별 준비율 차트 + 로드맵 자동 초안
- 관리자 웹 선배 매칭/변경 요청/대면·비대면 UI

### 버그 수정
- 상담 라운지 사전 조사 단계에서 예비고1 설문 연결 오류
- 카테고리 탭 클릭 네비게이션 (학부모만 허용, 학생은 순차 진행)
- Flutter MapEntry 타입 명시 오류
- 백엔드 BaseModel import 누락
- `isCurrentReadOnly` 선언 순서 오류
- 설문 카테고리 탭 클릭 활성화

---

## 2026-04-07 ~ 2026-04-08

### 앱 아이콘/파비콘 적용 (user-web + mobile)
- **원본 아이콘**: `ipsilounge/assets/favicon.png` (1025×1025 RGBA PNG, 파란/청록 그라디언트 위치 핀 + 홈 심볼)
- **user-web** (Next.js App Router가 자동 인식)
  - `user-web/src/app/favicon.ico` (멀티 사이즈 16/32/48)
  - `user-web/src/app/icon.png` (512×512)
  - `user-web/src/app/apple-icon.png` (180×180, iOS "홈 화면에 추가")
- **mobile (Android)**: Python + Pillow로 5개 mipmap 폴더의 `ic_launcher.png` 자동 생성
  - `mipmap-mdpi` 48×48
  - `mipmap-hdpi` 72×72
  - `mipmap-xhdpi` 96×96
  - `mipmap-xxhdpi` 144×144
  - `mipmap-xxxhdpi` 192×192
  - 원본 보관: `mobile/assets/icon/icon.png` (1024×1024)
  - 재생성 스크립트: `mobile/scripts/generate_launcher_icons.py` (원본 교체 후 해당 스크립트만 실행하면 전 사이즈 자동 재생성)
- **admin-web**: 요청 사항에 따라 현 상태 유지 (파비콘 미적용)
- **참고**: `flutter_launcher_icons` 패키지는 쓰지 않음 — 한글 경로에서 `flutter pub run` 이슈를 피하기 위해 Python 스크립트 방식 채택

### [버그 수정] 비밀번호 찾기/재설정 API URL 오류 (404)
- **문제**: `forgot-password` / `reset-password` 페이지가 API 호출 시 `/api` 프리픽스 없이 `/auth/forgot-password`, `/auth/reset-password`로 요청하여 **404 Not Found** 발생. 사용자가 비밀번호 찾기를 시도해도 항상 "오류가 발생했습니다" 메시지만 뜨는 상태였음
- **원인**: `fetch` 호출 URL에서 `/api` 경로 누락 (공통 `request()` 헬퍼를 사용하지 않고 직접 fetch 호출)
- **발견 경위**: 특정 지점관리자가 로그인·비밀번호 찾기가 모두 안 된다는 제보 → 서버 로그 분석 결과 `POST /auth/forgot-password HTTP/1.0 404 Not Found` 확인
- **수정**
  - `user-web/src/app/forgot-password/page.tsx`
    - URL: `/auth/forgot-password` → `/api/auth/forgot-password`
    - 에러 처리 개선: 429(rate limit) 별도 메시지, 서버 응답의 `detail` 필드 표시
  - `user-web/src/app/reset-password/page.tsx`
    - URL: `/auth/reset-password` → `/api/auth/reset-password`

### 대학/학과 선택 드롭다운 (입결 DB 기반)
- **변경**: 학생부 라운지 / 학종 라운지 신청 시 대학·학과를 자유 텍스트 입력 → **검색 가능한 드롭다운**으로 전환
- **데이터 소스**: `school-record-analyzer/data/admission_db.xlsx` (수시입결RAW 시트)
  - 컬럼: `대학|전형구분|전형명|모집단위명|학년도|모집인원|지원자|경쟁률|추합|입결50%|입결70%|비고`
  - 최신 학년도 자동 감지(`SELECT MAX(year) FROM admission_data`) → 연도 하드코딩 없이 자동 전환
  - 대학/학과 모두 **가나다 순** 정렬
  - 현재 반영: 2027학년도 기준 82개 대학, 총 35,173 rows 적재 (2024~2027)
- **백엔드 신규/수정 파일**
  - `backend/app/models/admission_data.py` (신규): `admission_data` 테이블 모델 (university, major, year 인덱스)
  - `backend/app/routers/universities.py` (신규)
    - `GET /api/universities` → `{year, universities[]}` 반환
    - `GET /api/universities/majors?university=...` → `{year, university, majors[]}` 반환
    - `_get_latest_year()` 헬퍼로 최신 학년도 조회
  - `backend/scripts/import_admission_data.py` (신규): 엑셀 파싱 후 `admission_data` 테이블 bulk insert (1000행 단위 배치, `--clear` 옵션 지원)
  - `backend/app/main.py`: `universities` 라우터 및 `admission_data` 모델 등록
- **user-web 신규/수정 파일**
  - `user-web/src/components/SearchableSelect.tsx` (신규): 재사용 가능한 검색형 combobox 컴포넌트 (실시간 필터, 외부 클릭 닫힘, 지우기 버튼)
  - `user-web/src/lib/api.ts`: `getUniversities()`, `getUniversityMajors(university)` 추가
  - `user-web/src/app/analysis/apply/page.tsx`
    - `TextField` → `SearchableSelect`로 교체 (대학 선택 시 학과 목록 자동 로드)
    - "※ N학년도 기준 대학·학과 데이터입니다." 안내 문구 표시
- **mobile 수정 파일**
  - `mobile/lib/services/analysis_service.dart`: `getUniversities()`, `getUniversityMajors(university)` 추가
  - `mobile/lib/screens/analysis_apply_screen.dart`
    - Flutter `Autocomplete<String>` 위젯으로 대학/학과 입력 필드 교체
    - `TextEditingController` 제거 → `_university`, `_major` 상태 변수로 전환
    - 대학 선택 시 해당 학과 목록 자동 로드, 학과 필드는 대학 선택 전까지 비활성화
    - 대학·학과 검색 결과 드롭다운, 지우기 버튼, 데이터 기준 학년도 안내 표시
- **운영 반영**: 서버에 `openpyxl` 설치 후 `scripts/import_admission_data.py` 실행 → `admission_data` 테이블에 35,173 rows 적재 완료

### 학생부 라운지 / 학종 라운지 상담 자격 분리
- **문제**: 학생부 라운지를 신청하지 않았는데 학종 라운지만 신청했어도, "학생부 분석 상담"이 자격 충족으로 인식되어 예약 가능했음. 즉 두 라운지가 구분 없이 처리됨
- **수정**
  - `backend/app/routers/analysis.py` `check_consultation_eligible`
    - `consultation_type` → `service_type` 매핑 추가 (`학생부분석` → `학생부라운지`, `학종전략` → `학종라운지`)
    - `AnalysisOrder` 조회 시 해당 `service_type` 필터 적용
    - 자격 미달 메시지·가이드를 라운지별로 명확히 분기
    - 응답에 `required_service` 필드 추가
  - `user-web/src/app/consultation/page.tsx`: 자격 미달 화면에서 상담 유형에 맞는 라운지(학생부/학종)만 안내
  - `mobile/lib/screens/consultation_screen.dart`: 동일하게 상담 유형별로 안내 라운지 분기

### 학생-담당자 매칭에서 지점관리자 제외
- **문제**: 지점관리자로 가입한 회원이 학생-담당자 매칭 페이지의 학생 목록에 노출됨
- **수정**
  - `backend/app/routers/admin_users.py`: `list_users`에 `exclude_branch_manager` 쿼리 파라미터 추가
  - `backend/app/routers/admin_admins.py`: 미매칭 학생 목록에서 `branch_manager` 회원 자동 제외
  - `admin-web/src/lib/api.ts`: `getUsers`에 `excludeBranchManager` 인자 추가
  - `admin-web/src/app/assignments/page.tsx`: 회원 목록 로드·검색 시 지점관리자 제외 옵션 사용

### 학생-담당자 매칭에서 이미 매칭된 학생 제외
- **문제**: "새 매칭 추가" 폼의 학생 선택 목록에 이미 매칭된 학생이 그대로 노출됨
- **수정**: `admin-web/src/app/assignments/page.tsx`에서 `assignments`에 이미 존재하는 `user_id`를 가진 회원을 드롭다운에서 클라이언트 사이드 필터링으로 제외

### 설명회 시간대 캘린더 반영 시간 변경
- 오전 09:00~12:00 → **11:00~13:00**
- 오후 13:00~17:00 → **14:00~16:00**
- 저녁 18:00~21:00 → **19:00~21:00**
- 수정 파일: `backend/app/services/calendar_service.py` (`SEMINAR_TIME_SLOTS`)

### 다중 구글 캘린더 연동 지원
- 관리자 개인 캘린더 + 입시라운지 공식 캘린더(`ipsinoreply@gmail.com`) 양쪽 동시 연동
- `backend/app/config.py`: `GOOGLE_CALENDAR_EXTRA_IDS` 환경변수 추가 (쉼표 구분)
- `backend/app/services/calendar_service.py`: 다중 캘린더용 헬퍼 함수 (`_get_all_calendar_ids`, `_create_event_on_all`, `_update_event_on_all`, `_delete_event_on_all`) 추가
- `backend/app/models/seminar_reservation.py` / `consultation_booking.py`: `google_event_id` 컬럼을 `String(255)` → `Text`로 변경 (여러 이벤트 ID 저장)
- 운영 DB에서 `ALTER TABLE ... ALTER COLUMN google_event_id TYPE TEXT` 실행 완료

### 구글 캘린더 자동 연동 (초기 도입)
- 서비스 계정(`ipsilounge-calendar@ipsilounge.iam.gserviceaccount.com`) 기반 연동
- 설명회 예약 승인/수정/취소 시 캘린더 일정 자동 생성/수정/삭제
- 상담 예약 확정/취소 시 캘린더 일정 자동 생성/삭제 (30분 전 팝업 알림)
- 신규 파일: `backend/app/services/calendar_service.py`
- `backend/requirements.txt`: `google-api-python-client==2.114.0`, `google-auth==2.27.0` 추가
- 서버 `.env`에 `GOOGLE_CALENDAR_CREDENTIALS_PATH`, `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_EXTRA_IDS` 설정
- 서비스 키 파일: `/home/ubuntu/ipsilounge/backend/google-calendar-key.json`
- DB 마이그레이션: `seminar_reservations`, `consultation_bookings` 테이블에 `google_event_id` 컬럼 추가

### 설명회 예약 수정/취소 기능 (지점관리자 마이페이지)
- 지점관리자 마이페이지에 설명회 예약 수정/취소 버튼 추가
- **마감일시 이전**에만 수정/취소 가능 (deadline 검사)
- 수정 폼: 날짜 드롭다운, 시간대 버튼(잔여 인원 표시), 참석 인원, 메모, 수정 사유
- **수정 후에는 관리자 재승인 필요** (status → `modified`)
- 취소 폼: 취소 사유 입력
- 수정 파일
  - `user-web/src/app/mypage/page.tsx` (대규모 개편)
  - `backend/app/routers/seminar.py`: `modify_reservation`·`cancel_reservation`에 마감일 검사 추가
  - `backend/app/schemas/seminar.py`: `SeminarReservationResponse`에 `deadline_at` 필드 추가

### 관리자 웹 로그인 "아이디 저장" / "로그인 유지"
- 로그인 화면에 체크박스 2개 추가
- 아이디 저장: 이메일을 `localStorage`에 저장
- 로그인 유지: 비밀번호를 base64 인코딩하여 저장, 401 발생 시 자동 재로그인
- 수정 파일
  - `admin-web/src/app/login/page.tsx` (재작성)
  - `admin-web/src/lib/api.ts`: `tryAutoReLogin()` 함수 추가, 401 시 자동 재인증
  - `admin-web/src/lib/auth.ts`: `logout()`에서 관련 localStorage 키도 삭제

### 지점관리자 회원가입 지점명 드롭다운
- 회원가입 폼의 지점명을 텍스트 입력 → 드롭다운으로 변경
- 10개 지점을 가나다 순으로 정렬, `대치스터디센터점`은 맨 아래 고정
  - 경복궁점, 광화문점, 구리점, 대치점, 대흥점, 마포점, 분당점, 은평점, 중계점, 대치스터디센터점
- 수정 파일: `user-web/src/app/register/page.tsx`

### 라벨 변경: "지원 대학/학과" → "희망 지원 대학/학과"
- 학생부라운지/학종라운지 신청 관련 9개 파일
  - `user-web`: `analysis/apply/page.tsx`, `analysis/[id]/page.tsx`, `analysis/upload/page.tsx`, `page.tsx`, `payment/page.tsx`
  - `admin-web`: `analysis/page.tsx`, `analysis/[id]/page.tsx`
  - `mobile`: `analysis_apply_screen.dart`, `analysis_detail_screen.dart`

### 모바일 앱 Android 툴체인 업그레이드 (APK 빌드용)
- Android SDK: `compileSdk`/`targetSdk` 35 → **36**
- NDK: `25.1.8937393` → **27.0.12077973**
- Android Gradle Plugin: 8.3.0 → **8.9.1**
- Gradle Wrapper: 8.4 → **8.11.1**
- Kotlin: 1.9.22 → **2.1.0**
- 한글 경로 우회: `C:/temp_build/mobile`에서 빌드, `android.overridePathCheck=true`
- 수정 파일: `mobile/android/app/build.gradle`, `mobile/android/settings.gradle`, `mobile/android/build.gradle`, `mobile/android/gradle/wrapper/gradle-wrapper.properties`
