import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../theme/app_palette.dart';
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

/// 에디토리얼 섹션 헤더 (§ 01 · Menu / 메뉴)
Widget _sectionHead(String no, String en, String ko) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('§ $no  ·  $en',
            style: const TextStyle(
                fontSize: 13,
                fontStyle: FontStyle.italic,
                color: AppPalette.teal,
                fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(ko,
            style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: AppPalette.navy,
                letterSpacing: -0.5)),
        const SizedBox(height: 10),
        Container(height: 1, color: AppPalette.line),
        const SizedBox(height: 14),
      ],
    );

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
        backgroundColor: Colors.white,
        selectedItemColor: AppPalette.teal,
        unselectedItemColor: AppPalette.muted,
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
        titleSpacing: 16,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/icon/icon.png', width: 26, height: 26),
            const SizedBox(width: 8),
            const Text('입시라운지',
                style: TextStyle(fontWeight: FontWeight.w800, color: AppPalette.navy)),
          ],
        ),
        centerTitle: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined, color: AppPalette.navy),
            onPressed: () => Navigator.pushNamed(context, '/notifications'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 28),
        children: [
          // 환영 — 에디토리얼
          const Text('§  Today',
              style: TextStyle(
                  fontSize: 15,
                  fontStyle: FontStyle.italic,
                  color: AppPalette.teal,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          RichText(
            text: TextSpan(
              children: [
                const TextSpan(
                    text: '안녕하세요,\n',
                    style: TextStyle(
                        color: AppPalette.navy,
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -1,
                        height: 1.15)),
                TextSpan(
                    text: user?.name ?? '',
                    style: const TextStyle(
                        color: AppPalette.teal,
                        fontSize: 34,
                        fontWeight: FontWeight.w700,
                        fontStyle: FontStyle.italic,
                        letterSpacing: -1)),
                const TextSpan(
                    text: '님.',
                    style: TextStyle(
                        color: AppPalette.navy,
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -1)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Text('오늘도 입시 준비 화이팅!',
              style: TextStyle(color: AppPalette.muted, fontSize: 14)),
          const SizedBox(height: 32),
          _sectionHead('01', 'Menu', '메뉴'),
          Row(
            children: [
              Expanded(
                child: _MenuCard(
                  icon: Icons.description_outlined,
                  label: '학생부 라운지',
                  english: 'Records',
                  onTap: () => onSwitchTab(1),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MenuCard(
                  icon: Icons.adjust,
                  label: '학종 라운지',
                  english: 'Match',
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
                  icon: Icons.forum_outlined,
                  label: '상담 라운지',
                  english: 'Counsel',
                  onTap: () => onSwitchTab(3),
                ),
              ),
              const SizedBox(width: 12),
              // 4번: 상담 관리 (이전 5번에서 이동)
              Expanded(
                child: _MenuCard(
                  icon: Icons.edit_document,
                  label: '상담 관리',
                  english: 'Manage',
                  onTap: () => Navigator.pushNamed(context, '/consultation/management'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              // 5번: 입시 뉴스 (신규 — 네이버 블로그 RSS 연동)
              Expanded(
                child: _MenuCard(
                  icon: Icons.newspaper_outlined,
                  label: '입시 뉴스',
                  english: 'News',
                  onTap: () => Navigator.pushNamed(context, '/news'),
                ),
              ),
              const SizedBox(width: 12),
              // 6번: 대입 정보 (이전 4번에서 이동)
              Expanded(
                child: _MenuCard(
                  icon: Icons.menu_book_outlined,
                  label: '대입 정보',
                  english: 'Info',
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
                  english: 'Seminar',
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SeminarScreen())),
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(child: SizedBox()),
              ],
            ),
          ],
          // 알림: 메뉴 그리드에서 분리하여 별도 섹션으로 배치
          const SizedBox(height: 32),
          _sectionHead('02', 'Notifications', '알림'),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppPalette.line),
            ),
            child: ListTile(
              leading: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppPalette.cream,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(Icons.notifications_outlined, color: AppPalette.teal),
              ),
              title: const Text(
                '알림 센터',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
              ),
              subtitle: const Text(
                '분석 완료·상담 확정·리마인드 알림 확인',
                style: TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
              ),
              trailing: const Icon(Icons.chevron_right, color: Color(0xFF9CA3AF)),
              onTap: () => Navigator.pushNamed(context, '/notifications'),
            ),
          ),
          const SizedBox(height: 32),
          if (recent.isNotEmpty) ...[
            Stack(
              children: [
                _sectionHead('03', 'Recent applications', '최근 라운지 신청'),
                Positioned(
                  right: 0,
                  top: 0,
                  child: TextButton(
                    onPressed: () => onSwitchTab(1),
                    child: const Text('전체보기 →',
                        style: TextStyle(color: AppPalette.teal, fontWeight: FontWeight.w700, fontSize: 13)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
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
  final String english;
  final VoidCallback onTap;

  const _MenuCard({
    required this.icon,
    required this.label,
    required this.english,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 156,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppPalette.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: AppPalette.teal, size: 28),
            const Spacer(),
            Text(
              english,
              style: const TextStyle(
                  fontSize: 11,
                  fontStyle: FontStyle.italic,
                  color: AppPalette.muted,
                  fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 3),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Flexible(
                  child: Text(
                    label,
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: AppPalette.navy),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const Icon(Icons.arrow_forward, size: 16, color: AppPalette.muted),
              ],
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
