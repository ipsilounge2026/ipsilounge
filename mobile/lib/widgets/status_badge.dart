import 'package:flutter/material.dart';

class StatusBadge extends StatelessWidget {
  final String status;

  const StatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final config = _getConfig(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: config['bg'],
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        config['label']!,
        style: TextStyle(
          color: config['text'],
          fontSize: 12,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

  Map<String, dynamic> _getConfig(String status) {
    switch (status) {
      case 'applied':
        return {'label': '신청완료', 'bg': const Color(0xFFE8E0F0), 'text': const Color(0xFF5A3D8A)};
      case 'uploaded':
        return {'label': '업로드완료', 'bg': const Color(0xFFD1ECF1), 'text': const Color(0xFF0C5460)};
      case 'pending':
        return {'label': '접수완료', 'bg': const Color(0xFFFEF3C7), 'text': const Color(0xFF92400E)};
      case 'processing':
        return {'label': '분석중', 'bg': const Color(0xFFDBEAFE), 'text': const Color(0xFF1E40AF)};
      case 'completed':
        return {'label': '완료', 'bg': const Color(0xFFD1FAE5), 'text': const Color(0xFF065F46)};
      case 'cancelled':
        return {'label': '취소됨', 'bg': const Color(0xFFF3F4F6), 'text': const Color(0xFF6B7280)};
      case 'requested':
        return {'label': '예약신청', 'bg': const Color(0xFFFEF3C7), 'text': const Color(0xFF92400E)};
      case 'confirmed':
        return {'label': '예약확정', 'bg': const Color(0xFFDBEAFE), 'text': const Color(0xFF1E40AF)};
      default:
        return {'label': status, 'bg': const Color(0xFFF3F4F6), 'text': const Color(0xFF6B7280)};
    }
  }
}
