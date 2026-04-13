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
        title: const Text('상담 관리'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(0xFF3B82F6),
          unselectedLabelColor: const Color(0xFF9CA3AF),
          indicatorColor: const Color(0xFF3B82F6),
          labelStyle:
              const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          tabs: const [
            Tab(text: '상담 기록'),
            Tab(text: '액션 플랜'),
            Tab(text: '학습 로드맵'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _NotesTab(),
          _ActionPlanTab(),
          _RoadmapTab(),
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

/* ──────── 학습 로드맵 탭 ──────── */

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
              'timing': s['timing'] ?? '',
              'phases': roadmap['phases'] ?? [],
              'tracks': roadmap['tracks'] ?? [],
              'overrides': rm['overrides'],
            });
          }
        } catch (_) {}
      }
      setState(() => _roadmaps = roadmaps);
    } catch (_) {} finally {
      setState(() => _isLoading = false);
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
          ..._roadmaps.map((rm) {
            final timing = _timingLabels[rm['timing']] ?? rm['timing'];
            final phases = rm['phases'] as List;
            final overrides = rm['overrides'] as Map<String, dynamic>?;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(timing,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                ...phases.asMap().entries.map((entry) {
                  final phase = entry.value as Map<String, dynamic>;
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
                                (content is String && content.isEmpty))
                              return const SizedBox.shrink();
                            final color = _trackColors[trackEntry.key] ??
                                const Color(0xFF6B7280);
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
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
                                      style: const TextStyle(
                                          fontSize: 13,
                                          color: Color(0xFF374151),
                                          height: 1.5),
                                    ),
                                  ),
                                ],
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
