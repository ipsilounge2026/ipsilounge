# 입시라운지 (IpsiLounge) 서비스 프로젝트

## 프로젝트 개요

학생부 분석 + 입시 상담 예약 + 입시 사례 공유 플랫폼.
사용자가 학생부를 업로드하면 관리자가 분석 후 리포트를 전달하고, 상담 예약을 통해 1:1 컨설팅을 제공하는 구조.

---

## 기술 스택

| 구성 요소 | 기술 | 비고 |
|-----------|------|------|
| 백엔드 API | FastAPI (Python) | 비동기 처리 (async/await) |
| 데이터베이스 | PostgreSQL (프로덕션) / SQLite (개발) | SQLAlchemy 2.0 async |
| 파일 저장소 | AWS S3 (프로덕션) / 로컬 (개발) | file_service.py에서 분기 |
| 관리자 웹 | Next.js (React) | Vercel 배포, 포트 3001 |
| 사용자 웹 | Next.js (React) | Vercel 배포, 포트 3000 |
| 모바일 앱 | Flutter (Dart) | Android 전용 |
| 푸시 알림 | FCM (Firebase Cloud Messaging) | 분석완료/상담리마인드 |
| 결제 (웹) | 토스페이먼츠 | PG사 결제 |
| 결제 (앱) | Google Play Billing | 인앱결제 |
| 이메일 | SMTP (Gmail) | 비밀번호 재설정, 상담 리마인드 |
| 스케줄러 | APScheduler | 매일 9시 상담 리마인드 발송 |

---

## 서버/배포 정보

| 항목 | 상세 |
|------|------|
| 백엔드 서버 | AWS EC2 (ubuntu@3.107.217.182) |
| SSH 키 | `C:\Users\orbik\Dropbox\관리\홈페이지 AWS Key\ipsilounge\ipsilounge-key.pem` |
| 배포 명령 | `cd /home/ubuntu/ipsilounge && git pull && sudo systemctl restart ipsilounge` |
| 관리자 웹 | Vercel 자동 배포 (push 시) - admin.ipsilounge.co.kr |
| 사용자 웹 | Vercel 자동 배포 (push 시) - ipsilounge.co.kr |
| CORS 허용 | localhost:3000, localhost:3001, ipsilounge.com, ipsilounge.co.kr, admin.ipsilounge.co.kr 등 |

---

## 디렉토리 구조

```
ipsilounge/
├── CLAUDE.md                           # 이 파일
├── docker-compose.yml
├── setup-server.sh
├── nginx/
│
├── backend/                            # FastAPI 백엔드
│   ├── app/
│   │   ├── main.py                     # FastAPI 앱 진입점 + DB 마이그레이션
│   │   ├── config.py                   # 환경변수 설정 (Settings, SHARED_DATA_ROOT 포함)
│   │   ├── database.py                 # DB 연결 (async_session, engine)
│   │   │
│   │   ├── models/                     # SQLAlchemy 모델
│   │   │   # ── 회원·인증·권한 ──
│   │   │   ├── user.py                 # 회원
│   │   │   ├── admin.py                # 관리자 + AdminStudentAssignment + SeniorStudentAssignment
│   │   │   ├── password_reset_token.py # 비밀번호 재설정 토큰
│   │   │   ├── family_link.py          # 학생-학부모 계정 연결
│   │   │   ├── family_invite.py        # 가족 초대 코드
│   │   │   # ── 분석(학생부/학종 라운지) ──
│   │   │   ├── analysis_order.py       # 분석 요청 (학생부라운지/학종라운지)
│   │   │   ├── analysis_share.py       # 분석 결과 공유 (7일 토큰)
│   │   │   ├── interview_question.py   # 면접 예상 질문
│   │   │   ├── admission_case.py       # 입시 사례
│   │   │   ├── admission_data.py       # 수시 입결 DB (대학·학과 드롭다운 데이터)
│   │   │   ├── jeongsi_admission_data.py   # 정시 입결 DB
│   │   │   # ── 상담 공통 (슬롯·예약·결제·알림) ──
│   │   │   ├── consultation_slot.py    # 상담 시간대 (admin_id, repeat_group_id, google_event_id)
│   │   │   ├── consultation_booking.py # 상담 예약 (google_event_id, senior 예약 포함)
│   │   │   ├── counselor_change_request.py # 담당자 변경 요청
│   │   │   ├── payment.py              # 결제
│   │   │   ├── notification.py         # 알림
│   │   │   # ── 공지·세미나·가이드북 ──
│   │   │   ├── notice.py               # 공지사항
│   │   │   ├── guidebook.py            # 가이드북
│   │   │   ├── seminar_schedule.py     # 설명회 일정
│   │   │   ├── seminar_reservation.py  # 설명회 예약
│   │   │   ├── seminar_mail_log.py     # 설명회 메일 로그
│   │   │   # ── 기획서 영역 (상세는 각 기획서 참조) ──
│   │   │   ├── consultation_note.py    # 상담 기록 (고등학교 상담 V3 + 연계규칙 V1 공유 필드)
│   │   │   ├── consultation_survey.py  # 상담 설문 (고등학교 상담 V3)
│   │   │   ├── senior_consultation_note.py # 선배 상담 기록 (선배 상담 V1)
│   │   │   ├── senior_pre_survey.py    # 선배 사전 설문 (선배 상담 V1)
│   │   │   ├── senior_change_request.py    # 선배 변경 요청 (선배 상담 V1)
│   │   │   ├── satisfaction_survey.py  # 상담 만족도 설문 (만족도 설문 기획서)
│   │   │   └── consultation_data_access_log.py # 연계규칙 V1 §10-2 감사 로그
│   │   │
│   │   ├── schemas/                    # Pydantic 요청/응답 스키마
│   │   │   ├── user.py
│   │   │   ├── analysis.py
│   │   │   ├── consultation.py
│   │   │   ├── consultation_survey.py  # (기획서 영역)
│   │   │   ├── payment.py
│   │   │   ├── notice.py
│   │   │   ├── seminar.py
│   │   │   └── family.py
│   │   │
│   │   ├── routers/                    # API 엔드포인트
│   │   │   # ── 전반 기능 ──
│   │   │   ├── auth.py                 # 인증 (회원가입/로그인/비밀번호 재설정)
│   │   │   ├── users.py                # 회원 정보/FCM 토큰/알림
│   │   │   ├── analysis.py             # 사용자 분석 관련
│   │   │   ├── consultation.py         # 사용자 상담 예약 (상담자 선택 포함)
│   │   │   ├── admission_cases.py      # 입시 사례 + 면접 질문 + 공유 링크
│   │   │   ├── payment.py              # 결제 처리
│   │   │   ├── notice.py               # 공지사항
│   │   │   ├── seminar.py              # 설명회 예약 (지점관리자)
│   │   │   ├── family.py               # 가족(학부모-학생) 연결
│   │   │   ├── schools.py              # 학교명 검색
│   │   │   ├── universities.py         # 대학/학과 검색 (입결 DB 기반)
│   │   │   ├── dev_routes.py           # 개발용 유틸 엔드포인트
│   │   │   ├── admin_dashboard.py      # 관리자 대시보드
│   │   │   ├── admin_analysis.py       # 관리자 분석 관리 (매칭 필터링)
│   │   │   ├── admin_consultation.py   # 관리자 상담 시간/예약 관리 (선배 슬롯 포함)
│   │   │   ├── admin_admission_cases.py    # 관리자 입시 사례 관리
│   │   │   ├── admin_users.py          # 관리자 회원 관리
│   │   │   ├── admin_payments.py       # 관리자 결제 관리
│   │   │   ├── admin_admins.py         # 관리자 계정/역할/매칭 관리
│   │   │   ├── admin_notice.py         # 관리자 공지사항
│   │   │   ├── admin_guidebook.py      # 관리자 가이드북
│   │   │   ├── admin_seminar.py        # 관리자 설명회 관리
│   │   │   ├── admin_audit_log.py      # 관리자 감사 로그 뷰어 (super_admin 전용)
│   │   │   # ── 기획서 영역 (상세는 각 기획서 참조) ──
│   │   │   ├── consultation_notes.py           # (고등학교 상담 V3)
│   │   │   ├── consultation_survey.py          # (고등학교 상담 V3)
│   │   │   ├── admin_consultation_notes.py     # (고등학교 상담 V3)
│   │   │   ├── admin_consultation_survey.py    # (고등학교 상담 V3)
│   │   │   ├── admin_senior_consultation.py    # (선배 상담 V1)
│   │   │   ├── senior_notes.py                 # (선배 상담 V1)
│   │   │   ├── senior_pre_survey.py            # (선배 상담 V1)
│   │   │   ├── satisfaction_survey.py          # (만족도 설문 기획서)
│   │   │   ├── admin_counselor_sharing_review.py # (연계규칙 V1)
│   │   │   └── user_consultation_sharing.py    # (연계규칙 V1 §10-1)
│   │   │
│   │   ├── services/                   # 비즈니스 로직
│   │   │   # ── 전반 기능 ──
│   │   │   ├── auth_service.py         # JWT 토큰 발급/검증
│   │   │   ├── file_service.py         # S3/로컬 파일 업로드/다운로드
│   │   │   ├── consultation_service.py # 상담 시간 계산/벌크 생성
│   │   │   ├── notification_service.py # FCM 푸시 + DB 알림 저장
│   │   │   ├── email_service.py        # SMTP 이메일 발송
│   │   │   ├── payment_service.py      # 결제 검증 (토스/구글)
│   │   │   ├── scheduler_service.py    # APScheduler (상담 리마인드)
│   │   │   ├── calendar_service.py     # Google Calendar 다중 연동
│   │   │   ├── school_service.py       # 학교 검색·정규화
│   │   │   ├── course_requirement_service.py  # 권장과목 DB (SHARED_DATA_ROOT)
│   │   │   ├── counselor_type_service.py      # 수시/정시 입결 판정
│   │   │   ├── suneung_minimum_service.py     # 수능 최저 기준 DB
│   │   │   ├── consultation_access_log_service.py # V1 감사 로그 기록
│   │   │   # ── 기획서 영역 ──
│   │   │   ├── senior_sharing_service.py       # (연계규칙 V1 §6/§6-1)
│   │   │   ├── survey_scoring_service.py       # (고등학교 상담 V3)
│   │   │   ├── survey_timing_service.py        # (고등학교 상담 V3)
│   │   │   ├── survey_qa_validator.py          # (고등학교 상담 V3)
│   │   │   ├── survey_resume_service.py        # (고등학교 상담 V3)
│   │   │   ├── survey_report_service.py        # (고등학교 상담 V3)
│   │   │   └── comment_generation_service.py   # (고등학교 상담 V3)
│   │   │
│   │   └── utils/
│   │       ├── security.py             # 비밀번호 해시, JWT
│   │       ├── dependencies.py         # get_current_user, get_current_admin
│   │       ├── family.py               # 가족 연결 유틸
│   │       └── rate_limiter.py         # slowapi 기반 IP 레이트 리미터
│   │
│   ├── tests/                          # pytest 단위 테스트
│   ├── scripts/                        # 데이터 마이그레이션 스크립트 (import_admission_data 등)
│   ├── requirements.txt
│   └── Dockerfile
│
├── admin-web/                          # 관리자 웹 (Next.js)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx              # 전체 레이아웃
│   │   │   ├── page.tsx                # 대시보드 (권한 체크 포함)
│   │   │   ├── login/page.tsx          # 로그인 (아이디 저장·로그인 유지·역할별 리다이렉트)
│   │   │   # ── 전반 기능 ──
│   │   │   ├── analysis/                    # 분석 관리
│   │   │   ├── consultation/                # 상담 시간/예약/기록 관리 (기획서 영역 혼재)
│   │   │   ├── users/                       # 회원 관리
│   │   │   ├── payments/                    # 결제 현황
│   │   │   ├── admins/                      # 담당자 관리
│   │   │   ├── assignments/                 # 학생-담당자 매칭
│   │   │   ├── admission-cases/             # 입시 사례 관리
│   │   │   ├── notice/                      # 공지사항 관리
│   │   │   ├── guidebook/                   # 가이드북 관리
│   │   │   ├── seminar/                     # 설명회 관리
│   │   │   ├── settings/                    # 설정 (/settings, /settings/admins)
│   │   │   ├── super-admin/                 # super_admin 전용 (감사 로그 뷰어 등)
│   │   │   # ── 기획서 영역 ──
│   │   │   ├── my-students/                 # (선배 상담 V1) 선배 전용 담당 학생 뷰
│   │   │   ├── senior-quality/              # (선배 상담 V1) 선배 품질 대시보드
│   │   │   └── surveys/                     # (고등학교 상담 V3) 상담 설문 열람
│   │   │
│   │   ├── components/
│   │   │   ├── Sidebar.tsx             # 사이드바 (역할별 메뉴 필터링)
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── FileUploader.tsx
│   │   │   ├── SatisfactionTrendsCard.tsx  # (만족도 설문 기획서) 추이 카드
│   │   │   └── SurveyCharts.tsx            # (고등학교 상담 V3) 설문 차트
│   │   │
│   │   └── lib/
│   │       ├── api.ts                  # 백엔드 API 호출 함수 모음
│   │       ├── auth.ts                 # 인증 + 메뉴 권한 + 기본 경로
│   │       └── senior-topics.ts        # (선배 상담 V1) 세션별 주제 상수
│
├── user-web/                           # 사용자 웹 (Next.js)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                # 메인 (랜딩)
│   │   │   ├── login/page.tsx          # 로그인
│   │   │   ├── register/page.tsx       # 회원가입 (이용약관+개인정보처리방침 통합 동의)
│   │   │   ├── forgot-password/page.tsx
│   │   │   ├── reset-password/page.tsx
│   │   │   ├── terms/page.tsx          # 이용약관
│   │   │   ├── privacy/page.tsx        # 개인정보처리방침
│   │   │   ├── mypage/                 # 마이페이지 (가족 연결, 담당자 변경 요청 등 통합)
│   │   │   │   └── senior-sharing/     # (연계규칙 V1 §10-1) 선배 연계 부분 철회
│   │   │   ├── analysis/                # 분석 신청/업로드/조회/면접질문
│   │   │   ├── consultation/            # 상담 예약/내 예약/기록
│   │   │   ├── admission-cases/         # 입시 사례 열람
│   │   │   ├── payment/                 # 결제 (토스 + 성공/실패)
│   │   │   ├── seminar/                 # 설명회 예약 (지점관리자)
│   │   │   # ── 기획서 영역 ──
│   │   │   ├── consultation-survey/     # (고등학교 상담 V3) 상담 설문 작성
│   │   │   ├── satisfaction-survey/     # (만족도 설문 기획서)
│   │   │   └── senior-pre-survey/       # (선배 상담 V1) 선배 사전 설문
│   │   │
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── NoticeBanner.tsx        # 공지 배너
│   │   │   ├── SearchableSelect.tsx    # 대학/학과 검색 드롭다운 (입결 DB 연계)
│   │   │   ├── ChildSelector.tsx       # 학부모용 자녀 선택 (가족 연결)
│   │   │   └── FamilyLinkSection.tsx   # 가족 연결 섹션
│   │   │
│   │   └── lib/
│   │       ├── api.ts
│   │       ├── auth.ts
│   │       └── surveyTypes.ts          # (고등학교 상담 V3) 설문 타입 정의
│
└── mobile/                             # Flutter 모바일 앱 (Android SDK 36, AGP 8.9.1, Kotlin 2.1.0)
    ├── lib/
    │   ├── main.dart
    │   ├── screens/
    │   │   # ── 전반 기능 ──
    │   │   ├── splash_screen.dart
    │   │   ├── login_screen.dart
    │   │   ├── register_screen.dart
    │   │   ├── forgot_password_screen.dart
    │   │   ├── home_screen.dart
    │   │   ├── mypage_screen.dart
    │   │   ├── notification_screen.dart
    │   │   ├── notices_screen.dart               # 공지사항
    │   │   ├── analysis_list_screen.dart
    │   │   ├── analysis_apply_screen.dart
    │   │   ├── analysis_upload_screen.dart
    │   │   ├── analysis_detail_screen.dart
    │   │   ├── interview_questions_screen.dart
    │   │   ├── admission_cases_screen.dart
    │   │   ├── admission_info_screen.dart        # 대학/학과 검색 (입결 DB)
    │   │   ├── consultation_screen.dart          # 상담자 선택 → 달력 → 시간
    │   │   ├── consultation_list_screen.dart
    │   │   ├── consultation_management_screen.dart # 내 상담 관리
    │   │   ├── consultation_notes_screen.dart    # 내 상담 기록
    │   │   ├── payment_screen.dart
    │   │   ├── seminar_screen.dart               # 설명회 예약 (지점관리자)
    │   │   ├── seminar_list_screen.dart
    │   │   # ── 기획서 영역 ──
    │   │   ├── survey_screen.dart                   # (고등학교 상담 V3)
    │   │   ├── high_survey_timing_screen.dart       # (고등학교 상담 V3) 타이밍 선택
    │   │   ├── survey_report_screen.dart            # (고등학교 상담 V3)
    │   │   ├── senior_pre_survey_screen.dart        # (선배 상담 V1)
    │   │   ├── senior_consultation_notes_screen.dart # (선배 상담 V1)
    │   │   └── satisfaction_survey_screen.dart      # (만족도 설문 기획서)
    │   │
    │   ├── models/
    │   ├── services/
    │   ├── providers/
    │   └── widgets/
    ├── scripts/
    │   └── generate_launcher_icons.py  # 아이콘 전 사이즈 자동 생성 (Pillow)
    └── pubspec.yaml
```

---

## 역할(Role) 체계

### 관리자 역할
| 역할 | 설명 | 데이터 접근 범위 |
|------|------|-----------------|
| super_admin | 최고관리자 | 전체 데이터 접근 |
| admin | 관리자 (담당자) | 매칭된 학생의 분석만, 본인 슬롯의 상담만 |
| counselor | 상담자 | 매칭된 학생의 분석만, 본인 슬롯의 상담만 |
| senior | 선배 상담자 | `SeniorStudentAssignment` 로 매칭된 학생만. 상세 운영은 **선배 상담 V1 기획서** 참조 |

### 사용자(user) 역할
| 역할 | 설명 |
|------|------|
| student | 학생 |
| parent | 학부모 (가족 연결로 자녀 데이터 열람) |
| branch_manager | 지점관리자 (설명회 예약 전용) |

### 메뉴 권한 시스템
super_admin은 전체 접근, admin/counselor는 `allowed_menus` 배열에 따라 접근 제어.

| 메뉴 키 | 페이지 | 설명 |
|---------|--------|------|
| dashboard | / | 대시보드 |
| analysis | /analysis | 분석 관리 |
| consultation | /consultation | 상담 관리 |
| users | /users | 회원 관리 |
| payments | /payments | 결제 현황 |
| admins | /admins | 담당자 관리 |
| assignments | /assignments | 학생-담당자 매칭 |
| settings | /settings | 설정 |

### 데이터 접근 규칙
- **분석 관리**: `AdminStudentAssignment` 테이블 기반 매칭. admin/counselor는 매칭된 학생의 분석만 조회 가능
- **상담 관리**: 슬롯 소유자 기반 필터링. admin/counselor는 본인이 만든 슬롯의 예약만 조회 가능
- **로그인 후 리다이렉트**: 대시보드 권한이 없으면 `getDefaultRoute()`로 허용된 첫 메뉴로 이동

---

## 핵심 기능 상세

### 1. 분석 서비스

**서비스 유형**: 학생부라운지 / 학종라운지

**분석 상태 흐름**:
```
applied(신청) → uploaded(학생부 업로드) → processing(분석중) → completed(완료)
                                                              → cancelled(취소)
```

**기능 목록**:
- 사용자: 분석 신청 → 학생부 업로드 → 상태 조회 → 리포트(Excel/PDF) 다운로드
- 관리자: 접수 목록 조회 → 학생부 다운로드 → 리포트 업로드 → 상태 변경
- 면접 예상 질문: 관리자가 분석 건에 면접 질문 등록, 사용자가 열람
- 분석 공유: 7일 만료 토큰 기반 공유 링크 생성

### 2. 상담 예약

**예약 흐름 (사용자)**: 병원 예약 방식
```
1. 상담자 선택 (활성 슬롯이 있는 상담자 목록)
2. 달력에서 날짜 선택
3. 해당 날짜의 가능한 시간대 선택
4. 상담 유형/메모 입력 후 예약 신청
```

**예약 상태**: requested(신청) → confirmed(확정) → completed(완료) / cancelled(취소)

**상담 시간 설정 (관리자)**:
- 달력 기반 UI: 날짜 클릭 → 해당 날짜에 시간/타임 추가
- 반복 생성: 매주 반복(같은 요일) / 매월 반복(같은 날짜), 반복 횟수 설정 가능
- `repeat_group_id`로 반복 슬롯 그룹 관리
- 수정 시 "이 건만 수정" / "이후 반복 전체 수정" 선택 가능
- 삭제 시 "이 건만 삭제" / "이후 전체 삭제" 선택 가능 (예약 있는 슬롯은 삭제 불가)
- 슬롯별 활성/비활성 토글
- 종료 시간이 시작 시간보다 앞이면 생성/수정 차단 (프론트+백엔드 이중 검증)
- super_admin은 다른 상담자의 슬롯도 생성/관리 가능

**상담 기록**:
- 관리자가 상담 후 기록 작성 (카테고리: 분석, 전략, 학교생활, 공부법, 진로, 심리, 기타)
- 비공개 메모 (admin_private_notes): 관리자만 열람
- 공개 설정 (is_visible_to_user): 사용자 열람 허용 여부

### 3. 입시 사례

- 관리자가 합격 사례 등록 (대학, 학과, 전형, 성적, 활동 등)
- 공개 설정된 사례만 사용자에게 표시
- 대학/학과/전형별 필터링

### 4. 결제

- 토스페이먼츠 (웹): 결제 준비 → 결제 확인 → 상태 업데이트
- Google Play Billing (앱): 인앱결제 영수증 검증
- 관리자: 결제 목록 조회, 환불 처리, 매출 통계

### 5. 알림

- FCM 푸시 알림: 분석 완료, 상담 확정, 상담 리마인드
- APScheduler: 매일 9시(서울 시간) 내일 상담 예약자에게 리마인드 발송
- 이메일 알림: 비밀번호 재설정, 상담 리마인드

### 6. 가족 연결 (학생-학부모)

- 초대 코드 발급 → 상대방이 입력하여 양방향 연결
- 학부모가 자녀 마이페이지 / 분석 / 상담 기록 등 조회 가능 (자녀 선택)
- `family_link` / `family_invite` 테이블 + `/api/family/*` 라우터
- 동의·권한 스키마는 이용약관·개인정보처리방침에 명시

### 7. 공지사항 / 가이드북 / 설명회

- 공지사항: 관리자 작성, 사용자 웹·모바일에 배너로 노출 (`NoticeBanner`)
- 가이드북: 관리자가 PDF/링크 등록, 사용자에게 제공
- 설명회(세미나): 지점관리자 전용. 예약 → 마감일 이전 수정/취소 → 관리자 재승인
  - `seminar_*` 3종 테이블 + `seminar` / `admin_seminar` 라우터
  - 시간대: 오전 11:00~13:00 / 오후 14:00~16:00 / 저녁 19:00~21:00

### 8. Google Calendar 연동

- 서비스 계정(`ipsilounge-calendar@...`) 기반, 관리자 개인 + 입시라운지 공식 캘린더(`ipsinoreply@gmail.com`) 다중 연동
- 설명회 예약 승인/수정/취소 시 일정 자동 생성/수정/삭제
- 상담 예약 확정/취소 시 자동 생성/삭제 (30분 전 팝업 알림)
- `google_event_id` 컬럼(Text)에 복수 이벤트 ID 저장
- `GOOGLE_CALENDAR_CREDENTIALS_PATH` / `GOOGLE_CALENDAR_ID` / `GOOGLE_CALENDAR_EXTRA_IDS` 환경변수

### 9. 입결 DB 기반 대학/학과 검색

- `school-record-analyzer/data/admission_db.xlsx` → `admission_data` 테이블로 적재 (35,000+ rows, 2024~2027)
- 최신 학년도 자동 감지 (`SELECT MAX(year) FROM admission_data`)
- `/api/universities`, `/api/universities/majors?university=...` 제공
- user-web 은 `SearchableSelect`, mobile 은 `Autocomplete<String>` 사용
- `backend/scripts/import_admission_data.py` 로 재적재 (`--clear` 옵션)

### 10. 공유 데이터 루트 (SHARED_DATA_ROOT)

- `school-record-analyzer/data/` 가 단일 원천
- 기본 경로: `ipsilounge/backend/app/config.py` 에서 `parents[3]/school-record-analyzer/data` 자동 계산
- 운영 배포 시 `SHARED_DATA_ROOT` 환경변수로 재지정
- 공유 파일: `admission_db.xlsx` / `수능최저_db.xlsx` / `course_requirements.xlsx` / `university_grading.xlsx`
- `ADMISSION_DB_PATH` 로 admission_db.xlsx 단독 오버라이드 지원
- 관련 서비스: `course_requirement_service` / `suneung_minimum_service` / `counselor_type_service`

### 11. 기획서 영역 기능 (상세는 각 기획서 참조)

- **고등학교 상담 시스템 V3** → `고등학교 상담시스템_기획서_V3.md`
- **예비고1 상담 시스템 V2_2** → `예비고1 상담시스템_기획서_V2_2.md`
- **선배 상담 프로그램 V1** → `선배상담_프로그램_기획서_V1.md`
- **선배-상담사 연계 규칙 V1** → `선배상담_상담사상담_연계규칙_V1.md`
- 만족도 설문 — 선배·고등학교 기획서에 병합된 섹션

---

## API 엔드포인트 목록

### 인증 (/api/auth)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| POST | /register | 회원가입 |
| POST | /login | 로그인 (JWT) |
| POST | /refresh | 토큰 갱신 |
| POST | /admin/login | 관리자 로그인 |
| POST | /forgot-password | 비밀번호 재설정 이메일 |
| POST | /reset-password | 비밀번호 재설정 |

### 사용자 (/api/users)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /me | 내 정보 |
| PUT | /me | 내 정보 수정 |
| PUT | /me/fcm-token | FCM 토큰 등록 |
| GET | /notifications | 알림 목록 |
| PUT | /notifications/{id}/read | 알림 읽음 |

### 사용자 - 분석 (/api/analysis)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| POST | /upload | 학생부 업로드 + 분석 요청 |
| GET | /list | 내 분석 목록 |
| GET | /{id} | 분석 상세 |
| GET | /{id}/report/excel | 리포트 Excel 다운로드 |
| GET | /{id}/report/pdf | 리포트 PDF 다운로드 |
| GET | /{id}/interview-questions | 면접 질문 목록 |
| POST | /{id}/share | 공유 링크 생성 |

### 사용자 - 상담 (/api/consultation)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /counselors | 상담자 목록 (활성 슬롯 있는) |
| GET | /slots | 예약 가능 시간대 (admin_id 필터) |
| POST | /book | 예약 신청 |
| GET | /my | 내 예약 목록 |
| PUT | /{id}/cancel | 예약 취소 |

### 사용자 - 상담 기록 (/api/consultation-notes)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | / | 내 상담 기록 (공개 건만) |

### 사용자 - 입시 사례 (/api/admission-cases)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | / | 공개 사례 목록 |

### 공유 링크
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /api/shared/{token} | 공유된 분석 결과 조회 (로그인 불필요) |

### 사용자 - 결제 (/api/payment)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| POST | /toss/ready | 토스 결제 준비 |
| POST | /toss/confirm | 토스 결제 확인 |
| POST | /google/verify | 구글 인앱결제 검증 |
| GET | /my | 내 결제 내역 |

### 관리자 - 대시보드 (/api/admin/dashboard)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | / | 통계 (분석/상담/결제 현황) |

### 관리자 - 분석 (/api/admin/analysis)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /stats | 분석 통계 (매칭 필터) |
| GET | /list | 분석 목록 (매칭 필터, 상태/서비스유형 필터) |
| GET | /{id} | 분석 상세 |
| GET | /{id}/download | 학생부 다운로드 |
| POST | /{id}/upload-report | 리포트 업로드 |
| PUT | /{id}/status | 상태 변경 |
| POST | /{id}/interview-questions | 면접 질문 등록 |
| PUT | /interview-questions/{qid} | 면접 질문 수정 |
| DELETE | /interview-questions/{qid} | 면접 질문 삭제 |

### 관리자 - 상담 (/api/admin/consultation)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /counselors | 상담자 목록 |
| POST | /slots | 시간대 생성 (반복 포함) |
| GET | /slots | 시간대 목록 (월별, 상담자 필터) |
| PUT | /slots/{id} | 시간대 수정 (단건/반복 전체) |
| DELETE | /slots/{id} | 시간대 삭제 (단건/반복 전체) |
| GET | /bookings | 예약 목록 (슬롯 소유자 기반 필터) |
| PUT | /bookings/{id}/status | 예약 상태 변경 |

### 관리자 - 상담 기록 (/api/admin/consultation-notes)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | / | 상담 기록 목록 |
| GET | /user/{user_id} | 학생별 상담 기록 + 요약 |
| POST | / | 상담 기록 작성 |
| PUT | /{id} | 상담 기록 수정 |
| DELETE | /{id} | 상담 기록 삭제 |

### 관리자 - 입시 사례 (/api/admin/admission-cases)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | / | 사례 목록 |
| POST | / | 사례 등록 |
| PUT | /{id} | 사례 수정 |
| DELETE | /{id} | 사례 삭제 |

### 관리자 - 회원 (/api/admin/users)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | / | 회원 목록 (검색) |
| GET | /{id} | 회원 상세 |
| PUT | /{id}/deactivate | 회원 비활성화 |

### 관리자 - 결제 (/api/admin/payments)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | / | 결제 목록 |
| GET | /stats | 매출 통계 |
| PUT | /{id}/refund | 환불 처리 |

### 관리자 - 계정/매칭 (/api/admin/admins)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /me | 내 정보 (메뉴 포함) |
| GET | /menus | 전체 메뉴 목록 |
| GET | / | 관리자 목록 |
| POST | / | 관리자 생성 |
| POST | /promote | 기존 회원을 관리자로 승격 |
| PUT | /{id} | 관리자 정보 수정 |
| PUT | /{id}/reset-password | 비밀번호 초기화 |
| GET | /assignments | 매칭 목록 (학생-담당자) |
| POST | /assignments | 매칭 생성 |
| DELETE | /assignments/{id} | 매칭 삭제 |
| GET | /my-students | 내 담당 학생 목록 |
| GET | /senior-assignments | 선배-학생 매칭 목록 |
| POST | /senior-assignments | 선배-학생 매칭 생성 |
| DELETE | /senior-assignments/{id} | 선배-학생 매칭 삭제 |

### 공지사항 (/api/notices, /api/admin/notices)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /api/notices | 공지 목록 (사용자) |
| GET | /api/notices/{id} | 공지 상세 |
| POST | /api/admin/notices | 공지 등록 |
| PUT | /api/admin/notices/{id} | 공지 수정 |
| DELETE | /api/admin/notices/{id} | 공지 삭제 |

### 가이드북 (/api/admin/guidebook)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /api/admin/guidebook | 가이드북 목록/등록/수정 |

### 설명회 / 세미나 (/api/seminar, /api/admin/seminar)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /api/seminar/schedules | 공개 일정 목록 |
| POST | /api/seminar/reservations | 예약 신청 (지점관리자) |
| PUT | /api/seminar/reservations/{id} | 예약 수정 (마감일 이전만) |
| DELETE | /api/seminar/reservations/{id} | 예약 취소 (마감일 이전만) |
| GET | /api/admin/seminar/* | 관리자 일정·예약 관리 |

### 가족 연결 (/api/family)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| POST | /api/family/invite | 초대 코드 발급 |
| POST | /api/family/accept | 초대 코드 입력으로 연결 |
| GET | /api/family/links | 내 연결 목록 |
| DELETE | /api/family/links/{id} | 연결 해제 |

### 학교/대학/학과 (/api/schools, /api/universities)
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /api/schools/search | 학교명 검색 |
| GET | /api/universities | 대학 목록 (입결 DB 기반, 최신 학년도 자동) |
| GET | /api/universities/majors?university=... | 대학별 학과 목록 |

### 파일 서빙
| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /api/files/{folder}/{filename} | 로컬 파일 다운로드 (S3 미사용 시) |

### 기획서 영역 API (상세는 각 기획서 참조)

아래 엔드포인트 군은 기획서에서 구조·항목·흐름을 정의한다. 세부 엔드포인트 목록·요청 스키마·응답 필드는 이 문서가 아닌 해당 기획서를 단일 원천으로 삼는다.

| 라우터 prefix | 영역 | 해당 기획서 |
|---|---|---|
| `/api/consultation-notes`, `/api/admin/consultation-notes` | 상담 기록 | 고등학교 상담 V3 |
| `/api/consultation-survey`, `/api/admin/consultation-survey` | 상담 설문 | 고등학교 상담 V3 |
| `/api/satisfaction-survey` | 만족도 설문 | 만족도 설문 기획서 |
| `/api/admin/senior-consultation` | 선배 상담 기록 | 선배 상담 V1 |
| `/api/senior-notes`, `/api/senior-pre-survey` | 선배 기록/사전설문 | 선배 상담 V1 |
| `/api/admin/counselor-sharing` | 상담사→선배 공유 검토 | 연계규칙 V1 §6 |
| `/api/user/consultation-sharing` | 학생 사후 철회 | 연계규칙 V1 §10-1 |
| `/api/admin/audit/consultation-data-access` | 열람 감사 로그 | 연계규칙 V1 §10-2 |

---

## DB 테이블 구조

### users
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| email | VARCHAR | 이메일 (로그인 ID) |
| password_hash | VARCHAR | 암호화 비밀번호 |
| name | VARCHAR | 이름 |
| phone | VARCHAR | 연락처 |
| fcm_token | VARCHAR | FCM 푸시 토큰 |
| is_active | BOOLEAN | 활성 상태 |
| created_at | DATETIME | 가입일 |

### admins
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| email | VARCHAR | 이메일 |
| password_hash | VARCHAR | 암호화 비밀번호 |
| name | VARCHAR | 이름 |
| role | VARCHAR | super_admin / admin / counselor |
| is_active | BOOLEAN | 활성 상태 |
| allowed_menus | JSON | 허용된 메뉴 키 배열 |
| user_id | VARCHAR(36) | 승격된 경우 원래 회원 ID |

### admin_student_assignments
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| admin_id | UUID → admins | 담당자 |
| user_id | UUID → users | 학생 |
| created_at | DATETIME | 매칭일 |

### analysis_orders
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| user_id | UUID → users | 신청 회원 |
| service_type | VARCHAR(20) | 학생부라운지 / 학종라운지 |
| status | VARCHAR(20) | applied / uploaded / processing / completed / cancelled |
| school_record_url | VARCHAR(500) | 학생부 파일 경로 |
| school_record_filename | VARCHAR(255) | 원본 파일명 |
| target_university | VARCHAR(100) | 지원 대학 |
| target_major | VARCHAR(100) | 지원 학과 |
| report_excel_url | VARCHAR(500) | 리포트 Excel 경로 |
| report_pdf_url | VARCHAR(500) | 리포트 PDF 경로 |
| memo | TEXT | 사용자 메모 |
| admin_memo | TEXT | 관리자 메모 |
| created_at / uploaded_at / processing_at / completed_at | DATETIME | 각 단계 시각 |

### analysis_shares
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| analysis_order_id | UUID → analysis_orders | 분석 건 |
| token | VARCHAR | 공유 토큰 |
| expires_at | DATETIME | 만료일 (7일) |

### consultation_slots
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| admin_id | VARCHAR(36) | 슬롯 소유 상담자 |
| repeat_group_id | VARCHAR(36) | 반복 그룹 ID |
| date | DATE | 날짜 |
| start_time | TIME | 시작 시간 |
| end_time | TIME | 종료 시간 |
| max_bookings | INTEGER | 최대 예약 수 |
| current_bookings | INTEGER | 현재 예약 수 |
| is_active | BOOLEAN | 활성 여부 |

### consultation_bookings
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| user_id | UUID → users | 예약 회원 |
| slot_id | UUID → consultation_slots | 예약 시간대 |
| analysis_order_id | UUID → analysis_orders | 연결된 분석 건 |
| type | VARCHAR | 상담 유형 |
| memo | TEXT | 사전 메모 |
| status | VARCHAR | requested / confirmed / completed / cancelled |
| created_at | DATETIME | 신청일 |

### interview_questions
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| analysis_order_id | UUID → analysis_orders | 분석 건 |
| category | VARCHAR | 세특기반/창체기반/행특기반/지원동기/진로계획/종합 |
| question | TEXT | 질문 |
| hint | TEXT | 답변 방향 힌트 |

### admission_cases
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| university | VARCHAR | 대학 |
| major | VARCHAR | 학과 |
| admission_year | INTEGER | 입학년도 |
| admission_type | VARCHAR | 학생부교과/학생부종합/논술/기타 |
| grade_average | FLOAT | 평균 등급 |
| grade_details | JSON | 성적 상세 |
| setuek_grade / changche_grade / haengtuk_grade | VARCHAR | 비교과 등급 |
| strengths | TEXT | 강점 |
| key_activities | TEXT | 핵심 활동 |
| notes | TEXT | 비고 |
| is_public | BOOLEAN | 공개 여부 |

### payments
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| user_id | UUID → users | 결제 회원 |
| analysis_order_id | UUID → analysis_orders | 분석 건 |
| consultation_booking_id | UUID → consultation_bookings | 상담 건 |
| amount | INTEGER | 금액 (원) |
| method | VARCHAR | google_play / toss / card / transfer |
| status | VARCHAR | pending / completed / refunded / failed |
| transaction_id | VARCHAR | 외부 결제 번호 |

### notifications
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| user_id | UUID → users | 대상 회원 |
| title | VARCHAR | 제목 |
| body | TEXT | 내용 |
| type | VARCHAR | analysis_complete / consultation_remind 등 |
| is_read | BOOLEAN | 읽음 여부 |

### password_reset_tokens
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| user_id | UUID → users | 회원 |
| token | VARCHAR | 재설정 토큰 |
| expires_at | DATETIME | 만료일 |

### admission_data / jeongsi_admission_data
수시/정시 입결 RAW (대학/학과 드롭다운 데이터). 매년 `scripts/import_admission_data.py` 로 적재. `SELECT MAX(year)` 로 최신 학년도 자동 판정.

### family_links / family_invites
학생-학부모 계정 연결. invite 는 일회용 코드 기반, link 는 확정된 쌍방 연결(`status`, `revoked_at`).

### counselor_change_request / senior_change_request
사용자 → 담당자(상담자·선배) 변경 요청 이력. `status=pending|approved|rejected` + 관리자 판정 타임스탬프.

### notices
공지사항. 제목/본문/노출범위/기간 필드. user-web `NoticeBanner` + mobile `notices_screen` 에서 조회.

### guidebooks
가이드북. 제목/카테고리/파일 또는 URL.

### seminar_schedules / seminar_reservations / seminar_mail_log
설명회 일정·예약·메일 로그. `seminar_reservations` 의 `google_event_id`(Text) 에 Google Calendar 이벤트 ID 복수 저장.

### 기획서 영역 테이블 (상세는 각 기획서 참조)

| 테이블 | 영역 | 해당 기획서 |
|---|---|---|
| `consultation_notes` | 상담 기록 | 고등학교 상담 V3 / 연계규칙 V1 공유 필드 |
| `consultation_surveys` | 상담 설문 | 고등학교 상담 V3 |
| `senior_consultation_notes` | 선배 상담 기록 | 선배 상담 V1 |
| `senior_pre_surveys` | 선배 사전 설문 | 선배 상담 V1 |
| `satisfaction_surveys` | 상담 만족도 | 만족도 설문 기획서 |
| `consultation_data_access_logs` | 열람 감사 로그 | 연계규칙 V1 §10-2 |

---

## DB 마이그레이션 (main.py startup)

서버 시작 시 `_check_and_migrate()` 가 자동 실행. SQLite(DEV_MODE) 는 `create_all` 로 충분히 커버하고, PostgreSQL 운영 환경은 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 로 기존 테이블에 신규 컬럼만 점증적으로 반영한다.

주요 마이그레이션 블록:
1. `Base.metadata.create_all` — 전체 테이블 생성
2. 기본 스키마 보강: `admins.user_id` / `consultation_slots.admin_id` / `consultation_slots.repeat_group_id` 등
3. Google Calendar 연동: `seminar_reservations.google_event_id`, `consultation_bookings.google_event_id` (Text 타입으로 복수 ID 저장)
4. 연계규칙 V1 §6 상담사 검토 게이트 필드 추가: `consultation_surveys` / `consultation_notes` 에 `senior_review_status` 등 5개 컬럼 + `senior_sharing_revoked_at`·`senior_sharing_revoke_reason` (V1 §10-1)
5. 초기 super_admin 계정 생성 (없는 경우)

기획서 영역 테이블의 신규 컬럼도 여기에 점증 추가된다. 운영 DB 에 새 컬럼을 수동 반영해야 할 때는 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 패턴을 그대로 따른다.

---

## 개발 시 참고사항

### SQLite UUID 호환성
- SQLAlchemy에서 `UUID(as_uuid=True)` 컬럼은 SQLite에서 문자열로 저장됨
- 쿼리 시 반드시 `uuid.UUID(string_id)` 변환 후 비교해야 함
- `str` 타입 직접 비교하면 `'str' object has no attribute 'hex'` 에러 발생

### 프론트엔드 API 호출
- `admin-web/src/lib/api.ts`, `user-web/src/lib/api.ts` 에서 모든 API 함수 관리
- `request()` 공통 함수: Authorization 헤더 자동 추가, 401 시 로그인 리다이렉트
- FormData 전송 시 Content-Type 미설정 (브라우저 자동 설정)
- `toFullUrl()`: 상대경로 URL에 API 서버 주소 자동 추가

### 환경 변수
- `NEXT_PUBLIC_API_URL`: 프론트엔드 API 서버 주소 (기본: http://localhost:8000)
- 백엔드: `.env` 파일로 관리 (DB_URL, JWT_SECRET, S3, FCM, SMTP 등)

### 기획서 기반 구현 원칙 (필수)

이 프로젝트에는 아래 기획서 파일들이 존재한다:
- `선배상담_프로그램_기획서_V1.md` — 선배 상담 프로그램 전체 설계
- `고등학교 상담시스템_기획서_V3.md` — 상담사 상담 시스템 설계
- `예비고1 상담시스템_기획서_V2_2.md` — 예비고1 상담 시스템 설계
- `선배상담_상담사상담_연계규칙_V1.md` — 선배-상담사 연계 규칙

**구현 요청 시 반드시 다음 절차를 따를 것:**

1. **구현 전**: 해당 기능과 관련된 기획서 파일을 먼저 읽고, 기획서에 정의된 내용(주제, 구조, 흐름, 항목 수, 시점 등)을 정확히 파악한다.
2. **구현 중**: 기획서에 명시된 내용을 기준으로 구현한다. 기획서에 없는 내용을 임의로 추가하거나, 기획서의 내용을 임의로 변경하지 않는다.
3. **구현 후**: 구현 결과를 기획서 내용과 다시 비교/대조하여, 항목 수·항목명·구조·시점 등이 기획서와 일치하는지 검증한다. 불일치가 발견되면 즉시 수정한다.
4. **문서 반영 (구현 완료 시 필수)**: 커밋 직전에 아래 규칙에 따라 CLAUDE.md / CHANGELOG.md 를 동기화한다.
   - **기획서가 있는 기능** (예비고1·고등학교 상담·선배 상담·선배-상담사 연계): 변경 상세는 **각 기획서 파일**에 반영한다. CLAUDE.md 본문(인벤토리·API·DB 테이블)은 **건드리지 않는다**. CLAUDE.md는 "해당 기획서를 따름" 이상으로 상세를 기재하지 않는다.
   - **기획서가 없는 전반 기능** (인증·결제·분석·파일·캘린더·매칭·입결·세미나·공지·가이드북·가족 연결·역할/권한·배포 등): **즉시 CLAUDE.md 본문에 반영**한다. 신규 모델/라우터/서비스/페이지/화면은 해당 섹션의 표·디렉토리 트리·API 엔드포인트 목록·DB 테이블 목록에 바로 추가한다.
   - **모든 변경** (기획서 유무 무관): **CHANGELOG.md 에 날짜별로 기록**한다. 기능 추가는 번들 단위로 요약하고, 버그 수정·운영 변경은 원인·파일까지 짧게 명시한다.

기획서와 다르게 구현해야 할 합리적 이유가 있는 경우, 사용자에게 차이점을 설명하고 확인을 받은 후 진행한다.
