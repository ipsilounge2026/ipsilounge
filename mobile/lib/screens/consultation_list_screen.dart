import 'package:flutter/material.dart';
import '../models/consultation.dart';
import '../services/consultation_service.dart';
import '../widgets/status_badge.dart';

class ConsultationListScreen extends StatefulWidget {
  const ConsultationListScreen({super.key});

  @override
  State<ConsultationListScreen> createState() => _ConsultationListScreenState();
}

class _ConsultationListScreenState extends State<ConsultationListScreen> {
  List<ConsultationBooking> _bookings = [];
  bool _isLoading = true;
  String? _message;

  @override
  void initState() {
    super.initState();
    _loadBookings();
  }

  Future<void> _loadBookings() async {
    setState(() => _isLoading = true);
    try {
      final bookings = await ConsultationService.getMyBookings();
      setState(() => _bookings = bookings);
    } catch (_) {} finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _cancel(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('예약 취소'),
        content: const Text('상담 예약을 취소하시겠습니까?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('아니오')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('취소하기', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ConsultationService.cancelBooking(id);
      setState(() => _message = '예약이 취소되었습니다');
      _loadBookings();
    } catch (e) {
      setState(() => _message = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('내 상담 예약'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pushNamed(context, '/consultation'),
            child: const Text('새 예약', style: TextStyle(color: Color(0xFF3B82F6))),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadBookings,
              child: _bookings.isEmpty
                  ? ListView(
                      children: [
                        SizedBox(
                          height: MediaQuery.of(context).size.height * 0.5,
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.calendar_today_outlined,
                                  size: 56, color: Color(0xFFD1D5DB)),
                              const SizedBox(height: 16),
                              const Text(
                                '예약된 상담이 없습니다',
                                style: TextStyle(color: Color(0xFF6B7280)),
                              ),
                              const SizedBox(height: 16),
                              ElevatedButton(
                                onPressed: () =>
                                    Navigator.pushNamed(context, '/consultation'),
                                child: const Text('상담 예약하기'),
                              ),
                            ],
                          ),
                        ),
                      ],
                    )
                  : ListView(
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
                                style: const TextStyle(
                                    color: Color(0xFF065F46), fontSize: 13)),
                          ),
                        ..._bookings.map((b) => Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.05),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        _formatDateKr(b.slotDate),
                                        style: const TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w700),
                                      ),
                                      StatusBadge(status: b.status),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    '${b.slotStartTime.substring(0, 5)} ~ ${b.slotEndTime.substring(0, 5)} | ${b.type}',
                                    style: const TextStyle(
                                        fontSize: 13, color: Color(0xFF6B7280)),
                                  ),
                                  if (b.memo != null) ...[
                                    const SizedBox(height: 4),
                                    Text(
                                      '메모: ${b.memo}',
                                      style: const TextStyle(
                                          fontSize: 12, color: Color(0xFF9CA3AF)),
                                    ),
                                  ],
                                  if (b.canCancel) ...[
                                    const SizedBox(height: 12),
                                    Align(
                                      alignment: Alignment.centerRight,
                                      child: OutlinedButton(
                                        onPressed: () => _cancel(b.id),
                                        style: OutlinedButton.styleFrom(
                                          foregroundColor: const Color(0xFFEF4444),
                                          side: const BorderSide(
                                              color: Color(0xFFEF4444)),
                                          minimumSize: const Size(0, 32),
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 12),
                                        ),
                                        child: const Text('예약 취소',
                                            style: TextStyle(fontSize: 13)),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            )),
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
