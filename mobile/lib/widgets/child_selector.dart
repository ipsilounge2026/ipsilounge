import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../services/family_service.dart';

/// 학부모 계정일 때 자녀 선택 드롭다운을 표시하는 위젯.
/// 학생 계정이면 아무것도 렌더링하지 않음 (SizedBox.shrink).
class ChildSelector extends StatefulWidget {
  final String? selectedChildId;
  final ValueChanged<String?> onChanged;
  /// 로딩 완료 후 호출 (isParent, children)
  final void Function(bool isParent, List<Map<String, dynamic>> children)? onReady;

  const ChildSelector({
    super.key,
    required this.selectedChildId,
    required this.onChanged,
    this.onReady,
  });

  @override
  State<ChildSelector> createState() => _ChildSelectorState();
}

class _ChildSelectorState extends State<ChildSelector> {
  List<Map<String, dynamic>> _children = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final user = Provider.of<AuthProvider>(context, listen: false).user;
    final isParent = user?.memberType == 'parent';

    if (!isParent) {
      setState(() => _loading = false);
      widget.onReady?.call(false, []);
      return;
    }

    try {
      final kids = await FamilyService.getLinkedChildren();
      setState(() {
        _children = kids;
        _loading = false;
      });
      // 자녀가 1명이면 자동 선택
      if (kids.length == 1 && widget.selectedChildId == null) {
        widget.onChanged(kids[0]['user_id'] as String);
      }
      widget.onReady?.call(true, kids);
    } catch (_) {
      setState(() => _loading = false);
      widget.onReady?.call(true, []);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = Provider.of<AuthProvider>(context, listen: false).user;
    if (user?.memberType != 'parent') return const SizedBox.shrink();
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Text('자녀 정보 로딩 중...', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
      );
    }

    if (_children.isEmpty) {
      return Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF7ED),
          border: Border.all(color: const Color(0xFFFDBA74)),
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('연결된 자녀가 없습니다',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF9A3412))),
            SizedBox(height: 4),
            Text('마이페이지에서 자녀와 가족 연결을 먼저 진행해주세요.',
                style: TextStyle(fontSize: 13, color: Color(0xFFC2410C))),
          ],
        ),
      );
    }

    final label = '신청 대상 자녀';

    if (_children.length == 1) {
      final child = _children[0];
      final name = child['name'] ?? '';
      final school = child['school_name'];
      final grade = child['grade'];
      final display = '$name${school != null ? ' ($school' : ''}${grade != null ? ' ${grade}학년' : ''}${school != null ? ')' : ''}';
      return Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFF9FAFB),
                border: Border.all(color: const Color(0xFFE5E7EB)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(display, style: const TextStyle(fontSize: 14)),
            ),
          ],
        ),
      );
    }

    // 여러 자녀
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            value: widget.selectedChildId,
            decoration: InputDecoration(
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            ),
            hint: const Text('자녀를 선택해주세요'),
            items: _children.map((child) {
              final id = child['user_id'] as String;
              final name = child['name'] ?? '';
              final school = child['school_name'];
              final grade = child['grade'];
              final display = '$name${school != null ? ' ($school' : ''}${grade != null ? ' ${grade}학년' : ''}${school != null ? ')' : ''}';
              return DropdownMenuItem(value: id, child: Text(display));
            }).toList(),
            onChanged: widget.onChanged,
          ),
        ],
      ),
    );
  }
}
