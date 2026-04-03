import 'package:flutter/material.dart';
import '../models/consultation_note.dart';
import '../services/api_service.dart';

class ConsultationNotesScreen extends StatefulWidget {
  const ConsultationNotesScreen({super.key});

  @override
  State<ConsultationNotesScreen> createState() => _ConsultationNotesScreenState();
}

class _ConsultationNotesScreenState extends State<ConsultationNotesScreen> {
  List<ConsultationNote> _notes = [];
  bool _isLoading = true;

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
      setState(() => _notes = items.map((e) => ConsultationNote.fromJson(e)).toList());
    } catch (_) {} finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('상담 기록')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadNotes,
              child: _notes.isEmpty
                  ? ListView(
                      children: [
                        SizedBox(
                          height: MediaQuery.of(context).size.height * 0.5,
                          child: const Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.note_alt_outlined, size: 56, color: Color(0xFFD1D5DB)),
                              SizedBox(height: 16),
                              Text('상담 기록이 없습니다',
                                  style: TextStyle(color: Color(0xFF6B7280))),
                            ],
                          ),
                        ),
                      ],
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _notes.length,
                      itemBuilder: (context, index) {
                        final note = _notes[index];
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
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFEFF6FF),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(note.categoryLabel,
                                        style: const TextStyle(
                                            fontSize: 12, color: Color(0xFF3B82F6), fontWeight: FontWeight.w600)),
                                  ),
                                  Text(_formatDate(note.consultationDate),
                                      style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                                ],
                              ),
                              if (note.goals != null && note.goals!.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                const Text('상담 목표',
                                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                                const SizedBox(height: 4),
                                Text(note.goals!, style: const TextStyle(fontSize: 14)),
                              ],
                              if (note.mainContent != null && note.mainContent!.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                const Text('주요 내용',
                                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                                const SizedBox(height: 4),
                                Text(note.mainContent!, style: const TextStyle(fontSize: 14)),
                              ],
                              if (note.adviceGiven != null && note.adviceGiven!.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                const Text('조언',
                                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                                const SizedBox(height: 4),
                                Text(note.adviceGiven!, style: const TextStyle(fontSize: 14)),
                              ],
                              if (note.nextSteps != null && note.nextSteps!.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                const Text('다음 단계',
                                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                                const SizedBox(height: 4),
                                Text(note.nextSteps!, style: const TextStyle(fontSize: 14)),
                              ],
                              if (note.nextTopic != null && note.nextTopic!.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                const Text('다음 주제',
                                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                                const SizedBox(height: 4),
                                Text(note.nextTopic!, style: const TextStyle(fontSize: 14)),
                              ],
                            ],
                          ),
                        );
                      },
                    ),
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
