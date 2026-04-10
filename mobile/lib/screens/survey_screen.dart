import 'dart:async';
import 'package:flutter/material.dart';
import '../services/survey_service.dart';

/// 사전 상담 설문 작성 화면.
///
/// 인자:
///   surveyType: "preheigh1" | "high"
///   timing: T1~T4 (high 전용, null이면 선택 UI 표시)
///   ownerUserId: 학부모가 자녀 대신 작성 시
///   existingSurveyId: 이어쓰기 시 기존 설문 ID
class SurveyScreen extends StatefulWidget {
  final String surveyType;
  final String? timing;
  final String? ownerUserId;
  final String? existingSurveyId;

  const SurveyScreen({
    super.key,
    required this.surveyType,
    this.timing,
    this.ownerUserId,
    this.existingSurveyId,
  });

  @override
  State<SurveyScreen> createState() => _SurveyScreenState();
}

class _SurveyScreenState extends State<SurveyScreen> {
  Map<String, dynamic>? _schema;
  Map<String, dynamic>? _survey;
  List<Map<String, dynamic>> _categories = [];
  int _currentCatIndex = 0;
  bool _loading = true;
  bool _submitting = false;
  bool _submitted = false;
  String? _error;
  String? _lastUpdatedAt;

  // 답변 저장: { "A": { "A1": value, ... }, ... }
  Map<String, Map<String, dynamic>> _answers = {};

  Timer? _autoSaveTimer;
  bool _dirty = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _autoSaveTimer?.cancel();
    if (_dirty && _survey != null) {
      _doSave(); // 나가기 전 저장
    }
    super.dispose();
  }

  Future<void> _init() async {
    try {
      // 1) 스키마 로드
      final schema = await SurveyService.getSchema(widget.surveyType);
      _schema = schema;

      // 모바일 지원 카테고리만 필터
      final allCats = (schema['categories'] as List).cast<Map<String, dynamic>>();
      _categories = allCats.where((c) {
        final platforms = (c['platforms'] as List?)?.cast<String>() ?? ['web', 'mobile'];
        final respondent = c['respondent'] as String?;
        // 학부모 카테고리는 학부모만 보임
        if (respondent == 'parent' && widget.ownerUserId == null) return false;
        // 학부모가 편집 시 parent 카테고리만
        if (widget.ownerUserId != null && respondent != 'parent') return false;
        return platforms.contains('mobile');
      }).toList();

      // 2) 기존 설문 찾기 or 생성
      String surveyId;
      if (widget.existingSurveyId != null) {
        surveyId = widget.existingSurveyId!;
      } else {
        // 기존 draft 찾기
        final list = await SurveyService.listMy(surveyType: widget.surveyType);
        final matching = list.where((s) {
          if (widget.timing != null) return s['timing'] == widget.timing && s['status'] == 'draft';
          return s['status'] == 'draft';
        }).toList();

        if (matching.isNotEmpty) {
          surveyId = matching.first['id'];
        } else {
          final created = await SurveyService.create(
            surveyType: widget.surveyType,
            timing: widget.timing,
            startedPlatform: 'mobile',
            ownerUserId: widget.ownerUserId,
          );
          surveyId = created['id'];
        }
      }

      // 3) 전체 데이터 조회
      final survey = await SurveyService.get(surveyId);
      _survey = survey;
      _lastUpdatedAt = survey['updated_at'];

      // 답변 복원
      final ans = survey['answers'] as Map<String, dynamic>? ?? {};
      _answers = {};
      for (final entry in ans.entries) {
        _answers[entry.key] = Map<String, dynamic>.from(entry.value as Map);
      }

      // 마지막 작성 카테고리로 이동
      final lastCat = survey['last_category'] as String?;
      if (lastCat != null) {
        final idx = _categories.indexWhere((c) => c['id'] == lastCat);
        if (idx >= 0) _currentCatIndex = idx;
      }

      setState(() => _loading = false);
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void _setAnswer(String catId, String qId, dynamic value) {
    _answers.putIfAbsent(catId, () => {});
    _answers[catId]![qId] = value;
    _dirty = true;
    _autoSaveTimer?.cancel();
    _autoSaveTimer = Timer(const Duration(milliseconds: 1500), _doSave);
    setState(() {});
  }

  Future<void> _doSave() async {
    if (_survey == null || !_dirty) return;
    _dirty = false;
    try {
      final catId = _categories[_currentCatIndex]['id'];
      final result = await SurveyService.patch(_survey!['id'], {
        'answers': {catId: _answers[catId] ?? {}},
        'category_status': {catId: 'in_progress'},
        'last_category': catId,
        if (_lastUpdatedAt != null) 'last_known_updated_at': _lastUpdatedAt,
      });
      _lastUpdatedAt = result['updated_at'];
    } catch (e) {
      // 409 충돌 시 알림
      if (e.toString().contains('409') || e.toString().contains('충돌')) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('다른 기기에서 수정되었습니다. 새로고침합니다.'), backgroundColor: Colors.orange),
          );
          _init();
        }
      }
    }
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      // 마지막 저장
      await _doSave();
      await SurveyService.submit(_survey!['id']);
      setState(() {
        _submitted = true;
        _submitting = false;
      });
    } catch (e) {
      setState(() => _submitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('제출 실패: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _nextCategory() {
    _doSave();
    if (_currentCatIndex < _categories.length - 1) {
      setState(() => _currentCatIndex++);
    }
  }

  void _prevCategory() {
    _doSave();
    if (_currentCatIndex > 0) {
      setState(() => _currentCatIndex--);
    }
  }

  Future<void> _sendResumeLink() async {
    try {
      final result = await SurveyService.issueResumeToken(_survey!['id'], sendEmail: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result['email_sent'] == true ? '이어쓰기 링크가 이메일로 발송되었습니다' : '이어쓰기 링크가 생성되었습니다'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('링크 발송 실패: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.surveyType == 'preheigh1' ? '예비고1 사전 조사' : '고등학생 사전 조사'),
        actions: [
          if (_survey != null && !_submitted)
            TextButton(
              onPressed: _sendResumeLink,
              child: const Text('웹에서 이어쓰기', style: TextStyle(fontSize: 13)),
            ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: () { setState(() { _loading = true; _error = null; }); _init(); }, child: const Text('다시 시도')),
            ],
          ),
        ),
      );
    }
    if (_submitted) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.check_circle, size: 64, color: Colors.green),
              const SizedBox(height: 16),
              const Text('설문 제출이 완료되었습니다', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              const Text('상담사가 답변을 검토 후 상담 일정을 안내드립니다.\n제출 후에도 상담 전까지 답변을 수정하실 수 있습니다.',
                textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF6B7280), height: 1.6)),
              const SizedBox(height: 24),
              ElevatedButton(onPressed: () => Navigator.pop(context, true), child: const Text('돌아가기')),
            ],
          ),
        ),
      );
    }

    if (_categories.isEmpty) {
      return const Center(child: Text('모바일에서 작성 가능한 항목이 없습니다.\n웹에서 작성해주세요.', textAlign: TextAlign.center));
    }

    final cat = _categories[_currentCatIndex];
    final catId = cat['id'] as String;
    final questions = (cat['questions'] as List).cast<Map<String, dynamic>>();
    final catAnswers = _answers[catId] ?? {};
    final isLast = _currentCatIndex == _categories.length - 1;

    return Column(
      children: [
        // 진행률 바
        _buildProgressBar(),
        // 카테고리 헤더
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${cat['title']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              if (cat['description'] != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(cat['description'], style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                ),
            ],
          ),
        ),
        // 질문 목록
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: questions.length,
            itemBuilder: (context, i) => _buildQuestion(questions[i], catId, catAnswers),
          ),
        ),
        // 하단 네비게이션
        SafeArea(
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, -2))],
            ),
            child: Row(
              children: [
                if (_currentCatIndex > 0)
                  Expanded(
                    child: OutlinedButton(onPressed: _prevCategory, child: const Text('이전')),
                  ),
                if (_currentCatIndex > 0) const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _submitting ? null : (isLast ? _submit : _nextCategory),
                    child: _submitting
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text(isLast ? '제출하기' : '다음'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildProgressBar() {
    final progress = _categories.isEmpty ? 0.0 : (_currentCatIndex + 1) / _categories.length;
    return Column(
      children: [
        LinearProgressIndicator(value: progress, minHeight: 4, backgroundColor: const Color(0xFFE5E7EB)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${_currentCatIndex + 1} / ${_categories.length}', style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
              if (_dirty) const Text('저장 중...', style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildQuestion(Map<String, dynamic> q, String catId, Map<String, dynamic> catAnswers) {
    // condition 체크
    if (q.containsKey('condition')) {
      final cond = q['condition'] as Map<String, dynamic>;
      final condQ = cond['question'] as String;
      final condVal = cond['value'];
      final actual = catAnswers[condQ];
      if (condVal is List) {
        if (!condVal.contains(actual)) return const SizedBox.shrink();
      } else {
        if (actual != condVal) return const SizedBox.shrink();
      }
    }

    final type = q['type'] as String;
    final qId = q['id'] as String;
    final label = q['label'] as String? ?? '';
    final required = q['required'] == true;
    final answer = catAnswers[qId];

    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RichText(
            text: TextSpan(
              text: label,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF374151)),
              children: required ? [const TextSpan(text: ' *', style: TextStyle(color: Colors.red))] : null,
            ),
          ),
          if (q['description'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(q['description'], style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
            ),
          const SizedBox(height: 8),
          _buildInput(type, q, catId, qId, answer),
        ],
      ),
    );
  }

  Widget _buildInput(String type, Map<String, dynamic> q, String catId, String qId, dynamic answer) {
    switch (type) {
      case 'text':
        return _textField(catId, qId, answer as String?, q['placeholder'] as String?);
      case 'textarea':
        return _textField(catId, qId, answer as String?, q['placeholder'] as String?, maxLines: 4);
      case 'number':
        return _textField(catId, qId, answer?.toString(), q['placeholder'] as String?, keyboardType: TextInputType.number);
      case 'radio':
        return _radioGroup(catId, qId, answer as String?, (q['options'] as List).cast<Map<String, dynamic>>());
      case 'select':
        return _dropdown(catId, qId, answer as String?, (q['options'] as List).cast<Map<String, dynamic>>());
      case 'checkboxes':
      case 'multi_select':
        return _checkboxGroup(catId, qId, (answer as List?)?.cast<String>() ?? [], (q['options'] as List).cast<Map<String, dynamic>>());
      case 'slider':
        return _slider(catId, qId, answer, q);
      case 'rank':
        return _rankInput(catId, qId, (answer as List?)?.cast<String>() ?? [], (q['options'] as List).cast<Map<String, dynamic>>());
      case 'text_list':
        return _textList(catId, qId, (answer as List?)?.cast<String>() ?? [], q);
      case 'group_select':
        return _groupSelect(catId, qId, answer as String?, q);
      case 'cascading_select':
        return _cascadingSelect(catId, qId, answer as Map<String, dynamic>?, q);
      case 'career_select':
        return _careerSelect(catId, qId, answer as Map<String, dynamic>?, q);
      case 'composite':
        return _compositeInput(catId, qId, answer as Map<String, dynamic>?, q);
      case 'group':
        final children = (q['children'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: children.map((child) {
            final catAnswers = _answers[catId] ?? {};
            return _buildQuestion(child, catId, catAnswers);
          }).toList(),
        );
      default:
        return Text('지원하지 않는 질문 유형: $type (웹에서 작성해주세요)', style: const TextStyle(color: Colors.grey, fontSize: 13));
    }
  }

  // ---- Input Widgets ----

  Widget _textField(String catId, String qId, String? value, String? placeholder, {int maxLines = 1, TextInputType? keyboardType}) {
    return TextFormField(
      initialValue: value ?? '',
      maxLines: maxLines,
      keyboardType: keyboardType,
      decoration: InputDecoration(
        hintText: placeholder,
        border: const OutlineInputBorder(),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
      onChanged: (v) => _setAnswer(catId, qId, v),
    );
  }

  Widget _radioGroup(String catId, String qId, String? value, List<Map<String, dynamic>> options) {
    return Column(
      children: options.map((opt) {
        final v = opt['value'] as String;
        final label = opt['label'] as String;
        return RadioListTile<String>(
          title: Text(label, style: const TextStyle(fontSize: 14)),
          value: v,
          groupValue: value,
          onChanged: (val) => _setAnswer(catId, qId, val),
          contentPadding: EdgeInsets.zero,
          dense: true,
        );
      }).toList(),
    );
  }

  Widget _dropdown(String catId, String qId, String? value, List<Map<String, dynamic>> options) {
    return DropdownButtonFormField<String>(
      value: value,
      decoration: const InputDecoration(border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
      items: options.map((opt) => DropdownMenuItem(value: opt['value'] as String, child: Text(opt['label'] as String, style: const TextStyle(fontSize: 14)))).toList(),
      onChanged: (val) => _setAnswer(catId, qId, val),
    );
  }

  Widget _checkboxGroup(String catId, String qId, List<String> values, List<Map<String, dynamic>> options) {
    return Column(
      children: options.map((opt) {
        final v = opt['value'] as String;
        final label = opt['label'] as String;
        return CheckboxListTile(
          title: Text(label, style: const TextStyle(fontSize: 14)),
          value: values.contains(v),
          onChanged: (checked) {
            final newVals = List<String>.from(values);
            if (checked == true) {
              newVals.add(v);
            } else {
              newVals.remove(v);
            }
            _setAnswer(catId, qId, newVals);
          },
          contentPadding: EdgeInsets.zero,
          dense: true,
          controlAffinity: ListTileControlAffinity.leading,
        );
      }).toList(),
    );
  }

  Widget _slider(String catId, String qId, dynamic value, Map<String, dynamic> q) {
    final min = (q['min'] as num?)?.toDouble() ?? 1;
    final max = (q['max'] as num?)?.toDouble() ?? 10;
    final step = (q['step'] as num?)?.toDouble() ?? 1;
    final current = (value as num?)?.toDouble() ?? min;
    final labels = q['labels'] as Map<String, dynamic>?;
    return Column(
      children: [
        Slider(
          value: current.clamp(min, max),
          min: min,
          max: max,
          divisions: ((max - min) / step).round(),
          label: current.round().toString(),
          onChanged: (v) => _setAnswer(catId, qId, v.round()),
        ),
        if (labels != null)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(labels['min'] ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
              Text(labels['max'] ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
            ],
          ),
      ],
    );
  }

  Widget _rankInput(String catId, String qId, List<String> ranked, List<Map<String, dynamic>> options) {
    final maxRank = (options.first['max_rank'] as int?) ?? options.length;
    final available = options.where((o) => !ranked.contains(o['value'])).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (ranked.isNotEmpty) ...[
          ...ranked.asMap().entries.map((entry) {
            final idx = entry.key;
            final val = entry.value;
            final opt = options.firstWhere((o) => o['value'] == val, orElse: () => {'label': val});
            return ListTile(
              leading: CircleAvatar(radius: 14, child: Text('${idx + 1}', style: const TextStyle(fontSize: 13))),
              title: Text(opt['label'] as String, style: const TextStyle(fontSize: 14)),
              trailing: IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () {
                final newRanked = List<String>.from(ranked)..removeAt(idx);
                _setAnswer(catId, qId, newRanked);
              }),
              contentPadding: EdgeInsets.zero,
              dense: true,
            );
          }),
          const SizedBox(height: 8),
        ],
        if (ranked.length < maxRank && available.isNotEmpty)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: available.map((opt) {
              return ActionChip(
                label: Text(opt['label'] as String, style: const TextStyle(fontSize: 13)),
                onPressed: () {
                  final newRanked = List<String>.from(ranked)..add(opt['value'] as String);
                  _setAnswer(catId, qId, newRanked);
                },
              );
            }).toList(),
          ),
        Text('${ranked.length}/$maxRank 선택', style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
      ],
    );
  }

  Widget _textList(String catId, String qId, List<String> items, Map<String, dynamic> q) {
    final maxItems = (q['max_items'] as int?) ?? 5;
    return Column(
      children: [
        ...items.asMap().entries.map((entry) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue: entry.value,
                    decoration: InputDecoration(
                      hintText: q['item_placeholder'] as String? ?? '항목 ${entry.key + 1}',
                      border: const OutlineInputBorder(),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                    onChanged: (v) {
                      final newItems = List<String>.from(items);
                      newItems[entry.key] = v;
                      _setAnswer(catId, qId, newItems);
                    },
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.remove_circle_outline, size: 20, color: Colors.red),
                  onPressed: () {
                    final newItems = List<String>.from(items)..removeAt(entry.key);
                    _setAnswer(catId, qId, newItems);
                  },
                ),
              ],
            ),
          );
        }),
        if (items.length < maxItems)
          TextButton.icon(
            onPressed: () => _setAnswer(catId, qId, [...items, '']),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('항목 추가'),
          ),
      ],
    );
  }

  Widget _groupSelect(String catId, String qId, String? value, Map<String, dynamic> q) {
    final groups = (q['groups'] as List).cast<Map<String, dynamic>>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: groups.map((g) {
        final groupLabel = g['label'] as String;
        final items = (g['items'] as List).cast<Map<String, dynamic>>();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 4),
              child: Text(groupLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: items.map((item) {
                final v = item['value'] as String;
                final isSelected = value == v;
                return ChoiceChip(
                  label: Text(item['label'] as String, style: TextStyle(fontSize: 13, color: isSelected ? Colors.white : null)),
                  selected: isSelected,
                  onSelected: (_) => _setAnswer(catId, qId, v),
                );
              }).toList(),
            ),
          ],
        );
      }).toList(),
    );
  }

  Widget _cascadingSelect(String catId, String qId, Map<String, dynamic>? value, Map<String, dynamic> q) {
    final levels = (q['levels'] as List).cast<Map<String, dynamic>>();
    value ??= {};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: levels.asMap().entries.map((entry) {
        final idx = entry.key;
        final level = entry.value;
        final levelKey = level['key'] as String;
        final levelLabel = level['label'] as String;

        // 이전 레벨의 선택에 따라 options 필터
        List<Map<String, dynamic>> options;
        if (idx == 0) {
          options = (level['options'] as List).cast<Map<String, dynamic>>();
        } else {
          final parentKey = levels[idx - 1]['key'] as String;
          final parentVal = value![parentKey];
          if (parentVal == null) return const SizedBox.shrink();
          options = (level['options'] as List)
              .cast<Map<String, dynamic>>()
              .where((o) => o['parent'] == parentVal)
              .toList();
        }

        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(levelLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
              const SizedBox(height: 4),
              DropdownButtonFormField<String>(
                value: value![levelKey] as String?,
                decoration: const InputDecoration(border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
                items: options.map((o) => DropdownMenuItem(value: o['value'] as String, child: Text(o['label'] as String, style: const TextStyle(fontSize: 14)))).toList(),
                onChanged: (val) {
                  final newVal = Map<String, dynamic>.from(value!);
                  newVal[levelKey] = val;
                  // 하위 레벨 초기화
                  for (int j = idx + 1; j < levels.length; j++) {
                    newVal.remove(levels[j]['key']);
                  }
                  _setAnswer(catId, qId, newVal);
                },
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _careerSelect(String catId, String qId, Map<String, dynamic>? value, Map<String, dynamic> q) {
    // career_select: 계열 → 학과 2단계 선택
    value ??= {};
    final fields = (q['fields'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: fields.map((field) {
        final fKey = field['name'] as String;
        final fLabel = field['label'] as String;
        final fType = field['type'] as String;

        if (fType == 'select' && field['options'] != null) {
          final options = (field['options'] as List).cast<Map<String, dynamic>>();
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                const SizedBox(height: 4),
                DropdownButtonFormField<String>(
                  value: value![fKey] as String?,
                  decoration: const InputDecoration(border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
                  items: options.map((o) => DropdownMenuItem(value: o['value'] as String, child: Text(o['label'] as String, style: const TextStyle(fontSize: 14)))).toList(),
                  onChanged: (val) {
                    final newVal = Map<String, dynamic>.from(value!);
                    newVal[fKey] = val;
                    _setAnswer(catId, qId, newVal);
                  },
                ),
              ],
            ),
          );
        } else {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                const SizedBox(height: 4),
                TextFormField(
                  initialValue: value![fKey] as String? ?? '',
                  decoration: InputDecoration(
                    hintText: field['placeholder'] as String?,
                    border: const OutlineInputBorder(),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                  onChanged: (v) {
                    final newVal = Map<String, dynamic>.from(value!);
                    newVal[fKey] = v;
                    _setAnswer(catId, qId, newVal);
                  },
                ),
              ],
            ),
          );
        }
      }).toList(),
    );
  }

  Widget _compositeInput(String catId, String qId, Map<String, dynamic>? value, Map<String, dynamic> q) {
    value ??= {};
    final fields = (q['fields'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: fields.map((field) {
        final fKey = field['name'] as String;
        final fLabel = field['label'] as String;
        final fType = field['type'] as String;

        if (fType == 'radio' && field['options'] != null) {
          final options = (field['options'] as List).cast<Map<String, dynamic>>();
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                ...options.map((opt) => RadioListTile<String>(
                  title: Text(opt['label'] as String, style: const TextStyle(fontSize: 14)),
                  value: opt['value'] as String,
                  groupValue: value![fKey] as String?,
                  onChanged: (val) {
                    final newVal = Map<String, dynamic>.from(value!);
                    newVal[fKey] = val;
                    _setAnswer(catId, qId, newVal);
                  },
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                )),
              ],
            ),
          );
        } else if (fType == 'select' && field['options'] != null) {
          final options = (field['options'] as List).cast<Map<String, dynamic>>();
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                const SizedBox(height: 4),
                DropdownButtonFormField<String>(
                  value: value![fKey] as String?,
                  decoration: const InputDecoration(border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
                  items: options.map((o) => DropdownMenuItem(value: o['value'] as String, child: Text(o['label'] as String, style: const TextStyle(fontSize: 14)))).toList(),
                  onChanged: (val) {
                    final newVal = Map<String, dynamic>.from(value!);
                    newVal[fKey] = val;
                    _setAnswer(catId, qId, newVal);
                  },
                ),
              ],
            ),
          );
        } else {
          // text, textarea, number
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                const SizedBox(height: 4),
                TextFormField(
                  initialValue: value![fKey] as String? ?? '',
                  maxLines: fType == 'textarea' ? 3 : 1,
                  keyboardType: fType == 'number' ? TextInputType.number : null,
                  decoration: InputDecoration(
                    hintText: field['placeholder'] as String?,
                    border: const OutlineInputBorder(),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                  onChanged: (v) {
                    final newVal = Map<String, dynamic>.from(value!);
                    newVal[fKey] = v;
                    _setAnswer(catId, qId, newVal);
                  },
                ),
              ],
            ),
          );
        }
      }).toList(),
    );
  }
}
