import 'package:flutter/material.dart';
import '../services/api_service.dart';

class InterviewQuestionsScreen extends StatefulWidget {
  final String orderId;
  const InterviewQuestionsScreen({super.key, required this.orderId});

  @override
  State<InterviewQuestionsScreen> createState() => _InterviewQuestionsScreenState();
}

class _InterviewQuestionsScreenState extends State<InterviewQuestionsScreen> {
  List<Map<String, dynamic>> _questions = [];
  bool _loading = true;
  final Set<String> _expandedHints = {};

  static const Map<String, String> _categoryLabel = {
    '세특기반': '세특 기반',
    '창체기반': '창체 기반',
    '행특기반': '행특 기반',
    '지원동기': '지원 동기',
    '진로계획': '진로 계획',
    '종합': '종합',
  };

  static const Map<String, Color> _categoryColor = {
    '세특기반': Colors.blue,
    '창체기반': Colors.green,
    '행특기반': Colors.purple,
    '지원동기': Colors.orange,
    '진로계획': Colors.pink,
    '종합': Colors.grey,
  };

  @override
  void initState() {
    super.initState();
    _loadQuestions();
  }

  Future<void> _loadQuestions() async {
    try {
      final data = await ApiService.get(
        '/analysis/${widget.orderId}/interview-questions',
      );
      setState(() {
        _questions = List<Map<String, dynamic>>.from(data);
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  // 카테고리별 그룹
  Map<String, List<Map<String, dynamic>>> get _grouped {
    final result = <String, List<Map<String, dynamic>>>{};
    for (final q in _questions) {
      final cat = q['category'] as String? ?? '종합';
      result.putIfAbsent(cat, () => []).add(q);
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('면접 예상 질문'),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 0,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _questions.isEmpty
              ? _buildEmpty()
              : _buildQuestionList(),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.quiz_outlined, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          const Text('아직 면접 질문이 준비되지 않았습니다.', style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 8),
          const Text(
            '분석 완료 후 관리자가 등록합니다.',
            style: TextStyle(color: Colors.grey, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildQuestionList() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: _grouped.entries.expand((entry) {
        final category = entry.key;
        final questions = entry.value;
        return [
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 8),
            child: Text(
              '${_categoryLabel[category] ?? category} (${questions.length}개)',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 13,
                color: Colors.grey[600],
              ),
            ),
          ),
          ...questions.asMap().entries.map((e) => _buildQuestionCard(
                e.value,
                e.key + 1,
                category,
              )),
        ];
      }).toList(),
    );
  }

  Widget _buildQuestionCard(Map<String, dynamic> q, int index, String category) {
    final id = q['id'] as String;
    final hint = q['hint'] as String?;
    final color = _categoryColor[category] ?? Colors.grey;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Q$index',
                  style: TextStyle(
                    color: Colors.grey[400],
                    fontFamily: 'monospace',
                    fontSize: 13,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    q['question'] as String,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, height: 1.5),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _categoryLabel[category] ?? category,
                    style: TextStyle(color: color, fontSize: 11),
                  ),
                ),
              ],
            ),
            if (hint != null) ...[
              const SizedBox(height: 10),
              GestureDetector(
                onTap: () {
                  setState(() {
                    if (_expandedHints.contains(id)) {
                      _expandedHints.remove(id);
                    } else {
                      _expandedHints.add(id);
                    }
                  });
                },
                child: Text(
                  _expandedHints.contains(id) ? '힌트 숨기기' : '답변 힌트 보기',
                  style: const TextStyle(color: Colors.blue, fontSize: 13),
                ),
              ),
              if (_expandedHints.contains(id))
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    hint,
                    style: TextStyle(color: Colors.blue.shade800, fontSize: 13, height: 1.5),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
