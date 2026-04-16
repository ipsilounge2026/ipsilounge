import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'providers/auth_provider.dart';
import 'providers/analysis_provider.dart';
import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/home_screen.dart';
import 'screens/analysis_list_screen.dart';
import 'screens/analysis_apply_screen.dart';
import 'screens/analysis_upload_screen.dart';
import 'screens/analysis_detail_screen.dart';
import 'screens/consultation_screen.dart';
import 'screens/consultation_list_screen.dart';
import 'screens/consultation_notes_screen.dart';
import 'screens/senior_consultation_notes_screen.dart';
import 'screens/consultation_management_screen.dart';
import 'screens/admission_info_screen.dart';
import 'screens/admission_cases_screen.dart';
import 'screens/mypage_screen.dart';
import 'screens/notification_screen.dart';
import 'screens/payment_screen.dart';
import 'screens/forgot_password_screen.dart';
import 'screens/interview_questions_screen.dart';
import 'screens/notices_screen.dart';
import 'screens/senior_pre_survey_screen.dart';
import 'screens/satisfaction_survey_screen.dart';

final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
    FlutterLocalNotificationsPlugin();

/// Firebase 사용 가능 여부.
///
/// 활성화 순서:
///   1. Firebase 콘솔에서 Android 앱 등록 (package name: com.ipsilounge.app)
///   2. google-services.json → android/app/ 배치
///   3. android/build.gradle: `classpath 'com.google.gms:google-services:4.4.2'`
///   4. android/app/build.gradle: `apply plugin: 'com.google.gms.google-services'`
///   5. 본 플래그를 true 로 변경
const bool kEnableFirebase = false;

/// 백그라운드 메시지 핸들러 (top-level 함수여야 함).
/// onBackgroundMessage 는 별도 isolate 에서 실행되므로 UI 접근 불가.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // 백그라운드에서 도착한 메시지는 FCM 기본 표시만 사용.
  // (알림 내용은 message.notification / message.data 로 접근 가능)
  debugPrint('FCM 백그라운드 메시지 수신: ${message.messageId}');
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase 초기화 (설정된 경우만)
  if (kEnableFirebase) {
    try {
      await _initFirebase();
      debugPrint('Firebase 초기화 완료');
    } catch (e) {
      debugPrint('Firebase 초기화 실패: $e');
    }
  }

  // 로컬 알림 초기화
  const AndroidInitializationSettings initializationSettingsAndroid =
      AndroidInitializationSettings('@mipmap/ic_launcher');
  const InitializationSettings initializationSettings =
      InitializationSettings(android: initializationSettingsAndroid);
  await flutterLocalNotificationsPlugin.initialize(initializationSettings);

  // 알림 채널 생성
  const AndroidNotificationChannel channel = AndroidNotificationChannel(
    'ipsilounge_channel',
    '입시라운지 알림',
    description: '분석 완료 및 상담 예약 알림',
    importance: Importance.high,
  );
  await flutterLocalNotificationsPlugin
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(channel);

  runApp(const IpsiLoungeApp());
}

/// Firebase Core 초기화 + FCM 핸들러 등록.
/// kEnableFirebase == true 이면서 google-services.json 이 배치되어 있어야 성공.
Future<void> _initFirebase() async {
  await Firebase.initializeApp();

  // 알림 권한 요청 (iOS 필수, Android 13+ 필수)
  final settings = await FirebaseMessaging.instance.requestPermission(
    alert: true,
    badge: true,
    sound: true,
  );
  debugPrint('FCM 권한 상태: ${settings.authorizationStatus}');

  // 백그라운드 메시지 핸들러 등록
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  // 포그라운드 수신 시 → 로컬 알림으로 표시
  FirebaseMessaging.onMessage.listen((RemoteMessage message) {
    debugPrint('FCM 포그라운드 메시지 수신: ${message.messageId}');
    final notification = message.notification;
    if (notification != null) {
      flutterLocalNotificationsPlugin.show(
        notification.hashCode,
        notification.title,
        notification.body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'ipsilounge_channel',
            '입시라운지 알림',
            channelDescription: '분석 완료 및 상담 예약 알림',
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
      );
    }
  });

  // 알림 탭으로 앱을 연 경우 (백그라운드 → 포그라운드 전환)
  FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
    debugPrint('FCM 알림 탭하여 앱 오픈: ${message.data}');
    // 향후 data.type 에 따라 라우팅 처리 가능
    // (예: type=consultation_confirmed → /consultation/my)
  });
}

class IpsiLoungeApp extends StatelessWidget {
  const IpsiLoungeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => AnalysisProvider()),
      ],
      child: MaterialApp(
        title: '입시라운지',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF3B82F6),
            primary: const Color(0xFF3B82F6),
          ),
          fontFamily: 'Pretendard',
          useMaterial3: true,
          appBarTheme: const AppBarTheme(
            backgroundColor: Colors.white,
            foregroundColor: Color(0xFF111827),
            elevation: 0,
            centerTitle: true,
            titleTextStyle: TextStyle(
              color: Color(0xFF111827),
              fontSize: 17,
              fontWeight: FontWeight.w600,
            ),
          ),
          scaffoldBackgroundColor: const Color(0xFFF9FAFB),
          elevatedButtonTheme: ElevatedButtonThemeData(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF3B82F6),
              foregroundColor: Colors.white,
              minimumSize: const Size(double.infinity, 48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
          inputDecorationTheme: InputDecorationTheme(
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFF3B82F6), width: 2),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
        ),
        routes: {
          '/': (context) => const SplashScreen(),
          '/login': (context) => const LoginScreen(),
          '/register': (context) => const RegisterScreen(),
          '/home': (context) => const HomeScreen(),
          '/analysis': (context) => const AnalysisListScreen(),
          '/analysis/apply': (context) => const AnalysisApplyScreen(),
          '/analysis/upload': (context) => const AnalysisUploadScreen(),
          '/consultation': (context) => const ConsultationScreen(),
          '/consultation/my': (context) => const ConsultationListScreen(),
          '/consultation/notes': (context) => const ConsultationNotesScreen(),
          '/consultation/senior-notes': (context) => const SeniorConsultationNotesScreen(),
          '/consultation/management': (context) => const ConsultationManagementScreen(),
          '/admission-info': (context) => const AdmissionInfoScreen(),
          '/admission-cases': (context) => const AdmissionCasesScreen(),
          '/mypage': (context) => const MypageScreen(),
          '/notifications': (context) => const NotificationScreen(),
          '/payment': (context) => const PaymentScreen(),
          '/forgot-password': (context) => const ForgotPasswordScreen(),
          '/notices': (context) => const NoticesScreen(),
          '/senior-pre-survey': (context) => const SeniorPreSurveyScreen(),
        },
        onGenerateRoute: (settings) {
          if (settings.name?.startsWith('/satisfaction-survey/') == true) {
            final id = settings.name!.split('/').last;
            return MaterialPageRoute(
              builder: (context) => SatisfactionSurveyScreen(surveyId: id),
            );
          }
          if (settings.name?.startsWith('/analysis/') == true) {
            final parts = settings.name!.split('/');
            // /analysis/:id/interview
            if (parts.length == 4 && parts[3] == 'interview') {
              return MaterialPageRoute(
                builder: (context) => InterviewQuestionsScreen(orderId: parts[2]),
              );
            }
            // /analysis/:id
            final id = parts.last;
            return MaterialPageRoute(
              builder: (context) => AnalysisDetailScreen(id: id),
            );
          }
          return null;
        },
      ),
    );
  }
}
