import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/analysis_provider.dart';
import '../services/auth_service.dart';
import '../widgets/status_badge.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

  @override
  void initState() {
    super.initState();
    // FCM은 Firebase 설정 후 활성화
    // _initFCM();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AnalysisProvider>().loadOrders();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _selectedIndex,
        children: const [
          _HomeTab(),
          _AnalysisTab(),
          _ConsultationTab(),
          _MypageTab(),
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
          BottomNavigationBarItem(icon: Icon(Icons.description_outlined), activeIcon: Icon(Icons.description), label: '분석'),
          BottomNavigationBarItem(icon: Icon(Icons.calendar_today_outlined), activeIcon: Icon(Icons.calendar_today), label: '상담'),
          BottomNavigationBarItem(icon: Icon(Icons.person_outline), activeIcon: Icon(Icons.person), label: '마이'),
        ],
      ),
    );
  }
}

class _HomeTab extends StatelessWidget {
  const _HomeTab();

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
                  icon: Icons.upload_file,
                  label: '학생부 업로드',
                  color: const Color(0xFFEFF6FF),
                  iconColor: const Color(0xFF3B82F6),
                  onTap: () => Navigator.pushNamed(context, '/analysis/upload'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MenuCard(
                  icon: Icons.calendar_month,
                  label: '상담 예약',
                  color: const Color(0xFFF0FDF4),
                  iconColor: const Color(0xFF22C55E),
                  onTap: () => Navigator.pushNamed(context, '/consultation'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MenuCard(
                  icon: Icons.payment_outlined,
                  label: '결제',
                  color: const Color(0xFFFFF7ED),
                  iconColor: const Color(0xFFF97316),
                  onTap: () => Navigator.pushNamed(context, '/payment'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MenuCard(
                  icon: Icons.notifications_outlined,
                  label: '알림',
                  color: const Color(0xFFF5F3FF),
                  iconColor: const Color(0xFF8B5CF6),
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
                  '최근 분석',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
                TextButton(
                  onPressed: () => Navigator.pushNamed(context, '/analysis'),
                  child: const Text('전체보기'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ...recent.map((o) => _RecentOrderCard(
                  filename: o.schoolRecordFilename,
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

class _AnalysisTab extends StatelessWidget {
  const _AnalysisTab();

  @override
  Widget build(BuildContext context) {
    return Navigator(
      onGenerateRoute: (settings) => MaterialPageRoute(
        builder: (context) => const AnalysisListInner(),
      ),
    );
  }
}

class AnalysisListInner extends StatelessWidget {
  const AnalysisListInner({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('분석 목록')),
      body: Center(
        child: TextButton(
          onPressed: () => Navigator.pushNamed(context, '/analysis'),
          child: const Text('분석 목록으로'),
        ),
      ),
    );
  }
}

class _ConsultationTab extends StatelessWidget {
  const _ConsultationTab();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('상담')),
      body: Center(
        child: TextButton(
          onPressed: () => Navigator.pushNamed(context, '/consultation'),
          child: const Text('상담 예약하러 가기'),
        ),
      ),
    );
  }
}

class _MypageTab extends StatelessWidget {
  const _MypageTab();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('마이페이지')),
      body: Center(
        child: TextButton(
          onPressed: () => Navigator.pushNamed(context, '/mypage'),
          child: const Text('마이페이지로'),
        ),
      ),
    );
  }
}
