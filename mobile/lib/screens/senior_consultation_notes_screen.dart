import 'package:flutter/material.dart';
import '../models/senior_consultation_note.dart';
import '../services/api_service.dart';

class SeniorConsultationNotesScreen extends StatefulWidget {
  const SeniorConsultationNotesScreen({super.key});

  @override
  State<SeniorConsultationNotesScreen> createState() =>
      _SeniorConsultationNotesScreenState();
}

class _SeniorConsultationNotesScreenState
    extends State<SeniorConsultationNotesScreen> {
  List<SeniorConsultationNote> _notes = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadNotes();
  }

  Future<void> _loadNotes() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiService.get('/senior-notes');
      final items = res as List;
      setState(() => _notes =
          items.map((e) => SeniorConsultationNote.fromJson(e)).toList());
    } catch (_) {
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('선배 상담 기록')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadNotes,
              child: _notes.isEmpty
                  ? ListView(children: [
                      SizedBox(
                        height: MediaQuery.of(context).size.height * 0.5,
                        child: const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.school_outlined,
                                size: 56, color: Color(0xFFD1D5DB)),
                            SizedBox(height: 16),
                            Text('공개된 선배 상담 기록이 없습니다',
                                style: TextStyle(color: Color(0xFF6B7280))),
                            SizedBox(height: 4),
                            Text('선배 상담 후 검토를 거쳐 공개됩니다',
                                style: TextStyle(
                                    fontSize: 13, color: Color(0xFF9CA3AF))),
                          ],
                        ),
                      ),
                    ])
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _notes.length,
                      itemBuilder: (context, index) =>
                          _buildNoteCard(_notes[index]),
                    ),
            ),
    );
  }

  Widget _buildNoteCard(SeniorConsultationNote note) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 헤더
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFFF5F3FF), Color(0xFFEDE9FE)],
              ),
              borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFF7C3AED),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(note.displayTiming,
                        style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: Colors.white)),
                  ),
                  const SizedBox(width: 8),
                  const Text('선배 상담',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF5B21B6))),
                ]),
                Text(
                  '${_formatDate(note.consultationDate ?? '')}${note.seniorName != null ? ' · ${note.seniorName} 선배' : ''}',
                  style: const TextStyle(
                      fontSize: 12, color: Color(0xFF6B7280)),
                ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 핵심 주제
                if (note.coreTopics.isNotEmpty) ...[
                  _sectionTitle('다룬 주제'),
                  ...note.coreTopics
                      .map((t) => _buildCoreTopic(t)),
                  const SizedBox(height: 16),
                ],

                // 질의응답
                if (note.studentQuestions != null &&
                    note.studentQuestions!.isNotEmpty) ...[
                  _sectionTitle('질의응답'),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF9FAFB),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('내 질문: ${note.studentQuestions}',
                            style: const TextStyle(fontSize: 13)),
                        if (note.seniorAnswers != null) ...[
                          const SizedBox(height: 8),
                          const Divider(height: 1),
                          const SizedBox(height: 8),
                          Text('선배 답변: ${note.seniorAnswers}',
                              style: const TextStyle(
                                  fontSize: 13, color: Color(0xFF6B7280))),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // 실천 사항
                if (note.actionItems.isNotEmpty) ...[
                  _sectionTitle('선배가 제안한 실천 사항'),
                  ...note.actionItems.map((a) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(children: [
                          Container(
                            width: 24,
                            height: 24,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: a.priority == '상'
                                  ? const Color(0xFFFEE2E2)
                                  : a.priority == '하'
                                      ? const Color(0xFFDBEAFE)
                                      : const Color(0xFFFEF3C7),
                            ),
                            child: Text(a.priority,
                                style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: a.priority == '상'
                                        ? const Color(0xFF991B1B)
                                        : a.priority == '하'
                                            ? const Color(0xFF1E40AF)
                                            : const Color(0xFF92400E))),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                              child: Text(a.action,
                                  style: const TextStyle(fontSize: 13))),
                        ]),
                      )),
                  const SizedBox(height: 16),
                ],

                // 다음 확인 사항
                if (note.nextCheckpoints.isNotEmpty) ...[
                  _sectionTitle('다음에 확인할 사항'),
                  ...note.nextCheckpoints.map((c) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text('· ${c.checkpoint}',
                            style: const TextStyle(
                                fontSize: 13, color: Color(0xFF6B7280))),
                      )),
                  const SizedBox(height: 16),
                ],

                // 학생 상태
                if (note.studentMood != null || note.studyAttitude != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FDF4),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('상담 시 나의 상태',
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF166534))),
                        const SizedBox(height: 6),
                        Row(children: [
                          if (note.studentMood != null)
                            Text('분위기: ${note.studentMood}  ',
                                style: const TextStyle(fontSize: 13)),
                          if (note.studyAttitude != null)
                            Text('공부 태도: ${note.studyAttitude}',
                                style: const TextStyle(fontSize: 13)),
                        ]),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(title,
          style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Color(0xFF374151))),
    );
  }

  Widget _buildCoreTopic(CoreTopic topic) {
    final Color borderColor;
    final Color bgColor;
    final Color badgeBg;
    final Color badgeText;

    switch (topic.progressStatus) {
      case '충분히 다룸':
        borderColor = const Color(0xFF10B981);
        bgColor = const Color(0xFFF0FDF4);
        badgeBg = const Color(0xFFD1FAE5);
        badgeText = const Color(0xFF065F46);
        break;
      case '간단히 다룸':
        borderColor = const Color(0xFFF59E0B);
        bgColor = const Color(0xFFFFFBEB);
        badgeBg = const Color(0xFFFEF3C7);
        badgeText = const Color(0xFF92400E);
        break;
      default:
        borderColor = const Color(0xFFD1D5DB);
        bgColor = const Color(0xFFF9FAFB);
        badgeBg = const Color(0xFFF3F4F6);
        badgeText = const Color(0xFF6B7280);
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
        border: Border(left: BorderSide(color: borderColor, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(topic.topic,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w500)),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: badgeBg,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(topic.progressStatus,
                    style: TextStyle(
                        fontSize: 11, color: badgeText)),
              ),
            ],
          ),
          if (topic.keyContent.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(topic.keyContent,
                style: const TextStyle(
                    fontSize: 13, color: Color(0xFF6B7280), height: 1.5)),
          ],
        ],
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
