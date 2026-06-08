import 'package:flutter/material.dart';
import '../theme/app_palette.dart';

/// 입시라운지 허브 화면 (옵션 A).
/// 입시 뉴스 + 대학모집요강 2개 카드를 모아놓은 진입 화면.
class IpsiLoungeHubScreen extends StatelessWidget {
  const IpsiLoungeHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('입시라운지'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '입시 정보',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppPalette.navy,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                '최신 입시 뉴스와 대학별 모집요강을 한 곳에서 확인하세요',
                style: TextStyle(fontSize: 13, color: AppPalette.muted),
              ),
              const SizedBox(height: 20),
              _HubCard(
                icon: Icons.newspaper_outlined,
                title: '입시 뉴스',
                description: '입시라운지 네이버 블로그 최신 글',
                onTap: () => Navigator.pushNamed(context, '/news'),
              ),
              const SizedBox(height: 12),
              _HubCard(
                icon: Icons.school_outlined,
                title: '대학모집요강',
                description: '대학별 수시·정시 모집요강·입시결과·시행계획',
                onTap: () => Navigator.pushNamed(context, '/university-guide'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HubCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final VoidCallback onTap;

  const _HubCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE5E7EB)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppPalette.cream,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 28, color: AppPalette.navy),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppPalette.navy,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: const TextStyle(fontSize: 12, color: AppPalette.muted),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppPalette.muted),
          ],
        ),
      ),
    );
  }
}
