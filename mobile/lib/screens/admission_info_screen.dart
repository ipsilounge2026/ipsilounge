import 'package:flutter/material.dart';

class AdmissionInfoScreen extends StatefulWidget {
  const AdmissionInfoScreen({super.key});

  @override
  State<AdmissionInfoScreen> createState() => _AdmissionInfoScreenState();
}

class _AdmissionInfoScreenState extends State<AdmissionInfoScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('대입 정보'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(0xFF3B82F6),
          unselectedLabelColor: const Color(0xFF9CA3AF),
          indicatorColor: const Color(0xFF3B82F6),
          labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          tabs: const [
            Tab(text: '전형별 정보'),
            Tab(text: '수능 최저'),
            Tab(text: '선택과목 가이드'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _AdmissionTypesTab(),
          _CsatMinimumTab(),
          _CourseGuideTab(),
        ],
      ),
    );
  }
}

/* ──────── 전형별 정보 탭 ──────── */

class _AdmissionTypesTab extends StatelessWidget {
  const _AdmissionTypesTab();

  static const _types = [
    {
      'name': '학생부교과전형',
      'color': 0xFF2563EB,
      'bg': 0xFFEFF6FF,
      'summary': '내신 성적 중심 선발, 교과 등급이 당락 결정',
      'features': [
        '내신(교과) 성적이 절대적 비중',
        '수능 최저학력기준 적용 대학이 많음',
        '정량 평가 위주 — 비교과 영향 적음',
        '지역균형(학교추천) 전형이 대표적',
      ],
      'suitable': '내신 성적이 우수한 학생, 안정적 합격을 원하는 학생',
      'preparation': '내신 관리가 핵심. 수능 최저 충족을 위한 수능 대비 병행 필요',
    },
    {
      'name': '학생부종합전형',
      'color': 0xFF7C3AED,
      'bg': 0xFFF3E8FF,
      'summary': '내신 + 세특 + 창체 + 행특 종합 평가',
      'features': [
        '서류 평가(학생부) 중심 + 면접(일부 대학)',
        '학업역량 · 진로역량 · 공동체역량 종합 판단',
        '세부능력특기사항(세특)이 매우 중요',
        '학교 추천 / 활동 우수 등 세부 전형으로 구분',
      ],
      'suitable': '내신은 중상위이나 세특·창체·행특이 우수한 학생',
      'preparation': '교과 세특에 탐구 활동 기록 확보, 진로 일관성 있는 활동 설계',
    },
    {
      'name': '논술전형',
      'color': 0xFFEA580C,
      'bg': 0xFFFFF7ED,
      'summary': '논술 시험 비중이 높은 전형',
      'features': [
        '논술 시험 성적이 합격 핵심 변수',
        '내신 반영은 있으나 실질 영향 작음',
        '수능 최저학력기준 적용 대학이 대부분',
        '수도권 주요 대학 위주로 시행',
      ],
      'suitable': '논리적 사고력이 뛰어나고, 내신이 다소 부족한 학생',
      'preparation': '대학별 논술 유형(인문/수리) 파악 후 꾸준한 연습 필요',
    },
    {
      'name': '정시전형 (수능)',
      'color': 0xFF16A34A,
      'bg': 0xFFF0FDF4,
      'summary': '대학수학능력시험(수능) 점수 중심 선발',
      'features': [
        '수능 성적(표준점수/백분위/등급)으로 선발',
        '대학별 영역 반영 비율이 다름',
        '가/나/다 군으로 나뉘어 3회 지원 가능',
        '정시 비율 40% 이상으로 확대 추세',
      ],
      'suitable': '수능 성적이 내신보다 우수한 학생, 재수/반수 고려 학생',
      'preparation': '수능 영역별 목표 점수 설정 후 체계적 학습 필수',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFFFFBEB),
            border: Border.all(color: const Color(0xFFFDE68A)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Text(
            '본 정보는 참고용이며, 정확한 내용은 각 대학 입학처를 통해 확인해주세요.',
            style: TextStyle(fontSize: 12, color: Color(0xFF92400E)),
          ),
        ),
        const SizedBox(height: 16),
        ..._types.map((t) => _TypeCard(data: t)),
      ],
    );
  }
}

class _TypeCard extends StatefulWidget {
  final Map<String, dynamic> data;
  const _TypeCard({required this.data});

  @override
  State<_TypeCard> createState() => _TypeCardState();
}

class _TypeCardState extends State<_TypeCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final color = Color(d['color'] as int);
    final bg = Color(d['bg'] as int);
    final features = d['features'] as List;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _expanded ? color.withOpacity(0.3) : const Color(0xFFE5E7EB)),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
                        child: Text(d['name'] as String,
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
                      ),
                      const Spacer(),
                      Icon(_expanded ? Icons.expand_less : Icons.expand_more,
                          size: 20, color: const Color(0xFF9CA3AF)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(d['summary'] as String,
                      style: const TextStyle(fontSize: 14, color: Color(0xFF4B5563))),
                ],
              ),
            ),
          ),
          if (_expanded) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('주요 특징',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF9CA3AF))),
                  const SizedBox(height: 6),
                  ...features.map((f) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('• ', style: TextStyle(fontSize: 14, color: Color(0xFF374151))),
                            Expanded(child: Text(f as String,
                                style: const TextStyle(fontSize: 14, color: Color(0xFF374151), height: 1.5))),
                          ],
                        ),
                      )),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('적합한 학생', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
                        const SizedBox(height: 4),
                        Text(d['suitable'] as String, style: const TextStyle(fontSize: 14, color: Color(0xFF374151))),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: const Color(0xFFF9FAFB), borderRadius: BorderRadius.circular(8)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('준비 방법',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                        const SizedBox(height: 4),
                        Text(d['preparation'] as String, style: const TextStyle(fontSize: 14, color: Color(0xFF374151))),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/* ──────── 수능 최저 탭 ──────── */

class _CsatMinimumTab extends StatelessWidget {
  const _CsatMinimumTab();

  static const _data = [
    {'univ': '서울대', 'type': '학종(일반)', 'req': '없음', 'note': '면접 비중 높음'},
    {'univ': '연세대', 'type': '교과(추천형)', 'req': '3개 합 7 이내', 'note': '영어 2등급 이내'},
    {'univ': '연세대', 'type': '학종(활동우수)', 'req': '없음', 'note': ''},
    {'univ': '고려대', 'type': '교과(학교추천)', 'req': '3개 합 7 이내', 'note': '영어 2등급 이내'},
    {'univ': '고려대', 'type': '학종(학업우수)', 'req': '없음', 'note': ''},
    {'univ': '성균관대', 'type': '교과(학교장)', 'req': '2개 합 5 이내', 'note': ''},
    {'univ': '성균관대', 'type': '학종(계열적합)', 'req': '없음', 'note': ''},
    {'univ': '서강대', 'type': '교과(지균)', 'req': '3개 합 7 이내', 'note': ''},
    {'univ': '서강대', 'type': '학종(일반)', 'req': '없음', 'note': ''},
    {'univ': '한양대', 'type': '교과(지역균형)', 'req': '없음', 'note': '교과 100%'},
    {'univ': '한양대', 'type': '학종(일반)', 'req': '없음', 'note': ''},
    {'univ': '중앙대', 'type': '교과(지균)', 'req': '3개 합 7 이내', 'note': ''},
    {'univ': '중앙대', 'type': '학종(다빈치)', 'req': '없음', 'note': ''},
    {'univ': '경희대', 'type': '교과(지균)', 'req': '2개 합 5 이내', 'note': ''},
    {'univ': '경희대', 'type': '학종(네오르네상스)', 'req': '없음', 'note': ''},
    {'univ': '이화여대', 'type': '교과(고교추천)', 'req': '3개 합 6 이내', 'note': ''},
    {'univ': '건국대', 'type': '교과(지균)', 'req': '2개 합 5 이내', 'note': ''},
    {'univ': '동국대', 'type': '교과(학교장)', 'req': '2개 합 5 이내', 'note': ''},
    {'univ': '숙명여대', 'type': '교과(지균)', 'req': '2개 합 5 이내', 'note': ''},
    {'univ': '홍익대', 'type': '교과(학교장)', 'req': '2개 합 6 이내', 'note': ''},
  ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 설명 박스
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFF0F9FF),
            border: Border.all(color: const Color(0xFFBAE6FD)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text('수능 최저학력기준이란?',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF0369A1))),
              SizedBox(height: 6),
              Text(
                '수시 합격을 위해 수능에서 충족해야 하는 최소 등급 기준입니다. '
                '예를 들어 "2개 합 5"는 국·수·영·탐 중 2개 영역 등급의 합이 5 이하여야 한다는 의미입니다.',
                style: TextStyle(fontSize: 13, color: Color(0xFF0C4A6E), height: 1.6),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        // 테이블 헤더
        Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
          decoration: BoxDecoration(
            color: const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: const [
              SizedBox(width: 60, child: Text('대학', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
              SizedBox(width: 8),
              Expanded(flex: 3, child: Text('전형', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
              Expanded(flex: 3, child: Text('최저 기준', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
            ],
          ),
        ),
        ..._data.asMap().entries.map((entry) {
          final i = entry.key;
          final row = entry.value;
          final isGyo = row['type']!.contains('교과');
          return Container(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
            decoration: BoxDecoration(
              color: i % 2 == 0 ? Colors.white : const Color(0xFFFAFAFA),
              border: const Border(bottom: BorderSide(color: Color(0xFFF3F4F6))),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 60,
                  child: Text(row['univ']!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 3,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: isGyo ? const Color(0xFFEFF6FF) : const Color(0xFFF3E8FF),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(row['type']!,
                        style: TextStyle(
                          fontSize: 11,
                          color: isGyo ? const Color(0xFF2563EB) : const Color(0xFF7C3AED),
                        )),
                  ),
                ),
                Expanded(
                  flex: 3,
                  child: Text(
                    row['req']!,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: row['req'] == '없음' ? FontWeight.w400 : FontWeight.w600,
                      color: row['req'] == '없음' ? const Color(0xFF9CA3AF) : const Color(0xFF1F2937),
                    ),
                  ),
                ),
              ],
            ),
          );
        }),
        const SizedBox(height: 12),
        const Center(
          child: Text(
            '* 2025학년도 기준 참고 자료 (대학별 요강에서 반드시 재확인)',
            style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
          ),
        ),
      ],
    );
  }
}

/* ──────── 선택과목 가이드 탭 ──────── */

class _CourseGuideTab extends StatelessWidget {
  const _CourseGuideTab();

  static const _tracks = [
    {
      'track': '인문·사회 계열',
      'color': 0xFF2563EB,
      'bg': 0xFFEFF6FF,
      'core': ['화법과 작문', '언어와 매체', '확률과 통계', '사회·문화'],
      'recommended': ['심화국어', '경제', '정치와 법', '세계사', '동아시아사', '윤리와 사상'],
      'majors': '경영학, 경제학, 법학, 행정학, 심리학, 사회학, 국어국문, 영어영문, 사학 등',
    },
    {
      'track': '자연·공학 계열',
      'color': 0xFF16A34A,
      'bg': 0xFFF0FDF4,
      'core': ['미적분', '기하', '물리학I', '화학I'],
      'recommended': ['물리학II', '화학II', '생명과학II', '확률과 통계', '경제수학', '정보'],
      'majors': '컴퓨터공학, 전자공학, 기계공학, 화학공학, 수학, 물리학 등',
    },
    {
      'track': '의약학 계열',
      'color': 0xFFDC2626,
      'bg': 0xFFFEF2F2,
      'core': ['미적분', '기하', '생명과학I', '화학I'],
      'recommended': ['생명과학II', '화학II', '물리학I', '확률과 통계'],
      'majors': '의학, 치의학, 한의학, 약학, 수의학, 간호학 등',
    },
    {
      'track': '교육 계열',
      'color': 0xFFCA8A04,
      'bg': 0xFFFEFCE8,
      'core': ['교과 관련 심화과목', '교육학'],
      'recommended': ['심리학', '철학', '사회·문화', '통계 관련 과목'],
      'majors': '국어교육, 영어교육, 수학교육, 사회교육, 과학교육, 초등교육 등',
    },
    {
      'track': '예체능 계열',
      'color': 0xFFDB2777,
      'bg': 0xFFFDF2F8,
      'core': ['관련 실기/전공 과목', '미술/음악/체육 관련 진로선택'],
      'recommended': ['미술 창작', '음악 연주와 창작', '체육 탐구', '미술사', '음악 감상과 비평'],
      'majors': '미술, 디자인, 음악, 체육, 무용, 연극영화 등',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFF0FDF4),
            border: Border.all(color: const Color(0xFFBBF7D0)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text('2022 개정교육과정 선택과목',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF166534))),
              SizedBox(height: 6),
              Text(
                '선택과목은 진로·전공과의 연관성이 중요합니다. 지원 학과에서 핵심/권장으로 지정한 과목을 이수하면 학종에서 유리합니다.',
                style: TextStyle(fontSize: 13, color: Color(0xFF14532D), height: 1.6),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        ..._tracks.map((tr) {
          final color = Color(tr['color'] as int);
          final bg = Color(tr['bg'] as int);
          final core = tr['core'] as List;
          final recommended = tr['recommended'] as List;
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: color.withOpacity(0.12)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
                  child: Text(tr['track'] as String,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
                ),
                const SizedBox(height: 12),
                const Text('핵심 선택과목',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: core
                      .map((c) => Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
                            child: Text(c as String, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w500)),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 12),
                const Text('권장 선택과목',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: recommended
                      .map((c) => Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: const Color(0xFFF3F4F6), borderRadius: BorderRadius.circular(6)),
                            child: Text(c as String, style: const TextStyle(fontSize: 12, color: Color(0xFF4B5563))),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.only(top: 10),
                  decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0xFFF3F4F6)))),
                  child: Text('관련 학과: ${tr['majors']}',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
