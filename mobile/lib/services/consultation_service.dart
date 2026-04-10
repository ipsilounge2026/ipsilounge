import 'api_service.dart';
import '../models/consultation.dart';

class ConsultationService {
  /// 기존 자격 확인 (하위 호환)
  static Future<Map<String, dynamic>> checkEligible() async {
    return await ApiService.get('/analysis/check-consultation-eligible');
  }

  /// 상담 유형별 자격 확인
  static Future<Map<String, dynamic>> checkEligibleByType(String consultationType) async {
    return await ApiService.get(
        '/analysis/check-consultation-eligible?consultation_type=${Uri.encodeComponent(consultationType)}');
  }

  /// 예약 쿨다운 확인
  static Future<Map<String, dynamic>> checkBookingCooldown() async {
    return await ApiService.get('/consultation/check-booking-cooldown');
  }

  /// 상담자 목록 (배정 정보 포함)
  static Future<Map<String, dynamic>> getCounselorsWithAssignment() async {
    final res = await ApiService.get('/consultation/counselors');
    return Map<String, dynamic>.from(res);
  }

  /// 기존 상담자 목록 (하위 호환 - 새 API 형식 래핑)
  static Future<List<Counselor>> getCounselors() async {
    final res = await getCounselorsWithAssignment();
    final items = res['counselors'] as List;
    return items.map((e) => Counselor.fromJson(e)).toList();
  }

  /// 내 담당 상담자 조회
  static Future<Map<String, dynamic>> getMyCounselor() async {
    return await ApiService.get('/consultation/my-counselor');
  }

  /// 변경 가능한 상담자 목록
  static Future<List<Counselor>> getAvailableCounselors() async {
    final res = await ApiService.get('/consultation/available-counselors');
    final items = res as List;
    return items.map((e) => Counselor.fromJson(e)).toList();
  }

  /// 담당자 변경 요청
  static Future<void> requestCounselorChange(String? requestedAdminId, String reason) async {
    await ApiService.post('/consultation/change-counselor-request', {
      'requested_admin_id': requestedAdminId,
      'reason': reason,
    });
  }

  static Future<List<ConsultationSlot>> getAvailableSlots(
      int year, int month, {String? adminId}) async {
    String url = '/consultation/slots?year=$year&month=$month';
    if (adminId != null) url += '&admin_id=$adminId';
    final res = await ApiService.get(url);
    final items = res as List;
    return items.map((e) => ConsultationSlot.fromJson(e)).toList();
  }

  static Future<void> book(String slotId, String type, String? memo, {String? ownerUserId}) async {
    await ApiService.post('/consultation/book', {
      'slot_id': slotId,
      'type': type,
      if (memo != null && memo.isNotEmpty) 'memo': memo,
      if (ownerUserId != null && ownerUserId.isNotEmpty) 'owner_user_id': ownerUserId,
    });
  }

  static Future<List<ConsultationBooking>> getMyBookings() async {
    final res = await ApiService.get('/consultation/my');
    final items = res['items'] as List;
    return items.map((e) => ConsultationBooking.fromJson(e)).toList();
  }

  static Future<void> cancelBooking(String id) async {
    await ApiService.put('/consultation/$id/cancel', {});
  }
}
