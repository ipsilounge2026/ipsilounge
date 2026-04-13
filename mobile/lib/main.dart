import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

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
import 'screens/consultation_management_screen.dart';
import 'screens/admission_info_screen.dart';
import 'screens/admission_cases_screen.dart';
import 'screens/mypage_screen.dart';
import 'screens/notification_screen.dart';
import 'screens/payment_screen.dart';
import 'screens/forgot_password_screen.dart';
import 'screens/interview_questions_screen.dart';
import 'screens/notices_screen.dart';

final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
    FlutterLocalNotificationsPlugin();

/// Firebase 사용 가능 여부 (google-services.json 설정 후 true로 변경)
const bool kEnableFirebase = false;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase 초기화 (설정된 경우만)
  if (kEnableFirebase) {
    try {
      final firebaseCore = await _initFirebase();
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

Future<void> _initFirebase() async {
  // Firebase 초기화는 kEnableFirebase가 true일 때만 호출됨
  // google-services.json 설정 후 아래 import를 활성화:
  // import 'package:firebase_core/firebase_core.dart';
  // import 'package:firebase_messaging/firebase_messaging.dart';
  // await Firebase.initializeApp();
  // FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
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
          '/consultation/management': (context) => const ConsultationManagementScreen(),
          '/admission-info': (context) => const AdmissionInfoScreen(),
          '/admission-cases': (context) => const AdmissionCasesScreen(),
          '/mypage': (context) => const MypageScreen(),
          '/notifications': (context) => const NotificationScreen(),
          '/payment': (context) => const PaymentScreen(),
          '/forgot-password': (context) => const ForgotPasswordScreen(),
          '/notices': (context) => const NoticesScreen(),
        },
        onGenerateRoute: (settings) {
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
