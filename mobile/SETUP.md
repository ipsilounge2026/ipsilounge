# Flutter 앱 설정 가이드

## 1. Flutter SDK 설치

https://docs.flutter.dev/get-started/install/windows 에서 Flutter SDK를 다운로드하고 설치합니다.

## 2. Firebase 프로젝트 설정

1. https://console.firebase.google.com 에서 새 프로젝트 생성 (프로젝트명: ipsilounge)
2. Android 앱 추가:
   - 패키지명: `com.ipsilounge.app`
   - 앱 닉네임: 입시라운지
3. `google-services.json` 다운로드 → `android/app/` 폴더에 저장
4. Firebase Cloud Messaging 활성화

## 3. 서버 주소 설정

`lib/services/api_service.dart` 파일에서 서버 주소 수정:
```dart
static const String baseUrl = 'https://api.ipsilounge.co.kr/api';
// 개발 환경: 'http://192.168.x.x:8000/api' (PC의 로컬 IP)
```

## 4. 패키지 설치 및 빌드

```bash
cd ipsilounge/mobile
flutter pub get
flutter run  # 개발 테스트
flutter build apk --release  # 릴리즈 APK 빌드
```

## 5. Play Store 배포

1. `android/app/build.gradle`에서 signingConfig를 릴리즈 키스토어로 교체
2. `flutter build appbundle --release` 로 AAB 파일 생성
3. Google Play Console에서 앱 업로드

## 주요 파일 구조

```
lib/
├── main.dart               # 앱 진입점, FCM 초기화
├── screens/                # 화면 (13개)
│   ├── splash_screen.dart  # 시작 화면 (자동 로그인 확인)
│   ├── login_screen.dart   # 로그인
│   ├── register_screen.dart # 회원가입
│   ├── home_screen.dart    # 홈 (하단 탭바 포함)
│   ├── analysis_list_screen.dart   # 분석 목록
│   ├── analysis_upload_screen.dart # 학생부 업로드
│   ├── analysis_detail_screen.dart # 분석 상세 + 리포트 다운로드
│   ├── consultation_screen.dart    # 상담 예약 (달력)
│   ├── consultation_list_screen.dart # 내 예약 목록
│   ├── mypage_screen.dart  # 마이페이지
│   └── notification_screen.dart    # 알림 목록
├── models/                 # 데이터 모델
├── services/               # API 통신
├── providers/              # 상태 관리 (Provider)
└── widgets/                # 공통 위젯
```
