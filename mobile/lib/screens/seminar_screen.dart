import 'package:flutter/material.dart';
import '../services/seminar_service.dart';
import 'seminar_list_screen.dart';

class SeminarScreen extends StatefulWidget {
  const SeminarScreen({super.key});

  @override
  State<SeminarScreen> createState() => _SeminarScreenState();
}

class _SeminarScreenState extends State<SeminarScreen> {
  bool _loading = true;
  List<dynamic> _schedules = [];
  Map<String, dynamic>? _selectedSchedule;
  Map<String, dynamic>? _availability;
  DateTime _focusedMonth = DateTime.now();
  String? _selectedDate;
  String? _selectedSlot;

  final _contactNameCtrl = TextEditingController();
  final _contactPhoneCtrl = TextEditingController();
  final _attendeeCountCtrl = TextEditingController(text: '1');
  final _memoCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadSchedules();
  }

  Future<void> _loadSchedules() async {
    try {
      final data = await SeminarService.getSchedules();
      setState(() {
        _schedules = data;
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  Future<void> _loadAvailability(String scheduleId) async {
    try {
      final data = await SeminarService.getAvailability(scheduleId);
      setState(() {
        _availability = data;
        _selectedDate = null;
        _selectedSlot = null;
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('가용 정보를 불러올 수 없습니다')),
      );
    }
  }

  Map<String, Map<String, dynamic>> get _availableDatesMap {
    if (_availability == null) return {};
    final dates = _availability!['available_dates'] as List? ?? [];
    final map = <String, Map<String, dynamic>>{};
    for (final d in dates) {
      map[d['date']] = Map<String, dynamic>.from(d);
    }
    return map;
  }

  List<Map<String, dynamic>> get _dateSlots {
    if (_selectedDate == null || !_availableDatesMap.containsKey(_selectedDate)) return [];
    final info = _availableDatesMap[_selectedDate]!;
    final slots = <Map<String, dynamic>>[];
    if ((info['morning_remaining'] ?? 0) > 0) slots.add({'key': 'morning', 'label': '오전', 'remaining': info['morning_remaining']});
    if ((info['afternoon_remaining'] ?? 0) > 0) slots.add({'key': 'afternoon', 'label': '오후', 'remaining': info['afternoon_remaining']});
    if ((info['evening_remaining'] ?? 0) > 0) slots.add({'key': 'evening', 'label': '저녁', 'remaining': info['evening_remaining']});
    return slots;
  }

  Future<void> _submit() async {
    if (_selectedSchedule == null || _selectedDate == null || _selectedSlot == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('설명회, 날짜, 시간대를 선택해주세요')));
      return;
    }
    final name = _contactNameCtrl.text.trim();
    final phone = _contactPhoneCtrl.text.trim();
    final count = int.tryParse(_attendeeCountCtrl.text) ?? 0;
    if (name.isEmpty || phone.isEmpty || count < 1) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('담당자 정보와 참석 인원을 입력해주세요')));
      return;
    }
    setState(() => _submitting = true);
    try {
      await SeminarService.createReservation(
        scheduleId: _selectedSchedule!['id'],
        reservationDate: _selectedDate!,
        timeSlot: _selectedSlot!,
        contactName: name,
        contactPhone: phone,
        attendeeCount: count,
        memo: _memoCtrl.text.trim().isEmpty ? null : _memoCtrl.text.trim(),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('예약 신청이 완료되었습니다')));
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const SeminarListScreen()));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('설명회 예약'),
        actions: [
          TextButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SeminarListScreen())),
            child: const Text('내 예약', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _schedules.isEmpty
              ? const Center(child: Text('현재 신청 가능한 설명회가 없습니다', style: TextStyle(color: Colors.grey)))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 설명회 선택
                      const Text('설명회 선택', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      ..._schedules.map((s) => _buildScheduleCard(s)),

                      // 캘린더
                      if (_availability != null) ...[
                        const SizedBox(height: 24),
                        const Text('날짜 선택', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        _buildCalendar(),
                      ],

                      // 시간대 선택
                      if (_selectedDate != null && _dateSlots.isNotEmpty) ...[
                        const SizedBox(height: 24),
                        Text('$_selectedDate 시간대 선택', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        Row(
                          children: _dateSlots.map((slot) => Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() => _selectedSlot = slot['key']),
                              child: Container(
                                margin: const EdgeInsets.symmetric(horizontal: 4),
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: _selectedSlot == slot['key'] ? Colors.blue : Colors.grey.shade300, width: _selectedSlot == slot['key'] ? 2 : 1),
                                  color: _selectedSlot == slot['key'] ? Colors.blue.shade50 : Colors.white,
                                ),
                                child: Column(
                                  children: [
                                    Text(slot['label'], style: const TextStyle(fontWeight: FontWeight.bold)),
                                    Text('잔여 ${slot['remaining']}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                                  ],
                                ),
                              ),
                            ),
                          )).toList(),
                        ),
                      ],

                      // 신청 폼
                      if (_selectedSlot != null) ...[
                        const SizedBox(height: 24),
                        const Text('신청 정보', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        TextField(controller: _contactNameCtrl, decoration: const InputDecoration(labelText: '담당자 이름 *', border: OutlineInputBorder())),
                        const SizedBox(height: 12),
                        TextField(controller: _contactPhoneCtrl, decoration: const InputDecoration(labelText: '연락처 *', border: OutlineInputBorder()), keyboardType: TextInputType.phone),
                        const SizedBox(height: 12),
                        TextField(controller: _attendeeCountCtrl, decoration: const InputDecoration(labelText: '참석 예정 인원 *', border: OutlineInputBorder()), keyboardType: TextInputType.number),
                        const SizedBox(height: 12),
                        TextField(controller: _memoCtrl, decoration: const InputDecoration(labelText: '요청사항 (선택)', border: OutlineInputBorder()), maxLines: 3),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _submitting ? null : _submit,
                            style: ElevatedButton.styleFrom(padding: const EdgeInsets.all(16)),
                            child: Text(_submitting ? '신청 중...' : '예약 신청', style: const TextStyle(fontSize: 16)),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
    );
  }

  Widget _buildScheduleCard(dynamic sched) {
    final isSelected = _selectedSchedule?['id'] == sched['id'];
    return GestureDetector(
      onTap: () {
        setState(() => _selectedSchedule = Map<String, dynamic>.from(sched));
        _loadAvailability(sched['id']);
      },
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isSelected ? Colors.blue : Colors.grey.shade300, width: isSelected ? 2 : 1),
          color: isSelected ? Colors.blue.shade50 : Colors.white,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(sched['title'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            if (sched['description'] != null && sched['description'].toString().isNotEmpty)
              Padding(padding: const EdgeInsets.only(top: 4), child: Text(sched['description'], style: const TextStyle(fontSize: 13, color: Colors.grey))),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('${sched['start_date']} ~ ${sched['end_date']}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCalendar() {
    final year = _focusedMonth.year;
    final month = _focusedMonth.month;
    final firstDay = DateTime(year, month, 1).weekday % 7;
    final daysInMonth = DateTime(year, month + 1, 0).day;
    final dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade300)),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => setState(() => _focusedMonth = DateTime(year, month - 1))),
              Text('$year년 $month월', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => setState(() => _focusedMonth = DateTime(year, month + 1))),
            ],
          ),
          Row(children: dayLabels.map((d) => Expanded(child: Center(child: Text(d, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: d == '일' ? Colors.red : d == '토' ? Colors.blue : Colors.grey))))).toList()),
          const SizedBox(height: 4),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, childAspectRatio: 1),
            itemCount: firstDay + daysInMonth,
            itemBuilder: (ctx, index) {
              if (index < firstDay) return const SizedBox();
              final day = index - firstDay + 1;
              final dateStr = '$year-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
              final avail = _availableDatesMap[dateStr];
              final isSelected = _selectedDate == dateStr;

              return GestureDetector(
                onTap: avail != null ? () => setState(() { _selectedDate = dateStr; _selectedSlot = null; }) : null,
                child: Container(
                  margin: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    color: isSelected ? Colors.blue : avail != null ? Colors.blue.shade50 : null,
                  ),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('$day', style: TextStyle(
                          fontSize: 14,
                          fontWeight: avail != null ? FontWeight.bold : FontWeight.normal,
                          color: isSelected ? Colors.white : avail != null ? Colors.blue.shade900 : Colors.grey.shade400,
                        )),
                        if (avail != null)
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if ((avail['morning_remaining'] ?? 0) > 0) Container(width: 4, height: 4, margin: const EdgeInsets.all(1), decoration: BoxDecoration(shape: BoxShape.circle, color: isSelected ? Colors.white : Colors.amber)),
                              if ((avail['afternoon_remaining'] ?? 0) > 0) Container(width: 4, height: 4, margin: const EdgeInsets.all(1), decoration: BoxDecoration(shape: BoxShape.circle, color: isSelected ? Colors.white : Colors.green)),
                              if ((avail['evening_remaining'] ?? 0) > 0) Container(width: 4, height: 4, margin: const EdgeInsets.all(1), decoration: BoxDecoration(shape: BoxShape.circle, color: isSelected ? Colors.white : Colors.purple)),
                            ],
                          ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _contactNameCtrl.dispose();
    _contactPhoneCtrl.dispose();
    _attendeeCountCtrl.dispose();
    _memoCtrl.dispose();
    super.dispose();
  }
}
