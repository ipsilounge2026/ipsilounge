import 'package:flutter/material.dart';
import '../models/consultation_note.dart';
import '../services/api_service.dart';

class ConsultationManagementScreen extends StatefulWidget {
  const ConsultationManagementScreen({super.key});

  @override
  State<ConsultationManagementScreen> createState() =>
      _ConsultationManagementScreenState();
}

class _ConsultationManagementScreenState
    extends State<ConsultationManagementScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
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
        title: const Text('상담 관리'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(0xFF3B82F6),
          unselectedLabelColor: const Color(0xFF9CA3AF),
          indicatorColor: const Color(0xFF3B82F6),
          isScrollable: true,
          labelStyle:
              const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          tabs: const [
            Tab(text: '상담 기록'),
            Tab(text: '액션 플랜'),
            Tab(text: '학습 로드맵'),
            Tab(text: '변화 추적'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _NotesTab(),
          _ActionPlanTab(),
          _RoadmapTab(),
          _DeltaTab(),
        ],
      ),
    );
  }
}

/* ──────── 상담 기록 탭 ──────── */

class _NotesTab extends StatefulWidget {
  const _NotesTab();
  @override
  State<_NotesTab> createState() => _NotesTabState();
}

class _NotesTabState extends State<_NotesTab> {
  List<ConsultationNote> _notes = [];
  bool _isLoading = true;

  static const _categoryLabels = {
    'academic': '학생부분석',
    'record': '입시전략',
    'admission': '학교생활',
    'mental': '심리정서',
    'other': '기타',
  };

  static const _categoryColors = {
    'academic': Color(0xFF3B82F6),
    'record': Color(0xFF7C3AED),
    'admission': Color(0xFF16A34A),
    'mental': Color(0xFFF97316),
    'other': Color(0xFF6B7280),
  };

  @override
  void initState() {
    super.initState();
    _loadNotes();
  }

  Future<void> _loadNotes() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiService.get('/consultation-notes');
      final items = res as List;
      setState(() =>
          _notes = items.map((e) => ConsultationNote.fromJson(e)).toList());
    } catch (_) {} finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());

    if (_notes.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Icon(Icons.note_alt_outlined, size: 56, color: Color(0xFFD1D5DB)),
            SizedBox(height: 16),
            Text('상담 기록이 없습니다',
                style: TextStyle(color: Color(0xFF6B7280))),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadNotes,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _notes.length,
        itemBuilder: (context, index) {
          final note = _notes[index];
          final catColor =
              _categoryColors[note.category] ?? const Color(0xFF6B7280);
          final catLabel = _categoryLabels[note.category] ?? note.category;

          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 8,
                    offset: const Offset(0, 2)),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                          color: catColor.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(4)),
                      child: Text(catLabel,
                          style: TextStyle(
                              fontSize: 12,
                              color: catColor,
                              fontWeight: FontWeight.w600)),
                    ),
                    Text(_formatDate(note.consultationDate),
                        style: const TextStyle(
                            fontSize: 12, color: Color(0xFF9CA3AF))),
                  ],
                ),
                if (note.goals != null && note.goals!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _SectionLabel('상담 목표'),
                  const SizedBox(height: 4),
                  Text(note.goals!, style: const TextStyle(fontSize: 14)),
                ],
                if (note.mainContent != null &&
                    note.mainContent!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _SectionLabel('주요 내용'),
                  const SizedBox(height: 4),
                  Text(note.mainContent!,
                      style: const TextStyle(fontSize: 14)),
                ],
                if (note.adviceGiven != null &&
                    note.adviceGiven!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _SectionLabel('조언'),
                  const SizedBox(height: 4),
                  Text(note.adviceGiven!,
                      style: const TextStyle(fontSize: 14)),
                ],
                if (note.nextSteps != null &&
                    note.nextSteps!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _SectionLabel('다음 단계'),
                  const SizedBox(height: 4),
                  Text(note.nextSteps!, style: const TextStyle(fontSize: 14)),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  String _formatDate(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr);
      return '${dt.year}.${dt.month.toString().padLeft(2, '0')}.${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return dateStr;
    }
  }
}

/* ──────── 액션 플랜 탭 ──────── */

class _ActionPlanTab extends StatefulWidget {
  const _ActionPlanTab();
  @override
  State<_ActionPlanTab> createState() => _ActionPlanTabState();
}

class _ActionPlanTabState extends State<_ActionPlanTab> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _plans = [];

  @override
  void initState() {
    super.initState();
    _loadActionPlans();
  }

  Future<void> _loadActionPlans() async {
    setState(() => _isLoading = true);
    try {
      final surveys = await ApiService.get(
          '/consultation-surveys?status=submitted') as Map<String, dynamic>;
      final items = (surveys['items'] ?? []) as List;
      final plans = <Map<String, dynamic>>[];
      for (final s in items) {
        try {
          final plan =
              await ApiService.get('/consultation-surveys/${s['id']}/action-plan');
          if (plan != null && plan is Map && (plan['items'] as List?)?.isNotEmpty == true) {
            plans.add({
              'survey_id': s['id'],
              'timing': s['timing'] ?? '',
              'items': plan['items'] ?? [],
            });
          }
        } catch (_) {}
      }
      setState(() => _plans = plans);
    } catch (_) {} finally {
      setState(() => _isLoading = false);
    }
  }

  static const _timingLabels = {
    'T1': '고1 1학기',
    'T2': '고1 2학기',
    'T3': '고2 1학기',
    'T4': '고2 2학기',
  };

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());

    if (_plans.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Icon(Icons.checklist_outlined,
                size: 56, color: Color(0xFFD1D5DB)),
            SizedBox(height: 16),
            Text('액션 플랜이 없습니다',
                style: TextStyle(color: Color(0xFF6B7280))),
            SizedBox(height: 4),
            Text('상담 완료 후 상담사가 작성한 액션 플랜이 여기에 표시됩니다',
                style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadActionPlans,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: _plans.map((plan) {
          final items = plan['items'] as List;
          final completed = items.where((i) => i['completed'] == true).length;
          final total = items.length;
          final pct = total > 0 ? completed / total : 0.0;
          final timing = _timingLabels[plan['timing']] ?? plan['timing'];

          return Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 8,
                    offset: const Offset(0, 2)),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(timing,
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600)),
                    const Spacer(),
                    Text('$completed/$total 완료',
                        style: TextStyle(
                            fontSize: 13,
                            color: pct >= 1.0
                                ? const Color(0xFF16A34A)
                                : const Color(0xFF6B7280),
                            fontWeight: FontWeight.w500)),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: pct,
                    backgroundColor: const Color(0xFFE5E7EB),
                    valueColor: AlwaysStoppedAnimation(
                        pct >= 1.0
                            ? const Color(0xFF16A34A)
                            : const Color(0xFF3B82F6)),
                    minHeight: 6,
                  ),
                ),
                const SizedBox(height: 12),
                ...items.map((item) {
                  final done = item['completed'] == true;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          done
                              ? Icons.check_circle
                              : Icons.radio_button_unchecked,
                          size: 20,
                          color: done
                              ? const Color(0xFF16A34A)
                              : const Color(0xFFD1D5DB),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item['content'] ?? '',
                                style: TextStyle(
                                  fontSize: 14,
                                  color: done
                                      ? const Color(0xFF9CA3AF)
                                      : const Color(0xFF1F2937),
                                  decoration: done
                                      ? TextDecoration.lineThrough
                                      : null,
                                ),
                              ),
                              if (item['deadline'] != null &&
                                  (item['deadline'] as String).isNotEmpty)
                                Text('마감: ${item['deadline']}',
                                    style: const TextStyle(
                                        fontSize: 11,
                                        color: Color(0xFF9CA3AF))),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

/* ──────── 학습 로드맵 탭 (진행 체크 포함) ──────── */

class _RoadmapTab extends StatefulWidget {
  const _RoadmapTab();
  @override
  State<_RoadmapTab> createState() => _RoadmapTabState();
}

class _RoadmapTabState extends State<_RoadmapTab> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _roadmaps = [];

  static const _timingLabels = {
    'T1': '고1 1학기',
    'T2': '고1 2학기',
    'T3': '고2 1학기',
    'T4': '고2 2학기',
  };

  static const _trackColors = {
    'academic': Color(0xFF3B82F6),
    'naesin': Color(0xFF16A34A),
    'mock_prep': Color(0xFFF97316),
    'habit': Color(0xFF8B5CF6),
  };

  static const _trackLabels = {
    'academic': '교과 학습',
    'naesin': '내신 전략',
    'mock_prep': '수능·모의',
    'habit': '학습 습관',
  };

  @override
  void initState() {
    super.initState();
    _loadRoadmaps();
  }

  Future<void> _loadRoadmaps() async {
    setState(() => _isLoading = true);
    try {
      final surveys = await ApiService.get(
          '/consultation-surveys?status=submitted') as Map<String, dynamic>;
      final items = (surveys['items'] ?? []) as List;
      final roadmaps = <Map<String, dynamic>>[];
      for (final s in items) {
        try {
          final rm = await ApiService.get(
              '/consultation-surveys/${s['id']}/roadmap') as Map<String, dynamic>;
          final roadmap = rm['roadmap'] as Map<String, dynamic>?;
          if (roadmap != null && (roadmap['phases'] as List?)?.isNotEmpty == true) {
            roadmaps.add({
              'survey_id': s['id'],
              'timing': s['timing'] ?? '',
              'phases': roadmap['phases'] ?? [],
              'tracks': roadmap['tracks'] ?? [],
              'overrides': rm['overrides'],
              'progress': Map<String, dynamic>.from(rm['progress'] ?? {}),
            });
          }
        } catch (_) {}
      }
      setState(() => _roadmaps = roadmaps);
    } catch (_) {} finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _toggleProgress(int rmIndex, String phaseKey, String trackKey, bool checked) async {
    // Optimistic update
    setState(() {
      final progress = _roadmaps[rmIndex]['progress'] as Map<String, dynamic>;
      if (!progress.containsKey(phaseKey)) {
        progress[phaseKey] = <String, dynamic>{};
      }
      (progress[phaseKey] as Map<String, dynamic>)[trackKey] = checked;
    });

    try {
      final surveyId = _roadmaps[rmIndex]['survey_id'];
      await ApiService.patch(
        '/consultation-surveys/$surveyId/roadmap-progress',
        {
          'progress': {
            phaseKey: {trackKey: checked}
          }
        },
      );
    } catch (_) {
      // Revert on error
      setState(() {
        final progress = _roadmaps[rmIndex]['progress'] as Map<String, dynamic>;
        (progress[phaseKey] as Map<String, dynamic>)[trackKey] = !checked;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());

    if (_roadmaps.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Icon(Icons.map_outlined, size: 56, color: Color(0xFFD1D5DB)),
            SizedBox(height: 16),
            Text('학습 로드맵이 없습니다',
                style: TextStyle(color: Color(0xFF6B7280))),
            SizedBox(height: 4),
            Text('사전 설문 제출 후 자동으로 생성됩니다',
                style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadRoadmaps,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 트랙 범례
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: _trackLabels.entries.map((e) {
              final color = _trackColors[e.key] ?? const Color(0xFF6B7280);
              return Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                          color: color, borderRadius: BorderRadius.circular(2))),
                  const SizedBox(width: 4),
                  Text(e.value,
                      style:
                          const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                ],
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          ..._roadmaps.asMap().entries.map((rmEntry) {
            final rmIndex = rmEntry.key;
            final rm = rmEntry.value;
            final timing = _timingLabels[rm['timing']] ?? rm['timing'];
            final phases = rm['phases'] as List;
            final overrides = rm['overrides'] as Map<String, dynamic>?;
            final progress = rm['progress'] as Map<String, dynamic>;

            // Calculate progress
            int totalItems = 0;
            int checkedItems = 0;
            for (int pi = 0; pi < phases.length; pi++) {
              final phase = phases[pi] as Map<String, dynamic>;
              final matrix = (overrides != null && overrides['matrix'] != null)
                  ? (overrides['matrix'] as Map<String, dynamic>)[phase['key']]
                  : (phase['content'] as Map<String, dynamic>?);
              if (matrix != null) {
                for (final trackKey in _trackLabels.keys) {
                  if (matrix[trackKey] != null && (matrix[trackKey] as String).isNotEmpty) {
                    totalItems++;
                    final phaseKey = 'p$pi';
                    if (progress[phaseKey] is Map && (progress[phaseKey] as Map)[trackKey] == true) {
                      checkedItems++;
                    }
                  }
                }
              }
            }
            final pct = totalItems > 0 ? checkedItems / totalItems : 0.0;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(timing,
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700)),
                    const Spacer(),
                    Text('달성 ${(pct * 100).round()}%',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: pct >= 1.0
                                ? const Color(0xFF16A34A)
                                : const Color(0xFF3B82F6))),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: LinearProgressIndicator(
                    value: pct,
                    backgroundColor: const Color(0xFFE5E7EB),
                    valueColor: AlwaysStoppedAnimation(
                        pct >= 1.0
                            ? const Color(0xFF16A34A)
                            : const Color(0xFF3B82F6)),
                    minHeight: 4,
                  ),
                ),
                const SizedBox(height: 12),
                ...phases.asMap().entries.map((entry) {
                  final pi = entry.key;
                  final phase = entry.value as Map<String, dynamic>;
                  final phaseKey = 'p$pi';
                  final matrix = (overrides != null && overrides['matrix'] != null)
                      ? (overrides['matrix'] as Map<String, dynamic>)[phase['key']]
                      : (phase['content'] as Map<String, dynamic>?);

                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFE5E7EB)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(phase['label'] ?? '',
                            style: const TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w600)),
                        if (phase['theme'] != null) ...[
                          const SizedBox(height: 2),
                          Text(phase['theme'],
                              style: const TextStyle(
                                  fontSize: 12, color: Color(0xFF9CA3AF))),
                        ],
                        if (matrix != null) ...[
                          const SizedBox(height: 10),
                          ...(_trackLabels.entries.map((trackEntry) {
                            final content = matrix[trackEntry.key];
                            if (content == null ||
                                (content is String && content.isEmpty)) {
                              return const SizedBox.shrink();
                            }
                            final color = _trackColors[trackEntry.key] ??
                                const Color(0xFF6B7280);
                            final isChecked = progress[phaseKey] is Map &&
                                (progress[phaseKey] as Map)[trackEntry.key] == true;

                            return InkWell(
                              onTap: () => _toggleProgress(rmIndex, phaseKey, trackEntry.key, !isChecked),
                              child: Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    // Checkbox
                                    Container(
                                      width: 20,
                                      height: 20,
                                      margin: const EdgeInsets.only(top: 1, right: 8),
                                      decoration: BoxDecoration(
                                        color: isChecked ? const Color(0xFF16A34A) : Colors.transparent,
                                        border: Border.all(
                                          color: isChecked ? const Color(0xFF16A34A) : const Color(0xFFD1D5DB),
                                          width: 2,
                                        ),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: isChecked
                                          ? const Icon(Icons.check, size: 14, color: Colors.white)
                                          : null,
                                    ),
                                    // Track color bar
                                    Container(
                                      width: 4,
                                      height: 16,
                                      margin: const EdgeInsets.only(top: 2),
                                      decoration: BoxDecoration(
                                          color: color,
                                          borderRadius:
                                              BorderRadius.circular(2)),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        content.toString(),
                                        style: TextStyle(
                                            fontSize: 13,
                                            color: isChecked
                                                ? const Color(0xFF9CA3AF)
                                                : const Color(0xFF374151),
                                            decoration: isChecked
                                                ? TextDecoration.lineThrough
                                                : null,
                                            height: 1.5),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          })),
                        ],
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 12),
              ],
            );
          }),
        ],
      ),
    );
  }
}

/* ──────── 변화 추적 탭 ──────── */

class _DeltaTab extends StatefulWidget {
  const _DeltaTab();
  @override
  State<_DeltaTab> createState() => _DeltaTabState();
}

class _DeltaTabState extends State<_DeltaTab> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _deltas = [];

  static const _timingLabels = {
    'T1': '고1 1학기',
    'T2': '고1 2학기',
    'T3': '고2 1학기',
    'T4': '고2 2학기',
  };

  static const _studyMethodLabels = {
    '수업전예습': '수업 전 예습',
    '당일복습': '당일 복습',
    '교과서정독': '교과서 정독',
    '필기요약정리': '필기·요약 정리',
    '인강수강': '인강 수강',
    '문제집반복': '문제집 반복',
    '기출분석': '기출 분석',
    '개념서회독': '개념서 회독',
    '요약노트': '요약 노트',
    '기타': '기타',
  };

  static const _engagementLabels = {
    '거의안들음': '거의 안 들음',
    '듣기만함': '듣기만 함',
    '필기하며': '필기하며 수업',
    '적극참여': '적극 참여',
  };

  static const _satisfactionLabels = {
    '불만족': '불만족',
    '보통': '보통',
    '만족': '만족',
  };

  @override
  void initState() {
    super.initState();
    _loadDeltas();
  }

  Future<void> _loadDeltas() async {
    setState(() => _isLoading = true);
    try {
      final surveys = await ApiService.get(
          '/consultation-surveys?status=submitted') as Map<String, dynamic>;
      final items = (surveys['items'] ?? []) as List;
      final deltas = <Map<String, dynamic>>[];
      for (final s in items) {
        try {
          final data = await ApiService.get(
              '/consultation-surveys/${s['id']}/delta') as Map<String, dynamic>;
          if (data['has_previous'] == true) {
            deltas.add({
              'survey_id': s['id'],
              'timing': s['timing'] ?? '',
              'delta': data,
            });
          }
        } catch (_) {}
      }
      setState(() => _deltas = deltas);
    } catch (_) {} finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());

    if (_deltas.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Icon(Icons.trending_up, size: 56, color: Color(0xFFD1D5DB)),
            SizedBox(height: 16),
            Text('변화 추적 데이터가 없습니다',
                style: TextStyle(color: Color(0xFF6B7280))),
            SizedBox(height: 4),
            Text('2회 이상 설문 제출 시 이전 대비 변화를 확인할 수 있습니다',
                style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadDeltas,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: _deltas.map((d) {
          final delta = d['delta'] as Map<String, dynamic>;
          final diff = delta['diff'] as Map<String, dynamic>? ?? {};
          final studyChanges = delta['study_method_changes'] as Map<String, dynamic>?;
          final timing = _timingLabels[d['timing']] ?? d['timing'];
          final prevTiming = _timingLabels[delta['previous_timing']] ?? delta['previous_timing'] ?? '-';

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 요약 카드
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                        color: Colors.black.withOpacity(0.05),
                        blurRadius: 8,
                        offset: const Offset(0, 2)),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('$timing 변화 추적',
                            style: const TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w600)),
                        Text('이전: $prevTiming',
                            style: const TextStyle(
                                fontSize: 12, color: Color(0xFF9CA3AF))),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFF6FF),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        delta['summary'] ?? '',
                        style: const TextStyle(
                            fontSize: 13, color: Color(0xFF1E40AF)),
                      ),
                    ),
                  ],
                ),
              ),

              // 카테고리별 변경
              if (diff.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                          color: Colors.black.withOpacity(0.05),
                          blurRadius: 8,
                          offset: const Offset(0, 2)),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('카테고리별 변경 내역',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 10),
                      ...diff.entries.map((catEntry) {
                        final catId = catEntry.key;
                        final questions = catEntry.value as Map<String, dynamic>;
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              margin: const EdgeInsets.only(bottom: 6, top: 4),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEFF6FF),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(catId,
                                  style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF2563EB))),
                            ),
                            ...questions.entries.map((qEntry) {
                              final change =
                                  qEntry.value as Map<String, dynamic>;
                              final changeType =
                                  change['change_type'] as String? ?? '';
                              Color tagColor;
                              Color tagBg;
                              String tagLabel;
                              switch (changeType) {
                                case 'added':
                                  tagColor = const Color(0xFF16A34A);
                                  tagBg = const Color(0xFFF0FDF4);
                                  tagLabel = '신규';
                                  break;
                                case 'removed':
                                  tagColor = const Color(0xFFDC2626);
                                  tagBg = const Color(0xFFFEF2F2);
                                  tagLabel = '삭제';
                                  break;
                                case 'increased':
                                  tagColor = const Color(0xFFD97706);
                                  tagBg = const Color(0xFFFEF3C7);
                                  tagLabel = '증가';
                                  break;
                                case 'decreased':
                                  tagColor = const Color(0xFFD97706);
                                  tagBg = const Color(0xFFFEF3C7);
                                  tagLabel = '감소';
                                  break;
                                default:
                                  tagColor = const Color(0xFFD97706);
                                  tagBg = const Color(0xFFFEF3C7);
                                  tagLabel = '변경';
                              }
                              return Container(
                                margin: const EdgeInsets.only(
                                    left: 8, bottom: 4),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 6),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFAFAFA),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                      color: const Color(0xFFE5E7EB)),
                                ),
                                child: Row(
                                  children: [
                                    Text(qEntry.key,
                                        style: const TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
                                            color: Color(0xFF6B7280))),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 1),
                                      decoration: BoxDecoration(
                                        color: tagBg,
                                        borderRadius:
                                            BorderRadius.circular(4),
                                      ),
                                      child: Text(tagLabel,
                                          style: TextStyle(
                                              fontSize: 11,
                                              color: tagColor,
                                              fontWeight: FontWeight.w500)),
                                    ),
                                  ],
                                ),
                              );
                            }),
                            const SizedBox(height: 4),
                          ],
                        );
                      }),
                    ],
                  ),
                ),

              // D7 학습법 변화
              if (studyChanges != null &&
                  (studyChanges['subject_changes'] as List?)?.isNotEmpty == true)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                          color: Colors.black.withOpacity(0.05),
                          blurRadius: 8,
                          offset: const Offset(0, 2)),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('과목별 학습법 변화',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      Text(
                        '${studyChanges['total_subjects_changed']}개 과목에서 학습법이 변경되었습니다',
                        style: const TextStyle(
                            fontSize: 12, color: Color(0xFF9CA3AF)),
                      ),
                      const SizedBox(height: 12),
                      ...(studyChanges['subject_changes'] as List).map((sc) {
                        final changes =
                            sc['changes'] as Map<String, dynamic>;
                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFAFAFA),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                                color: const Color(0xFFE5E7EB)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(sc['subject'],
                                  style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600)),
                              const SizedBox(height: 8),
                              // 학습법 변경
                              if (changes['study_method'] != null) ...[
                                const Text('학습법 변경',
                                    style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        color: Color(0xFF6B7280))),
                                const SizedBox(height: 4),
                                Wrap(
                                  spacing: 4,
                                  runSpacing: 4,
                                  children: [
                                    ...(changes['study_method']['added']
                                            as List? ?? [])
                                        .map((m) => _ChangeTag(
                                            '+ ${_studyMethodLabels[m] ?? m}',
                                            const Color(0xFF16A34A),
                                            const Color(0xFFF0FDF4))),
                                    ...(changes['study_method']['removed']
                                            as List? ?? [])
                                        .map((m) => _ChangeTag(
                                            '- ${_studyMethodLabels[m] ?? m}',
                                            const Color(0xFFDC2626),
                                            const Color(0xFFFEF2F2))),
                                  ],
                                ),
                                const SizedBox(height: 6),
                              ],
                              // 수업 참여도
                              if (changes['class_engagement'] != null)
                                _ChangeRow(
                                  '수업 참여',
                                  _engagementLabels[changes['class_engagement']['prev']] ??
                                      changes['class_engagement']['prev']?.toString() ?? '-',
                                  _engagementLabels[changes['class_engagement']['curr']] ??
                                      changes['class_engagement']['curr']?.toString() ?? '-',
                                ),
                              // 만족도
                              if (changes['satisfaction'] != null)
                                _ChangeRow(
                                  '만족도',
                                  _satisfactionLabels[changes['satisfaction']['prev']] ??
                                      changes['satisfaction']['prev']?.toString() ?? '-',
                                  _satisfactionLabels[changes['satisfaction']['curr']] ??
                                      changes['satisfaction']['curr']?.toString() ?? '-',
                                ),
                              // 교재
                              if (changes['main_textbook'] != null)
                                _ChangeRow(
                                  '교재',
                                  changes['main_textbook']['prev']?.toString() ?? '-',
                                  changes['main_textbook']['curr']?.toString() ?? '-',
                                ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

/* ──────── 공통 위젯 ──────── */

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(text,
        style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Color(0xFF6B7280)));
  }
}

class _ChangeTag extends StatelessWidget {
  final String text;
  final Color textColor;
  final Color bgColor;
  const _ChangeTag(this.text, this.textColor, this.bgColor);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(text,
          style: TextStyle(fontSize: 11, color: textColor)),
    );
  }
}

class _ChangeRow extends StatelessWidget {
  final String label;
  final String prev;
  final String curr;
  const _ChangeRow(this.label, this.prev, this.curr);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(
            width: 70,
            child: Text(label,
                style: const TextStyle(
                    fontSize: 12, color: Color(0xFF6B7280))),
          ),
          Text(prev,
              style: const TextStyle(
                  fontSize: 12, color: Color(0xFF9CA3AF))),
          const Text(' → ',
              style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          Text(curr,
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF374151))),
        ],
      ),
    );
  }
}
