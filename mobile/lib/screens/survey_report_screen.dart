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
  Map<String, dynamic>? _studyMatrix;
  Map<String, dynamic>? _suneungSim;
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
      // Load study method matrix separately (non-blocking)
      try {
        final matrix = await SurveyService.getStudyMethodMatrix(widget.surveyId);
        if (mounted) setState(() => _studyMatrix = matrix);
      } catch (_) {}
      // Load suneung minimum simulation (non-blocking, high only)
      if (widget.surveyType == 'high') {
        try {
          final sim = await SurveyService.getSuneungMinimumSimulation(widget.surveyId);
          if (mounted) setState(() => _suneungSim = sim);
        } catch (_) {}
      }
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
          // 성적 추이 차트 (예비고1)
          if (isPreheigh1 && _computed?['grade_trend'] != null) ...[
            _GradeTrendCard(data: _computed!['grade_trend'] as Map<String, dynamic>),
            const SizedBox(height: 16),
          ],
          // 고등학생 내신 등급 추이
          if (!isPreheigh1 && _computed?['grade_trend'] != null) ...[
            _HighGradeTrendCard(data: _computed!['grade_trend'] as Map<String, dynamic>),
            const SizedBox(height: 16),
          ],
          // 고등학생 모의고사 추이
          if (!isPreheigh1 && _computed?['mock_trend'] != null) ...[
            _MockTrendCard(data: _computed!['mock_trend'] as Map<String, dynamic>),
            const SizedBox(height: 16),
          ],
          // 고등학생 내신 vs 모의 비교
          if (!isPreheigh1 && _computed?['grade_trend'] != null && _computed?['mock_trend'] != null) ...[
            _NaesinMockCompareCard(
              gradeTrend: _computed!['grade_trend'] as Map<String, dynamic>,
              mockTrend: _computed!['mock_trend'] as Map<String, dynamic>,
            ),
            const SizedBox(height: 16),
          ],
          // 학습 습관 분석 (공통)
          if (_computed?['study_analysis'] != null && (_computed!['study_analysis'] as Map).isNotEmpty) ...[
            _StudyAnalysisCard(data: _computed!['study_analysis'] as Map<String, dynamic>),
            const SizedBox(height: 16),
          ],
          // 학습 방법 진단 매트릭스
          if (_studyMatrix != null && (_studyMatrix!['subjects'] as List?)?.isNotEmpty == true) ...[
            _StudyMethodMatrixCard(data: _studyMatrix!),
            const SizedBox(height: 16),
          ],
          if (isPreheigh1 && rs['school_type_compatibility'] != null) ...[
            _CompatibilityCard(data: rs['school_type_compatibility']),
            const SizedBox(height: 16),
          ],
          // 수능 최저학력기준 시뮬레이션 (고등학생만)
          if (!isPreheigh1 && _suneungSim != null && (_suneungSim!['simulations'] as List?)?.isNotEmpty == true) ...[
            _SuneungMinimumCard(data: _suneungSim!),
            const SizedBox(height: 16),
          ],
          if (rs['roadmap'] != null) ...[
            _RoadmapCard(roadmap: rs['roadmap'], isPreheigh1: isPreheigh1),
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
                return MapEntry<String, double>(
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

// ── 고교유형 적합도 카드 (예비고1) ──

class _CompatibilityCard extends StatelessWidget {
  final Map<String, dynamic> data;
  const _CompatibilityCard({required this.data});

  static const _schoolIcons = {
    '과고': '🔬',
    '외고': '🌐',
    '국제고': '🌍',
    '자사고': '🏫',
    '일반고': '📚',
  };

  static const _subjectLabels = {
    'ko': '국어',
    'en': '영어',
    'ma': '수학',
    'so': '사회',
    'sc': '과학',
  };

  @override
  Widget build(BuildContext context) {
    final recommendations = data['recommendations'] as List? ?? [];
    final details = data['details'] as Map<String, dynamic>? ?? {};
    final subjectScores = data['subject_scores'] as Map<String, dynamic>? ?? {};
    if (recommendations.isEmpty) return const SizedBox();

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
          const Text('고교유형 적합도', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text(
            '4축(학업기초력·교과선행도·학습습관·진로방향성) 기반 유형별 적합도 분석',
            style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF)),
          ),
          const SizedBox(height: 16),

          // 유형별 카드
          ...recommendations.map((rec) {
            final m = rec as Map<String, dynamic>;
            final schoolType = m['school_type'] ?? '';
            final score = (m['score'] ?? 0).toDouble();
            final grade = m['grade'] ?? 'D';
            final isDesired = m['is_desired'] == true;
            final detail = details[schoolType] as Map<String, dynamic>? ?? {};
            final bonus = (detail['bonus'] ?? 0) as int;
            final penalty = (detail['penalty'] ?? 0) as int;
            final bonusReason = detail['bonus_reason'] ?? '';
            final penaltyReason = detail['penalty_reason'] ?? '';
            final (bg, text, border) = _gc(grade);
            final icon = _schoolIcons[schoolType] ?? '🏫';

            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isDesired ? border : const Color(0xFFE5E7EB),
                  width: isDesired ? 2 : 1,
                ),
                color: isDesired ? bg : Colors.white,
              ),
              child: Column(
                children: [
                  // 헤더
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(
                      children: [
                        Text(icon, style: const TextStyle(fontSize: 20)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Row(
                            children: [
                              Text(schoolType,
                                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                              if (isDesired) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: text,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: const Text('희망',
                                    style: TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600)),
                                ),
                              ],
                            ],
                          ),
                        ),
                        RichText(text: TextSpan(children: [
                          TextSpan(text: score.toStringAsFixed(0),
                            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: text)),
                          TextSpan(text: '점',
                            style: TextStyle(fontSize: 11, color: text)),
                        ])),
                        const SizedBox(width: 8),
                        _GradeBadge(grade: grade),
                      ],
                    ),
                  ),

                  // 보정 정보
                  if (bonus != 0 || penalty != 0)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          if (bonus > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                              decoration: BoxDecoration(
                                color: const Color(0xFFDCFCE7),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text('+$bonus $bonusReason',
                                style: const TextStyle(fontSize: 11, color: Color(0xFF16A34A), fontWeight: FontWeight.w600)),
                            ),
                          if (penalty < 0)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEE2E2),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text('$penalty $penaltyReason',
                                style: const TextStyle(fontSize: 11, color: Color(0xFFDC2626), fontWeight: FontWeight.w600)),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            );
          }),

          // 기준 원점수 표시
          if (subjectScores.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF9FAFB),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFE5E7EB)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('보정 기준 원점수 (최근 학기)',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 16,
                    runSpacing: 4,
                    children: ['ko', 'en', 'ma', 'so', 'sc'].where((k) => subjectScores[k] != null).map((k) {
                      final score = (subjectScores[k] ?? 0).toDouble();
                      return RichText(text: TextSpan(
                        style: const TextStyle(fontSize: 12, color: Color(0xFF374151)),
                        children: [
                          TextSpan(text: '${_subjectLabels[k]} ',
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                          TextSpan(text: '${score.toStringAsFixed(0)}점',
                            style: TextStyle(
                              color: score >= 95 ? const Color(0xFF16A34A)
                                  : score <= 90 ? const Color(0xFFDC2626)
                                  : const Color(0xFF374151),
                            )),
                        ],
                      ));
                    }).toList(),
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

// ── 성적 추이 카드 (예비고1) ──

class _GradeTrendCard extends StatelessWidget {
  final Map<String, dynamic> data;
  const _GradeTrendCard({required this.data});

  static const _subjectColors = {
    '국어': Color(0xFF70AD47),
    '영어': Color(0xFFED7D31),
    '수학': Color(0xFF4472C4),
    '사회': Color(0xFFFFC000),
    '과학': Color(0xFF5B9BD5),
  };

  static const _trendBadges = {
    '상승': ('↑ 상승', Color(0xFF16A34A)),
    '유지': ('→ 유지', Color(0xFF6B7280)),
    '등락': ('↕ 등락', Color(0xFFD97706)),
    '하락': ('↓ 하락', Color(0xFFDC2626)),
  };

  @override
  Widget build(BuildContext context) {
    final trendData = data['data'] as List? ?? [];
    final subjectTrends = data['subject_trends'] as Map<String, dynamic>? ?? {};
    final badge = data['trend_badge'] as String?;

    if (trendData.isEmpty) return const SizedBox();

    final badgeInfo = badge != null ? _trendBadges[badge] : null;

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
          Row(
            children: [
              const Text('성적 추이', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              if (badgeInfo != null) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                  decoration: BoxDecoration(
                    color: badgeInfo.$2.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(badgeInfo.$1, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: badgeInfo.$2)),
                ),
              ],
            ],
          ),
          const SizedBox(height: 4),
          const Text('학기별 전과목 평균 및 과목별 원점수 추이', style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          const SizedBox(height: 16),

          // 전과목 평균 라인차트
          const Text('전과목 평균', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
          const SizedBox(height: 8),
          SizedBox(
            height: 180,
            child: LineChart(
              LineChartData(
                minY: 50,
                maxY: 100,
                gridData: FlGridData(show: true, drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) => const FlLine(color: Color(0xFFE5E7EB), strokeWidth: 0.5)),
                titlesData: FlTitlesData(
                  bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28,
                    getTitlesWidget: (val, _) {
                      final idx = val.toInt();
                      if (idx < 0 || idx >= trendData.length) return const SizedBox();
                      return Text((trendData[idx] as Map)['semester'] ?? '', style: const TextStyle(fontSize: 10, color: Color(0xFF6B7280)));
                    })),
                  leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 32,
                    getTitlesWidget: (val, _) => Text(val.toInt().toString(), style: const TextStyle(fontSize: 10, color: Color(0xFF9CA3AF))))),
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                ),
                borderData: FlBorderData(show: false),
                lineBarsData: [
                  LineChartBarData(
                    spots: trendData.asMap().entries.map((e) {
                      final avg = ((e.value as Map)['avg_score'] ?? 0).toDouble();
                      return FlSpot(e.key.toDouble(), avg);
                    }).toList(),
                    color: const Color(0xFF4472C4),
                    barWidth: 2.5,
                    dotData: FlDotData(show: true, getDotPainter: (_, __, ___, ____) =>
                      FlDotCirclePainter(radius: 4, color: const Color(0xFF4472C4), strokeColor: Colors.white, strokeWidth: 1.5)),
                    isCurved: true,
                    curveSmoothness: 0.2,
                  ),
                ],
              ),
            ),
          ),

          // 과목별 추이
          if (subjectTrends.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('과목별 추이', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
            const SizedBox(height: 8),
            SizedBox(
              height: 200,
              child: _buildSubjectChart(subjectTrends),
            ),
            // 범례
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 4,
              children: subjectTrends.keys.map((subj) {
                final c = _subjectColors[subj] ?? const Color(0xFF6B7280);
                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(width: 12, height: 3, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2))),
                    const SizedBox(width: 4),
                    Text(subj, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                  ],
                );
              }).toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSubjectChart(Map<String, dynamic> subjectTrends) {
    // Collect all semesters
    final allSemesters = <String>{};
    for (final arr in subjectTrends.values) {
      for (final p in (arr as List)) {
        allSemesters.add((p as Map)['semester'] as String);
      }
    }
    final semesters = allSemesters.toList()..sort();

    final bars = <LineChartBarData>[];
    for (final entry in subjectTrends.entries) {
      final subj = entry.key;
      final arr = entry.value as List;
      final color = _subjectColors[subj] ?? const Color(0xFF6B7280);
      final spots = <FlSpot>[];
      for (var i = 0; i < semesters.length; i++) {
        final pt = arr.cast<Map>().where((p) => p['semester'] == semesters[i]).firstOrNull;
        if (pt != null) spots.add(FlSpot(i.toDouble(), (pt['raw_score'] ?? 0).toDouble()));
      }
      bars.add(LineChartBarData(
        spots: spots,
        color: color,
        barWidth: 2,
        dotData: FlDotData(show: true, getDotPainter: (_, __, ___, ____) =>
          FlDotCirclePainter(radius: 3, color: color, strokeColor: Colors.white, strokeWidth: 1)),
        isCurved: true,
        curveSmoothness: 0.2,
      ));
    }

    return LineChart(
      LineChartData(
        minY: 50,
        maxY: 100,
        gridData: FlGridData(show: true, drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => const FlLine(color: Color(0xFFE5E7EB), strokeWidth: 0.5)),
        titlesData: FlTitlesData(
          bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28,
            getTitlesWidget: (val, _) {
              final idx = val.toInt();
              if (idx < 0 || idx >= semesters.length) return const SizedBox();
              return Text(semesters[idx], style: const TextStyle(fontSize: 10, color: Color(0xFF6B7280)));
            })),
          leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 32,
            getTitlesWidget: (val, _) => Text(val.toInt().toString(), style: const TextStyle(fontSize: 10, color: Color(0xFF9CA3AF))))),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        borderData: FlBorderData(show: false),
        lineBarsData: bars,
      ),
    );
  }
}

// ── 학습 습관 분석 카드 (예비고1) ──

class _StudyAnalysisCard extends StatelessWidget {
  final Map<String, dynamic> data;
  const _StudyAnalysisCard({required this.data});

  static const _typeColors = {
    '학원수업': Color(0xFF4472C4),
    '학원과제': Color(0xFFED7D31),
    '자기주도': Color(0xFF70AD47),
  };

  @override
  Widget build(BuildContext context) {
    final totalHours = (data['total_weekly_hours'] ?? 0).toDouble();
    final byType = data['by_type'] as Map<String, dynamic>? ?? {};
    final bySubject = data['by_subject'] as Map<String, dynamic>? ?? {};
    final selfRatio = (data['self_study_ratio'] ?? 0).toDouble();
    final balance = (data['subject_balance'] ?? 0).toDouble();

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
          const Text('학습 습관 분석', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('주간 학습 스케줄 기반 분석 결과', style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          const SizedBox(height: 16),

          // 요약 3카드
          Row(
            children: [
              Expanded(child: _SummaryMini(
                value: '${totalHours.toStringAsFixed(0)}',
                label: '주간 총 시간',
                color: const Color(0xFF4472C4),
              )),
              const SizedBox(width: 8),
              Expanded(child: _SummaryMini(
                value: '${selfRatio.toStringAsFixed(0)}%',
                label: '자기주도 비율',
                color: selfRatio >= 40 ? const Color(0xFF16A34A) : selfRatio >= 20 ? const Color(0xFFD97706) : const Color(0xFFDC2626),
              )),
              const SizedBox(width: 8),
              Expanded(child: _SummaryMini(
                value: '${balance.toStringAsFixed(0)}',
                label: '과목 밸런스',
                color: balance >= 70 ? const Color(0xFF16A34A) : balance >= 40 ? const Color(0xFFD97706) : const Color(0xFFDC2626),
              )),
            ],
          ),
          const SizedBox(height: 16),

          // 유형별 비율 (가로 바)
          if (byType.isNotEmpty) ...[
            const Text('유형별 비율', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
            const SizedBox(height: 8),
            ...byType.entries.map((e) {
              final hours = (e.value ?? 0).toDouble();
              final pct = totalHours > 0 ? (hours / totalHours * 100) : 0.0;
              final color = _typeColors[e.key] ?? const Color(0xFF9CA3AF);
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    SizedBox(width: 60, child: Text(e.key, style: const TextStyle(fontSize: 12, color: Color(0xFF374151)))),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: (pct / 100).clamp(0, 1),
                          minHeight: 14,
                          backgroundColor: const Color(0xFFF3F4F6),
                          valueColor: AlwaysStoppedAnimation(color),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(width: 55, child: Text('${hours.toStringAsFixed(0)}h (${pct.toStringAsFixed(0)}%)',
                      style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)), textAlign: TextAlign.right)),
                  ],
                ),
              );
            }),
            const SizedBox(height: 12),
          ],

          // 과목별 시간
          if (bySubject.isNotEmpty) ...[
            const Text('과목별 시간', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
            const SizedBox(height: 8),
            ...bySubject.entries.map((e) {
              final hours = (e.value ?? 0).toDouble();
              final maxH = bySubject.values.fold<double>(1, (a, b) => max(a, (b ?? 0).toDouble()));
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    SizedBox(width: 40, child: Text(e.key, style: const TextStyle(fontSize: 12, color: Color(0xFF374151)))),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: (hours / maxH).clamp(0, 1),
                          minHeight: 14,
                          backgroundColor: const Color(0xFFF3F4F6),
                          valueColor: const AlwaysStoppedAnimation(Color(0xFF4472C4)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(width: 35, child: Text('${hours.toStringAsFixed(0)}h',
                      style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)), textAlign: TextAlign.right)),
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}

class _SummaryMini extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  const _SummaryMini({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
        ],
      ),
    );
  }
}

// ── 고등학생 내신 등급 추이 카드 ──

class _HighGradeTrendCard extends StatelessWidget {
  final Map<String, dynamic> data;
  const _HighGradeTrendCard({required this.data});

  static const _subjColors = {
    '국어': Color(0xFF70AD47), '영어': Color(0xFFED7D31), '수학': Color(0xFF4472C4),
    '탐구1': Color(0xFFFFC000), '탐구2': Color(0xFF5B9BD5), '사회': Color(0xFF9DC3E6),
  };

  static const _trendBadges = {
    '상승': ('↑ 상승', Color(0xFF16A34A)),
    '유지': ('→ 유지', Color(0xFF6B7280)),
    '등락': ('↕ 등락', Color(0xFFD97706)),
    '하락': ('↓ 하락', Color(0xFFDC2626)),
  };

  static const _distColors = [Color(0xFF4338CA), Color(0xFF059669), Color(0xFFD97706), Color(0xFFDC2626), Color(0xFF6B7280)];

  @override
  Widget build(BuildContext context) {
    final trendData = data['data'] as List? ?? [];
    final subjectTrends = data['subject_trends'] as Map<String, dynamic>? ?? {};
    final badge = data['trend_badge'] as String?;
    final gradeDist = data['grade_distribution'] as List? ?? [];

    if (trendData.isEmpty) return const SizedBox();

    final badgeInfo = badge != null ? _trendBadges[badge] : null;

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
          Row(children: [
            const Text('내신 등급 추이', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            if (badgeInfo != null) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                decoration: BoxDecoration(color: badgeInfo.$2.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                child: Text(badgeInfo.$1, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: badgeInfo.$2)),
              ),
            ],
          ]),
          const SizedBox(height: 4),
          const Text('학기별 전과목 평균 등급 (낮을수록 우수)', style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          const SizedBox(height: 16),

          // 전과목 평균 등급 라인차트
          const Text('전과목 평균 등급', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
          const SizedBox(height: 8),
          SizedBox(
            height: 180,
            child: LineChart(LineChartData(
              minY: 1, maxY: 5,
              gridData: FlGridData(show: true, drawVerticalLine: false,
                getDrawingHorizontalLine: (_) => const FlLine(color: Color(0xFFE5E7EB), strokeWidth: 0.5)),
              titlesData: FlTitlesData(
                bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28,
                  getTitlesWidget: (val, _) {
                    final idx = val.toInt();
                    if (idx < 0 || idx >= trendData.length) return const SizedBox();
                    return Text((trendData[idx] as Map)['semester'] ?? '', style: const TextStyle(fontSize: 10, color: Color(0xFF6B7280)));
                  })),
                leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28,
                  getTitlesWidget: (val, _) => Text(val.toInt().toString(), style: const TextStyle(fontSize: 10, color: Color(0xFF9CA3AF))))),
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              ),
              borderData: FlBorderData(show: false),
              lineBarsData: [
                LineChartBarData(
                  spots: trendData.asMap().entries.map((e) {
                    final avg = ((e.value as Map)['avg_grade'] ?? 3).toDouble();
                    return FlSpot(e.key.toDouble(), avg);
                  }).toList(),
                  color: const Color(0xFF4472C4), barWidth: 2.5,
                  dotData: FlDotData(show: true, getDotPainter: (_, __, ___, ____) =>
                    FlDotCirclePainter(radius: 4, color: const Color(0xFF4472C4), strokeColor: Colors.white, strokeWidth: 1.5)),
                  isCurved: true, curveSmoothness: 0.2,
                ),
              ],
            )),
          ),

          // 과목별 추이
          if (subjectTrends.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('과목별 등급 추이', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
            const SizedBox(height: 8),
            SizedBox(height: 200, child: _buildSubjChart(subjectTrends)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12, runSpacing: 4,
              children: subjectTrends.keys.map((s) {
                final c = _subjColors[s] ?? const Color(0xFF6B7280);
                return Row(mainAxisSize: MainAxisSize.min, children: [
                  Container(width: 12, height: 3, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2))),
                  const SizedBox(width: 4),
                  Text(s, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                ]);
              }).toList(),
            ),
          ],

          // 등급 분포 변화
          if (gradeDist.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('등급 분포 변화', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
            const SizedBox(height: 8),
            ...gradeDist.map((sem) {
              final m = sem as Map<String, dynamic>;
              final total = [1,2,3,4,5].fold<int>(0, (a, g) => a + ((m['$g'] ?? 0) as int));
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(m['semester'] ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: SizedBox(
                      height: 16,
                      child: Row(children: [1,2,3,4,5].map((g) {
                        final cnt = (m['$g'] ?? 0) as int;
                        if (cnt == 0 || total == 0) return const SizedBox();
                        return Expanded(
                          flex: cnt,
                          child: Container(color: _distColors[g - 1]),
                        );
                      }).toList()),
                    ),
                  ),
                ]),
              );
            }),
            Wrap(
              spacing: 10, runSpacing: 4,
              children: [1,2,3,4,5].map((g) => Row(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 10, height: 10, decoration: BoxDecoration(color: _distColors[g - 1], borderRadius: BorderRadius.circular(2))),
                const SizedBox(width: 3),
                Text('${g}등급', style: const TextStyle(fontSize: 10, color: Color(0xFF6B7280))),
              ])).toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSubjChart(Map<String, dynamic> subjectTrends) {
    final allSems = <String>{};
    for (final arr in subjectTrends.values) {
      for (final p in (arr as List)) allSems.add((p as Map)['semester'] as String);
    }
    final sems = allSems.toList()..sort();

    final bars = <LineChartBarData>[];
    for (final entry in subjectTrends.entries) {
      final color = _subjColors[entry.key] ?? const Color(0xFF6B7280);
      final spots = <FlSpot>[];
      for (var i = 0; i < sems.length; i++) {
        final pt = (entry.value as List).cast<Map>().where((p) => p['semester'] == sems[i]).firstOrNull;
        if (pt != null) spots.add(FlSpot(i.toDouble(), (pt['grade'] ?? 3).toDouble()));
      }
      bars.add(LineChartBarData(spots: spots, color: color, barWidth: 2,
        dotData: FlDotData(show: true, getDotPainter: (_, __, ___, ____) =>
          FlDotCirclePainter(radius: 3, color: color, strokeColor: Colors.white, strokeWidth: 1)),
        isCurved: true, curveSmoothness: 0.2));
    }

    return LineChart(LineChartData(
      minY: 1, maxY: 5,
      gridData: FlGridData(show: true, drawVerticalLine: false,
        getDrawingHorizontalLine: (_) => const FlLine(color: Color(0xFFE5E7EB), strokeWidth: 0.5)),
      titlesData: FlTitlesData(
        bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28,
          getTitlesWidget: (val, _) {
            final idx = val.toInt();
            if (idx < 0 || idx >= sems.length) return const SizedBox();
            return Text(sems[idx], style: const TextStyle(fontSize: 10, color: Color(0xFF6B7280)));
          })),
        leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28,
          getTitlesWidget: (val, _) => Text(val.toInt().toString(), style: const TextStyle(fontSize: 10, color: Color(0xFF9CA3AF))))),
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
      ),
      borderData: FlBorderData(show: false),
      lineBarsData: bars,
    ));
  }
}

// ── 고등학생 모의고사 추이 카드 ──

class _MockTrendCard extends StatelessWidget {
  final Map<String, dynamic> data;
  const _MockTrendCard({required this.data});

  static const _areaColors = {
    '국어': Color(0xFF70AD47), '수학': Color(0xFF4472C4), '영어': Color(0xFFED7D31),
    '탐구1': Color(0xFFFFC000), '탐구2': Color(0xFF5B9BD5),
  };

  static const _trendBadges = {
    '상승': ('↑ 상승', Color(0xFF16A34A)),
    '유지': ('→ 유지', Color(0xFF6B7280)),
    '등락': ('↕ 등락', Color(0xFFD97706)),
    '하락': ('↓ 하락', Color(0xFFDC2626)),
  };

  @override
  Widget build(BuildContext context) {
    final avgTrend = data['avg_trend'] as List? ?? [];
    final areaTrends = data['area_trends'] as Map<String, dynamic>? ?? {};
    final badge = data['trend_badge'] as String?;
    final weakAreas = data['weak_areas'] as List? ?? [];

    if (avgTrend.isEmpty) return const SizedBox();
    final badgeInfo = badge != null ? _trendBadges[badge] : null;

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
          Row(children: [
            const Text('모의고사 추이', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            if (badgeInfo != null) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                decoration: BoxDecoration(color: badgeInfo.$2.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                child: Text(badgeInfo.$1, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: badgeInfo.$2)),
              ),
            ],
          ]),
          const SizedBox(height: 4),
          const Text('모의고사 회차별 평균 등급 (낮을수록 우수)', style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          const SizedBox(height: 16),

          // 전 영역 평균 등급
          const Text('전 영역 평균 등급', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
          const SizedBox(height: 8),
          SizedBox(
            height: 180,
            child: LineChart(LineChartData(
              minY: 1, maxY: 9,
              gridData: FlGridData(show: true, drawVerticalLine: false,
                getDrawingHorizontalLine: (_) => const FlLine(color: Color(0xFFE5E7EB), strokeWidth: 0.5)),
              titlesData: FlTitlesData(
                bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28,
                  getTitlesWidget: (val, _) {
                    final idx = val.toInt();
                    if (idx < 0 || idx >= avgTrend.length) return const SizedBox();
                    return Text((avgTrend[idx] as Map)['session'] ?? '', style: const TextStyle(fontSize: 9, color: Color(0xFF6B7280)));
                  })),
                leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28,
                  getTitlesWidget: (val, _) => Text(val.toInt().toString(), style: const TextStyle(fontSize: 10, color: Color(0xFF9CA3AF))))),
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              ),
              borderData: FlBorderData(show: false),
              lineBarsData: [
                LineChartBarData(
                  spots: avgTrend.asMap().entries.map((e) {
                    return FlSpot(e.key.toDouble(), ((e.value as Map)['avg_rank'] ?? 5).toDouble());
                  }).toList(),
                  color: const Color(0xFF4472C4), barWidth: 2.5,
                  dotData: FlDotData(show: true, getDotPainter: (_, __, ___, ____) =>
                    FlDotCirclePainter(radius: 4, color: const Color(0xFF4472C4), strokeColor: Colors.white, strokeWidth: 1.5)),
                  isCurved: true, curveSmoothness: 0.2,
                ),
              ],
            )),
          ),

          // 영역별 추이
          if (areaTrends.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('영역별 등급 추이', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
            const SizedBox(height: 8),
            SizedBox(height: 200, child: _buildAreaChart(areaTrends)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12, runSpacing: 4,
              children: areaTrends.keys.map((a) {
                final c = _areaColors[a] ?? const Color(0xFF6B7280);
                return Row(mainAxisSize: MainAxisSize.min, children: [
                  Container(width: 12, height: 3, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2))),
                  const SizedBox(width: 4),
                  Text(a, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                ]);
              }).toList(),
            ),
          ],

          // 취약 영역
          if (weakAreas.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('취약 영역', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
            const SizedBox(height: 8),
            ...weakAreas.map((w) {
              final m = w as Map<String, dynamic>;
              return Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFFCA5A5)),
                ),
                child: Row(children: [
                  Text(m['area'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFFDC2626))),
                  const SizedBox(width: 10),
                  Text('평균 ${(m['avg_rank'] ?? 0).toStringAsFixed(1)}등급', style: const TextStyle(fontSize: 12, color: Color(0xFFDC2626))),
                  const Spacer(),
                  Text('전체 대비 +${(m['gap'] ?? 0).toStringAsFixed(1)}', style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
                ]),
              );
            }),
          ],
        ],
      ),
    );
  }

  Widget _buildAreaChart(Map<String, dynamic> areaTrends) {
    final allSes = <String>{};
    for (final arr in areaTrends.values) {
      for (final p in (arr as List)) allSes.add((p as Map)['session'] as String);
    }
    final sessions = allSes.toList()..sort();

    final bars = <LineChartBarData>[];
    for (final entry in areaTrends.entries) {
      final color = _areaColors[entry.key] ?? const Color(0xFF6B7280);
      final spots = <FlSpot>[];
      for (var i = 0; i < sessions.length; i++) {
        final pt = (entry.value as List).cast<Map>().where((p) => p['session'] == sessions[i]).firstOrNull;
        if (pt != null) spots.add(FlSpot(i.toDouble(), (pt['rank'] ?? 5).toDouble()));
      }
      bars.add(LineChartBarData(spots: spots, color: color, barWidth: 2,
        dotData: FlDotData(show: true, getDotPainter: (_, __, ___, ____) =>
          FlDotCirclePainter(radius: 3, color: color, strokeColor: Colors.white, strokeWidth: 1)),
        isCurved: true, curveSmoothness: 0.2));
    }

    return LineChart(LineChartData(
      minY: 1, maxY: 9,
      gridData: FlGridData(show: true, drawVerticalLine: false,
        getDrawingHorizontalLine: (_) => const FlLine(color: Color(0xFFE5E7EB), strokeWidth: 0.5)),
      titlesData: FlTitlesData(
        bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28,
          getTitlesWidget: (val, _) {
            final idx = val.toInt();
            if (idx < 0 || idx >= sessions.length) return const SizedBox();
            return Text(sessions[idx], style: const TextStyle(fontSize: 9, color: Color(0xFF6B7280)));
          })),
        leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28,
          getTitlesWidget: (val, _) => Text(val.toInt().toString(), style: const TextStyle(fontSize: 10, color: Color(0xFF9CA3AF))))),
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
      ),
      borderData: FlBorderData(show: false),
      lineBarsData: bars,
    ));
  }
}

// ── 내신 vs 모의 비교 카드 (고등학생) ──

class _NaesinMockCompareCard extends StatelessWidget {
  final Map<String, dynamic> gradeTrend;
  final Map<String, dynamic> mockTrend;
  const _NaesinMockCompareCard({required this.gradeTrend, required this.mockTrend});

  @override
  Widget build(BuildContext context) {
    final gradeData = gradeTrend['data'] as List? ?? [];
    final subjectTrends = gradeTrend['subject_trends'] as Map<String, dynamic>? ?? {};
    final areaTrends = mockTrend['area_trends'] as Map<String, dynamic>? ?? {};

    if (gradeData.isEmpty) return const SizedBox();

    // 최근 내신 과목별 등급
    final latestGrade = <String, double>{};
    for (final entry in subjectTrends.entries) {
      final arr = entry.value as List;
      if (arr.isNotEmpty) latestGrade[entry.key] = ((arr.last as Map)['grade'] ?? 0).toDouble();
    }

    // 최근 모의 영역별 등급
    final latestMock = <String, double>{};
    for (final entry in areaTrends.entries) {
      final arr = entry.value as List;
      if (arr.isNotEmpty) latestMock[entry.key] = ((arr.last as Map)['rank'] ?? 0).toDouble();
    }

    final rows = [
      ('국어', latestGrade['국어'], latestMock['국어']),
      ('수학', latestGrade['수학'], latestMock['수학']),
      ('영어', latestGrade['영어'], latestMock['영어']),
      ('탐구1', latestGrade['탐구1'], latestMock['탐구1']),
      ('탐구2', latestGrade['탐구2'], latestMock['탐구2']),
    ].where((r) => r.$2 != null || r.$3 != null).toList();

    if (rows.isEmpty) return const SizedBox();

    final lastAvgGrade = (gradeData.last as Map)['avg_grade']?.toDouble();
    final mockAvg = mockTrend['avg_trend'] as List? ?? [];
    final lastAvgMock = mockAvg.isNotEmpty ? (mockAvg.last as Map)['avg_rank']?.toDouble() : null;

    String typeHint = '';
    if (lastAvgGrade != null && lastAvgMock != null) {
      final conv = lastAvgGrade * 2 - 1;
      final diff = lastAvgMock - conv;
      typeHint = diff > 1.5 ? '내신형' : diff < -1.5 ? '수능형' : '균형형';
    }

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
          const Text('내신 vs 모의고사 비교', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('최근 내신(5등급) vs 최근 모의(9등급) 비교', style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          const SizedBox(height: 16),

          // 테이블 헤더
          Container(
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: const BoxDecoration(
              color: Color(0xFF4472C4),
              borderRadius: BorderRadius.vertical(top: Radius.circular(10)),
            ),
            child: const Row(children: [
              Expanded(child: Text('과목', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white))),
              Expanded(child: Text('내신', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white))),
              Expanded(child: Text('모의', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white))),
              Expanded(child: Text('Gap', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white))),
            ]),
          ),

          // 테이블 행
          ...rows.asMap().entries.map((e) {
            final (label, naesin, mock) = e.value;
            final gap = naesin != null && mock != null ? mock - (naesin * 2 - 1) : null;
            return Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: e.key % 2 == 0 ? Colors.white : const Color(0xFFF9FAFB),
                border: const Border(top: BorderSide(color: Color(0xFFF3F4F6))),
              ),
              child: Row(children: [
                Expanded(child: Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
                Expanded(child: Text(naesin != null ? naesin.toStringAsFixed(1) : '-', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13))),
                Expanded(child: Text(mock != null ? mock.toStringAsFixed(1) : '-', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13))),
                Expanded(child: Text(
                  gap != null ? (gap > 0 ? '+${gap.toStringAsFixed(1)}' : gap.toStringAsFixed(1)) : '-',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                    color: gap == null ? const Color(0xFF6B7280) : gap > 1 ? const Color(0xFFDC2626) : gap < -1 ? const Color(0xFF16A34A) : const Color(0xFF6B7280)),
                )),
              ]),
            );
          }),

          // 평균 + 유형
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF9FAFB),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Row(children: [
              if (lastAvgGrade != null) ...[
                const Text('내신 ', style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                Text('${lastAvgGrade.toStringAsFixed(2)}등급', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                const SizedBox(width: 16),
              ],
              if (lastAvgMock != null) ...[
                const Text('모의 ', style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                Text('${lastAvgMock.toStringAsFixed(2)}등급', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
              ],
              const Spacer(),
              if (typeHint.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: typeHint == '내신형' ? const Color(0xFFEEF2FF)
                         : typeHint == '수능형' ? const Color(0xFFECFDF5)
                         : const Color(0xFFFFF7ED),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(typeHint, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                    color: typeHint == '내신형' ? const Color(0xFF4338CA)
                         : typeHint == '수능형' ? const Color(0xFF059669)
                         : const Color(0xFFD97706))),
                ),
            ]),
          ),
          const SizedBox(height: 8),
          const Text('※ Gap은 5등급→9등급 환산 참고값. 정확한 유형 판정은 상담사가 확정합니다.',
            style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF), height: 1.4)),
        ],
      ),
    );
  }
}

// ── 로드맵 카드 (예비고1) ──

class _RoadmapCard extends StatefulWidget {
  final Map<String, dynamic> roadmap;
  final bool isPreheigh1;
  const _RoadmapCard({required this.roadmap, this.isPreheigh1 = false});

  @override
  State<_RoadmapCard> createState() => _RoadmapCardState();
}

class _RoadmapCardState extends State<_RoadmapCard> {
  String? _expandedPhase;

  static const _priorityColors = {
    '상': (Color(0xFFFEE2E2), Color(0xFFDC2626)),
    '중': (Color(0xFFFEF3C7), Color(0xFFD97706)),
    '하': (Color(0xFFDBEAFE), Color(0xFF2563EB)),
  };

  @override
  Widget build(BuildContext context) {
    final items = widget.roadmap['items'] as List? ?? [];
    final summary = widget.roadmap['summary'] as String? ?? '';
    final matrix = widget.roadmap['matrix'] as Map<String, dynamic>?;
    final priorityItems = items.where((it) {
      final p = (it as Map)['priority'];
      return p == '상' || p == '중';
    }).toList();

    if (items.isEmpty && matrix == null) return const SizedBox();

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
          Text(widget.isPreheigh1 ? '고교 준비 로드맵' : '학습 로드맵', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(summary, style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          const SizedBox(height: 16),

          // 우선 과제 요약
          if (priorityItems.isNotEmpty) ...[
            const Text('우선 과제', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
            const SizedBox(height: 8),
            ...priorityItems.map((item) {
              final m = item as Map<String, dynamic>;
              final priority = m['priority'] ?? '하';
              final (pbg, ptxt) = _priorityColors[priority] ?? _priorityColors['하']!;
              final grade = m['current_grade'] ?? 'D';
              return Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFFF9FAFB),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: pbg, borderRadius: BorderRadius.circular(10)),
                      child: Text(priority == '상' ? '최우선' : '중요',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: ptxt)),
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(m['title'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
                    _GradeBadge(grade: grade, size: 22),
                  ],
                ),
              );
            }),
            const SizedBox(height: 16),
          ],

          // 4단계 × 6트랙 매트릭스
          if (matrix != null) ...[
            const Text('단계별 로드맵', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
            const SizedBox(height: 8),
            ..._buildMatrixPhases(matrix),
          ],

          // 안내 문구
          Container(
            margin: const EdgeInsets.only(top: 12),
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

  List<Widget> _buildMatrixPhases(Map<String, dynamic> matrix) {
    final phases = matrix['phases'] as List? ?? [];
    final tracks = matrix['tracks'] as List? ?? [];
    final cells = matrix['cells'] as Map<String, dynamic>? ?? {};

    return phases.map<Widget>((phase) {
      final p = phase as Map<String, dynamic>;
      final phaseKey = p['key'] as String;
      final isOpen = _expandedPhase == phaseKey;

      return Container(
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          children: [
            // Phase 헤더 (탭 토글)
            InkWell(
              onTap: () => setState(() => _expandedPhase = isOpen ? null : phaseKey),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(11)),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: isOpen ? const Color(0xFFEEF2FF) : const Color(0xFFF9FAFB),
                  borderRadius: isOpen
                    ? const BorderRadius.vertical(top: Radius.circular(11))
                    : BorderRadius.circular(11),
                ),
                child: Row(
                  children: [
                    AnimatedRotation(
                      turns: isOpen ? 0.25 : 0,
                      duration: const Duration(milliseconds: 200),
                      child: const Icon(Icons.play_arrow, size: 14, color: Color(0xFF6B7280)),
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(p['label'] ?? '', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700))),
                    Text(p['theme'] ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
                  ],
                ),
              ),
            ),
            // 6트랙 내용
            if (isOpen)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: tracks.map<Widget>((track) {
                    final t = track as Map<String, dynamic>;
                    final content = (cells[phaseKey] as Map<String, dynamic>?)?[t['key']];
                    if (content == null || content.toString().isEmpty) return const SizedBox.shrink();
                    return SizedBox(
                      width: (MediaQuery.of(context).size.width - 80) / 2,
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF9FAFB),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFF3F4F6)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${t['icon'] ?? ''} ${t['label'] ?? ''}',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF374151))),
                            const SizedBox(height: 4),
                            Text(content.toString(),
                              style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280), height: 1.5)),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
          ],
        ),
      );
    }).toList();
  }
}

// ── 학습 방법 진단 매트릭스 카드 ──

class _StudyMethodMatrixCard extends StatelessWidget {
  final Map<String, dynamic> data;
  const _StudyMethodMatrixCard({required this.data});

  static const _satColors = {
    '만족': (Color(0xFFECFDF5), Color(0xFF059669)),
    '보통': (Color(0xFFFFF7ED), Color(0xFFD97706)),
    '불만족': (Color(0xFFFEF2F2), Color(0xFFDC2626)),
  };

  static const _gradeRankColors = {
    1: (Color(0xFFEEF2FF), Color(0xFF4338CA)),
    2: (Color(0xFFEEF2FF), Color(0xFF4338CA)),
    3: (Color(0xFFECFDF5), Color(0xFF059669)),
    4: (Color(0xFFFFF7ED), Color(0xFFD97706)),
    5: (Color(0xFFFEF2F2), Color(0xFFDC2626)),
  };

  static const _matchColors = {
    '효율적': Color(0xFF059669),
    '적정': Color(0xFF4472C4),
    '비효율': Color(0xFFDC2626),
    '-': Color(0xFF9CA3AF),
  };

  static const _psychColors = {
    '매우 긴장': Color(0xFFDC2626),
    '가끔 긴장': Color(0xFFD97706),
    '긴장하지 않음': Color(0xFF059669),
    '높음': Color(0xFF059669),
    '보통': Color(0xFFD97706),
    '낮음': Color(0xFFDC2626),
    '매우 부담': Color(0xFFDC2626),
    '약간 부담': Color(0xFFD97706),
    '적당함': Color(0xFF059669),
    '부담 없음': Color(0xFF059669),
  };

  @override
  Widget build(BuildContext context) {
    final subjects = (data['subjects'] as List?) ?? [];
    final weekly = (data['weekly_summary'] as Map<String, dynamic>?) ?? {};
    final psych = (data['psychology'] as Map<String, dynamic>?) ?? {};

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
          const Text('학습 방법 진단 매트릭스', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('과목별 학습 방법과 성적의 연계 분석', style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          const SizedBox(height: 16),

          // a) 과목별 학습 방법 매트릭스 (가로 스크롤 테이블)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: _buildMatrixTable(subjects),
          ),
          const SizedBox(height: 16),

          // b) 학습법-성적 연계 분석
          _buildMethodGradeAnalysis(subjects),
          const SizedBox(height: 16),

          // c) 주간 스케줄 요약
          if (weekly['total_hours'] != null) ...[
            _buildWeeklySummary(weekly),
            const SizedBox(height: 12),
          ],

          // d) 학습 심리 상태
          if (psych.values.any((v) => v != null))
            _buildPsychCard(psych),

          // 범례
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFBEB),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFFFCD34D)),
            ),
            child: const Text(
              '매칭 평가: \u2713 효율적 = 적은 학습법으로 높은 성적 | \u2713 적정 = 균형 | \u25B2 비효율 = 전략 개선 필요',
              style: TextStyle(fontSize: 11, color: Color(0xFF92400E), height: 1.5),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMatrixTable(List subjects) {
    const headerStyle = TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF374151));
    const cellStyle = TextStyle(fontSize: 11, color: Color(0xFF374151));

    return DataTable(
      columnSpacing: 12,
      horizontalMargin: 8,
      headingRowHeight: 36,
      dataRowMinHeight: 40,
      dataRowMaxHeight: 64,
      headingRowColor: WidgetStateProperty.all(const Color(0xFFF9FAFB)),
      columns: const [
        DataColumn(label: Text('과목', style: headerStyle)),
        DataColumn(label: Text('학습 방법', style: headerStyle)),
        DataColumn(label: Text('수업', style: headerStyle)),
        DataColumn(label: Text('만족', style: headerStyle)),
        DataColumn(label: Text('교재', style: headerStyle)),
        DataColumn(label: Text('인강', style: headerStyle)),
        DataColumn(label: Text('등급', style: headerStyle)),
        DataColumn(label: Text('매칭', style: headerStyle)),
      ],
      rows: subjects.map<DataRow>((subj) {
        final s = subj as Map<String, dynamic>;
        final methods = (s['study_methods'] as List?) ?? [];
        final sat = s['satisfaction'] as String?;
        final satC = _satColors[sat] ?? (const Color(0xFFF3F4F6), const Color(0xFF6B7280));
        final gradeInfo = s['grade'] as Map<String, dynamic>?;
        final rank = gradeInfo?['rank'] != null ? (gradeInfo!['rank'] as num).round() : null;
        final gradeC = _gradeRankColors[rank] ?? (const Color(0xFFF3F4F6), const Color(0xFF6B7280));
        final match = (s['method_grade_match'] as String?) ?? '-';
        final matchColor = _matchColors[match] ?? const Color(0xFF9CA3AF);
        final lecture = s['lecture'] as Map<String, dynamic>? ?? {};
        final hasLecture = lecture['has'] == true;

        return DataRow(cells: [
          DataCell(Text(s['name'] ?? '', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700))),
          DataCell(
            methods.isNotEmpty
              ? Wrap(spacing: 2, runSpacing: 2, children: methods.map<Widget>((m) =>
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(8)),
                    child: Text(m.toString(), style: const TextStyle(fontSize: 10, color: Color(0xFF4338CA))),
                  )).toList())
              : const Text('-', style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
          ),
          DataCell(Text(s['class_engagement'] ?? '-', style: cellStyle)),
          DataCell(
            sat != null
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: satC.$1, borderRadius: BorderRadius.circular(8)),
                  child: Text(sat, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: satC.$2)),
                )
              : const Text('-', style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
          ),
          DataCell(Text(s['textbook'] ?? '-', style: cellStyle)),
          DataCell(
            hasLecture
              ? Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(lecture['instructor'] ?? 'O', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                  if (lecture['platform'] != null)
                    Text(lecture['platform'], style: const TextStyle(fontSize: 9, color: Color(0xFF9CA3AF))),
                ])
              : const Text('-', style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
          ),
          DataCell(
            rank != null
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: gradeC.$1, borderRadius: BorderRadius.circular(8)),
                  child: Text('$rank등급', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: gradeC.$2)),
                )
              : const Text('-', style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
          ),
          DataCell(
            Column(mainAxisSize: MainAxisSize.min, children: [
              Text(match == '효율적' || match == '적정' ? '\u2713' : match == '비효율' ? '\u25B2' : '-',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: matchColor)),
              Text(match, style: TextStyle(fontSize: 9, color: matchColor)),
            ]),
          ),
        ]);
      }).toList(),
    );
  }

  Widget _buildMethodGradeAnalysis(List subjects) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('학습법-성적 연계 분석', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ...subjects.where((s) {
            final sub = s as Map<String, dynamic>;
            final methods = (sub['study_methods'] as List?) ?? [];
            final grade = (sub['grade'] as Map<String, dynamic>?)?['rank'];
            return methods.isNotEmpty || grade != null;
          }).map((s) {
            final sub = s as Map<String, dynamic>;
            final methods = (sub['study_methods'] as List?) ?? [];
            final grade = (sub['grade'] as Map<String, dynamic>?)?['rank'];
            final match = (sub['method_grade_match'] as String?) ?? '-';
            final matchColor = _matchColors[match] ?? const Color(0xFF9CA3AF);
            final matchBg = match == '비효율' ? const Color(0xFFFEF2F2)
                : match == '효율적' ? const Color(0xFFECFDF5) : const Color(0xFFF3F4F6);

            return Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFF3F4F6)),
              ),
              child: Row(
                children: [
                  SizedBox(width: 40, child: Text(sub['name'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
                  const SizedBox(width: 8),
                  Expanded(child: Text(
                    '학습법 ${methods.length}개 사용${grade != null ? ' \u2192 ${(grade as num).round()}등급' : ''}',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                  )),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(color: matchBg, borderRadius: BorderRadius.circular(8)),
                    child: Text(match, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: matchColor)),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildWeeklySummary(Map<String, dynamic> weekly) {
    final totalHours = (weekly['total_hours'] ?? 0).toDouble();
    final selfRatio = (weekly['self_study_ratio'] ?? 0).toDouble();
    final bySubject = (weekly['by_subject'] as Map<String, dynamic>?) ?? {};

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('주간 스케줄 요약', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _SummaryMini(
              value: '${totalHours.toStringAsFixed(0)}',
              label: '총 시간',
              color: const Color(0xFF4472C4),
            )),
            const SizedBox(width: 8),
            Expanded(child: _SummaryMini(
              value: '${selfRatio.toStringAsFixed(0)}%',
              label: '자기주도',
              color: selfRatio >= 40 ? const Color(0xFF16A34A) : selfRatio >= 20 ? const Color(0xFFD97706) : const Color(0xFFDC2626),
            )),
          ]),
          if (bySubject.isNotEmpty) ...[
            const SizedBox(height: 12),
            ...bySubject.entries.map((e) {
              final hours = (e.value ?? 0).toDouble();
              final maxH = bySubject.values.fold<double>(1, (a, b) => max(a, (b ?? 0).toDouble()));
              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(children: [
                  SizedBox(width: 32, child: Text(e.key, style: const TextStyle(fontSize: 11, color: Color(0xFF374151)), textAlign: TextAlign.right)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: (hours / maxH).clamp(0, 1),
                        minHeight: 10,
                        backgroundColor: const Color(0xFFE5E7EB),
                        valueColor: const AlwaysStoppedAnimation(Color(0xFF4472C4)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  SizedBox(width: 28, child: Text('${hours.toStringAsFixed(0)}h', style: const TextStyle(fontSize: 10, color: Color(0xFF6B7280)), textAlign: TextAlign.right)),
                ]),
              );
            }),
          ],
        ],
      ),
    );
  }

  Widget _buildPsychCard(Map<String, dynamic> psych) {
    final items = [
      ('test_anxiety', '시험 불안'),
      ('motivation', '학습 동기'),
      ('study_load', '학습 부담'),
      ('sleep_hours', '수면 시간'),
      ('subject_giveup', '포기 과목'),
    ];

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('학습 심리 상태', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ...items.where((item) => psych[item.$1] != null).map((item) {
            final val = psych[item.$1].toString();
            final color = _psychColors[val] ?? const Color(0xFF6B7280);
            return Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(children: [
                Expanded(child: Text(item.$2, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)))),
                Text(val, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
              ]),
            );
          }),
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

// ── 수능 최저학력기준 충족 시뮬레이션 ──

class _SuneungMinimumCard extends StatefulWidget {
  final Map<String, dynamic> data;
  const _SuneungMinimumCard({required this.data});

  @override
  State<_SuneungMinimumCard> createState() => _SuneungMinimumCardState();
}

class _SuneungMinimumCardState extends State<_SuneungMinimumCard> {
  String? _expandedUniv;

  static const _subjectLabels = {
    'korean': '국어',
    'math': '수학',
    'english': '영어',
    'inquiry1': '탐구1',
    'inquiry2': '탐구2',
  };

  Color _resultBgColor(String result, num? margin) {
    if (result == '충족') return const Color(0xFFECFDF5);
    if (result == '미충족' && margin != null && margin >= -2) return const Color(0xFFFFFBEB);
    if (result == '미충족') return const Color(0xFFFEF2F2);
    return const Color(0xFFF3F4F6);
  }

  Color _resultTextColor(String result, num? margin) {
    if (result == '충족') return const Color(0xFF059669);
    if (result == '미충족' && margin != null && margin >= -2) return const Color(0xFFD97706);
    if (result == '미충족') return const Color(0xFFDC2626);
    return const Color(0xFF6B7280);
  }

  String _resultLabel(String result, num? margin) {
    if (result == '충족') return '충족';
    if (result == '미충족' && margin != null && margin >= -2) return '근접';
    if (result == '미충족') return '미충족';
    if (result == '해당없음') return '없음';
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final grades = (widget.data['student_mock_grades'] as Map<String, dynamic>?) ?? {};
    final simulations = (widget.data['simulations'] as List?) ?? [];
    final summary = (widget.data['summary'] as Map<String, dynamic>?) ?? {};

    // Group by university
    final grouped = <String, List<dynamic>>{};
    for (final sim in simulations) {
      final key = (sim as Map)['university'] as String? ?? '';
      grouped.putIfAbsent(key, () => []).add(sim);
    }

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '수능 최저학력기준 충족 시뮬레이션',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),

            // Mock exam grades
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _subjectLabels.entries.map((entry) {
                final grade = grades[entry.key];
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    children: [
                      Text(entry.value, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                      const SizedBox(height: 2),
                      Text(
                        grade != null ? '$grade' : '-',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: grade != null ? Colors.black87 : const Color(0xFFD1D5DB),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),

            // Summary row
            Row(
              children: [
                _summaryChip('충족', summary['met'] ?? 0, const Color(0xFF059669), const Color(0xFFECFDF5)),
                const SizedBox(width: 8),
                _summaryChip('근접', summary['close'] ?? 0, const Color(0xFFD97706), const Color(0xFFFFFBEB)),
                const SizedBox(width: 8),
                _summaryChip('미충족', summary['not_met'] ?? 0, const Color(0xFFDC2626), const Color(0xFFFEF2F2)),
              ],
            ),
            const SizedBox(height: 12),

            // University groups
            ...grouped.entries.map((entry) {
              final univ = entry.key;
              final sims = entry.value;
              final isExpanded = _expandedUniv == univ;
              final metCount = sims.where((s) => (s as Map)['result'] == '충족').length;
              final totalCount = sims.where((s) => (s as Map)['result'] != '해당없음').length;

              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  children: [
                    InkWell(
                      onTap: () => setState(() => _expandedUniv = isExpanded ? null : univ),
                      borderRadius: BorderRadius.circular(10),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Row(
                                children: [
                                  Text(univ, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                                  const SizedBox(width: 8),
                                  if (totalCount > 0)
                                    Text(
                                      '$metCount/$totalCount 충족',
                                      style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                                    ),
                                ],
                              ),
                            ),
                            Icon(
                              isExpanded ? Icons.expand_less : Icons.expand_more,
                              size: 18,
                              color: const Color(0xFF9CA3AF),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (isExpanded)
                      Padding(
                        padding: const EdgeInsets.only(left: 14, right: 14, bottom: 12),
                        child: Column(
                          children: sims.asMap().entries.map((simEntry) {
                            final sim = simEntry.value as Map;
                            final result = sim['result'] as String? ?? '';
                            final margin = sim['margin'] as num?;
                            return Container(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              decoration: BoxDecoration(
                                border: simEntry.key > 0
                                    ? const Border(top: BorderSide(color: Color(0xFFF3F4F6)))
                                    : null,
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _resultBgColor(result, margin),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      _resultLabel(result, margin),
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: _resultTextColor(result, margin),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          sim['admission_type'] as String? ?? '',
                                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                                        ),
                                        if (sim['detail'] != null)
                                          Padding(
                                            padding: const EdgeInsets.only(top: 2),
                                            child: Text(
                                              sim['detail'] as String? ?? '',
                                              style: TextStyle(
                                                fontSize: 12,
                                                color: _resultTextColor(result, margin),
                                              ),
                                            ),
                                          ),
                                      ],
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
            }),

            const SizedBox(height: 8),
            const Text(
              '* 최신 모의고사 등급 기준 시뮬레이션 결과입니다.',
              style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryChip(String label, int count, Color textColor, Color bgColor) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          children: [
            Text(
              '$count',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textColor),
            ),
            Text(
              label,
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: textColor),
            ),
          ],
        ),
      ),
    );
  }
}
