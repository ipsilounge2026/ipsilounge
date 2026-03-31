import 'package:flutter/material.dart';
import '../models/consultation.dart';
import '../services/consultation_service.dart';

class ConsultationScreen extends StatefulWidget {
  const ConsultationScreen({super.key});

  @override
  State<ConsultationScreen> createState() => _ConsultationScreenState();
}

class _ConsultationScreenState extends State<ConsultationScreen> {
  late int _year;
  late int _month;
  List<ConsultationSlot> _slots = [];
  String? _selectedDate;
  ConsultationSlot? _selectedSlot;
  String _consultType = '학생부분석';
  final _memoCtrl = TextEditingController();
  bool _isLoading = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _year = now.year;
    _month = now.month;
    _loadSlots();
  }

  @override
  void dispose() {
    _memoCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadSlots() async {
    try {
      final slots = await ConsultationService.getAvailableSlots(_year, _month);
      setState(() => _slots = slots);
    } catch (_) {}
  }

  void _prevMonth() {
    setState(() {
      if (_month == 1) { _month = 12; _year--; } else { _month--; }
      _selectedDate = null;
      _selectedSlot = null;
    });
    _loadSlots();
  }

  void _nextMonth() {
    setState(() {
      if (_month == 12) { _month = 1; _year++; } else { _month++; }
      _selectedDate = null;
      _selectedSlot = null;
    });
    _loadSlots();
  }

  Future<void> _book() async {
    if (_selectedSlot == null) return;
    setState(() { _isLoading = true; _message = null; });
    try {
      await ConsultationService.book(
        _selectedSlot!.id, _consultType, _memoCtrl.text.trim());
      setState(() {
        _message = '상담 예약이 신청되었습니다! 확정 알림을 기다려주세요.';
        _selectedSlot = null;
        _selectedDate = null;
        _memoCtrl.clear();
      });
    } catch (e) {
      setState(() => _message = e.toString());
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final datesWithSlots = Set<String>.from(_slots.map((s) => s.date));
    final firstDay = DateTime(_year, _month, 1).weekday % 7;
    final daysInMonth = DateTime(_year, _month + 1, 0).day;
    final today = DateTime.now();
    final todayStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';

    final slotsForDate = _selectedDate != null
        ? _slots.where((s) => s.date == _selectedDate).toList()
        : <ConsultationSlot>[];

    return Scaffold(
      appBar: AppBar(
        title: const Text('상담 예약'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pushNamed(context, '/consultation/my'),
            child: const Text('내 예약', style: TextStyle(color: Color(0xFF3B82F6))),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_message != null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFD1FAE5),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(_message!,
                  style: const TextStyle(color: Color(0xFF065F46), fontSize: 13)),
            ),

          // 달력
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2)),
              ],
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    IconButton(
                      onPressed: _prevMonth,
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Text(
                      '$_year년 $_month월',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                    ),
                    IconButton(
                      onPressed: _nextMonth,
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                // 요일 헤더
                Row(
                  children: ['일', '월', '화', '수', '목', '금', '토']
                      .map((d) => Expanded(
                            child: Center(
                              child: Text(d,
                                  style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF6B7280))),
                            ),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 8),
                // 날짜 그리드
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 7,
                    childAspectRatio: 1,
                  ),
                  itemCount: firstDay + daysInMonth,
                  itemBuilder: (context, i) {
                    if (i < firstDay) return const SizedBox();
                    final day = i - firstDay + 1;
                    final dateStr =
                        '$_year-${_month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
                    final hasSlots = datesWithSlots.contains(dateStr);
                    final isPast = dateStr.compareTo(todayStr) < 0;
                    final isSelected = dateStr == _selectedDate;
                    final isToday = dateStr == todayStr;

                    return GestureDetector(
                      onTap: () {
                        if (!isPast && hasSlots) {
                          setState(() {
                            _selectedDate = dateStr;
                            _selectedSlot = null;
                          });
                        }
                      },
                      child: Container(
                        margin: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? const Color(0xFF3B82F6)
                              : isToday
                                  ? const Color(0xFFEFF6FF)
                                  : Colors.transparent,
                          shape: BoxShape.circle,
                        ),
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            Text(
                              '$day',
                              style: TextStyle(
                                fontSize: 13,
                                color: isSelected
                                    ? Colors.white
                                    : isPast
                                        ? const Color(0xFFD1D5DB)
                                        : const Color(0xFF111827),
                                fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
                              ),
                            ),
                            if (hasSlots && !isSelected)
                              Positioned(
                                bottom: 4,
                                child: Container(
                                  width: 4,
                                  height: 4,
                                  decoration: const BoxDecoration(
                                    color: Color(0xFF3B82F6),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),

          // 시간대 선택
          if (_selectedDate != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2)),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${_formatDateKr(_selectedDate!)} 예약 가능 시간',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  if (slotsForDate.isEmpty)
                    const Text(
                      '예약 가능한 시간이 없습니다',
                      style: TextStyle(color: Color(0xFF6B7280)),
                    )
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: slotsForDate
                          .map((slot) => GestureDetector(
                                onTap: () {
                                  if (slot.remaining > 0) {
                                    setState(() => _selectedSlot = slot);
                                  }
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 16, vertical: 10),
                                  decoration: BoxDecoration(
                                    color: slot.remaining == 0
                                        ? const Color(0xFFF3F4F6)
                                        : _selectedSlot?.id == slot.id
                                            ? const Color(0xFF3B82F6)
                                            : const Color(0xFFEFF6FF),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                      color: _selectedSlot?.id == slot.id
                                          ? const Color(0xFF3B82F6)
                                          : const Color(0xFFE5E7EB),
                                    ),
                                  ),
                                  child: Column(
                                    children: [
                                      Text(
                                        slot.timeRange,
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                          color: slot.remaining == 0
                                              ? const Color(0xFF9CA3AF)
                                              : _selectedSlot?.id == slot.id
                                                  ? Colors.white
                                                  : const Color(0xFF111827),
                                        ),
                                      ),
                                      Text(
                                        slot.remaining > 0
                                            ? '${slot.remaining}자리 남음'
                                            : '마감',
                                        style: TextStyle(
                                          fontSize: 11,
                                          color: slot.remaining == 0
                                              ? const Color(0xFF9CA3AF)
                                              : _selectedSlot?.id == slot.id
                                                  ? Colors.white70
                                                  : const Color(0xFF6B7280),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ))
                          .toList(),
                    ),
                ],
              ),
            ),
          ],

          // 예약 폼
          if (_selectedSlot != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2)),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '예약 정보 입력',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 16),
                  const Text('상담 유형',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    value: _consultType,
                    items: const [
                      DropdownMenuItem(value: '학생부분석', child: Text('학생부 분석 상담')),
                      DropdownMenuItem(value: '입시전략', child: Text('입시 전략 상담')),
                      DropdownMenuItem(value: '기타', child: Text('기타')),
                    ],
                    onChanged: (v) => setState(() => _consultType = v!),
                    decoration: const InputDecoration(),
                  ),
                  const SizedBox(height: 16),
                  const Text('사전 질문 (선택)',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _memoCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      hintText: '상담 전 궁금한 점을 입력해주세요',
                    ),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _book,
                      child: _isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                  color: Colors.white, strokeWidth: 2),
                            )
                          : const Text('상담 예약 신청'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _formatDateKr(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr);
      const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
      return '${dt.month}월 ${dt.day}일 (${weekdays[dt.weekday % 7]})';
    } catch (_) {
      return dateStr;
    }
  }
}
