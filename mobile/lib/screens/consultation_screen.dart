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
  List<Counselor> _counselors = [];
  Counselor? _selectedCounselor;
  List<ConsultationSlot> _slots = [];
  String? _selectedDate;
  ConsultationSlot? _selectedSlot;
  String _consultType = '학생부분석';
  final _memoCtrl = TextEditingController();
  bool _isLoading = false;
  String? _message;

  // 자격 확인
  bool _checkingEligibility = true;
  bool _eligible = false;
  String? _eligibilityReason;
  String? _earliestDate;

  // 쿨다운 상태 (기본 false: API 확인 전까지 버튼 비활성)
  bool _canBook = false;
  String? _bookingCooldownUntil;
  String? _lastBooked;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _year = now.year;
    _month = now.month;
    _checkEligibility();
  }

  Future<void> _checkEligibility() async {
    try {
      final result = await ConsultationService.checkEligible();
      setState(() {
        _eligible = result['eligible'] == true;
        _eligibilityReason = result['reason'];
        _earliestDate = result['earliest_date'];
        _checkingEligibility = false;
      });
      if (_eligible) {
        _loadCounselors();
        _checkBookingCooldown();
      }
    } catch (_) {
      setState(() {
        _eligible = false;
        _eligibilityReason = '자격 확인에 실패했습니다.';
        _checkingEligibility = false;
      });
    }
  }

  Future<void> _checkBookingCooldown() async {
    try {
      final result = await ConsultationService.checkBookingCooldown();
      setState(() {
        _canBook = result['can_book'] == true;
        _bookingCooldownUntil = result['cooldown_until'];
        _lastBooked = result['last_booked'];
      });
    } catch (_) {
      // API 실패 시에도 예약 허용 (서버에서 재검증)
      setState(() => _canBook = true);
    }
  }

  @override
  void dispose() {
    _memoCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadCounselors() async {
    try {
      final counselors = await ConsultationService.getCounselors();
      setState(() => _counselors = counselors);
    } catch (_) {}
  }

  Future<void> _loadSlots() async {
    if (_selectedCounselor == null) return;
    try {
      final slots = await ConsultationService.getAvailableSlots(
          _year, _month, adminId: _selectedCounselor!.id);
      setState(() => _slots = slots);
    } catch (_) {}
  }

  void _selectCounselor(Counselor c) {
    setState(() {
      _selectedCounselor = c;
      _selectedDate = null;
      _selectedSlot = null;
      _slots = [];
    });
    _loadSlots();
  }

  void _changeCounselor() {
    setState(() {
      _selectedCounselor = null;
      _selectedDate = null;
      _selectedSlot = null;
      _slots = [];
    });
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
      body: _checkingEligibility
          ? const Center(child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('상담 예약 자격을 확인하고 있습니다...', style: TextStyle(color: Color(0xFF6B7280))),
              ],
            ))
          : !_eligible
              ? _buildEligibilityBlock()
              : ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // earliest_date 안내 배너
          if (_earliestDate != null && _earliestDate!.compareTo(todayStr) > 0)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                border: Border.all(color: const Color(0xFFBFDBFE)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'ℹ️ 학생부 분석 후 상담 진행을 위해 ${_earliestDate!.replaceAll('-', '.')} 이후 날짜부터 예약 가능합니다.',
                style: const TextStyle(fontSize: 13, color: Color(0xFF1E40AF), height: 1.5),
              ),
            ),

          // 쿨다운 배너
          if (!_canBook && _lastBooked != null && _bookingCooldownUntil != null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF3C7),
                border: Border.all(color: const Color(0xFFFDE68A)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '이전 상담 예약일(${_lastBooked!.replaceAll('-', '.')}) 기준 3개월 이후(${_bookingCooldownUntil!.replaceAll('-', '.')})부터 재예약이 가능합니다.',
                style: const TextStyle(fontSize: 13, color: Color(0xFF92400E), height: 1.5),
              ),
            ),

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

          // Step 1: 상담자 선택
          if (_selectedCounselor == null) ...[
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
                  const Text('상담자 선택',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  const Text('상담을 진행할 상담자를 선택해주세요',
                      style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                  const SizedBox(height: 16),
                  if (_counselors.isEmpty)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: Text('현재 예약 가능한 상담자가 없습니다',
                            style: TextStyle(color: Color(0xFF6B7280))),
                      ),
                    )
                  else
                    ..._counselors.map((c) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: InkWell(
                        onTap: () => _selectCounselor(c),
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                          decoration: BoxDecoration(
                            border: Border.all(color: const Color(0xFFE5E7EB)),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: [
                              CircleAvatar(
                                radius: 18,
                                backgroundColor: const Color(0xFFEFF6FF),
                                child: Text(c.name.isNotEmpty ? c.name[0] : '?',
                                    style: const TextStyle(
                                        color: Color(0xFF3B82F6),
                                        fontWeight: FontWeight.w700,
                                        fontSize: 16)),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(c.name,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600, fontSize: 15)),
                              ),
                              const Text('선택',
                                  style: TextStyle(
                                      color: Color(0xFF3B82F6), fontSize: 13)),
                            ],
                          ),
                        ),
                      ),
                    )),
                ],
              ),
            ),
          ] else ...[
            // 선택된 상담자 표시
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                border: Border.all(color: const Color(0xFFBFDBFE)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: const Color(0xFF3B82F6),
                    child: Text(
                      _selectedCounselor!.name.isNotEmpty ? _selectedCounselor!.name[0] : '?',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(_selectedCounselor!.name,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(width: 6),
                  const Text('상담자',
                      style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                  const Spacer(),
                  GestureDetector(
                    onTap: _changeCounselor,
                    child: const Text('변경',
                        style: TextStyle(
                            color: Color(0xFF3B82F6),
                            fontSize: 13,
                            decoration: TextDecoration.underline)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Step 2: 달력
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
                      IconButton(onPressed: _prevMonth, icon: const Icon(Icons.chevron_left)),
                      Text('$_year년 $_month월',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      IconButton(onPressed: _nextMonth, icon: const Icon(Icons.chevron_right)),
                    ],
                  ),
                  const SizedBox(height: 8),
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
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 7, childAspectRatio: 1),
                    itemCount: firstDay + daysInMonth,
                    itemBuilder: (context, i) {
                      if (i < firstDay) return const SizedBox();
                      final day = i - firstDay + 1;
                      final dateStr =
                          '$_year-${_month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
                      final hasSlots = datesWithSlots.contains(dateStr);
                      final isPast = dateStr.compareTo(todayStr) < 0;
                      final isBeforeEarliest = _earliestDate != null && dateStr.compareTo(_earliestDate!) < 0;
                      final isDisabled = isPast || isBeforeEarliest;
                      final isSelected = dateStr == _selectedDate;
                      final isToday = dateStr == todayStr;

                      return GestureDetector(
                        onTap: () {
                          if (!isDisabled && hasSlots) {
                            setState(() { _selectedDate = dateStr; _selectedSlot = null; });
                          }
                        },
                        child: Container(
                          margin: const EdgeInsets.all(2),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? const Color(0xFF3B82F6)
                                : isToday ? const Color(0xFFEFF6FF) : Colors.transparent,
                            shape: BoxShape.circle,
                          ),
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              Text('$day',
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: isSelected ? Colors.white
                                        : isDisabled ? const Color(0xFFD1D5DB) : const Color(0xFF111827),
                                    fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
                                  )),
                              if (hasSlots && !isSelected && !isDisabled)
                                Positioned(
                                  bottom: 4,
                                  child: Container(
                                    width: 4, height: 4,
                                    decoration: const BoxDecoration(
                                        color: Color(0xFF3B82F6), shape: BoxShape.circle),
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

            // Step 3: 시간대 선택
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
                    Text('${_formatDateKr(_selectedDate!)} 예약 가능 시간',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 12),
                    if (slotsForDate.isEmpty)
                      const Text('예약 가능한 시간이 없습니다',
                          style: TextStyle(color: Color(0xFF6B7280)))
                    else
                      Wrap(
                        spacing: 8, runSpacing: 8,
                        children: slotsForDate.map((slot) => GestureDetector(
                          onTap: () {
                            if (slot.remaining > 0) setState(() => _selectedSlot = slot);
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                            decoration: BoxDecoration(
                              color: slot.remaining == 0 ? const Color(0xFFF3F4F6)
                                  : _selectedSlot?.id == slot.id ? const Color(0xFF3B82F6)
                                  : const Color(0xFFEFF6FF),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: _selectedSlot?.id == slot.id
                                    ? const Color(0xFF3B82F6) : const Color(0xFFE5E7EB)),
                            ),
                            child: Column(children: [
                              Text(slot.timeRange,
                                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                                    color: slot.remaining == 0 ? const Color(0xFF9CA3AF)
                                        : _selectedSlot?.id == slot.id ? Colors.white
                                        : const Color(0xFF111827))),
                              Text(slot.remaining > 0 ? '${slot.remaining}자리 남음' : '마감',
                                  style: TextStyle(fontSize: 11,
                                    color: slot.remaining == 0 ? const Color(0xFF9CA3AF)
                                        : _selectedSlot?.id == slot.id ? Colors.white70
                                        : const Color(0xFF6B7280))),
                            ]),
                          ),
                        )).toList(),
                      ),
                  ],
                ),
              ),
            ],

            // Step 4: 예약 폼
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
                    const Text('예약 정보 입력',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 16),
                    const Text('상담 유형', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      value: _consultType,
                      items: const [
                        DropdownMenuItem(value: '학생부분석', child: Text('학생부 분석 상담')),
                        DropdownMenuItem(value: '입시전략', child: Text('입시 전략 상담')),
                        DropdownMenuItem(value: '학습상담', child: Text('학습 상담')),
                        DropdownMenuItem(value: '심리상담', child: Text('심리 상담')),
                        DropdownMenuItem(value: '기타', child: Text('기타')),
                      ],
                      onChanged: (v) => setState(() => _consultType = v!),
                      decoration: const InputDecoration(),
                    ),
                    const SizedBox(height: 16),
                    const Text('사전 질문 (선택)', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _memoCtrl,
                      maxLines: 3,
                      decoration: const InputDecoration(hintText: '상담 전 궁금한 점을 입력해주세요'),
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity, height: 48,
                      child: ElevatedButton(
                        onPressed: (_isLoading || !_canBook) ? null : _book,
                        child: _isLoading
                            ? const SizedBox(width: 20, height: 20,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                            : Text(!_canBook ? '쿨다운 기간' : '상담 예약 신청'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildEligibilityBlock() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(height: 40),
            const Icon(Icons.lock_outline, size: 48, color: Color(0xFF9CA3AF)),
            const SizedBox(height: 16),
            const Text('상담 예약 조건',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xFF374151))),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFFDE68A)),
              ),
              child: Text(
                _eligibilityReason ?? '',
                style: const TextStyle(fontSize: 14, color: Color(0xFF92400E), height: 1.6),
              ),
            ),
            const SizedBox(height: 16),
            if (_eligibilityReason != null && _eligibilityReason!.contains('업로드를 완료')) ...[
              // 신청 완료, 파일 미업로드
              const Text(
                '신청은 완료되었습니다. 학생부 파일을 업로드하면\n학생부 분석 후 상담 진행을 위해 상담 예약이 가능합니다.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.6),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pushNamed(context, '/analysis'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF3B82F6),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: const Text('내 분석 목록에서 파일 업로드', style: TextStyle(color: Colors.white, fontSize: 13)),
                ),
              ),
            ] else ...[
              // 미신청
              const Text(
                '상담 라운지는 학생부 라운지 또는 학종 라운지를 신청하고\n학생부 파일 업로드를 완료한 후 이용 가능합니다.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.6),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => Navigator.pushNamed(context, '/analysis/apply', arguments: '학생부라운지'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF3B82F6),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: const Text('학생부 라운지 신청', style: TextStyle(color: Colors.white, fontSize: 13)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pushNamed(context, '/analysis/apply', arguments: '학종라운지'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF22C55E),
                        side: const BorderSide(color: Color(0xFF22C55E)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: const Text('학종 라운지 신청', style: TextStyle(fontSize: 13)),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
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
