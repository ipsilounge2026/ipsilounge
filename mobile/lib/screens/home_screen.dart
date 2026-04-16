import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../main.dart' show kEnableFirebase;
import '../providers/auth_provider.dart';
import '../providers/analysis_provider.dart';
import '../services/auth_service.dart';
import '../widgets/status_badge.dart';
import 'analysis_list_screen.dart';
import 'consultation_list_screen.dart';
import 'mypage_screen.dart';
import 'seminar_screen.dart';

// Firebase import 는 compile 단계에서만 필요.
// kEnableFirebase=false 이면 런타임에는 호출되지 않음.
import 'package:firebase_messaging/firebase_messaging.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

  void _switchTab(int index) {
    setState(() => _selectedIndex = index);
  }

  @override
  void initState() {
    super.initState();
    // FCM 토큰 등록 (로그인 상태 + Firebase 활성화 시)
    _initFCM();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AnalysisProvider>().loadOrders();
    });
  }

  /// FCM 토큰을 백엔드에 등록.
  /// 기획서 §7-1: 상담 확정 / 리포트 준비 완료 / 만족도 설문 발송 3개 트리거가 본 토큰으로 발송됨.
  Future<void> _initFCM() async {
    if (!kEnableFirebase) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await AuthService.saveFcmToken(token);
        debugPrint('FCM 토큰 등록 완료');
      }
      // 토큰 갱신 시 자동 재등록
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
        AuthService.saveFcmToken(newToken);
      });
    } catch (e) {
      debugPrint('FCM 토큰 등록 실패: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _selectedIndex,
        children: [
          _HomeTab(onSwitchTab: _switchTab),
          const AnalysisListScreen(serviceType: '학생부라운지'),
          const AnalysisListScreen(serviceType: '학종라운지'),
          const ConsultationListScreen(),
          const MypageScreen(),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (i) => setState(() => _selectedIndex = i),
        type: BottomNavigationBarType.fixed,
        selectedItemColor: const Color(0xFF3B82F6),
        unselectedItemColor: const Color(0xFF9CA3AF),
        selectedLabelStyle:
            const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelStyle: const TextStyle(fontSize: 11),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home), label: '홈'),
          BottomNavigationBarItem(icon: Icon(Icons.description_outlined), activeIcon: Icon(Icons.description), label: '학생부'),
          BottomNavigationBarItem(icon: Icon(Icons.school_outlined), activeIcon: Icon(Icons.school), label: '학종'),
          BottomNavigationBarItem(icon: Icon(Icons.calendar_today_outlined), activeIcon: Icon(Icons.calendar_today), label: '상담'),
          BottomNavigationBarItem(icon: Icon(Icons.person_outline), activeIcon: Icon(Icons.person), label: '마이'),
        ],
      ),
    );
  }
}

class _HomeTab extends StatelessWidget {
  final void Function(int) onSwitchTab;
  const _HomeTab({required this.onSwitchTab});

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final orders = context.watch<AnalysisProvider>().orders;
    final recent = orders.take(2).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('입시라운지'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => Navigator.pushNamed(context, '/notifications'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 환영 카드
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF3B82F6), Color(0xFF2563EB)],
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '안녕하세요, ${user?.name ?? ''}님',
                  style: const TextStyle(
                      color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                const Text(
                  '오늘도 입시 준비 화이팅!',
                  style: TextStyle(color: Colors.white70, fontSize: 14),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          // 빠른 메뉴
          const Text(
            '메뉴',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MenuCard(
                  icon: Icons.description_outlined,
                  label: '학생부 라운지',
                  color: const Color(0xFFEFF6FF),
                  iconColor: const Color(0xFF3B82F6),
                  onTap: () => onSwitchTab(1),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MenuCard(
                  icon: Icons.school_outlined,
                  label: '학종 라운지',
                  color: const Color(0xFFF0FDF4),
                  iconColor: const Color(0xFF22C55E),
                  onTap: () => onSwitchTab(2),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MenuCard(
                  icon: Icons.calendar_month,
                  label: '상담 라운지',
                  color: const Color(0xFFFFF7ED),
                  iconColor: const Color(0xFFF97316),
                  onTap: () => onSwitchTab(3),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MenuCard(
                  icon: Icons.info_outline,
                  label: '대입 정보',
                  color: const Color(0xFFFEF3C7),
                  iconColor: const Color(0xFFD97706),
                  onTap: () => Navigator.pushNamed(context, '/admission-info'),
                ),
              ),
            ],
          ),
          // 설명회 메뉴 (지점 담당자만)
          if (user?.memberType == 'branch_manager') ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _MenuCard(
                    icon: Icons.mic_outlined,
                    label: '설명회 예약',
                    color: const Color(0xFFEDE9FE),
                    iconColor: const Color(0xFF8B5CF6),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SeminarScreen())),
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(child: SizedBox()),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MenuCard(
                  icon: Icons.note_alt_outlined,
                  label: '상담 관리',
                  color: const Color(0xFFF5F3FF),
                  iconColor: const Color(0xFF7C3AED),
                  onTap: () => Navigator.pushNamed(context, '/consultation/management'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MenuCard(
                  icon: Icons.notifications_outlined,
                  label: '알림',
                  color: const Color(0xFFFEF2F2),
                  iconColor: const Color(0xFFEF4444),
                  onTap: () => Navigator.pushNamed(context, '/notifications'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (recent.isNotEmpty) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  '최근 라운지 신청',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
                TextButton(
                  onPressed: () => onSwitchTab(1),
                  child: const Text('전체보기'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ...recent.map((o) => _RecentOrderCard(
                  filename: o.schoolRecordFilename ?? '${o.serviceTypeLabel} 신청',
                  status: o.status,
                  onTap: () => Navigator.pushNamed(context, '/analysis/${o.id}'),
                )),
          ],
        ],
      ),
    );
  }
}

class _MenuCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final Color iconColor;
  final VoidCallback onTap;

  const _MenuCard({
    required this.icon,
    required this.label,
    required this.color,
    required this.iconColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: iconColor, size: 28),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

class _RecentOrderCard extends StatelessWidget {
  final String filename;
  final String status;
  final VoidCallback onTap;

  const _RecentOrderCard({
    required this.filename,
    required this.status,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            const Icon(Icons.insert_drive_file_outlined,
                color: Color(0xFF3B82F6), size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                filename,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            StatusBadge(status: status),
          ],
        ),
      ),
    );
  }
}

