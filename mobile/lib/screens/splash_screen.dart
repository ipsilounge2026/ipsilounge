import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../theme/app_palette.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    await Future.delayed(const Duration(milliseconds: 1500));
    if (!mounted) return;
    final auth = context.read<AuthProvider>();
    await auth.checkAuth();
    if (!mounted) return;
    Navigator.pushReplacementNamed(
        context, auth.isLoggedIn ? '/home' : '/login');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppPalette.cream,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            children: [
              const SizedBox(height: 12),
              // 상단 에디토리얼 헤더
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: const [
                  Text('§  vol. 04',
                      style: TextStyle(
                          color: AppPalette.muted,
                          fontSize: 14,
                          fontStyle: FontStyle.italic)),
                  Text('2026 · SEOUL',
                      style: TextStyle(
                          color: AppPalette.muted,
                          fontSize: 14,
                          fontStyle: FontStyle.italic)),
                ],
              ),
              const Spacer(),
              // 로고
              Image.asset('assets/icon/icon.png', width: 132, height: 132),
              const SizedBox(height: 28),
              const Text(
                '입시라운지',
                style: TextStyle(
                  color: AppPalette.navy,
                  fontSize: 44,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.5,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Ipsi Lounge',
                style: TextStyle(
                  color: AppPalette.teal,
                  fontSize: 26,
                  fontWeight: FontWeight.w600,
                  fontStyle: FontStyle.italic,
                ),
              ),
              const SizedBox(height: 28),
              Container(width: 48, height: 1.5, color: AppPalette.lineStrong),
              const SizedBox(height: 24),
              const Text(
                '학생부 분석 & 상담 예약',
                style: TextStyle(color: AppPalette.navy, fontSize: 16),
              ),
              const Spacer(),
              // 하단 페이지 도트
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _dot(true),
                  const SizedBox(width: 8),
                  _dot(false),
                  const SizedBox(width: 8),
                  _dot(false),
                ],
              ),
              const SizedBox(height: 28),
            ],
          ),
        ),
      ),
    );
  }

  Widget _dot(bool active) => Container(
        width: 7,
        height: 7,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: active ? AppPalette.teal : AppPalette.teal.withOpacity(0.3),
        ),
      );
}
