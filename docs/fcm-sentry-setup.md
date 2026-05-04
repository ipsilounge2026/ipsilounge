# FCM 푸시 알림 + Sentry 에러 모니터링 설정 가이드

작성일: 2026-04-21
대상: 운영자 (배포 직전 1회 설정)

코드 레벨 통합은 모두 완료된 상태입니다. 이 문서는 외부 서비스(Firebase, Sentry) 가입 + 환경변수 설정 절차만 다룹니다. **둘 다 환경변수 미설정 시 graceful 비활성**되므로 한 쪽만 먼저 설정해도 됩니다.

---

## 1. Firebase (FCM 푸시 알림)

### 무엇을 위한 것인가
- Android 앱(향후 iOS 도) 사용자에게 상담 리마인더, 분석 완료, 검토 완료 등의 푸시 알림 전송
- 코드 위치: `backend/app/services/notification_service.py` (이미 작성됨)

### 1-A. Firebase 프로젝트 생성 (운영자 직접, 약 5분)

1. [https://console.firebase.google.com/](https://console.firebase.google.com/) 접속 (Google 계정 로그인)
2. **"프로젝트 만들기"** 클릭
3. 프로젝트 이름: `ipsilounge` (자유)
4. Google Analytics: **사용 안 함** 선택 (필수 아님)
5. 프로젝트 생성 완료

### 1-B. Android 앱 등록 → google-services.json 다운로드

1. 프로젝트 대시보드 → **Android 아이콘** 클릭
2. Android 패키지 이름: `com.ipsilounge.app` (정확히 이 값, 앱 빌드 설정과 일치)
3. 앱 닉네임: `입시라운지` (자유)
4. SHA-1 인증서 지문: 비워둠 (인앱 결제 등 추가 기능 시 추후 등록)
5. **"google-services.json 다운로드"** 클릭
6. 다운로드한 파일을 다음 경로에 복사:
   ```
   ipsilounge/mobile/android/app/google-services.json
   ```
7. 파일이 위 경로에 있으면 `mobile/android/app/build.gradle` 의 자동 감지 로직이 google-services 플러그인을 활성화합니다 (이미 코드에 있음).

> ⚠️ **`google-services.json` 은 git 에 커밋하지 마세요.** `.gitignore` 에 이미 등록되어 있는지 확인. 없다면 추가 필요.

### 1-C. 백엔드용 서비스 계정 키 발급

1. Firebase Console → **프로젝트 설정 (톱니바퀴 아이콘)** → **서비스 계정** 탭
2. **"새 비공개 키 생성"** → **"키 생성"** 클릭
3. JSON 파일 다운로드 (예: `firebase-adminsdk-xxxxx.json`)
4. 두 가지 옵션 중 하나로 EC2 서버에 배치:

#### 옵션 1: 파일로 배치 (간단)

```bash
# 로컬에서 EC2 로 SCP 전송
scp -i "C:\Users\orbik\Dropbox\관리\홈페이지 AWS Key\ipsilounge\ipsilounge-key.pem" \
    firebase-adminsdk-xxxxx.json \
    ubuntu@3.107.217.182:/home/ubuntu/ipsilounge/backend/firebase-credentials.json
```

그 다음 EC2 서버 `.env` 에:
```
FIREBASE_CREDENTIALS_PATH=/home/ubuntu/ipsilounge/backend/firebase-credentials.json
```

#### 옵션 2: JSON 문자열로 환경변수 (CI/CD 친화적)

`.env` 또는 systemd EnvironmentFile 에:
```
FIREBASE_CREDENTIALS_JSON={"type":"service_account","project_id":"ipsilounge",...}
```

(따옴표 이스케이프 주의 — 한 줄에 모두)

> ⚠️ 서비스 계정 키 파일도 **절대 git 커밋 금지**. 유출 시 FCM 무단 발송·과금 위험.

### 1-D. 적용 확인

1. EC2 서버 재시작:
   ```bash
   ssh -i "..." ubuntu@3.107.217.182 "sudo systemctl restart ipsilounge"
   ```
2. 로그 확인:
   ```bash
   ssh -i "..." ubuntu@3.107.217.182 "sudo journalctl -u ipsilounge -n 50 --no-pager"
   ```
   다음 메시지가 보이면 성공:
   ```
   [firebase] Firebase Admin SDK 초기화 완료 — FCM 발송 활성
   ```
3. 실제 푸시 테스트: 앱에서 FCM 토큰을 백엔드에 등록 → 상담 리마인더 등 이벤트 발생 시 푸시 도착 확인

---

## 2. Sentry (에러 모니터링)

### 무엇을 위한 것인가
- 프로덕션에서 발생하는 백엔드/프론트엔드 에러를 실시간으로 대시보드에 수집
- 사용자가 신고하기 전에 운영자가 먼저 인지 → 빠른 대응
- 무료 플랜: 월 5,000 이벤트 (소규모 운영에 충분)

### 2-A. Sentry 가입 (운영자 직접, 약 5분)

1. [https://sentry.io/signup/](https://sentry.io/signup/) 가입 (Google/GitHub OAuth 가능)
2. Organization slug: 예) `ipsilounge`
3. **Create Project** 클릭

### 2-B. 3개 프로젝트 생성 (백엔드 / admin-web / user-web 각 1개)

각각 별도 프로젝트로 만드는 것을 권장 (대시보드에서 분리 확인 용이):

1. **Backend (Python · FastAPI)**
   - Platform: **Python** → **FastAPI**
   - Project name: `ipsilounge-backend`
   - 발급된 **DSN** 복사 (예: `https://abc123@o12345.ingest.sentry.io/67890`)

2. **Admin Web (Next.js)**
   - Platform: **JavaScript** → **Next.js**
   - Project name: `ipsilounge-admin`
   - DSN 복사

3. **User Web (Next.js)**
   - Platform: **JavaScript** → **Next.js**
   - Project name: `ipsilounge-user`
   - DSN 복사

### 2-C. 환경변수 설정

#### 백엔드 (EC2 `.env` 또는 systemd EnvironmentFile)

```env
SENTRY_DSN=https://abc123@o12345.ingest.sentry.io/67890
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

#### Admin Web (Vercel 또는 배포 환경)

```env
NEXT_PUBLIC_SENTRY_DSN=https://...@o....ingest.sentry.io/...
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
```

#### User Web (Vercel 또는 배포 환경)

```env
NEXT_PUBLIC_SENTRY_DSN=https://...@o....ingest.sentry.io/...
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
```

> 💡 `NEXT_PUBLIC_` 접두사는 클라이언트(브라우저)에 노출되도록 Next.js 가 빌드 시 인라인합니다. DSN 자체는 노출되어도 안전 (write-only key).

### 2-D. 적용 확인

#### 백엔드
```bash
ssh -i "..." ubuntu@3.107.217.182 "sudo systemctl restart ipsilounge && sleep 3 && sudo journalctl -u ipsilounge -n 20 --no-pager"
```
로그에서 다음 메시지 확인:
```
[sentry] 초기화 완료 — environment=production traces_sample_rate=0.1
```

#### 프론트엔드
- Vercel 또는 배포 환경에서 환경변수 추가 후 **재배포 트리거**
- 일부러 에러 유발 (예: 잘못된 URL 접근) → Sentry 대시보드에서 5분 이내 수신 확인

### 2-E. 운영 팁

- **알림 설정**: Sentry → Project → Alerts → 새 에러 발생 시 이메일 알림 추가
- **이슈 자동 해결**: 같은 에러가 7일 동안 발생 안 하면 자동 close (기본 설정)
- **민감 정보 자동 스크러빙**: Sentry 가 패스워드·신용카드·이메일 등을 자동 마스킹. 추가 필드는 Project → Settings → Security & Privacy → Data Scrubbing 에서 등록.
- **traces_sample_rate**: 트랜잭션(성능 추적) 샘플링. 기본 0.1 (10%) — 트래픽 많아지면 0.05 로 낮춰 비용 관리.

---

## 3. 비활성 모드 동작 확인

두 서비스 모두 **환경변수 미설정 시 graceful 비활성**됩니다:

| 환경변수 | 미설정 시 동작 |
|---|---|
| `FIREBASE_CREDENTIALS_PATH` / `_JSON` | FCM 발송 시도 자체 스킵 (로그 INFO 1회) |
| `SENTRY_DSN` | Sentry SDK 초기화 안 함 (로그 INFO 1회) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry.init() 호출 안 함 — 빌드/런타임 영향 0 |

**즉 둘 중 하나만 먼저 설정해도 됩니다**. Firebase 가 우선 필요하면 Sentry 는 나중에, 또는 그 반대.

---

## 4. 보안 체크리스트

- [ ] `mobile/android/app/google-services.json` `.gitignore` 등록 확인
- [ ] `backend/firebase-credentials.json` `.gitignore` 등록 확인
- [ ] `.env` 파일 `.gitignore` 등록 확인 (이미 되어 있을 것)
- [ ] EC2 `.env` 파일 권한 `chmod 600 .env` 로 제한
- [ ] Sentry DSN 은 write-only 라 노출되어도 안전하나, **서비스 계정 키는 절대 노출 금지**
- [ ] Firebase 콘솔 → 프로젝트 설정 → 사용자 및 권한에서 운영자 외 액세스 제거

---

## 5. 문제 해결 (Troubleshooting)

| 증상 | 원인 / 해결 |
|---|---|
| `Firebase Admin SDK 초기화 완료` 로그가 안 보임 | `FIREBASE_CREDENTIALS_PATH` 가 절대경로인지 확인. 상대경로면 `backend/` 기준으로 해석 |
| `[firebase] FIREBASE_CREDENTIALS_PATH=... 파일 없음` | scp 전송 시 경로 오타. `ls -la` 로 실제 파일 위치 확인 |
| `Sentry 대시보드에 이벤트 안 옴` | DSN 정확성 + `NEXT_PUBLIC_` 접두사 (Next.js 만) + 배포 후 재빌드 필요 |
| 푸시는 보내지는데 앱에 안 옴 | (1) `mobile/android/app/google-services.json` 배치 + 앱 재빌드, (2) 사용자가 앱에서 알림 권한 허용했는지, (3) `users.fcm_token` DB 에 저장됐는지 |
| Sentry 이벤트 너무 많이 발생해서 quota 초과 | `SENTRY_TRACES_SAMPLE_RATE=0.05` 로 낮추거나, 알려진 무해 에러는 `before_send` 훅으로 필터 |

---

## 6. 다음 단계

이 가이드를 따라 두 서비스 모두 활성화하면:
- ✅ 사용자 앱에 푸시 알림 정상 도착
- ✅ 운영자가 발생하는 에러를 실시간 인지
- ✅ Google Play 스토어 등록 시 "푸시 알림" 기능 정상 표기 가능

이후 작업은 Google Play 개발자 등록 + APK/AAB 서명 keystore 생성 → 별도 가이드로 안내드릴 예정.
