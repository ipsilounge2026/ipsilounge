# 입시라운지 배포 가이드

## 전체 배포 구성

```
[사용자 웹]          → Vercel (ipsilounge.co.kr)
[관리자 웹]          → Vercel (admin.ipsilounge.co.kr)
[백엔드 API]         → 서버 + Docker (api.ipsilounge.co.kr)
[데이터베이스]       → PostgreSQL (Docker 컨테이너)
[파일 저장소]        → AWS S3
[푸시 알림]          → Firebase FCM
[Android 앱]         → Google Play Store
```

---

## STEP 1 — 도메인 구매

1. 가비아(gabia.com) 또는 후이즈(whois.co.kr)에서 도메인 구매
   - 추천: `ipsilounge.co.kr` (연 약 2만원)
2. DNS 레코드 설정 (구매 후 DNS 관리 페이지에서):

| 타입 | 호스트 | 값 | 설명 |
|------|--------|----|------|
| A    | @      | 서버IP | 메인 도메인 (사용자 웹 Vercel 처리) |
| A    | api    | 서버IP | 백엔드 API 서버 |
| CNAME | www   | cname.vercel-dns.com | Vercel 연결 |
| CNAME | admin | cname.vercel-dns.com | 관리자 웹 Vercel 연결 |

---

## STEP 2 — 서버 준비 (AWS EC2)

### 2-1. EC2 인스턴스 생성
- AWS 콘솔 → EC2 → 인스턴스 시작
- **AMI**: Ubuntu 24.04 LTS
- **타입**: t3.small (월 약 2만원) — 초기에 충분
- **스토리지**: 20GB SSD
- **보안 그룹 인바운드 규칙**:
  - SSH (22) — 내 IP만 허용
  - HTTP (80) — 0.0.0.0/0
  - HTTPS (443) — 0.0.0.0/0

### 2-2. 서버 초기 설정
```bash
# SSH 접속
ssh -i your-key.pem ubuntu@서버IP

# 패키지 업데이트
sudo apt update && sudo apt upgrade -y

# Docker 설치
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker

# Docker Compose 설치
sudo apt install -y docker-compose-plugin

# Git 설치
sudo apt install -y git

# 프로젝트 클론
cd /opt
sudo git clone https://github.com/YOUR_USERNAME/ipsilounge.git
sudo chown -R ubuntu:ubuntu ipsilounge
cd ipsilounge
```

### 2-3. 환경변수 설정
```bash
# 백엔드 .env 파일 생성
cp backend/.env.example backend/.env
nano backend/.env
# → 실제 값으로 채우기 (DB 비밀번호, AWS 키, Toss 키 등)
```

### 2-4. SSL 인증서 발급 (무료 Let's Encrypt)
```bash
# 임시로 HTTP만 허용하는 nginx 설정으로 시작
mkdir -p nginx/ssl

# Certbot으로 인증서 발급 (도메인이 서버 IP를 가리키고 있어야 함)
docker run --rm \
  -v $(pwd)/nginx/ssl:/etc/letsencrypt \
  -v $(pwd)/nginx/certbot_www:/var/www/certbot \
  -p 80:80 \
  certbot/certbot certonly \
  --standalone \
  --email your@email.com \
  --agree-tos \
  --no-eff-email \
  -d api.ipsilounge.co.kr
```

### 2-5. 서비스 시작
```bash
# Firebase 자격증명 파일 업로드 (로컬 PC에서)
scp -i your-key.pem firebase-credentials.json ubuntu@서버IP:/opt/ipsilounge/backend/

# 서버에서 실행
cd /opt/ipsilounge
docker compose up -d

# 로그 확인
docker compose logs -f backend
```

---

## STEP 3 — AWS S3 설정

1. AWS 콘솔 → S3 → 버킷 만들기
   - 버킷 이름: `ipsilounge-files`
   - 리전: `ap-northeast-2` (서울)
   - 퍼블릭 액세스 차단: **유지** (presigned URL로 접근)

2. IAM → 사용자 만들기 → 정책 연결:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::ipsilounge-files/*"
    }
  ]
}
```

3. IAM 사용자의 **액세스 키 ID**와 **시크릿 키**를 `backend/.env`에 입력

---

## STEP 4 — Firebase 설정 (FCM 푸시 알림)

1. https://console.firebase.google.com → 프로젝트 추가 (이름: ipsilounge)
2. 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성**
   - `firebase-credentials.json` 파일 다운로드
   - 서버의 `/opt/ipsilounge/backend/` 에 업로드
3. Android 앱 등록 → 패키지명: `com.ipsilounge.app`
   - `google-services.json` 다운로드 → `mobile/android/app/` 에 저장

---

## STEP 5 — Vercel 배포 (사용자 웹 + 관리자 웹)

### 5-1. GitHub 저장소 생성
```bash
# 로컬에서
cd C:\Users\orbik\Dropbox\AI Project\Claude\학생부분석프로그램\ipsilounge
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/ipsilounge.git
git push -u origin main
```

### 5-2. 사용자 웹 배포
1. https://vercel.com → New Project → GitHub 저장소 선택
2. **Root Directory**: `user-web`
3. **Environment Variables** 추가:
   - `NEXT_PUBLIC_API_URL` = `https://api.ipsilounge.co.kr`
   - `NEXT_PUBLIC_TOSS_CLIENT_KEY` = 토스 클라이언트 키 (테스트: `test_ck_xxx`)
4. Deploy → 완료 후 **도메인 설정**: `ipsilounge.co.kr`

### 5-3. 관리자 웹 배포
1. Vercel → New Project → 같은 저장소
2. **Root Directory**: `admin-web`
3. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = `https://api.ipsilounge.co.kr`
4. Deploy → 완료 후 **도메인 설정**: `admin.ipsilounge.co.kr`

---

## STEP 6 — Android 앱 서명 및 Play Store 출시

### 6-1. 릴리즈 키스토어 생성 (최초 1회)
```bash
# Windows 명령 프롬프트 또는 Git Bash
keytool -genkey -v \
  -keystore ipsilounge-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias ipsilounge
# → 비밀번호와 정보 입력 (이 파일을 절대 분실하지 말 것!)
```

### 6-2. key.properties 설정
```bash
# mobile/android/ 폴더에 key.properties 파일 생성
cp mobile/android/key.properties.example mobile/android/key.properties
# → 실제 비밀번호와 파일 경로로 수정
```

### 6-3. api_service.dart 서버 주소 변경
```dart
// mobile/lib/services/api_service.dart
static const String baseUrl = 'https://api.ipsilounge.co.kr/api';
```

### 6-4. AAB 빌드 (Play Store용)
```bash
cd mobile
flutter pub get
flutter build appbundle --release
# 결과물: mobile/build/app/outputs/bundle/release/app-release.aab
```

### 6-5. Play Store 등록
1. https://play.google.com/console → 앱 만들기
   - 앱 이름: 입시라운지
   - 기본 언어: 한국어
   - 앱 유형: 앱 (게임 아님)
   - 유료/무료: 무료
2. 프로덕션 → 새 버전 만들기 → AAB 파일 업로드
3. 스토어 정보 입력:
   - **앱 아이콘**: 512×512px PNG (배경 없음 권장)
   - **스크린샷**: 폰 화면 캡처 2장 이상 (세로 방향)
   - **간략한 설명**: 학생부 분석 및 입시 상담 예약 서비스
   - **전체 설명**: 상세 서비스 소개
4. 검토 제출 → 보통 3~7일 심사 후 출시

---

## STEP 7 — 자동 배포 설정 (GitHub Actions)

### GitHub Secrets 등록
저장소 → Settings → Secrets → Actions → New repository secret:

| 이름 | 값 |
|------|----|
| `SERVER_HOST` | EC2 퍼블릭 IP |
| `SERVER_USER` | `ubuntu` |
| `SERVER_SSH_KEY` | EC2 .pem 파일의 내용 전체 |

이제 `main` 브랜치에 push하면 `backend/` 변경사항이 서버에 자동 배포됩니다.
Vercel은 GitHub 연동 후 자동으로 배포됩니다.

---

## 운영 중 자주 쓰는 명령

```bash
# 서버 접속
ssh -i your-key.pem ubuntu@서버IP

# 백엔드 로그 확인
cd /opt/ipsilounge && docker compose logs -f backend

# 서비스 재시작
docker compose restart backend

# DB 백업
docker compose exec db pg_dump -U ipsilounge ipsilounge > backup_$(date +%Y%m%d).sql

# 인증서 수동 갱신
docker compose run --rm certbot renew
```

---

## 비용 요약 (월 기준)

| 항목 | 비용 |
|------|------|
| EC2 t3.small | 약 2만원 |
| 도메인 | 약 2천원 (연 2만원) |
| AWS S3 (초기) | 수백원~수천원 |
| Vercel (소규모) | 무료 |
| Firebase FCM | 무료 |
| SSL (Let's Encrypt) | 무료 |
| **합계** | **약 2~3만원/월** |
