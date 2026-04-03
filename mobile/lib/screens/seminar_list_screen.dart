import 'package:flutter/material.dart';
import '../services/seminar_service.dart';
import 'seminar_screen.dart';

const _timeSlotLabels = {'morning': '오전', 'afternoon': '오후', 'evening': '저녁'};
const _statusLabels = {'pending': '승인대기', 'modified': '수정대기', 'approved': '승인완료', 'cancelled': '취소'};
const _statusColors = {
  'pending': Color(0xFFF59E0B),
  'modified': Color(0xFF8B5CF6),
  'approved': Color(0xFF10B981),
  'cancelled': Color(0xFF9CA3AF),
};

class SeminarListScreen extends StatefulWidget {
  const SeminarListScreen({super.key});

  @override
  State<SeminarListScreen> createState() => _SeminarListScreenState();
}

class _SeminarListScreenState extends State<SeminarListScreen> {
  bool _loading = true;
  List<dynamic> _reservations = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await SeminarService.getMyReservations();
      setState(() {
        _reservations = data['items'] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  void _showCancelDialog(String id) {
    final reasonCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('예약 취소'),
        content: TextField(
          controller: reasonCtrl,
          decoration: const InputDecoration(labelText: '취소 사유', border: OutlineInputBorder()),
          maxLines: 3,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('닫기')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () async {
              if (reasonCtrl.text.trim().isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('취소 사유를 입력해주세요')));
                return;
              }
              try {
                await SeminarService.cancelReservation(id, cancelReason: reasonCtrl.text.trim());
                Navigator.pop(ctx);
                _load();
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
              }
            },
            child: const Text('취소 확정', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showModifyDialog(Map<String, dynamic> res) {
    final nameCtrl = TextEditingController(text: res['contact_name'] ?? '');
    final phoneCtrl = TextEditingController(text: res['contact_phone'] ?? '');
    final countCtrl = TextEditingController(text: (res['attendee_count'] ?? 1).toString());
    final memoCtrl = TextEditingController(text: res['memo'] ?? '');
    final reasonCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('예약 수정'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: '담당자 이름', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: phoneCtrl, decoration: const InputDecoration(labelText: '연락처', border: OutlineInputBorder()), keyboardType: TextInputType.phone),
              const SizedBox(height: 8),
              TextField(controller: countCtrl, decoration: const InputDecoration(labelText: '참석 예정 인원', border: OutlineInputBorder()), keyboardType: TextInputType.number),
              const SizedBox(height: 8),
              TextField(controller: memoCtrl, decoration: const InputDecoration(labelText: '요청사항', border: OutlineInputBorder()), maxLines: 2),
              const SizedBox(height: 8),
              TextField(controller: reasonCtrl, decoration: const InputDecoration(labelText: '수정 사유 *', border: OutlineInputBorder(), hintText: '수정 사유를 입력하세요'), maxLines: 2),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('닫기')),
          ElevatedButton(
            onPressed: () async {
              if (reasonCtrl.text.trim().isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('수정 사유를 입력해주세요')));
                return;
              }
              try {
                await SeminarService.modifyReservation(
                  res['id'],
                  contactName: nameCtrl.text.trim(),
                  contactPhone: phoneCtrl.text.trim(),
                  attendeeCount: int.tryParse(countCtrl.text) ?? 1,
                  memo: memoCtrl.text.trim(),
                  modifyReason: reasonCtrl.text.trim(),
                );
                Navigator.pop(ctx);
                _load();
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
              }
            },
            child: const Text('수정 완료'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('내 설명회 예약'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const SeminarScreen())),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _reservations.isEmpty
              ? const Center(child: Text('예약 내역이 없습니다', style: TextStyle(color: Colors.grey)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _reservations.length,
                    itemBuilder: (ctx, i) => _buildReservationCard(_reservations[i]),
                  ),
                ),
    );
  }

  Widget _buildReservationCard(dynamic res) {
    final status = res['status'] ?? '';
    final color = _statusColors[status] ?? Colors.grey;

    return Opacity(
      opacity: status == 'cancelled' ? 0.5 : 1.0,
      child: Card(
        margin: const EdgeInsets.only(bottom: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(child: Text(res['schedule_title'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15))),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), color: color),
                    child: Text(_statusLabels[status] ?? status, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text('${res['reservation_date']} (${_timeSlotLabels[res['time_slot']] ?? res['time_slot']})', style: const TextStyle(fontSize: 14)),
              Text('담당자: ${res['contact_name']} | ${res['contact_phone']}', style: const TextStyle(fontSize: 13, color: Colors.grey)),
              Text('참석 예정: ${res['attendee_count']}명', style: const TextStyle(fontSize: 13, color: Colors.grey)),
              if (res['actual_attendee_count'] != null) Text('실제 참석: ${res['actual_attendee_count']}명', style: const TextStyle(fontSize: 13, color: Colors.green)),
              if (res['memo'] != null && res['memo'].toString().isNotEmpty)
                Padding(padding: const EdgeInsets.only(top: 4), child: Text('메모: ${res['memo']}', style: const TextStyle(fontSize: 12, color: Colors.grey))),
              if (res['modify_reason'] != null && res['modify_reason'].toString().isNotEmpty)
                Padding(padding: const EdgeInsets.only(top: 4), child: Text('수정 사유: ${res['modify_reason']}', style: const TextStyle(fontSize: 12, color: Colors.purple))),
              if (res['cancel_reason'] != null && res['cancel_reason'].toString().isNotEmpty)
                Padding(padding: const EdgeInsets.only(top: 4), child: Text('취소 사유: ${res['cancel_reason']}', style: const TextStyle(fontSize: 12, color: Colors.grey))),
              if (status != 'cancelled') ...[
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    OutlinedButton(
                      onPressed: () => _showModifyDialog(Map<String, dynamic>.from(res)),
                      child: const Text('수정'),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      onPressed: () => _showCancelDialog(res['id']),
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.red, side: const BorderSide(color: Colors.red)),
                      child: const Text('취소'),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
