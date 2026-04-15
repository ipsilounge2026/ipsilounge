import 'dart:async';
import 'package:flutter/material.dart';
import '../services/satisfaction_survey_service.dart';

/// 만족도 설문 화면.
///
/// 인자:
///   surveyId: 만족도 설문 ID (satisfaction_surveys 테이블의 id)
class SatisfactionSurveyScreen extends StatefulWidget {
  final String surveyId;

  const SatisfactionSurveyScreen({
    super.key,
    required this.surveyId,
  });

  @override
  State<SatisfactionSurveyScreen> createState() => _SatisfactionSurveyScreenState();
}

class _SatisfactionSurveyScreenState extends State<SatisfactionSurveyScreen> {
  String _step = 'survey'; // survey | done
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  // survey data
  String? _surveyType;
  Map<String, int> _scores = {};
  Map<String, String> _freeText = {};

  // schema
  List<Map<String, dynamic>> _scoreQuestions = [];
  List<Map<String, dynamic>> _freeTextQuestions = [];

  // auto-save
  Timer? _saveTimer;
  String _lastSaved = '';

  @override
  void initState() {
    super.initState();
    _loadSurvey();
  }

  @override
  void dispose() {
    _saveTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadSurvey() async {
    try {
      final survey = await SatisfactionSurveyService.get(widget.surveyId);

      // If already submitted, show done screen
      if (survey['status'] == 'submitted') {
        setState(() { _step = 'done'; _loading = false; });
        return;
      }

      _surveyType = survey['survey_type'] as String?;
      final rawScores = survey['scores'] as Map<String, dynamic>? ?? {};
      _scores = rawScores.map((k, v) => MapEntry(k, v is int ? v : int.tryParse(v.toString()) ?? 0));
      final rawText = survey['free_text'] as Map<String, dynamic>? ?? {};
      _freeText = rawText.map((k, v) => MapEntry(k, v.toString()));

      // Load schema
      if (_surveyType != null) {
        await _loadSchema(_surveyType!);
      }

      setState(() { _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _loadSchema(String surveyType) async {
    final schema = await SatisfactionSurveyService.getSchema(surveyType);
    _scoreQuestions = List<Map<String, dynamic>>.from(schema['score_questions'] ?? []);
    _freeTextQuestions = List<Map<String, dynamic>>.from(schema['free_text_questions'] ?? []);
  }

  void _updateScore(String qId, int value) {
    setState(() { _scores[qId] = value; });
    _scheduleAutoSave();
  }

  void _updateFreeText(String qId, String value) {
    setState(() { _freeText[qId] = value; });
    _scheduleAutoSave();
  }

  void _scheduleAutoSave() {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 1500), () async {
      final json = '${_scores.toString()}|${_freeText.toString()}';
      if (json != _lastSaved) {
        try {
          await SatisfactionSurveyService.patch(
            widget.surveyId,
            scores: _scores,
            freeText: _freeText,
          );
          _lastSaved = json;
        } catch (_) {}
      }
    });
  }

  Future<void> _submit() async {
    // Validate: all score questions must have values
    for (final q in _scoreQuestions) {
      final qId = q['id'] as String;
      if (!_scores.containsKey(qId) || _scores[qId] == null || _scores[qId] == 0) {
        setState(() { _error = '"${q['label']}" 항목을 선택해주세요.'; });
        return;
      }
    }

    setState(() { _submitting = true; _error = null; });
    try {
      // Save latest before submit
      await SatisfactionSurveyService.patch(
        widget.surveyId,
        scores: _scores,
        freeText: _freeText,
      );
      await SatisfactionSurveyService.submit(widget.surveyId);
      setState(() { _step = 'done'; });
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      setState(() { _submitting = false; });
    }
  }

  // --- UI ---

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('만족도 설문'),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 0.5,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _step == 'survey'
              ? _buildSurvey()
              : _buildDone(),
    );
  }

  Widget _buildSurvey() {
    final typeLabel = _surveyType == 'senior' ? '선배 상담' : '상담사 상담';
    return Column(
      children: [
        // 유형 표시 배너
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          color: const Color(0xFFF5F3FF),
          child: Text(
            '$typeLabel 만족도 설문',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF7C3AED)),
          ),
        ),
        // 설문 본문
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                '상담은 어떠셨나요?\n솔직한 의견을 남겨주세요.',
                style: TextStyle(fontSize: 14, color: Colors.black54),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF9FAFB),
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  '🔒 응답자 정보는 상담사에게 노출되지 않습니다.',
                  style: TextStyle(fontSize: 13, color: Color(0xFF374151)),
                ),
              ),
              const SizedBox(height: 24),
              // Score questions
              ..._scoreQuestions.map(_buildScoreQuestion),
              // Free text questions
              if (_freeTextQuestions.isNotEmpty) ...[
                const Divider(height: 32),
                const Padding(
                  padding: EdgeInsets.only(bottom: 16),
                  child: Text('추가 의견',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF7C3AED))),
                ),
                ..._freeTextQuestions.map(_buildFreeTextQuestion),
              ],
              // Error
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                ),
              const SizedBox(height: 8),
              // Submit button
              ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF7C3AED),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: Text(_submitting ? '제출 중...' : '설문 제출',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              ),
              const SizedBox(height: 8),
              const Center(
                child: Text('작성 중인 내용은 자동 저장됩니다',
                    style: TextStyle(fontSize: 12, color: Colors.black38)),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildScoreQuestion(Map<String, dynamic> q) {
    final qId = q['id'] as String;
    final label = q['label'] as String;
    final selected = _scores[qId] ?? 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RichText(text: TextSpan(
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colors.black87),
            children: [
              TextSpan(text: label),
              const TextSpan(text: ' *', style: TextStyle(color: Colors.red)),
            ],
          )),
          const SizedBox(height: 14),
          // 10-point scale row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(10, (i) {
              final score = i + 1;
              final isSelected = selected == score;
              return GestureDetector(
                onTap: () => _updateScore(qId, score),
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isSelected ? const Color(0xFF7C3AED) : Colors.white,
                    border: Border.all(
                      color: isSelected ? const Color(0xFF7C3AED) : Colors.grey.shade300,
                      width: isSelected ? 2 : 1,
                    ),
                  ),
                  child: Center(
                    child: Text(
                      '$score',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: isSelected ? Colors.white : Colors.black54,
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 6),
          // Labels below the row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text('매우 불만족', style: TextStyle(fontSize: 10, color: Colors.black38)),
              Text('보통', style: TextStyle(fontSize: 10, color: Colors.black38)),
              Text('매우 만족', style: TextStyle(fontSize: 10, color: Colors.black38)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFreeTextQuestion(Map<String, dynamic> q) {
    final qId = q['id'] as String;
    final label = q['label'] as String;
    final maxLen = q['max_length'] as int? ?? 500;
    final text = _freeText[qId] ?? '';

    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colors.black87)),
          const SizedBox(height: 10),
          TextField(
            controller: TextEditingController(text: text)..selection = TextSelection.collapsed(offset: text.length),
            onChanged: (v) => _updateFreeText(qId, v),
            maxLength: maxLen,
            maxLines: 4,
            decoration: InputDecoration(
              hintText: '자유롭게 작성해주세요',
              hintStyle: const TextStyle(color: Colors.black26),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              contentPadding: const EdgeInsets.all(14),
            ),
            style: const TextStyle(fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildDone() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle_outline, size: 64, color: Color(0xFF7C3AED)),
            const SizedBox(height: 16),
            const Text('만족도 설문이 제출되었습니다',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            const Text('소중한 의견 감사합니다.\n더 나은 서비스를 위해 노력하겠습니다.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: Colors.black54)),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: () => Navigator.pushNamedAndRemoveUntil(context, '/mypage', (route) => route.isFirst),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF7C3AED),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('마이페이지로 이동', style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}
