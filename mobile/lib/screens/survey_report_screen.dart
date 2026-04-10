import 'dart:math';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../services/survey_service.dart';

/// 설문 분석 리포트 뷰어 (예비고1 / 고등학생 공통)
class SurveyReportScreen extends StatefulWidget {
  final String surveyId;
  final String surveyType; // "preheigh1" | "high"

  const SurveyReportScreen({
    super.key,
    required this.surveyId,
    required this.surveyType,
  });

  @override
  State<SurveyReportScreen> createState() => _SurveyReportScreenState();
}

class _SurveyReportScreenState extends State<SurveyReportScreen> {
  Map<String, dynamic>? _computed;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await SurveyService.getComputed(widget.surveyId);
      setState(() {
        _computed = data;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final typeLabel = widget.surveyType == 'preheigh1' ? '예비고1' : '고등학생';

    return Scaffold(
      appBar: AppBar(
        title: Text('$typeLabel 분석 리포트'),
        elevation: 0,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
              : _buildBody(),
    );
  }

  Widget _buildBody() {
    final rs = _computed?['radar_scores'];
    if (rs == null) {
      return const Center(child: Text('분석 결과가 아직 준비되지 않았습니다.'));
    }

    final isPreheigh1 = widget.surveyType == 'preheigh1';

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _OverallCard(rs: rs),
          const SizedBox(height: 16),
          _RadarChartCard(rs: rs, isPreheigh1: isPreheigh1),
          const SizedBox(height: 16),
          if (isPreheigh1 && rs['prep'] != null) ...[
            _PrepRateCard(prep: rs['prep']),
            const SizedBox(height: 16),
          ],
          _DetailCards(rs: rs, isPreheigh1: isPreheigh1),
          const SizedBox(height: 16),
          if (isPreheigh1 && rs['roadmap'] != null) ...[
            _RoadmapCard(roadmap: rs['roadmap']),
            const SizedBox(height: 16),
          ],
          _GradeLegendCard(),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

// ── 색상 매핑 ──

const _gradeColors = {
  'S': (Color(0xFFEEF2FF), Color(0xFF4338CA), Color(0xFFA5B4FC)),
  'A': (Color(0xFFECFDF5), Color(0xFF059669), Color(0xFF6EE7B7)),
  'B': (Color(0xFFFFF7ED), Color(0xFFD97706), Color(0xFFFCD34D)),
  'C': (Color(0xFFFEF2F2), Color(0xFFDC2626), Color(0xFFFCA5A5)),
  'D': (Color(0xFFF3F4F6), Color(0xFF6B7280), Color(0xFFD1D5DB)),
};

(Color bg, Color text, Color border) _gc(String grade) =>
    _gradeColors[grade] ?? _gradeColors['D']!;

const _ph1Labels = {
  '학업기초력': '학업기초력',
  '학습습관_자기주도력': '학습습관·자기주도력',
  '교과선행도': '교과선행도',
  '진로방향성': '진로방향성',
  '비교과역량': '비교과역량',
};

const _highLabels = {
  '내신_경쟁력': '내신 경쟁력',
  '모의고사_역량': '모의고사 역량',
  '학습습관_전략': '학습 습관·전략',
  '진로전형_전략': '진로·전형 전략',
};

const _ph1DetailSections = [
  ('academic', '학업기초력'),
  ('study', '학습습관·자기주도력'),
  ('prep', '교과선행도'),
  ('career', '진로방향성'),
  ('extracurricular', '비교과역량'),
];

const _highDetailSections = [
  ('naesin', '내신 경쟁력'),
  ('mock', '모의고사 역량'),
  ('study', '학습 습관·전략'),
  ('career', '진로·전형 전략'),
];

// ── 등급 배지 ──

class _GradeBadge extends StatelessWidget {
  final String grade;
  final double size;

  const _GradeBadge({required this.grade, this.size = 30});

  @override
  Widget build(BuildContext context) {
    final (bg, text, border) = _gc(grade);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(size * 0.27),
        border: Border.all(color: border, width: 2),
      ),
      alignment: Alignment.center,
      child: Text(grade, style: TextStyle(
        fontSize: size * 0.5, fontWeight: FontWeight.w800, color: text,
      )),
    );
  }
}

// ── 종합 등급 카드 ──

class _OverallCard extends StatelessWidget {
  final Map<String, dynamic> rs;
  const _OverallCard({required this.rs});

  @override
  Widget build(BuildContext context) {
    final grade = rs['overall_grade'] ?? 'D';
    final score = (rs['overall_score'] ?? 0).toDouble();
    final (bg, text, border) = _gc(grade);

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border, width: 2),
      ),
      child: Column(
        children: [
          Text('종합 등급', style: TextStyle(fontSize: 13, color: text, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          _GradeBadge(grade: grade, size: 48),
          const SizedBox(height: 8),
          RichText(text: TextSpan(children: [
            TextSpan(text: '${score.toStringAsFixed(1)}', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: text)),
            TextSpan(text: '점 / 100', style: TextStyle(fontSize: 14, color: text)),
          ])),
        ],
      ),
    );
  }
}

// ── 레이더 차트 카드 ──

class _RadarChartCard extends StatelessWidget {
  final Map<String, dynamic> rs;
  final bool isPreheigh1;
  const _RadarChartCard({required this.rs, required this.isPreheigh1});

  @override
  Widget build(BuildContext context) {
    final radar = rs['radar'] as Map<String, dynamic>? ?? {};
    final labels = isPreheigh1 ? _ph1Labels : _highLabels;

    final entries = radar.entries.toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('영역별 진단', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),

          // 레이더 차트
          SizedBox(
            height: 260,
            child: _CustomRadarChart(
              entries: entries.map((e) {
                final val = e.value as Map<String, dynamic>;
                return MapEntry(
                  labels[e.key] ?? e.key.replaceAll('_', ' '),
                  (val['score'] ?? 0).toDouble(),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 12),

          // 영역별 점수 카드
          ...entries.map((e) {
            final val = e.value as Map<String, dynamic>;
            final grade = val['grade'] ?? 'D';
            final score = (val['score'] ?? 0).toDouble();
            final (bg, text, border) = _gc(grade);
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: border),
              ),
              child: Row(
                children: [
                  _GradeBadge(grade: grade),
                  const SizedBox(width: 10),
                  Expanded(child: Text(
                    labels[e.key] ?? e.key,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  )),
                  RichText(text: TextSpan(children: [
                    TextSpan(text: '${score.toStringAsFixed(0)}', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: text)),
                    TextSpan(text: '/100', style: TextStyle(fontSize: 11, color: text)),
                  ])),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ── 커스텀 레이더 차트 (fl_chart의 RadarChart) ──

class _CustomRadarChart extends StatelessWidget {
  final List<MapEntry<String, double>> entries;
  const _CustomRadarChart({required this.entries});

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) return const SizedBox();

    return RadarChart(
      RadarChartData(
        dataSets: [
          RadarDataSet(
            dataEntries: entries.map((e) => RadarEntry(value: e.value)).toList(),
            fillColor: const Color(0xFF4472C4).withOpacity(0.25),
            borderColor: const Color(0xFF4472C4),
            borderWidth: 2,
            entryRadius: 4,
          ),
        ],
        radarShape: RadarShape.polygon,
        radarBorderData: const BorderSide(color: Color(0xFFE5E7EB)),
        gridBorderData: const BorderSide(color: Color(0xFFE5E7EB), width: 0.5),
        tickCount: 4,
        tickBorderData: const BorderSide(color: Color(0xFFE5E7EB), width: 0.5),
        ticksTextStyle: const TextStyle(fontSize: 9, color: Color(0xFF9CA3AF)),
        getTitle: (index, angle) => RadarChartTitle(
          text: entries[index].key,
          angle: 0,
        ),
        titleTextStyle: const TextStyle(fontSize: 11, color: Color(0xFF374151), fontWeight: FontWeight.w600),
        titlePositionPercentageOffset: 0.15,
      ),
    );
  }
}

// ── 과목별 준비율 카드 (예비고1) ──

class _PrepRateCard extends StatelessWidget {
  final Map<String, dynamic> prep;
  const _PrepRateCard({required this.prep});

  static const _subjectLabels = {
    '수학_선행도': '수학',
    '영어_역량': '영어',
    '국어_역량': '국어',
    '사회_역량': '사회',
    '과학_역량': '과학',
  };

  static const _subjectColors = {
    '수학_선행도': Color(0xFF4472C4),
    '영어_역량': Color(0xFFED7D31),
    '국어_역량': Color(0xFF70AD47),
    '사회_역량': Color(0xFFFFC000),
    '과학_역량': Color(0xFF5B9BD5),
  };

  @override
  Widget build(BuildContext context) {
    final details = prep['details'] as Map<String, dynamic>? ?? {};
    if (details.isEmpty) return const SizedBox();

    final items = details.entries.map((e) {
      final info = e.value as Map<String, dynamic>;
      final score = (info['score'] ?? 0).toDouble();
      final maxVal = (info['max'] ?? 1).toDouble();
      return (
        key: e.key,
        label: _subjectLabels[e.key] ?? e.key,
        score: score,
        max: maxVal,
        pct: (score / maxVal * 100).clamp(0, 100),
        color: _subjectColors[e.key] ?? const Color(0xFF6B7280),
      );
    }).toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('과목별 준비율', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('각 과목의 고교 학습 준비 수준을 배점 대비 달성률로 표시합니다',
            style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          const SizedBox(height: 16),

          // 바 차트
          ...items.map((item) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(item.label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    Text('${item.score.toInt()}/${item.max.toInt()} (${item.pct.toInt()}%)',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: item.pct / 100,
                    minHeight: 12,
                    backgroundColor: const Color(0xFFF3F4F6),
                    valueColor: AlwaysStoppedAnimation(item.color),
                  ),
                ),
              ],
            ),
          )),
        ],
      ),
    );
  }
}

// ── 영역별 상세 점수 카드 ──

class _DetailCards extends StatelessWidget {
  final Map<String, dynamic> rs;
  final bool isPreheigh1;
  const _DetailCards({required this.rs, required this.isPreheigh1});

  @override
  Widget build(BuildContext context) {
    final sections = isPreheigh1 ? _ph1DetailSections : _highDetailSections;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('영역별 상세 분석', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          ...sections.map((section) {
            final (key, label) = section;
            final data = rs[key] as Map<String, dynamic>?;
            if (data == null || data['details'] == null) return const SizedBox();
            return _DetailAreaCard(label: label, data: data);
          }),
        ],
      ),
    );
  }
}

class _DetailAreaCard extends StatelessWidget {
  final String label;
  final Map<String, dynamic> data;
  const _DetailAreaCard({required this.label, required this.data});

  @override
  Widget build(BuildContext context) {
    final grade = data['grade'] ?? 'D';
    final total = (data['total'] ?? 0).toDouble();
    final details = data['details'] as Map<String, dynamic>? ?? {};
    final (bg, text, border) = _gc(grade);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border),
      ),
      child: Column(
        children: [
          // 헤더
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(11)),
            ),
            child: Row(
              children: [
                _GradeBadge(grade: grade),
                const SizedBox(width: 10),
                Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
                RichText(text: TextSpan(children: [
                  TextSpan(text: '${total.toStringAsFixed(0)}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: text)),
                  TextSpan(text: '점', style: TextStyle(fontSize: 12, color: text)),
                ])),
              ],
            ),
          ),
          // 상세 항목
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(
              children: details.entries.map((e) {
                final info = e.value as Map<String, dynamic>;
                final score = (info['score'] ?? 0).toDouble();
                final maxVal = (info['max'] ?? 1).toDouble();
                final pct = (score / maxVal).clamp(0.0, 1.0);
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(
                    children: [
                      Expanded(
                        flex: 3,
                        child: Text(
                          e.key.replaceAll('_', ' '),
                          style: const TextStyle(fontSize: 12, color: Color(0xFF374151)),
                        ),
                      ),
                      SizedBox(
                        width: 48,
                        child: Text(
                          '${score.toInt()}/${maxVal.toInt()}',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: text),
                          textAlign: TextAlign.right,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        flex: 2,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(3),
                          child: LinearProgressIndicator(
                            value: pct,
                            minHeight: 8,
                            backgroundColor: const Color(0xFFF3F4F6),
                            valueColor: AlwaysStoppedAnimation(text),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

// ── 로드맵 카드 (예비고1) ──

class _RoadmapCard extends StatelessWidget {
  final Map<String, dynamic> roadmap;
  const _RoadmapCard({required this.roadmap});

  static const _priorityColors = {
    '상': (Color(0xFFFEE2E2), Color(0xFFDC2626)),
    '중': (Color(0xFFFEF3C7), Color(0xFFD97706)),
    '하': (Color(0xFFDBEAFE), Color(0xFF2563EB)),
  };

  @override
  Widget build(BuildContext context) {
    final items = roadmap['items'] as List? ?? [];
    final summary = roadmap['summary'] as String? ?? '';
    if (items.isEmpty) return const SizedBox();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('고교 준비 로드맵', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(summary, style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          const SizedBox(height: 16),
          ...items.map((item) {
            final m = item as Map<String, dynamic>;
            final priority = m['priority'] ?? '하';
            final (pbg, ptxt) = _priorityColors[priority] ?? _priorityColors['하']!;
            final grade = m['current_grade'] ?? 'D';

            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE5E7EB)),
              ),
              child: Column(
                children: [
                  // 헤더
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: const BoxDecoration(
                      color: Color(0xFFF9FAFB),
                      borderRadius: BorderRadius.vertical(top: Radius.circular(11)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                          decoration: BoxDecoration(color: pbg, borderRadius: BorderRadius.circular(12)),
                          child: Text(
                            priority == '상' ? '최우선' : priority == '중' ? '중요' : '참고',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: ptxt),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(child: Text(
                          m['title'] ?? '',
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                        )),
                        _GradeBadge(grade: grade, size: 26),
                      ],
                    ),
                  ),
                  // 내용
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          m['description'] ?? '',
                          style: const TextStyle(fontSize: 13, color: Color(0xFF374151), height: 1.6),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Icon(Icons.calendar_today, size: 12, color: Color(0xFF9CA3AF)),
                            const SizedBox(width: 4),
                            Text(m['period'] ?? '', style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                            const Spacer(),
                            Text(m['area'] ?? '', style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                            const SizedBox(width: 4),
                            Text('${(m['current_score'] ?? 0).toStringAsFixed(0)}점',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _gc(grade).$2)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),

          // 안내 문구
          Container(
            margin: const EdgeInsets.only(top: 4),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFBEB),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFFCD34D)),
            ),
            child: const Text(
              '이 로드맵은 설문 응답 기반 자동 생성 초안입니다.\n상담을 통해 학생 상황에 맞게 구체적인 계획을 수립할 수 있습니다.',
              style: TextStyle(fontSize: 12, color: Color(0xFF92400E), height: 1.5),
            ),
          ),
        ],
      ),
    );
  }
}

// ── 등급 범례 카드 ──

class _GradeLegendCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    const items = [
      ('S', '90~100 최상위'),
      ('A', '75~89 상위'),
      ('B', '55~74 평균'),
      ('C', '35~54 보완필요'),
      ('D', '0~34 미흡'),
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('등급 기준', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: items.map((item) {
              final (g, label) = item;
              return Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _GradeBadge(grade: g, size: 24),
                  const SizedBox(width: 4),
                  Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                ],
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
