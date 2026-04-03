import 'api_service.dart';

class SeminarService {
  /// 공개 설명회 일정 목록
  static Future<List<dynamic>> getSchedules() async {
    final data = await ApiService.get('/seminar/schedules');
    return data is List ? data : [];
  }

  /// 설명회 가용 날짜 + 잔여 현황
  static Future<Map<String, dynamic>> getAvailability(String scheduleId) async {
    final data = await ApiService.get('/seminar/schedules/$scheduleId/availability');
    return data is Map<String, dynamic> ? data : {};
  }

  /// 예약 신청
  static Future<dynamic> createReservation({
    required String scheduleId,
    required String reservationDate,
    required String timeSlot,
    required String contactName,
    required String contactPhone,
    required int attendeeCount,
    String? memo,
  }) async {
    final body = {
      'schedule_id': scheduleId,
      'reservation_date': reservationDate,
      'time_slot': timeSlot,
      'contact_name': contactName,
      'contact_phone': contactPhone,
      'attendee_count': attendeeCount,
    };
    if (memo != null && memo.isNotEmpty) body['memo'] = memo;
    return ApiService.post('/seminar/reserve', body);
  }

  /// 내 예약 목록
  static Future<Map<String, dynamic>> getMyReservations() async {
    final data = await ApiService.get('/seminar/my');
    return data is Map<String, dynamic> ? data : {'items': [], 'total': 0};
  }

  /// 예약 수정
  static Future<dynamic> modifyReservation(
    String reservationId, {
    String? contactName,
    String? contactPhone,
    int? attendeeCount,
    String? memo,
    required String modifyReason,
  }) async {
    final body = <String, dynamic>{
      'modify_reason': modifyReason,
    };
    if (contactName != null) body['contact_name'] = contactName;
    if (contactPhone != null) body['contact_phone'] = contactPhone;
    if (attendeeCount != null) body['attendee_count'] = attendeeCount;
    if (memo != null) body['memo'] = memo;
    return ApiService.put('/seminar/$reservationId', body);
  }

  /// 예약 취소
  static Future<dynamic> cancelReservation(
    String reservationId, {
    required String cancelReason,
  }) async {
    return ApiService.put('/seminar/$reservationId/cancel', {
      'cancel_reason': cancelReason,
    });
  }
}
