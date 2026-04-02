class Counselor {
  final String id;
  final String name;

  Counselor({required this.id, required this.name});

  factory Counselor.fromJson(Map<String, dynamic> json) {
    return Counselor(
      id: json['id'],
      name: json['name'],
    );
  }
}

class ConsultationSlot {
  final String id;
  final String date;
  final String startTime;
  final String endTime;
  final int remaining;
  final String? adminId;
  final String? adminName;

  ConsultationSlot({
    required this.id,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.remaining,
    this.adminId,
    this.adminName,
  });

  factory ConsultationSlot.fromJson(Map<String, dynamic> json) {
    return ConsultationSlot(
      id: json['id'],
      date: json['date'],
      startTime: json['start_time'],
      endTime: json['end_time'],
      remaining: json['remaining'] ?? 0,
      adminId: json['admin_id'],
      adminName: json['admin_name'],
    );
  }

  String get timeRange =>
      '${startTime.substring(0, 5)} ~ ${endTime.substring(0, 5)}';
}

class ConsultationBooking {
  final String id;
  final String slotDate;
  final String slotStartTime;
  final String slotEndTime;
  final String type;
  final String? memo;
  final String status;
  final String createdAt;

  ConsultationBooking({
    required this.id,
    required this.slotDate,
    required this.slotStartTime,
    required this.slotEndTime,
    required this.type,
    this.memo,
    required this.status,
    required this.createdAt,
  });

  factory ConsultationBooking.fromJson(Map<String, dynamic> json) {
    return ConsultationBooking(
      id: json['id'],
      slotDate: json['slot_date'],
      slotStartTime: json['slot_start_time'],
      slotEndTime: json['slot_end_time'],
      type: json['type'],
      memo: json['memo'],
      status: json['status'],
      createdAt: json['created_at'],
    );
  }

  String get statusLabel {
    switch (status) {
      case 'requested': return '신청완료';
      case 'confirmed': return '예약확정';
      case 'completed': return '상담완료';
      case 'cancelled': return '취소됨';
      default: return status;
    }
  }

  bool get canCancel => status == 'requested' || status == 'confirmed';
}
