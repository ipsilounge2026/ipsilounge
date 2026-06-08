import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/university_guide_service.dart';
import '../theme/app_palette.dart';

/// 대학모집요강 화면.
/// 학년도 선택 + 대학 검색 + 카드 목록.
/// 각 버튼 탭 시 외부 출처(대학어디가 또는 대학 입학처) URL을 시스템 기본 앱(브라우저/PDF 뷰어)으로 엶.
class UniversityGuideScreen extends StatefulWidget {
  const UniversityGuideScreen({super.key});

  @override
  State<UniversityGuideScreen> createState() => _UniversityGuideScreenState();
}

class _UniversityGuideScreenState extends State<UniversityGuideScreen> {
  bool _loading = true;
  int? _year;
  String _search = '';
  List<UniversityGuideItem> _items = const [];
  List<int> _availableYears = const [];
  String? _error;
  final TextEditingController _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final res = await UniversityGuideService.fetchGuides(
      year: _year,
      search: _search.isEmpty ? null : _search,
    );
    if (!mounted) return;
    setState(() {
      _items = res.items;
      _availableYears = res.availableYears;
      if (_year == null && res.availableYears.isNotEmpty) {
        _year = res.availableYears.first;
      }
      _error = res.error;
      _loading = false;
    });
  }

  Future<void> _openUrl(String? url) async {
    if (url == null || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('링크를 열 수 없습니다')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('대학모집요강'),
      ),
      body: Column(
        children: [
          // 필터 영역
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            color: Colors.white,
            child: Column(
              children: [
                Row(
                  children: [
                    if (_availableYears.isNotEmpty)
                      DropdownButton<int>(
                        value: _year,
                        items: _availableYears
                            .map((y) => DropdownMenuItem<int>(value: y, child: Text('$y학년도')))
                            .toList(),
                        onChanged: (v) {
                          setState(() => _year = v);
                          _load();
                        },
                      ),
                    const Spacer(),
                    Text(
                      '${_items.length}건',
                      style: const TextStyle(color: AppPalette.muted, fontSize: 13),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _searchCtrl,
                  decoration: InputDecoration(
                    hintText: '대학 검색',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  textInputAction: TextInputAction.search,
                  onSubmitted: (v) {
                    setState(() => _search = v);
                    _load();
                  },
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          // 카드 목록
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            '불러오기 실패\n$_error',
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: AppPalette.muted),
                          ),
                        ),
                      )
                    : _items.isEmpty
                        ? const Center(
                            child: Text(
                              '등록된 대학모집요강이 없습니다.',
                              style: TextStyle(color: AppPalette.muted),
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: _items.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 12),
                              itemBuilder: (_, i) => _GuideCard(
                                guide: _items[i],
                                onOpen: _openUrl,
                              ),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class _GuideCard extends StatelessWidget {
  final UniversityGuideItem guide;
  final void Function(String?) onOpen;

  const _GuideCard({required this.guide, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    final primary = <_BtnSpec>[
      _BtnSpec('대입전형시행계획', guide.adigaAdmissionPlanUrl),
      _BtnSpec('수시모집요강', guide.adigaSusiGuideUrl),
      _BtnSpec('학생부종합가이드북', guide.officialJonghapGuidebookUrl),
      _BtnSpec('정시모집요강', guide.adigaJeongsiGuideUrl),
    ];
    final secondary = <_BtnSpec>[
      _BtnSpec('입시결과(대교협)', guide.adigaResultUrl, icon: Icons.bar_chart),
      _BtnSpec('입시결과(자체발표)', guide.officialResultUrl, icon: Icons.bar_chart),
      _BtnSpec('선행학습영향평가', guide.adigaPriorLearningEvalUrl, icon: Icons.flag_outlined),
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE5E7EB)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 상단: 대학명 + 입학처
          Row(
            children: [
              const Icon(Icons.star_border, size: 18, color: AppPalette.muted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  guide.university,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppPalette.navy,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          GestureDetector(
            onTap: () => onOpen(guide.officialAdmissionUrl),
            child: Text(
              guide.officialAdmissionUrl == null ? '입학처 링크 없음' : '입학처 바로가기 →',
              style: TextStyle(
                fontSize: 12,
                color: guide.officialAdmissionUrl == null ? const Color(0xFF9CA3AF) : AppPalette.teal,
                decoration: guide.officialAdmissionUrl == null ? TextDecoration.none : TextDecoration.underline,
              ),
            ),
          ),
          const SizedBox(height: 12),
          // 주요 버튼 4개 (2열)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: primary.map((b) => _btnPrimary(b)).toList(),
          ),
          const SizedBox(height: 12),
          Container(height: 1, color: const Color(0xFFF3F4F6)),
          const SizedBox(height: 10),
          // 부가 3개
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: secondary.map((b) => _btnSecondary(b)).toList(),
          ),
        ],
      ),
    );
  }

  Widget _btnPrimary(_BtnSpec b) {
    final disabled = b.url == null || b.url!.isEmpty;
    return InkWell(
      onTap: disabled ? null : () => onOpen(b.url),
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: disabled ? const Color(0xFFE5E7EB) : const Color(0xFFD1D5DB)),
          borderRadius: BorderRadius.circular(6),
          color: disabled ? const Color(0xFFF9FAFB) : Colors.white,
        ),
        child: Text(
          b.label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: disabled ? const Color(0xFFD1D5DB) : const Color(0xFF374151),
          ),
        ),
      ),
    );
  }

  Widget _btnSecondary(_BtnSpec b) {
    final disabled = b.url == null || b.url!.isEmpty;
    return InkWell(
      onTap: disabled ? null : () => onOpen(b.url),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(b.icon ?? Icons.link, size: 14, color: disabled ? const Color(0xFFD1D5DB) : AppPalette.muted),
          const SizedBox(width: 4),
          Text(
            b.label,
            style: TextStyle(
              fontSize: 12,
              color: disabled ? const Color(0xFFD1D5DB) : AppPalette.muted,
            ),
          ),
        ],
      ),
    );
  }
}

class _BtnSpec {
  final String label;
  final String? url;
  final IconData? icon;
  _BtnSpec(this.label, this.url, {this.icon});
}
