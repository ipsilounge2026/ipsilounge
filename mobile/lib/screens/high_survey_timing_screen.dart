import 'package:flutter/material.dart';
import '../services/survey_service.dart';
import 'survey_screen.dart';

/// 고등학생 사전 조사 시점(T1~T4) 선택 화면.
///
/// HSGAP-P2-mobile-timing-select-ui: 설문 시작 전에 T1~T4 중 하나를 선택하도록 유도.
/// 백엔드의 /consultation-surveys/suggest/high 결과를 기반으로 '추천' 배지를 표시하고,
/// 사용자가 최종 선택한 timing을 SurveyScreen에 전달한다.
class HighSurveyTimingScreen extends StatefulWidget {
  final String? ownerUserId;

  const HighSurveyTimingScreen({super.key, this.ownerUserId});

  @override
  State<HighSurveyTimingScreen> createState() => _HighSurveyTimingScreenState();
}

class _HighSurveyTimingScreenState extends State<HighSurveyTimingScreen> {
  static const List<Map<String, String>> _options = [
    {
      'value': 'T1',
      'label': 'T1 (고1 ~ 고2 1학기)',
      'desc': '고등학교 초반 학습/진로 설계',
    },
    {
      'value': 'T2',
      'label': 'T2 (고2 2학기)',
      'desc': '진로 구체화 및 학업 전략',
    },
    {
      'value': 'T3',
      'label': 'T3 (고3 1학기)',
      'desc': '수시 지원 전략 수립',
    },
    {
      'value': 'T4',
      'label': 'T4 (고3 2학기)',
      'desc': '수시 최종 점검 및 정시 전략',
    },
  ];

  bool _loadingSuggest = true;
  String? _suggestedTiming;
  String _suggestedMode = 'full';
  String _suggestReason = '';
  String? _selectedTiming;
  bool _hasPrior = false;

  @override
  void initState() {
    super.initState();
    _loadSuggest();
  }

  Future<void> _loadSuggest() async {
    try {
      final suggest = await SurveyService.getSuggest('high');
      if (!mounted) return;
      setState(() {
        _suggestedTiming = suggest['suggested_timing'] as String?;
        _suggestedMode = (suggest['suggested_mode'] as String?) ?? 'full';
        _suggestReason = (suggest['reason'] as String?) ?? '';
        _hasPrior = (suggest['has_prior_submission'] as bool?) ?? false;
        _selectedTiming = _suggestedTiming; // 추천 값 기본 선택
        _loadingSuggest = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingSuggest = false;
      });
    }
  }

  Future<void> _startSurvey() async {
    if (_selectedTiming == null) return;
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SurveyScreen(
          surveyType: 'high',
          timing: _selectedTiming,
          ownerUserId: widget.ownerUserId,
        ),
      ),
    );
    if (!mounted) return;
    // 설문 완료 신호(true)는 그대로 상위로 전달
    Navigator.pop(context, result);
  }

  String? _labelOf(String? value) {
    if (value == null) return null;
    return _options.firstWhere(
      (o) => o['value'] == value,
      orElse: () => const {'label': ''},
    )['label'];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: const Text('고등학생 사전 조사 시점 선택'),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF111827),
        elevation: 0.5,
      ),
      body: SafeArea(
        child: _loadingSuggest
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      '현재 시점에 맞는 설문을 선택해주세요.\n시점별로 다른 질문이 포함됩니다.',
                      style: TextStyle(
                        fontSize: 13,
                        color: Color(0xFF6B7280),
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (_suggestedTiming != null) _buildSuggestBanner(),
                    const SizedBox(height: 8),
                    ..._options.map(_buildOptionCard),
                    const SizedBox(height: 24),
                    SizedBox(
                      height: 52,
                      child: ElevatedButton(
                        onPressed: _selectedTiming == null ? null : _startSurvey,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF3B82F6),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          textStyle: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        child: const Text('설문 시작하기'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text(
                        '취소',
                        style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildSuggestBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF6FF),
        border: Border.all(color: const Color(0xFFBFDBFE)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '추천 시점: ${_labelOf(_suggestedTiming) ?? _suggestedTiming}',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: Color(0xFF1E40AF),
              height: 1.5,
            ),
          ),
          if (_suggestReason.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              _suggestReason,
              style: const TextStyle(
                fontSize: 12,
                color: Color(0xFF1E40AF),
                height: 1.5,
              ),
            ),
          ],
          if (_suggestedMode == 'delta' && _hasPrior) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFFDBEAFE),
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Text(
                '이전 제출 이력 있음 - 변경분만 작성',
                style: TextStyle(fontSize: 11, color: Color(0xFF1E40AF)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildOptionCard(Map<String, String> opt) {
    final value = opt['value']!;
    final isSelected = _selectedTiming == value;
    final isSuggested = _suggestedTiming == value;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => setState(() => _selectedTiming = value),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFFF8FAFF) : Colors.white,
            border: Border.all(
              color: isSelected ? const Color(0xFF3B82F6) : const Color(0xFFE5E7EB),
              width: 2,
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      opt['label']!,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: isSelected
                            ? const Color(0xFF3B82F6)
                            : const Color(0xFF374151),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      opt['desc']!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF9CA3AF),
                      ),
                    ),
                  ],
                ),
              ),
              if (isSuggested)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xFFDBEAFE),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    '추천',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF1E40AF),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
