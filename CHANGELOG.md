# 변경 이력 (CHANGELOG)

입시라운지 프로젝트의 주요 수정사항을 날짜별로 기록합니다.

---

## 2026-04-07 ~ 2026-04-08

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
