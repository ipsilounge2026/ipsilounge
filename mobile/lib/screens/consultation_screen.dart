import 'package:flutter/material.dart';
import '../models/consultation.dart';
import '../services/consultation_service.dart';

class _ConsultationType {
  final String value;
  final String label;
  final String description;
  final IconData icon;
  final bool requiresUpload;

  const _ConsultationType({
    required this.value,
    required this.label,
    required this.description,
    required this.icon,
    required this.requiresUpload,
  });
}

const _consultationTypes = [
  _ConsultationType(
    value: '학생부분석', label: '학생부 분석 상담',
    description: '학생부 분석 결과를 바탕으로 한 맞춤 상담',
    icon: Icons.analytics_outlined, requiresUpload: true,
  ),
  _ConsultationType(
    value: '학종전략', label: '학종 전략 상담',
    description: '학생부종합전형 지원 전략 상담',
    icon: Icons.school_outlined, requiresUpload: true,
  ),
  _ConsultationType(
    value: '학습상담', label: '학습 상담',
    description: '학습 방법 및 전략 상담',
    icon: Icons.menu_book_outlined, requiresUpload: false,
  ),
  _ConsultationType(
    value: '심리상담', label: '심리 상담',
    description: '입시 스트레스 및 심리 상담',
    icon: Icons.favorite_outline, requiresUpload: false,
  ),
  _ConsultationType(
    value: '기타', label: '기타 상담',
    description: '기타 입시 관련 상담',
    icon: Icons.help_outline, requiresUpload: false,
  ),
];

class ConsultationScreen extends StatefulWidget {
  const ConsultationScreen({super.key});

  @override
  State<ConsultationScreen> createState() => _ConsultationScreenState();
}

class _ConsultationScreenState extends State<ConsultationScreen> {
  // Step: type → check → survey → booking
  String _step = 'type';
  _ConsultationType? _selectedType;

  // 자격 확인
  bool _checkingEligibility = false;
  bool _eligible = false;
  String? _eligibilityReason;
  String? _earliestDate;
  bool _needsSurvey = false;

  // 상담자
  List<Counselor> _counselors = [];
  Counselor? _selectedCounselor;
  bool _isAssigned = false;

  // 캘린더
  late int _year;
  late int _month;
  List<ConsultationSlot> _slots = [];
  String? _selectedDate;
  ConsultationSlot? _selectedSlot;
  final _memoCtrl = TextEditingController();
  bool _isLoading = false;
  String? _message;

  // 쿨다운
  bool _canBook = false;
  String? _bookingCooldownUntil;
  String? _lastBooked;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _year = now.year;
    _month = now.month;
  }

  @override
  void dispose() {
    _memoCtrl.dispose();
    super.dispose();
  }

  // === Step: type ===
  void _selectType(_ConsultationType type) {
    setState(() {
      _selectedType = type;
      _message = null;
    });

    if (type.requiresUpload) {
      // 학생부분석/학종전략 → 자격 확인
      setState(() {
        _step = 'check';
        _checkingEligibility = true;
      });
      _checkEligibility(type.value);
    } else {
      // 학습/심리/기타 → 사전조사
      setState(() => _step = 'survey');
    }
  }

  // === Step: check ===
  Future<void> _checkEligibility(String consultationType) async {
    try {
      final result = await ConsultationService.checkEligibleByType(consultationType);
      setState(() {
        _eligible = result['eligible'] == true;
        _eligibilityReason = result['reason'];
        _earliestDate = result['earliest_date'];
        _needsSurvey = result['needs_survey'] == true;
        _checkingEligibility = false;
      });
      if (_eligible) {
        _goToBooking();
      }
    } catch (_) {
      setState(() {
        _eligible = false;
        _eligibilityReason = '자격 확인에 실패했습니다.';
        _checkingEligibility = false;
      });
    }
  }

  // === Step: survey → booking ===
  void _goToBooking() {
    setState(() => _step = 'booking');
    _loadCounselors();
    _checkBookingCooldown();
  }

  Future<void> _loadCounselors() async {
    try {
      final res = await ConsultationService.getCounselorsWithAssignment();
      final assigned = res['assigned'] == true;
      final items = (res['counselors'] as List)
          .map((e) => Counselor.fromJson(e))
          .toList();

      setState(() {
        _counselors = items;
        _isAssigned = assigned;
      });

      // 담당자가 배정되어 있고 1명이면 자동 선택
      if (assigned && items.length == 1) {
        _selectCounselor(items.first);
      }
    } catch (_) {}
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
      setState(() => _canBook = true);
    }
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

  Future<void> _loadSlots() async {
    if (_selectedCounselor == null) return;
    try {
      final slots = await ConsultationService.getAvailableSlots(
          _year, _month, adminId: _selectedCounselor!.id);
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
    if (_selectedSlot == null || _selectedType == null) return;
    setState(() { _isLoading = true; _message = null; });
    try {
      await ConsultationService.book(
        _selectedSlot!.id, _selectedType!.value, _memoCtrl.text.trim());
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

  void _goBack() {
    setState(() {
      _message = null;
      if (_step == 'booking') {
        if (_selectedType != null && !_selectedType!.requiresUpload) {
          _step = 'survey';
        } else {
          _step = 'type';
        }
        _selectedCounselor = null;
        _selectedDate = null;
        _selectedSlot = null;
        _slots = [];
      } else if (_step == 'survey') {
        _step = 'type';
      } else if (_step == 'check') {
        _step = 'type';
      } else {
        Navigator.pop(context);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: _step == 'type' ? () => Navigator.pop(context) : _goBack,
        ),
        title: Text(_step == 'type' ? '상담 예약' : '상담 예약 - ${_selectedType?.label ?? ''}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pushNamed(context, '/consultation/my'),
            child: const Text('내 예약', style: TextStyle(color: Color(0xFF3B82F6))),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    switch (_step) {
      case 'type':
        return _buildTypeSelection();
      case 'check':
        return _checkingEligibility ? _buildLoading() : _buildEligibilityBlock();
      case 'survey':
        return _buildSurvey();
      case 'booking':
        return _buildBooking();
      default:
        return _buildTypeSelection();
    }
  }

  // === UI: 상담 유형 선택 ===
  Widget _buildTypeSelection() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('상담 유형을 선택해주세요',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        const Text('상담 목적에 맞는 유형을 선택하면 예약이 진행됩니다.',
            style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
        const SizedBox(height: 20),
        ..._consultationTypes.map((type) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: InkWell(
            onTap: () => _selectType(type),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE5E7EB)),
                boxShadow: [
                  BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6, offset: const Offset(0, 2)),
                ],
              ),
              child: Row(
                children: [
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(type.icon, color: const Color(0xFF3B82F6), size: 22),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(type.label,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 2),
                        Text(type.description,
                            style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: Color(0xFF9CA3AF)),
                ],
              ),
            ),
          ),
        )),
      ],
    );
  }

  // === UI: 로딩 ===
  Widget _buildLoading() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('상담 예약 자격을 확인하고 있습니다...', style: TextStyle(color: Color(0xFF6B7280))),
        ],
      ),
    );
  }

  // === UI: 자격 미달 ===
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
              const Text(
                '신청은 완료되었습니다. 학생부 파일을 업로드하면\n상담 예약이 가능합니다.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.6),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pushNamed(context, '/analysis'),
                  child: const Text('내 분석 목록에서 파일 업로드'),
                ),
              ),
            ] else ...[
              const Text(
                '학생부 라운지 또는 학종 라운지를 신청하고\n학생부 파일 업로드를 완료해주세요.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.6),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => Navigator.pushNamed(context, '/analysis/apply', arguments: '학생부라운지'),
                      child: const Text('학생부 라운지 신청', style: TextStyle(fontSize: 13)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pushNamed(context, '/analysis/apply', arguments: '학종라운지'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF22C55E),
                        side: const BorderSide(color: Color(0xFF22C55E)),
                      ),
                      child: const Text('학종 라운지 신청', style: TextStyle(fontSize: 13)),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            TextButton(
              onPressed: _goBack,
              child: const Text('다른 상담 유형 선택'),
            ),
          ],
        ),
      ),
    );
  }

  // === UI: 사전 조사 ===
  Widget _buildSurvey() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2)),
              ],
            ),
            child: Column(
              children: [
                const Icon(Icons.assignment_outlined, size: 48, color: Color(0xFF3B82F6)),
                const SizedBox(height: 16),
                const Text('사전 조사', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text(
                  '${_selectedType?.label ?? ''} 예약을 진행합니다.\n더 나은 상담을 위해 사전 조사가 준비 중입니다.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 14, color: Color(0xFF6B7280), height: 1.6),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _goToBooking,
                    child: const Text('예약 진행하기'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // === UI: 예약 (캘린더 + 슬롯 + 폼) ===
  Widget _buildBooking() {
    final today = DateTime.now();
    final todayStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    final datesWithSlots = Set<String>.from(_slots.map((s) => s.date));
    final firstDay = DateTime(_year, _month, 1).weekday % 7;
    final daysInMonth = DateTime(_year, _month + 1, 0).day;
    final slotsForDate = _selectedDate != null
        ? _slots.where((s) => s.date == _selectedDate).toList()
        : <ConsultationSlot>[];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // earliest_date 안내
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
              '${_earliestDate!.replaceAll('-', '.')} 이후 날짜부터 예약 가능합니다.',
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

        // 메시지
        if (_message != null)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFD1FAE5),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(_message!, style: const TextStyle(color: Color(0xFF065F46), fontSize: 13)),
          ),

        // 상담자 선택
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
                const Text('상담자 선택', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
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
                                  style: const TextStyle(color: Color(0xFF3B82F6), fontWeight: FontWeight.w700, fontSize: 16)),
                            ),
                            const SizedBox(width: 12),
                            Expanded(child: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                            const Text('선택', style: TextStyle(color: Color(0xFF3B82F6), fontSize: 13)),
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
                  backgroundColor: _isAssigned ? const Color(0xFF22C55E) : const Color(0xFF3B82F6),
                  child: Text(
                    _selectedCounselor!.name.isNotEmpty ? _selectedCounselor!.name[0] : '?',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
                  ),
                ),
                const SizedBox(width: 10),
                Text(_selectedCounselor!.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(width: 6),
                if (_isAssigned)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFFD1FAE5),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text('담당 상담자', style: TextStyle(fontSize: 10, color: Color(0xFF065F46), fontWeight: FontWeight.w600)),
                  )
                else
                  const Text('상담자', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                const Spacer(),
                if (!_isAssigned)
                  GestureDetector(
                    onTap: _changeCounselor,
                    child: const Text('변경', style: TextStyle(color: Color(0xFF3B82F6), fontSize: 13, decoration: TextDecoration.underline)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // 캘린더
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
                    Text('$_year년 $_month월', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    IconButton(onPressed: _nextMonth, icon: const Icon(Icons.chevron_right)),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: ['일', '월', '화', '수', '목', '금', '토']
                      .map((d) => Expanded(child: Center(child: Text(d, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))))))
                      .toList(),
                ),
                const SizedBox(height: 8),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, childAspectRatio: 1),
                  itemCount: firstDay + daysInMonth,
                  itemBuilder: (context, i) {
                    if (i < firstDay) return const SizedBox();
                    final day = i - firstDay + 1;
                    final dateStr = '$_year-${_month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
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
                          color: isSelected ? const Color(0xFF3B82F6) : isToday ? const Color(0xFFEFF6FF) : Colors.transparent,
                          shape: BoxShape.circle,
                        ),
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            Text('$day', style: TextStyle(
                              fontSize: 13,
                              color: isSelected ? Colors.white : isDisabled ? const Color(0xFFD1D5DB) : const Color(0xFF111827),
                              fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
                            )),
                            if (hasSlots && !isSelected && !isDisabled)
                              Positioned(
                                bottom: 4,
                                child: Container(width: 4, height: 4, decoration: const BoxDecoration(color: Color(0xFF3B82F6), shape: BoxShape.circle)),
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
                  Text('${_formatDateKr(_selectedDate!)} 예약 가능 시간',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  if (slotsForDate.isEmpty)
                    const Text('예약 가능한 시간이 없습니다', style: TextStyle(color: Color(0xFF6B7280)))
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
                            border: Border.all(color: _selectedSlot?.id == slot.id ? const Color(0xFF3B82F6) : const Color(0xFFE5E7EB)),
                          ),
                          child: Column(children: [
                            Text(slot.timeRange, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                              color: slot.remaining == 0 ? const Color(0xFF9CA3AF)
                                  : _selectedSlot?.id == slot.id ? Colors.white : const Color(0xFF111827))),
                            Text(slot.remaining > 0 ? '${slot.remaining}자리 남음' : '마감',
                                style: TextStyle(fontSize: 11,
                                  color: slot.remaining == 0 ? const Color(0xFF9CA3AF)
                                      : _selectedSlot?.id == slot.id ? Colors.white70 : const Color(0xFF6B7280))),
                          ]),
                        ),
                      )).toList(),
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
                  const Text('예약 정보 입력', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 16),
                  const Text('상담 유형', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 6),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFD1D5DB)),
                    ),
                    child: Text(_selectedType?.label ?? '', style: const TextStyle(fontSize: 15, color: Color(0xFF374151))),
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
