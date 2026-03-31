# 입시라운지 (IpsiLounge) — 서비스 전체 구성 및 기능 명세

> 학생부 분석 + 입시 상담 예약 플랫폼
> 구성: Android 앱 + 사용자 웹 + 관리자 웹 + 백엔드 API

---

## 목차

1. [서비스 개요](#1-서비스-개요)
2. [시스템 구성](#2-시스템-구성)
3. [사용자 흐름 (주요 워크플로우)](#3-사용자-흐름-주요-워크플로우)
4. [백엔드 API](#4-백엔드-api)
5. [사용자 웹 (user-web)](#5-사용자-웹-user-web)
6. [관리자 웹 (admin-web)](#6-관리자-웹-admin-web)
7. [Android 앱 (mobile)](#7-android-앱-mobile)
8. [데이터베이스 구조](#8-데이터베이스-구조)
9. [알림 시스템](#9-알림-시스템)
10. [결제 시스템](#10-결제-시스템)
11. [파일 저장소](#11-파일-저장소)
12. [보안 및 인증](#12-보안-및-인증)
13. [현재 미구현 / 추가 검토 필요 기능](#13-현재-미구현--추가-검토-필요-기능)

---

## 1. 서비스 개요

| 항목 | 내용 |
|------|------|
| 서비스명 | 입시라운지 (IpsiLounge) |
| 패키지명 | com.ipsilounge.app |
| 핵심 기능 | 학생부 PDF 업로드 → 전문가 분석 → 리포트 제공 |
| 부가 기능 | 1:1 입시 상담 예약 |
| 결제 | 현재 무료 운영 (유료 전환 준비 완료) |
| 타겟 사용자 | 대입을 준비하는 고등학생 및 학부모 |
| 교육과정 | 2022 개정교육과정 (5등급제) |

### 서비스 동작 방식

```
사용자 (앱/웹)         관리자 (관리자 웹)          로컬 프로그램
     │                      │                         │
     │ ① 학생부 업로드       │                         │
     │──────────────────────►│                         │
     │                      │ ② 학생부 다운로드         │
     │                      │─────────────────────────►│
     │                      │ ③ school-record-analyzer │
     │                      │    로 분석 실행           │
     │                      │◄─────────────────────────│
     │                      │ ④ 리포트 업로드          │
     │                      │   (Excel + PDF)          │
     │◄──────────────────────│                         │
     │ ⑤ 리포트 다운로드     │                         │
```

---

## 2. 시스템 구성

### 전체 아키텍처

| 구성 요소 | 기술 | 호스팅 | 역할 |
|-----------|------|--------|------|
| 백엔드 API | FastAPI (Python 3.12) | AWS EC2 + Docker | 모든 데이터 처리 |
| 데이터베이스 | PostgreSQL 16 | Docker (EC2 내부) | 회원/주문/예약 저장 |
| 파일 저장소 | AWS S3 | AWS | 학생부/리포트 파일 |
| 사용자 웹 | Next.js 15 (TypeScript) | Vercel | iPhone·PC 사용자 |
| 관리자 웹 | Next.js 15 (TypeScript) | Vercel | 관리자 전용 |
| Android 앱 | Flutter | Google Play Store | Android 사용자 |
| 푸시 알림 | Firebase FCM | Firebase | 분석완료·상담확정 알림 |
| 리버스 프록시 | Nginx | EC2 내부 | SSL 처리, API 라우팅 |

### 도메인 구조 (예정)

```
ipsilounge.co.kr          → 사용자 웹 (Vercel)
admin.ipsilounge.co.kr    → 관리자 웹 (Vercel)
api.ipsilounge.co.kr      → 백엔드 API (EC2 + Nginx)
```

### 디렉토리 구조

```
ipsilounge/
├── backend/                # FastAPI 백엔드
│   ├── app/
│   │   ├── models/         # DB 테이블 (7개)
│   │   ├── schemas/        # 요청/응답 형식
│   │   ├── routers/        # API 엔드포인트 (11개 파일)
│   │   ├── services/       # 핵심 비즈니스 로직
│   │   └── utils/          # 인증, 의존성
│   ├── Dockerfile
│   └── requirements.txt
│
├── admin-web/              # 관리자 웹사이트
│   └── src/app/            # 10개 페이지
│
├── user-web/               # 사용자 웹사이트
│   └── src/app/            # 13개 페이지
│
├── mobile/                 # Flutter Android 앱
│   └── lib/
│       ├── screens/        # 12개 화면
│       ├── services/       # 5개 서비스 (API 통신)
│       ├── models/         # 4개 데이터 모델
│       └── providers/      # 2개 상태 관리
│
├── nginx/                  # Nginx 설정
├── docker-compose.yml      # 서버 전체 실행 구성
└── docs/                   # 문서
```

---

## 3. 사용자 흐름 (주요 워크플로우)

### 3-1. 학생부 분석 전체 흐름

```
[사용자]
  1. 회원가입/로그인
  2. 학생부 PDF 업로드
     - 희망 대학·학과 입력 (선택)
     - 메모 작성 (선택)
  3. 분석 상태 조회 (접수완료 → 분석중 → 완료)
  4. 완료 알림 수신 (앱 푸시 또는 화면에서 확인)
  5. Excel / PDF 리포트 다운로드

[관리자]
  1. 신규 접수 목록 확인
  2. 학생부 파일 다운로드
  3. 로컬 PC에서 school-record-analyzer 실행
  4. 분석 리포트(Excel + PDF) 업로드
  5. 상태를 "완료"로 변경
     → 사용자에게 자동 알림 발송
```

### 3-2. 상담 예약 전체 흐름

```
[관리자]
  1. 상담 가능 날짜/시간 설정
     - 단건 설정 또는 반복 일괄 설정
     - 동시간 예약 가능 인원 지정

[사용자]
  1. 달력에서 예약 가능한 날짜 선택
  2. 시간대 선택 (잔여 자리 표시)
  3. 상담 유형 선택 (학생부분석 / 입시전략 / 기타)
  4. 사전 질문 작성 (선택)
  5. 예약 신청

[관리자]
  1. 예약 신청 목록 확인
  2. 예약 확정 처리
     → 사용자에게 자동 알림 발송

[사용자]
  1. 예약 확정 알림 수신
  2. 상담 진행
```

### 3-3. 상태 전이

**분석 주문 상태:**
```
pending (접수완료) → processing (분석중) → completed (완료)
                  └────────────────────► cancelled (취소)
```

**상담 예약 상태:**
```
requested (신청완료) → confirmed (예약확정) → completed (상담완료)
                    └──────────────────────► cancelled (취소)
```

**결제 상태:**
```
pending (대기중) → completed (완료) → refunded (환불됨)
                └─────────────────► failed (실패)
```

---

## 4. 백엔드 API

### 4-1. 인증 (`/api/auth`)

| 메서드 | 경로 | 기능 | 인증 |
|--------|------|------|------|
| POST | `/api/auth/register` | 회원가입 | 불필요 |
| POST | `/api/auth/login` | 로그인 → Access/Refresh Token 발급 | 불필요 |
| POST | `/api/auth/refresh` | Access Token 갱신 | Refresh Token |
| POST | `/api/auth/admin/login` | 관리자 로그인 | 불필요 |

### 4-2. 사용자 (`/api/users`)

| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | `/api/users/me` | 내 정보 조회 |
| PUT | `/api/users/me` | 이름·연락처 수정 |
| PUT | `/api/users/me/fcm-token` | FCM 토큰 업데이트 (앱 알림용) |
| GET | `/api/users/notifications` | 알림 목록 조회 (최근 50건) |
| PUT | `/api/users/notifications/{id}/read` | 알림 읽음 처리 |

### 4-3. 학생부 분석 (`/api/analysis`)

| 메서드 | 경로 | 기능 |
|--------|------|------|
| POST | `/api/analysis/upload` | 학생부 업로드 + 분석 요청 |
| GET | `/api/analysis/list` | 내 분석 목록 |
| GET | `/api/analysis/{id}` | 분석 상세 (상태, 리포트 유무 등) |
| GET | `/api/analysis/{id}/report/excel` | Excel 리포트 다운로드 URL (1시간 만료) |
| GET | `/api/analysis/{id}/report/pdf` | PDF 리포트 다운로드 URL (1시간 만료) |

### 4-4. 상담 예약 (`/api/consultation`)

| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | `/api/consultation/slots` | 예약 가능 시간대 조회 (year, month 파라미터) |
| POST | `/api/consultation/book` | 상담 예약 신청 |
| GET | `/api/consultation/my` | 내 예약 목록 |
| PUT | `/api/consultation/{id}/cancel` | 예약 취소 |

### 4-5. 결제 (`/api/payment`)

| 메서드 | 경로 | 기능 |
|--------|------|------|
| POST | `/api/payment/toss/ready` | 토스페이먼츠 결제 준비 (주문ID 생성) |
| POST | `/api/payment/toss/confirm` | 토스페이먼츠 결제 최종 승인 |
| POST | `/api/payment/google/verify` | Google Play 인앱결제 서버 검증 |
| GET | `/api/payment/my` | 내 결제 내역 |

### 4-6. 관리자 — 분석 관리 (`/api/admin/analysis`)

| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | `/api/admin/analysis/list` | 전체 분석 목록 (페이징, 상태 필터) |
| GET | `/api/admin/analysis/{id}` | 분석 상세 |
| GET | `/api/admin/analysis/{id}/download` | 학생부 파일 다운로드 URL |
| POST | `/api/admin/analysis/{id}/upload-report` | Excel + PDF 리포트 업로드 |
| PUT | `/api/admin/analysis/{id}/status` | 상태 변경 + 관리자 메모 저장 |

> 상태가 `completed`로 변경될 때 자동으로 사용자에게 FCM 알림 발송

### 4-7. 관리자 — 상담 관리 (`/api/admin/consultation`)

| 메서드 | 경로 | 기능 |
|--------|------|------|
| POST | `/api/admin/consultation/slots` | 상담 시간대 단건 생성 |
| POST | `/api/admin/consultation/slots/bulk` | 반복 시간대 일괄 생성 |
| GET | `/api/admin/consultation/slots` | 시간대 목록 |
| PUT | `/api/admin/consultation/slots/{id}` | 시간대 수정 (정원, 활성화 여부) |
| DELETE | `/api/admin/consultation/slots/{id}` | 시간대 삭제 (예약 없는 경우만) |
| GET | `/api/admin/consultation/bookings` | 전체 예약 목록 |
| PUT | `/api/admin/consultation/bookings/{id}/status` | 예약 상태 변경 |

> 예약이 `confirmed`로 변경될 때 자동으로 사용자에게 FCM 알림 발송

### 4-8. 관리자 — 기타

| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | `/api/admin/dashboard` | 대시보드 통계 |
| GET | `/api/admin/users` | 회원 목록 (페이징, 검색) |
| GET | `/api/admin/users/{id}` | 회원 상세 |
| PUT | `/api/admin/users/{id}/deactivate` | 회원 비활성화 |
| GET | `/api/admin/payments` | 결제 내역 목록 |
| GET | `/api/admin/payments/stats` | 결제 통계 |
| PUT | `/api/admin/payments/{id}/refund` | 환불 처리 |

---

## 5. 사용자 웹 (user-web)

**URL**: ipsilounge.co.kr
**기술**: Next.js 15 / TypeScript / CSS
**접근 가능 기기**: PC, iPhone, Android 브라우저

### 페이지 목록

| 경로 | 페이지 | 주요 기능 |
|------|--------|-----------|
| `/` | 랜딩 | 서비스 소개, 특징 설명, 회원가입 유도 |
| `/login` | 로그인 | 이메일·비밀번호 로그인 |
| `/register` | 회원가입 | 이름·이메일·비밀번호·연락처 |
| `/analysis` | 분석 목록 | 내 분석 요청 전체 목록, 상태 배지 |
| `/analysis/upload` | 학생부 업로드 | 파일 선택, 희망대학·학과, 메모 |
| `/analysis/[id]` | 분석 상세 | 3단계 진행 바, 리포트 다운로드, 관리자 코멘트 |
| `/consultation` | 상담 예약 | 달력 + 시간대 선택 + 예약 양식 |
| `/consultation/my` | 내 예약 목록 | 예약 상태, 취소 버튼 |
| `/mypage` | 마이페이지 | 정보 수정, 최근 알림 |
| `/payment` | 결제 | 서비스 선택, 토스페이먼츠 결제, 결제 내역 |
| `/payment/success` | 결제 완료 | 서버 최종 승인 처리 후 완료 화면 |
| `/payment/fail` | 결제 실패 | 실패 원인, 재시도 안내 |

### 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `Navbar` | 상단 네비게이션 (로그인 상태 반영) |
| `Footer` | 하단 푸터 |
| `StatusBadge` | 상태 표시 배지 (색상 코딩) |

### 특이사항

- 로그인 필요 페이지 진입 시 `/login`으로 자동 리다이렉트
- 상담 예약 달력은 라이브러리 없이 순수 CSS로 구현
- 리포트 다운로드 URL은 1시간 만료되는 S3 Presigned URL

---

## 6. 관리자 웹 (admin-web)

**URL**: admin.ipsilounge.co.kr
**기술**: Next.js 15 / TypeScript / CSS
**접근**: 관리자 계정만 로그인 가능 (초기 계정은 서버 `.env`에서 설정)

### 페이지 목록

| 경로 | 페이지 | 주요 기능 |
|------|--------|-----------|
| `/login` | 관리자 로그인 | |
| `/` (dashboard) | 대시보드 | 분석·상담·회원·매출 통계 카드 |
| `/analysis` | 분석 목록 | 전체 접수 목록, 상태 필터, 사용자 정보 |
| `/analysis/[id]` | 분석 상세 | 학생부 다운로드, 리포트 업로드, 상태 변경, 관리자 메모 |
| `/consultation` | 상담 예약 현황 | 전체 예약 목록, 상태 변경 (confirmed), 취소 처리 |
| `/consultation/settings` | 상담 시간 설정 | 반복 시간대 일괄 생성, 슬롯 수정·삭제·활성화 |
| `/users` | 회원 관리 | 회원 목록, 검색, 비활성화 |
| `/payments` | 결제 현황 | 매출 통계, 결제 내역, 환불 처리 |
| `/settings` | 설정 | (기본 구조만 구현) |

### 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `Sidebar` | 좌측 네비게이션 메뉴 |
| `Header` | 상단 헤더 |
| `StatusBadge` | 상태 배지 |
| `DataTable` | 목록 테이블 |
| `FileUploader` | 파일 업로드 영역 |

### 핵심 기능 상세

**분석 상세 페이지 (`/analysis/[id]`)**
- 사용자 정보 (이름·이메일·연락처)
- 학생부 파일 다운로드 버튼
- Excel 리포트 업로드 (선택)
- PDF 리포트 업로드 (선택)
- 관리자 메모 입력
- 상태 변경 버튼 (처리중 / 완료)
- 완료 처리 시 사용자에게 알림 자동 발송

**상담 시간 설정 (`/consultation/settings`)**
- 단건 시간대 추가 (날짜 + 시작·종료 시간 + 최대 인원)
- 반복 일괄 추가:
  - 기간 설정 (시작일 ~ 종료일)
  - 요일 선택 (월·화·수·목·금·토·일 중 복수 선택)
  - 시작 시간 / 종료 시간 / 슬롯 간격 (30분/60분 등)
  - 최대 동시 예약 인원
- 슬롯 목록: 날짜별 조회, 활성화·비활성화 토글, 삭제

---

## 7. Android 앱 (mobile)

**스토어**: Google Play Store
**패키지명**: com.ipsilounge.app
**최소 SDK**: Android 23 (Android 6.0)
**기술**: Flutter / Dart / Provider

### 화면 목록

| 화면 | 파일 | 주요 기능 |
|------|------|-----------|
| 스플래시 | `splash_screen.dart` | 앱 시작, 자동 로그인 확인, 로딩 |
| 로그인 | `login_screen.dart` | 이메일·비밀번호, 회원가입 이동 |
| 회원가입 | `register_screen.dart` | 이름·이메일·비밀번호·연락처 |
| 홈 | `home_screen.dart` | 환영 배너, 빠른 메뉴, 최근 분석 목록, 하단 탭바 |
| 분석 목록 | `analysis_list_screen.dart` | 분석 요청 전체 목록, 당겨서 새로고침 |
| 학생부 업로드 | `analysis_upload_screen.dart` | 파일 선택(PDF·JPG·PNG), 희망대학·학과·메모 |
| 분석 상세 | `analysis_detail_screen.dart` | 진행 단계 바, Excel·PDF 다운로드 |
| 상담 예약 | `consultation_screen.dart` | 달력, 시간대 선택, 예약 양식 |
| 내 상담 목록 | `consultation_list_screen.dart` | 예약 목록, 취소 |
| 마이페이지 | `mypage_screen.dart` | 정보 수정, 알림 이동, 로그아웃 |
| 알림 | `notification_screen.dart` | 알림 목록, 읽음 처리 |
| 결제 | `payment_screen.dart` | 현재 무료 안내 / 유료 전환 시 Google Play 인앱결제 |

### 하단 탭바 구성

```
홈  /  분석  /  상담  /  마이
```

### 서비스 레이어

| 서비스 | 파일 | 역할 |
|--------|------|------|
| API 공통 | `api_service.dart` | HTTP 요청 (GET/POST/PUT/파일업로드), 401 처리 |
| 인증 | `auth_service.dart` | 로그인/로그아웃/FCM 토큰 저장 |
| 분석 | `analysis_service.dart` | 분석 목록·상세·업로드·다운로드 URL |
| 상담 | `consultation_service.dart` | 시간대 조회·예약·목록·취소 |
| 사용자 | `user_service.dart` | 내 정보·알림 목록·읽음 처리 |
| 결제 | `payment_service.dart` | Google Play 구매 요청·서버 검증 |

### 주요 패키지

| 패키지 | 용도 |
|--------|------|
| `http` | HTTP 통신 |
| `shared_preferences` | 로컬 토큰 저장 |
| `file_picker` | 파일 선택 |
| `firebase_messaging` | FCM 푸시 알림 |
| `flutter_local_notifications` | 포그라운드 알림 표시 |
| `provider` | 상태 관리 |
| `url_launcher` | 외부 앱으로 파일 열기 |
| `in_app_purchase` | Google Play 인앱결제 |
| `intl` | 날짜 포맷 |

---

## 8. 데이터베이스 구조

### 테이블 관계도

```
users ─────────────────┬──── analysis_orders
  │                    │          │
  │                    │          └── payments
  │                    │
  ├──── consultation_bookings ──── consultation_slots
  │          │
  │          └── payments
  │
  └──── notifications

admins (독립 테이블)
```

### users (회원)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | 고유 식별자 |
| email | String (UNIQUE) | 로그인 이메일 |
| password_hash | String | bcrypt 암호화 |
| name | String | 이름 |
| phone | String? | 연락처 |
| fcm_token | String? | 앱 푸시 알림 토큰 |
| is_active | Boolean | 계정 활성 여부 |
| created_at | DateTime | 가입일 |

### analysis_orders (분석 요청)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | |
| user_id | UUID (FK) | 신청 회원 |
| status | String | pending / processing / completed / cancelled |
| school_record_url | String | S3 경로 |
| school_record_filename | String | 원본 파일명 |
| target_university | String? | 희망 대학 |
| target_major | String? | 희망 학과 |
| report_excel_url | String? | S3 Excel 경로 |
| report_pdf_url | String? | S3 PDF 경로 |
| memo | Text? | 사용자 메모 |
| admin_memo | Text? | 분석가 코멘트 |
| created_at | DateTime | 접수일 |
| processing_at | DateTime? | 분석 시작일 |
| completed_at | DateTime? | 완료일 |

### consultation_slots (상담 가능 시간대)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | |
| date | Date | 날짜 |
| start_time | Time | 시작 시간 |
| end_time | Time | 종료 시간 |
| max_bookings | Integer | 최대 동시 예약 수 |
| current_bookings | Integer | 현재 예약 수 |
| is_active | Boolean | 예약 가능 여부 |

### consultation_bookings (상담 예약)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | |
| user_id | UUID (FK) | 예약 회원 |
| slot_id | UUID (FK) | 예약 시간대 |
| analysis_order_id | UUID (FK)? | 연결된 분석 건 |
| type | String | 학생부분석 / 입시전략 / 기타 |
| memo | Text? | 사전 질문 |
| status | String | requested / confirmed / completed / cancelled |
| created_at | DateTime | 신청일 |

### payments (결제 내역)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | |
| user_id | UUID (FK) | |
| analysis_order_id | UUID (FK)? | 연결된 분석 건 |
| consultation_booking_id | UUID (FK)? | 연결된 상담 건 |
| amount | Integer | 금액 (원) |
| method | String | toss / google_play / card / transfer |
| status | String | pending / completed / refunded / failed |
| transaction_id | String? | 외부 결제 고유번호 |
| created_at | DateTime | 결제일 |

### admins (관리자)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | |
| email | String (UNIQUE) | |
| password_hash | String | bcrypt |
| name | String | |
| role | String | super_admin / admin |

### notifications (알림 이력)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | |
| user_id | UUID (FK) | |
| title | String | 알림 제목 |
| body | Text | 알림 내용 |
| type | String | analysis_complete / consultation_confirmed / consultation_remind |
| is_read | Boolean | 읽음 여부 |
| created_at | DateTime | 발송일 |

---

## 9. 알림 시스템

### 알림 발생 시점

| 이벤트 | 발송 주체 | 알림 내용 |
|--------|-----------|-----------|
| 분석 완료 | 관리자 상태 변경 시 자동 | "학생부 분석이 완료되었습니다" |
| 상담 예약 확정 | 관리자 확정 처리 시 자동 | "상담 예약이 확정되었습니다" |

### 알림 전달 방식

- **앱**: Firebase FCM 푸시 알림 + 앱 내 알림 목록
- **웹**: 앱 내 알림 목록 (마이페이지)

### FCM 동작 방식

```
1. 앱 최초 실행 시 FCM 토큰 발급
2. 토큰을 서버에 저장 (PUT /api/users/me/fcm-token)
3. 서버 이벤트 발생 → notification_service가 FCM API 호출
4. 앱 포그라운드: 스낵바로 표시
5. 앱 백그라운드/종료: 시스템 푸시 알림
```

---

## 10. 결제 시스템

### 웹 결제 — 토스페이먼츠

| 단계 | 처리 주체 | 설명 |
|------|-----------|------|
| 상품 선택 | 프론트엔드 | 서비스 목록 표시 |
| 주문 ID 생성 | 백엔드 | `ipsi_analysis_xxxxxxxx` 형식 |
| 결제 창 | 토스 JS SDK | 카드 정보 입력 |
| 결제 완료 | 토스 → `/payment/success` 리다이렉트 | paymentKey 포함 |
| 최종 승인 | 백엔드 → 토스 API | 금액 검증 후 승인 |

**현재 설정 금액**:
- 학생부 분석 서비스: 50,000원
- 1:1 입시 상담: 80,000원

### 앱 결제 — Google Play Billing

| 단계 | 처리 주체 | 설명 |
|------|-----------|------|
| 상품 조회 | Google Play | Product ID로 가격 조회 |
| 구매 요청 | `in_app_purchase` 패키지 | Google Play 결제 창 |
| 구매 완료 | Google → 앱 스트림 | PurchaseDetails 수신 |
| 서버 검증 | 백엔드 → Google Play API | 구매 토큰 유효성 확인 |
| 구매 확정 | `completePurchase()` | Google Play에 완료 통보 |

**Google Play 상품 ID**:
- `analysis_standard`: 학생부 분석 서비스
- `consultation_60min`: 60분 상담

### 무료 → 유료 전환 방법

웹: `user-web/.env.local`의 토스 클라이언트 키 입력
앱: `payment_screen.dart` 상단 `const bool IS_FREE_SERVICE = true;` → `false`로 변경

---

## 11. 파일 저장소

### S3 버킷 구조

```
ipsilounge-files/
├── school-records/
│   └── {UUID}.{pdf|jpg|png}     ← 사용자 업로드 학생부
└── reports/
    ├── {UUID}.xlsx               ← 관리자 업로드 Excel 리포트
    └── {UUID}.pdf                ← 관리자 업로드 PDF 리포트
```

### 접근 방식

- **업로드**: 서버에서 직접 S3 PutObject (사용자는 서버를 통해서만 업로드)
- **다운로드**: Presigned URL 방식 (1시간 만료, URL 노출되어도 기간 후 무효)
- **직접 접근 차단**: 버킷 퍼블릭 액세스 완전 차단

### 업로드 파일 제한

- 허용 형식: PDF, JPG, JPEG, PNG
- 최대 용량: Nginx 설정 50MB

---

## 12. 보안 및 인증

### JWT 토큰 구조

| 토큰 | 만료 | 저장 위치 |
|------|------|-----------|
| Access Token | 30분 | localStorage (웹) / SharedPreferences (앱) |
| Refresh Token | 7일 | localStorage (웹) / SharedPreferences (앱) |

### 역할 분리

```python
get_current_user   # users 테이블 기반 — 일반 사용자 API
get_current_admin  # admins 테이블 기반 — 관리자 API
```

- 관리자 토큰에는 `role: admin` 클레임 포함
- `/api/admin/` 하위 경로는 모두 관리자 토큰 필요

### 데이터 접근 제어

- 분석 주문: 본인 것만 조회 가능 (user_id 일치 확인)
- 상담 예약: 본인 것만 조회/취소 가능
- 관리자: 전체 데이터 접근 가능

### 관리자 초기 계정

서버 `.env` 파일의 `ADMIN_EMAIL`, `ADMIN_PASSWORD`로 자동 생성
(서버 최초 시작 시 해당 계정이 없으면 자동 생성)

---

## 13. 추가 기능 구현 현황

### ✅ 이번 업데이트에서 구현 완료

| 기능 | 구현 내용 |
|------|-----------|
| 이메일 알림 | `email_service.py` — 분석완료·예약확정·리마인더·비밀번호재설정 4종 템플릿 |
| 비밀번호 찾기 | `POST /api/auth/forgot-password` + `POST /api/auth/reset-password` (30분 토큰) |
| 상담 리마인더 | APScheduler 매일 오전 9시 — 내일 상담자에게 FCM + 이메일 발송 |
| 관리자 복수 계정 | `GET/POST/PUT /api/admin/admins` — super_admin만 생성·수정·비활성화 가능 |
| 상담 내용 기록 CRM | `consultation_notes` 테이블 — 7가지 상담 유형, 학생별 전체 이력 조회 |
| 합격 사례 DB | `admission_cases` 테이블 + 관리자 CRUD + 사용자 공개 조회 |
| 면접 예상 질문 | `interview_questions` 테이블 + 관리자 등록 + 사용자·앱 조회 |
| 분석 결과 공유 | 7일 유효 공유 토큰 생성 (`POST /api/analysis/{id}/share`), 비로그인 조회 가능 |
| 분석 내역 비교 | `GET /api/analysis/compare?ids=id1,id2,id3` (최대 3건) |

### 새로 추가된 DB 테이블

| 테이블 | 설명 |
|--------|------|
| `password_reset_tokens` | 비밀번호 재설정 토큰 (30분 만료, 1회용) |
| `consultation_notes` | 학생별 상담 기록 (7가지 유형: 학생부분석/입시전략/학교생활/공부법/진로/심리정서/기타) |
| `admission_cases` | 합격 사례 DB (대학·학과·전형·성적·강점 등) |
| `interview_questions` | 분석 건별 면접 예상 질문 (6가지 카테고리, 힌트 포함) |
| `analysis_shares` | 분석 결과 공유 링크 (7일 만료) |

### 새로 추가된 API 엔드포인트

| 메서드 | 경로 | 기능 |
|--------|------|------|
| POST | `/api/auth/forgot-password` | 비밀번호 재설정 이메일 발송 |
| POST | `/api/auth/reset-password` | 비밀번호 재설정 처리 |
| GET | `/api/analysis/compare` | 복수 분석 비교 (최대 3건) |
| POST | `/api/analysis/{id}/share` | 공유 링크 생성 |
| GET | `/api/shared/{token}` | 공유 링크로 결과 조회 (비로그인) |
| GET | `/api/analysis/{id}/interview-questions` | 면접 예상 질문 조회 |
| GET | `/api/admission-cases` | 공개 합격 사례 조회 |
| GET | `/api/consultation-notes` | 내 상담 기록 조회 (공개된 것만) |
| GET/POST/PUT/DELETE | `/api/admin/admins` | 관리자 계정 관리 (super_admin 전용) |
| GET/POST/PUT/DELETE | `/api/admin/consultation-notes` | 상담 기록 CRUD |
| GET | `/api/admin/consultation-notes/user/{id}` | 학생별 상담 전체 이력 |
| GET/POST/PUT/DELETE | `/api/admin/admission-cases` | 합격 사례 관리 |
| GET/POST/DELETE | `/api/admin/analysis/{id}/interview-questions` | 면접 질문 관리 |

### 새로 추가된 화면

**사용자 웹:**
- `/forgot-password` — 비밀번호 찾기
- `/reset-password?token=...` — 비밀번호 재설정
- `/admission-cases` — 합격 사례 조회
- `/analysis/[id]/interview` — 면접 예상 질문

**관리자 웹:**
- `/settings/admins` — 관리자 계정 관리
- `/users/[id]` — 학생 프로필 + 상담 기록 이력
- `/admission-cases` — 합격 사례 관리

**Flutter 앱:**
- `ForgotPasswordScreen` — 비밀번호 찾기
- `InterviewQuestionsScreen` — 면접 예상 질문
- 분석 상세 화면에 면접 질문 진입 버튼 추가

### 🟡 운영 편의 — 추가 개발 고려

| 기능 | 현황 | 설명 |
|------|------|------|
| 관리자 공지사항 | 미구현 | `/settings` 페이지 기본 구조만 있음 |
| 분석 요청 검색 | 미구현 | 이름·이메일·파일명으로 검색 |
| 상담 완료 후 후기/평점 | 미구현 | 사용자가 상담 평가 남기기 |
| 결제 연동 후 분석 자동 연결 | 부분 구현 | 결제한 건과 분석 주문을 연결하는 흐름 |
| 분석 재요청 | 미구현 | 동일 학생부 재분석 요청 |
| 관리자 통계 확장 | 기본만 구현 | 월별 매출 그래프, 분석 건수 추이 차트 |

### 🟢 추후 확장 — 서비스 성장 후 고려

| 기능 | 설명 |
|------|------|
| iOS 앱 | Flutter 코드 그대로 사용, Apple Developer 계정 필요 ($129/년) |
| 토스페이먼츠 자동 환불 | 현재는 수동 처리, 토스 API로 자동화 가능 |
| 상담 Zoom/구글밋 링크 자동 생성 | 예약 확정 시 화상 링크 자동 발송 |
| 소셜 로그인 | 카카오·구글 로그인 |
| 면접 질문 AI 자동 생성 | Claude API로 세특·창체 기반 면접 질문 자동 생성 |

---

*최종 업데이트: 2026-03-31*
