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
    _tabController = TabController(length: 5, vsync: this);
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
            Tab(text: '과목 경쟁력'),
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
          _CompetitivenessTab(),
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

  Future<void> _toggleActionItem(int planIndex, int itemIndex, bool completed) async {
    // Optimistic update
    setState(() {
      final items = _plans[planIndex]['items'] as List;
      items[itemIndex] = Map<String, dynamic>.from(items[itemIndex])
        ..['completed'] = completed;
    });

    try {
      final surveyId = _plans[planIndex]['survey_id'];
      await ApiService.patch(
        '/consultation-surveys/$surveyId/action-plan-progress',
        {'item_index': itemIndex, 'completed': completed},
      );
    } catch (_) {
      // Revert on error
      setState(() {
        final items = _plans[planIndex]['items'] as List;
        items[itemIndex] = Map<String, dynamic>.from(items[itemIndex])
          ..['completed'] = !completed;
      });
    }
  }

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
                ...items.asMap().entries.map((entry) {
                  final itemIndex = entry.key;
                  final item = entry.value;
                  final done = item['completed'] == true;
                  final planIndex = _plans.indexOf(plan);
                  return InkWell(
                    onTap: () => _toggleActionItem(planIndex, itemIndex, !done),
                    borderRadius: BorderRadius.circular(8),
                    child: Padding(
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
  List<Map<String, dynamic>> _changeReports = [];
  bool _reportLoading = false;

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
      // Also load change reports
      _loadChangeReports(items);
    } catch (_) {} finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadChangeReports(List items) async {
    setState(() => _reportLoading = true);
    try {
      final reports = <Map<String, dynamic>>[];
      for (final s in items) {
        try {
          final data = await ApiService.get(
              '/consultation-surveys/${s['id']}/change-report') as Map<String, dynamic>;
          if (data['has_previous'] == true) {
            reports.add({
              'survey_id': s['id'],
              'timing': s['timing'] ?? '',
              'report': data,
            });
          }
        } catch (_) {}
      }
      setState(() => _changeReports = reports);
    } catch (_) {} finally {
      setState(() => _reportLoading = false);
    }
  }

  Color _dirColor(String direction) {
    switch (direction) {
      case '개선': return const Color(0xFF16A34A);
      case '하락': return const Color(0xFFDC2626);
      case '혼재': return const Color(0xFFD97706);
      default: return const Color(0xFF6B7280);
    }
  }

  Color _dirBg(String direction) {
    switch (direction) {
      case '개선': return const Color(0xFFF0FDF4);
      case '하락': return const Color(0xFFFEF2F2);
      case '혼재': return const Color(0xFFFEF3C7);
      default: return const Color(0xFFF3F4F6);
    }
  }

  String _dirIcon(String direction) {
    switch (direction) {
      case '개선': return '\u25B2';
      case '하락': return '\u25BC';
      default: return '\u25AC';
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
        children: [
          ..._deltas.map((d) {
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
        }),

          // ─── 종합 변화 리포트 ───
          if (_reportLoading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            ),

          if (!_reportLoading && _changeReports.isNotEmpty) ...[
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.only(bottom: 12),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: Color(0xFF3B82F6), width: 2)),
              ),
              child: const Text('종합 변화 리포트',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF1F2937))),
            ),
            const SizedBox(height: 16),

            ..._changeReports.map((cr) {
              final report = cr['report'] as Map<String, dynamic>;
              final summary = report['summary'] as Map<String, dynamic>?;
              final grades = report['grades'] as Map<String, dynamic>?;
              final studyMethods = report['study_methods'] as Map<String, dynamic>?;
              final psych = report['psychology'] as Map<String, dynamic>?;
              final goals = report['goals'] as Map<String, dynamic>?;
              final timingLabel = _timingLabels[cr['timing']] ?? cr['timing'] ?? '현재';
              final prevTimingLabel = _timingLabels[report['previous_timing']] ?? report['previous_timing'] ?? '이전';

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 종합 요약
                  if (summary != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _dirColor(summary['overall_direction'] ?? '유지').withOpacity(0.2), width: 2),
                        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                summary['icon'] == 'up' ? '\uD83D\uDCC8' : summary['icon'] == 'down' ? '\uD83D\uDCC9' : summary['icon'] == 'mixed' ? '\uD83D\uDD04' : '\u2796',
                                style: const TextStyle(fontSize: 24),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('$prevTimingLabel → $timingLabel 종합 변화',
                                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                                    Text(summary['summary'] ?? '',
                                        style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                                  ],
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: _dirBg(summary['overall_direction'] ?? '유지'),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  '${_dirIcon(summary['overall_direction'] ?? '유지')} ${summary['overall_direction'] ?? '유지'}',
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _dirColor(summary['overall_direction'] ?? '유지')),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          if (summary['section_directions'] is Map)
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: (summary['section_directions'] as Map<String, dynamic>).entries.map((e) {
                                return Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: _dirBg(e.value ?? '유지'),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    '${e.key} ${_dirIcon(e.value ?? '유지')} ${e.value ?? '유지'}',
                                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: _dirColor(e.value ?? '유지')),
                                  ),
                                );
                              }).toList(),
                            ),
                        ],
                      ),
                    ),

                  // 성적 변화
                  if (grades != null && (grades['changes'] as List?)?.isNotEmpty == true)
                    _ReportSectionCard(
                      icon: '\uD83D\uDCCA',
                      title: '성적 변화',
                      direction: grades['direction'] ?? '유지',
                      summary: grades['summary'] ?? '',
                      dirColor: _dirColor,
                      dirBg: _dirBg,
                      dirIcon: _dirIcon,
                      child: Column(
                        children: (grades['changes'] as List).map<Widget>((g) {
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Row(
                              children: [
                                SizedBox(width: 50, child: Text(g['semester'] ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)))),
                                Expanded(child: Text(g['subject'] ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500))),
                                Text('${g['prev_grade'] ?? '-'}', style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
                                const Text(' → ', style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
                                Text('${g['curr_grade'] ?? '-'}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: _dirBg(g['direction'] ?? '유지'),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(_dirIcon(g['direction'] ?? '유지'), style: TextStyle(fontSize: 9, color: _dirColor(g['direction'] ?? '유지'))),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                      ),
                    ),

                  // 학습법 변화
                  if (studyMethods != null && (studyMethods['subjects'] as List?)?.isNotEmpty == true)
                    _ReportSectionCard(
                      icon: '\uD83D\uDCDD',
                      title: '학습 방법 변화',
                      direction: studyMethods['direction'] ?? '유지',
                      summary: studyMethods['summary'] ?? '',
                      dirColor: _dirColor,
                      dirBg: _dirBg,
                      dirIcon: _dirIcon,
                      child: Column(
                        children: (studyMethods['subjects'] as List).map<Widget>((subj) {
                          return Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFAFAFA),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: const Color(0xFFE5E7EB)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(subj['subject'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                                const SizedBox(height: 6),
                                if ((subj['method_added'] as List?)?.isNotEmpty == true || (subj['method_removed'] as List?)?.isNotEmpty == true)
                                  Wrap(
                                    spacing: 4,
                                    runSpacing: 4,
                                    children: [
                                      ...(subj['method_added'] as List? ?? []).map((m) =>
                                        _ChangeTag('+ $m', const Color(0xFF16A34A), const Color(0xFFF0FDF4))),
                                      ...(subj['method_removed'] as List? ?? []).map((m) =>
                                        _ChangeTag('- $m', const Color(0xFFDC2626), const Color(0xFFFEF2F2))),
                                    ],
                                  ),
                                if (subj['engagement'] is Map) ...[
                                  const SizedBox(height: 4),
                                  _ChangeRow(
                                    '수업 참여',
                                    subj['engagement']['prev']?.toString() ?? '-',
                                    subj['engagement']['curr']?.toString() ?? '-',
                                  ),
                                ],
                                if (subj['satisfaction'] is Map)
                                  _ChangeRow(
                                    '만족도',
                                    subj['satisfaction']['prev']?.toString() ?? '-',
                                    subj['satisfaction']['curr']?.toString() ?? '-',
                                  ),
                                if (subj['textbook'] is Map)
                                  _ChangeRow(
                                    '교재',
                                    subj['textbook']['prev']?.toString() ?? '-',
                                    subj['textbook']['curr']?.toString() ?? '-',
                                  ),
                              ],
                            ),
                          );
                        }).toList(),
                      ),
                    ),

                  // 심리 컨디션 변화
                  if (psych != null && (psych['items'] as List?)?.isNotEmpty == true)
                    _ReportSectionCard(
                      icon: '\uD83E\uDDE0',
                      title: '심리 · 컨디션 변화',
                      direction: psych['direction'] ?? '유지',
                      summary: psych['summary'] ?? '',
                      dirColor: _dirColor,
                      dirBg: _dirBg,
                      dirIcon: _dirIcon,
                      child: Column(
                        children: (psych['items'] as List).map<Widget>((item) {
                          final dir = item['direction'] ?? '유지';
                          return Container(
                            margin: const EdgeInsets.only(bottom: 4),
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFAFAFA),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: const Color(0xFFE5E7EB)),
                            ),
                            child: Row(
                              children: [
                                SizedBox(
                                  width: 80,
                                  child: Text(item['label'] ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                                ),
                                Expanded(
                                  child: RichText(
                                    text: TextSpan(
                                      style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF)),
                                      children: [
                                        TextSpan(text: '${item['prev'] ?? '-'} → '),
                                        TextSpan(text: '${item['curr'] ?? '-'}', style: TextStyle(fontWeight: FontWeight.w600, color: _dirColor(dir))),
                                      ],
                                    ),
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                  decoration: BoxDecoration(color: _dirBg(dir), borderRadius: BorderRadius.circular(8)),
                                  child: Text('${_dirIcon(dir)} $dir', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: _dirColor(dir))),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                      ),
                    ),

                  // 목표 변화
                  if (goals != null && (goals['items'] as List?)?.isNotEmpty == true)
                    _ReportSectionCard(
                      icon: '\uD83C\uDFAF',
                      title: '목표 · 진로 변화',
                      direction: goals['direction'] ?? '유지',
                      summary: goals['summary'] ?? '',
                      dirColor: _dirColor,
                      dirBg: _dirBg,
                      dirIcon: _dirIcon,
                      child: Column(
                        children: (goals['items'] as List).map<Widget>((item) {
                          final prev = item['prev'];
                          final curr = item['curr'];
                          return Container(
                            margin: const EdgeInsets.only(bottom: 4),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFAFAFA),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: const Color(0xFFE5E7EB)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(item['label'] ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                                const SizedBox(height: 4),
                                RichText(
                                  text: TextSpan(
                                    style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                                    children: [
                                      TextSpan(text: '${prev is Map ? prev.toString() : (prev ?? '-')} → '),
                                      TextSpan(
                                        text: curr is Map ? curr.toString() : (curr ?? '-').toString(),
                                        style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF374151)),
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

                  const SizedBox(height: 24),
                ],
              );
            }),
          ],
        ],
      ),
    );
  }
}

/* ──────── 리포트 섹션 카드 위젯 ──────── */

class _ReportSectionCard extends StatelessWidget {
  final String icon;
  final String title;
  final String direction;
  final String summary;
  final Color Function(String) dirColor;
  final Color Function(String) dirBg;
  final String Function(String) dirIcon;
  final Widget child;

  const _ReportSectionCard({
    required this.icon,
    required this.title,
    required this.direction,
    required this.summary,
    required this.dirColor,
    required this.dirBg,
    required this.dirIcon,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(icon, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: 8),
              Expanded(child: Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: dirBg(direction), borderRadius: BorderRadius.circular(10)),
                child: Text('${dirIcon(direction)} $direction', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: dirColor(direction))),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(summary, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}


/* ──────── 과목 경쟁력 탭 ──────── */

class _CompetitivenessTab extends StatefulWidget {
  const _CompetitivenessTab();
  @override
  State<_CompetitivenessTab> createState() => _CompetitivenessTabState();
}

class _CompetitivenessTabState extends State<_CompetitivenessTab> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _compData = [];

  static const _timingLabels = {
    'T1': '고1 1학기',
    'T2': '고1 2학기',
    'T3': '고2 1학기',
    'T4': '고2 2학기',
  };

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final surveys = await ApiService.get(
          '/consultation-surveys?status=submitted') as Map<String, dynamic>;
      final items = (surveys['items'] ?? []) as List;
      final results = <Map<String, dynamic>>[];
      for (final s in items) {
        try {
          final data = await ApiService.get(
                  '/consultation-surveys/${s['id']}/subject-competitiveness')
              as Map<String, dynamic>;
          if (data['subjects'] != null &&
              (data['subjects'] as Map).isNotEmpty) {
            results.add({
              'survey_id': s['id'],
              'timing': s['timing'] ?? '',
              'data': data,
            });
          }
        } catch (_) {}
      }
      setState(() => _compData = results);
    } catch (_) {
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Color _gradeBarColor(dynamic gap) {
    if (gap == null) return const Color(0xFF94A3B8);
    final g = (gap is num) ? gap.toDouble() : 0.0;
    if (g <= 0) return const Color(0xFF16A34A);
    if (g <= 1) return const Color(0xFFEAB308);
    return const Color(0xFFDC2626);
  }

  Color _gradeLabelColor(dynamic gap) {
    if (gap == null) return const Color(0xFF6B7280);
    final g = (gap is num) ? gap.toDouble() : 0.0;
    if (g <= 0) return const Color(0xFF166534);
    if (g <= 1) return const Color(0xFFA16207);
    return const Color(0xFF991B1B);
  }

  String _trendSymbol(String? trend) {
    switch (trend) {
      case 'improving':
        return '↑';
      case 'declining':
        return '↓';
      case 'stable':
        return '→';
      default:
        return '-';
    }
  }

  Color _trendColor(String? trend) {
    switch (trend) {
      case 'improving':
        return const Color(0xFF16A34A);
      case 'declining':
        return const Color(0xFFDC2626);
      case 'stable':
        return const Color(0xFF6B7280);
      default:
        return const Color(0xFF9CA3AF);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());

    if (_compData.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Icon(Icons.bar_chart_outlined, size: 56, color: Color(0xFFD1D5DB)),
            SizedBox(height: 16),
            Text('과목별 경쟁력 데이터가 없습니���',
                style: TextStyle(color: Color(0xFF6B7280))),
            SizedBox(height: 4),
            Text('설문에서 내신 성적과 모의고사 데이터를 입력하면 분석됩니다',
                style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: _compData.map((cd) {
          final data = cd['data'] as Map<String, dynamic>;
          final subjects = data['subjects'] as Map<String, dynamic>? ?? {};
          final strategy = data['strategy'] as Map<String, dynamic>? ?? {};
          final targetGrade = data['target_grade'];
          final targetLevel = data['target_level'] as String?;
          final weakestSubjects =
              (data['weakest_subjects'] as List?)?.cast<String>() ?? [];
          final strongestSubjects =
              (data['strongest_subjects'] as List?)?.cast<String>() ?? [];
          final weaknessTypes =
              data['weakness_types'] as Map<String, dynamic>? ?? {};
          final timing = _timingLabels[cd['timing']] ?? cd['timing'];

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('$timing 과목별 경쟁력 분석',
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              if (targetLevel != null)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEFF6FF),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '목표: $targetLevel (환산 목표등급 ${targetGrade}등급)',
                    style:
                        const TextStyle(fontSize: 13, color: Color(0xFF1E40AF)),
                  ),
                ),
              // Subject grade bars card
              Container(
                padding: const EdgeInsets.all(16),
                margin: const EdgeInsets.only(bottom: 12),
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
                    const Text('과목별 내신 등급',
                        style: TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 12),
                    ...subjects.entries.map((entry) {
                      final subj = entry.value as Map<String, dynamic>;
                      final currentGrade = subj['current_grade'] as num?;
                      if (currentGrade == null) return const SizedBox.shrink();
                      final gap = subj['gap'];
                      final barColor = _gradeBarColor(gap);
                      final labelColor = _gradeLabelColor(gap);
                      final barPct =
                          ((5 - currentGrade + 1) / 5).clamp(0.05, 1.0);
                      final withinPM1 = subj['within_plus_minus_1'] == true;
                      final mockCurrent = subj['mock_current'] as num?;
                      final trend = subj['trend'] as String?;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [
                              Text(subj['name'] ?? '',
                                  style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500)),
                              const SizedBox(width: 4),
                              Text(_trendSymbol(trend),
                                  style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: _trendColor(trend))),
                              if (withinPM1) ...[
                                const SizedBox(width: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 4, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFEF3C7),
                                    borderRadius: BorderRadius.circular(3),
                                  ),
                                  child: const Text('+-1',
                                      style: TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          color: Color(0xFF92400E))),
                                ),
                              ],
                              const Spacer(),
                              Text('${currentGrade}등급',
                                  style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: labelColor)),
                              if (gap != null) ...[
                                const SizedBox(width: 4),
                                Text(
                                    '(${(gap as num) > 0 ? "+" : ""}$gap)',
                                    style: const TextStyle(
                                        fontSize: 11,
                                        color: Color(0xFF9CA3AF))),
                              ],
                            ]),
                            const SizedBox(height: 4),
                            LayoutBuilder(builder: (context, constraints) {
                              final maxW = constraints.maxWidth;
                              return Stack(children: [
                                Container(
                                    height: 16,
                                    decoration: BoxDecoration(
                                        color: const Color(0xFFF1F5F9),
                                        borderRadius:
                                            BorderRadius.circular(4))),
                                Container(
                                    height: 16,
                                    width: maxW * barPct.toDouble(),
                                    decoration: BoxDecoration(
                                        color: barColor,
                                        borderRadius:
                                            BorderRadius.circular(4))),
                                if (targetGrade != null)
                                  Positioned(
                                    left: (maxW *
                                            ((5 - (targetGrade as num) + 1) /
                                                5))
                                        .clamp(0.0, maxW - 2),
                                    top: 0,
                                    child: Container(
                                        width: 2,
                                        height: 16,
                                        color: Colors.black54),
                                  ),
                              ]);
                            }),
                            if (mockCurrent != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  '모의: ${mockCurrent}등급 (내신 대비 ${mockCurrent < currentGrade ? "우위" : mockCurrent > currentGrade ? "열위" : "동일"})',
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: mockCurrent < currentGrade
                                          ? const Color(0xFF16A34A)
                                          : mockCurrent > currentGrade
                                              ? const Color(0xFFDC2626)
                                              : const Color(0xFF6B7280)),
                                ),
                              ),
                          ],
                        ),
                      );
                    }),
                    if (targetGrade != null) ...[
                      const Divider(),
                      Row(children: [
                        Container(
                            width: 12, height: 2, color: Colors.black54),
                        const SizedBox(width: 4),
                        Text('목표 등급 ($targetGrade)',
                            style: const TextStyle(
                                fontSize: 11, color: Color(0xFF9CA3AF))),
                      ]),
                    ],
                  ],
                ),
              ),
              // C2 weakness types
              if (weaknessTypes.isNotEmpty)
                _WeaknessTypesCard(
                    weaknessTypes: weaknessTypes, subjects: subjects),
              // D6 self-diagnosis
              if (weakestSubjects.isNotEmpty || strongestSubjects.isNotEmpty)
                _SelfDiagnosisCard(
                    weakestSubjects: weakestSubjects,
                    strongestSubjects: strongestSubjects),
              // Strategy cards
              ..._buildStrategyCards(strategy),
              const SizedBox(height: 20),
            ],
          );
        }).toList(),
      ),
    );
  }

  List<Widget> _buildStrategyCards(Map<String, dynamic> strategy) {
    final widgets = <Widget>[];
    final focus = (strategy['focus'] as List?) ?? [];
    if (focus.isNotEmpty) {
      widgets.add(_StrategyCard(
          title: '집중 공략 과목',
          icon: Icons.gps_fixed,
          borderColor: const Color(0xFF2563EB),
          bgColor: const Color(0xFFEFF6FF),
          labelColor: const Color(0xFF1E40AF),
          items: focus.cast<Map<String, dynamic>>()));
    }
    final maintain = (strategy['maintain'] as List?) ?? [];
    if (maintain.isNotEmpty) {
      widgets.add(_StrategyCard(
          title: '유지 관리 과목',
          icon: Icons.check_circle_outline,
          borderColor: const Color(0xFF16A34A),
          bgColor: const Color(0xFFF0FDF4),
          labelColor: const Color(0xFF166534),
          items: maintain.cast<Map<String, dynamic>>()));
    }
    final consider = (strategy['consider'] as List?) ?? [];
    if (consider.isNotEmpty) {
      widgets.add(_StrategyCard(
          title: '전략적 시간 배분 고려',
          icon: Icons.balance,
          borderColor: const Color(0xFF9CA3AF),
          bgColor: const Color(0xFFF9FAFB),
          labelColor: const Color(0xFF6B7280),
          items: consider.cast<Map<String, dynamic>>()));
    }
    return widgets;
  }
}

class _WeaknessTypesCard extends StatelessWidget {
  final Map<String, dynamic> weaknessTypes;
  final Map<String, dynamic> subjects;
  const _WeaknessTypesCard(
      {required this.weaknessTypes, required this.subjects});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.only(bottom: 12),
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
          const Text('모의고사 취약 유형',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          ...weaknessTypes.entries.map((entry) {
            final subjName =
                (subjects[entry.key] as Map?)?['name'] ?? entry.key;
            final types = (entry.value as List?)?.cast<String>() ?? [];
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFFECACA)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(subjName,
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF991B1B))),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 4,
                    runSpacing: 4,
                    children: types
                        .map((t) => Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                  color: const Color(0xFFFEE2E2),
                                  borderRadius: BorderRadius.circular(4)),
                              child: Text(t,
                                  style: const TextStyle(
                                      fontSize: 11, color: Color(0xFFB91C1C))),
                            ))
                        .toList(),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _SelfDiagnosisCard extends StatelessWidget {
  final List<String> weakestSubjects;
  final List<String> strongestSubjects;
  const _SelfDiagnosisCard(
      {required this.weakestSubjects, required this.strongestSubjects});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.only(bottom: 12),
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
          const Text('자가 진단',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          if (weakestSubjects.isNotEmpty) ...[
            Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 4,
                runSpacing: 4,
                children: [
                  const Text('가장 어려운 과목: ',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFFDC2626))),
                  ...weakestSubjects.map((s) => Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                          color: const Color(0xFFFEF2F2),
                          borderRadius: BorderRadius.circular(4)),
                      child: Text(s,
                          style: const TextStyle(
                              fontSize: 12, color: Color(0xFFB91C1C))))),
                ]),
            const SizedBox(height: 8),
          ],
          if (strongestSubjects.isNotEmpty)
            Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 4,
                runSpacing: 4,
                children: [
                  const Text('가장 자신있는 과목: ',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF16A34A))),
                  ...strongestSubjects.map((s) => Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                          color: const Color(0xFFF0FDF4),
                          borderRadius: BorderRadius.circular(4)),
                      child: Text(s,
                          style: const TextStyle(
                              fontSize: 12, color: Color(0xFF166534))))),
                ]),
        ],
      ),
    );
  }
}

class _StrategyCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color borderColor;
  final Color bgColor;
  final Color labelColor;
  final List<Map<String, dynamic>> items;

  const _StrategyCard({
    required this.title,
    required this.icon,
    required this.borderColor,
    required this.bgColor,
    required this.labelColor,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border(left: BorderSide(color: borderColor, width: 4)),
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
          Row(children: [
            Icon(icon, size: 18, color: borderColor),
            const SizedBox(width: 6),
            Text(title,
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: borderColor)),
          ]),
          const SizedBox(height: 10),
          ...items.map((item) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                  color: bgColor, borderRadius: BorderRadius.circular(8)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(item['name'] ?? '',
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: labelColor)),
                        if (item['current_grade'] != null &&
                            item['target_grade'] != null)
                          Text(
                              '${item['current_grade']}등급 → ${item['target_grade']}등급',
                              style:
                                  TextStyle(fontSize: 11, color: labelColor)),
                      ]),
                  if (item['tip'] != null) ...[
                    const SizedBox(height: 4),
                    Text(item['tip'],
                        style: TextStyle(
                            fontSize: 12, color: labelColor, height: 1.5)),
                  ],
                ],
              ))),
        ],
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
