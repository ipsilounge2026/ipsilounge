import 'dart:async';
import 'package:flutter/material.dart';
import '../services/senior_pre_survey_service.dart';

/// 선배 상담 사전 설문 화면.
///
/// 인자:
///   sessionTiming: S1~S4 (null이면 선택 UI 표시)
///   existingSurveyId: 이어쓰기 시 기존 설문 ID
class SeniorPreSurveyScreen extends StatefulWidget {
  final String? sessionTiming;
  final String? existingSurveyId;

  const SeniorPreSurveyScreen({
    super.key,
    this.sessionTiming,
    this.existingSurveyId,
  });

  @override
  State<SeniorPreSurveyScreen> createState() => _SeniorPreSurveyScreenState();
}

class _SeniorPreSurveyScreenState extends State<SeniorPreSurveyScreen> {
  static const _sessionLabels = {
    'S1': '고1-1학기 초 (3월)',
    'S2': '고1-2학기 초 (8월 말)',
    'S3': '고2-1학기 초 (3월)',
    'S4': '고2-2학기 초 (8월 말)',
  };

  String _step = 'select'; // select | survey | done
  String? _sessionTiming;
  String? _surveyId;
  Map<String, dynamic> _answers = {};
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  // schema
  List<Map<String, dynamic>> _commonQuestions = [];
  List<Map<String, dynamic>> _q3Options = [];
  List<Map<String, dynamic>> _sessionQuestions = [];

  // auto-save
  Timer? _saveTimer;
  String _lastSaved = '';

  @override
  void initState() {
    super.initState();
    if (widget.existingSurveyId != null) {
      _loadExisting(widget.existingSurveyId!);
    } else if (widget.sessionTiming != null) {
      _selectSession(widget.sessionTiming!);
    } else {
      _checkDraft();
    }
  }

  @override
  void dispose() {
    _saveTimer?.cancel();
    super.dispose();
  }

  Future<void> _checkDraft() async {
    try {
      final surveys = await SeniorPreSurveyService.listMy();
      final drafts = surveys.where((s) => s['status'] == 'draft').toList();
      if (drafts.isNotEmpty) {
        final draft = drafts.first;
        _surveyId = draft['id'];
        _answers = Map<String, dynamic>.from(draft['answers'] ?? {});
        _sessionTiming = draft['session_timing'];
        await _loadSchema(_sessionTiming!);
        setState(() { _step = 'survey'; _loading = false; });
        return;
      }
    } catch (_) {}
    setState(() { _loading = false; });
  }

  Future<void> _loadExisting(String id) async {
    try {
      final survey = await SeniorPreSurveyService.get(id);
      _surveyId = survey['id'];
      _answers = Map<String, dynamic>.from(survey['answers'] ?? {});
      _sessionTiming = survey['session_timing'];
      await _loadSchema(_sessionTiming!);
      setState(() { _step = 'survey'; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _loadSchema(String timing) async {
    final schema = await SeniorPreSurveyService.getSchema(sessionTiming: timing);
    _commonQuestions = List<Map<String, dynamic>>.from(schema['common_questions'] ?? []);
    _q3Options = List<Map<String, dynamic>>.from(schema['Q3_options'] ?? []);
    _sessionQuestions = List<Map<String, dynamic>>.from(schema['session_questions'] ?? []);
  }

  Future<void> _selectSession(String s) async {
    setState(() { _loading = true; _error = null; });
    try {
      _sessionTiming = s;
      await _loadSchema(s);
      final num = int.parse(s.replaceAll('S', ''));
      final survey = await SeniorPreSurveyService.create(sessionNumber: num, sessionTiming: s);
      _surveyId = survey['id'];
      _answers = Map<String, dynamic>.from(survey['answers'] ?? {});
      setState(() { _step = 'survey'; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _updateAnswer(String qId, dynamic value) {
    setState(() { _answers[qId] = value; });
    _scheduleAutoSave();
  }

  void _toggleCheckbox(String qId, String val) {
    setState(() {
      final list = List<String>.from((_answers[qId] as List?)?.cast<String>() ?? []);
      if (list.contains(val)) {
        list.remove(val);
      } else {
        list.add(val);
      }
      _answers[qId] = list;
    });
    _scheduleAutoSave();
  }

  void _scheduleAutoSave() {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 1500), () async {
      final json = _answers.toString();
      if (_surveyId != null && json != _lastSaved) {
        try {
          await SeniorPreSurveyService.patch(_surveyId!, _answers);
          _lastSaved = json;
        } catch (_) {}
      }
    });
  }

  Future<void> _submit() async {
    // 필수 항목 검증
    final allQ = [..._commonQuestions, ..._sessionQuestions];
    for (final q in allQ) {
      if (q['required'] != true) continue;
      final qId = q['id'] as String;
      if (qId == 'Q3') {
        final arr = _answers[qId];
        if (arr == null || (arr is List && arr.isEmpty)) {
          setState(() { _error = '"${q['label']}" 항목을 선택해주세요.'; });
          return;
        }
        continue;
      }
      final val = _answers[qId];
      if (val == null || val == '') {
        setState(() { _error = '"${q['label']}" 항목을 선택해주세요.'; });
        return;
      }
    }

    setState(() { _submitting = true; _error = null; });
    try {
      await SeniorPreSurveyService.patch(_surveyId!, _answers);
      await SeniorPreSurveyService.submit(_surveyId!);
      setState(() { _step = 'done'; });
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      setState(() { _submitting = false; });
    }
  }

  // ─── UI ───

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('선배 상담 사전 설문'),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 0.5,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _step == 'select'
              ? _buildSelect()
              : _step == 'survey'
                  ? _buildSurvey()
                  : _buildDone(),
    );
  }

  Widget _buildSelect() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text('상담 전에 간단한 설문을 작성해주세요.\n선배가 더 잘 준비할 수 있어요.',
            style: TextStyle(fontSize: 14, color: Colors.black54)),
        const SizedBox(height: 24),
        const Text('상담 회차를 선택하세요',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        const SizedBox(height: 12),
        ...['S1', 'S2', 'S3', 'S4'].map((s) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: InkWell(
            onTap: () => _selectSession(s),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${s.replaceAll('S', '')}회차',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(_sessionLabels[s] ?? '', style: const TextStyle(fontSize: 13, color: Colors.black54)),
                ],
              ),
            ),
          ),
        )),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
          ),
      ],
    );
  }

  Widget _buildSurvey() {
    return Column(
      children: [
        // 회차 표시
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          color: const Color(0xFFF5F3FF),
          child: Text(
            '${_sessionTiming!.replaceAll('S', '')}회차 · ${_sessionLabels[_sessionTiming] ?? ''}',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF7C3AED)),
          ),
        ),
        // 설문 본문
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              ..._commonQuestions.map(_buildQuestion),
              if (_sessionQuestions.isNotEmpty) ...[
                const Divider(height: 32),
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text('${_sessionTiming!.replaceAll('S', '')}회차 추가 질문',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF7C3AED))),
                ),
                ..._sessionQuestions.map(_buildQuestion),
              ],
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                ),
              const SizedBox(height: 8),
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

  Widget _buildQuestion(Map<String, dynamic> q) {
    final qId = q['id'] as String;
    final type = q['type'] as String;
    final label = q['label'] as String;
    final required = q['required'] == true;

    if (qId == 'Q3') return _buildCheckboxes(q, _q3Options);
    if (type == 'radio') return _buildRadio(q);
    if (type == 'checkboxes') {
      final opts = (q['options'] as List?)?.map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
      return _buildCheckboxes(q, opts);
    }
    if (type == 'textarea') return _buildTextarea(q);
    return const SizedBox.shrink();
  }

  Widget _buildRadio(Map<String, dynamic> q) {
    final qId = q['id'] as String;
    final label = q['label'] as String;
    final required = q['required'] == true;
    final options = (q['options'] as List?)?.map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
    final selected = _answers[qId] as String?;

    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RichText(text: TextSpan(
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colors.black87),
            children: [
              TextSpan(text: label),
              if (required) const TextSpan(text: ' *', style: TextStyle(color: Colors.red)),
            ],
          )),
          const SizedBox(height: 10),
          ...options.map((opt) {
            final val = opt['value'] as String;
            final isSelected = selected == val;
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: InkWell(
                onTap: () => _updateAnswer(qId, val),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    border: Border.all(color: isSelected ? const Color(0xFF7C3AED) : Colors.grey.shade300, width: isSelected ? 2 : 1),
                    borderRadius: BorderRadius.circular(8),
                    color: isSelected ? const Color(0xFFF5F3FF) : Colors.white,
                  ),
                  child: Row(children: [
                    Icon(isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
                        size: 20, color: isSelected ? const Color(0xFF7C3AED) : Colors.grey),
                    const SizedBox(width: 10),
                    Text(opt['label'] as String, style: const TextStyle(fontSize: 14)),
                  ]),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildCheckboxes(Map<String, dynamic> q, List<Map<String, dynamic>> options) {
    final qId = q['id'] as String;
    final label = q['label'] as String;
    final required = q['required'] == true;
    final checked = List<String>.from((_answers[qId] as List?)?.cast<String>() ?? []);

    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RichText(text: TextSpan(
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colors.black87),
            children: [
              TextSpan(text: label),
              if (required) const TextSpan(text: ' *', style: TextStyle(color: Colors.red)),
            ],
          )),
          const SizedBox(height: 2),
          const Text('복수 선택 가능', style: TextStyle(fontSize: 12, color: Colors.black45)),
          const SizedBox(height: 10),
          ...options.map((opt) {
            final val = opt['value'] as String;
            final isChecked = checked.contains(val);
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: InkWell(
                onTap: () => _toggleCheckbox(qId, val),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    border: Border.all(color: isChecked ? const Color(0xFF7C3AED) : Colors.grey.shade300, width: isChecked ? 2 : 1),
                    borderRadius: BorderRadius.circular(8),
                    color: isChecked ? const Color(0xFFF5F3FF) : Colors.white,
                  ),
                  child: Row(children: [
                    Icon(isChecked ? Icons.check_box : Icons.check_box_outline_blank,
                        size: 20, color: isChecked ? const Color(0xFF7C3AED) : Colors.grey),
                    const SizedBox(width: 10),
                    Expanded(child: Text(opt['label'] as String, style: const TextStyle(fontSize: 14))),
                  ]),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildTextarea(Map<String, dynamic> q) {
    final qId = q['id'] as String;
    final label = q['label'] as String;
    final required = q['required'] == true;
    final maxLen = q['max_length'] as int? ?? 500;
    final text = (_answers[qId] as String?) ?? '';

    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RichText(text: TextSpan(
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colors.black87),
            children: [
              TextSpan(text: label),
              if (required) const TextSpan(text: ' *', style: TextStyle(color: Colors.red)),
            ],
          )),
          const SizedBox(height: 10),
          TextField(
            controller: TextEditingController(text: text)..selection = TextSelection.collapsed(offset: text.length),
            onChanged: (v) => _updateAnswer(qId, v),
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
            const Text('설문이 제출되었습니다', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            const Text('선배가 설문 내용을 참고하여\n상담을 준비합니다.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: Colors.black54)),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: () => Navigator.pop(context),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF7C3AED),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('돌아가기', style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}
