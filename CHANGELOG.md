# 변경 이력 (CHANGELOG)

입시라운지 프로젝트의 주요 수정사항을 날짜별로 기록합니다.

---

## 2026-04-07 ~ 2026-04-08

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
