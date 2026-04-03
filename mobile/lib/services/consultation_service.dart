import 'api_service.dart';
import '../models/consultation.dart';

class ConsultationService {
  static Future<Map<String, dynamic>> checkEligible() async {
    return await ApiService.get('/analysis/check-consultation-eligible');
  }

  static Future<List<Counselor>> getCounselors() async {
    final res = await ApiService.get('/consultation/counselors');
    final items = res as List;
    return items.map((e) => Counselor.fromJson(e)).toList();
  }

  static Future<List<ConsultationSlot>> getAvailableSlots(
      int year, int month, {String? adminId}) async {
    String url = '/consultation/slots?year=$year&month=$month';
    if (adminId != null) url += '&admin_id=$adminId';
    final res = await ApiService.get(url);
    final items = res as List;
    return items.map((e) => ConsultationSlot.fromJson(e)).toList();
  }

  static Future<void> book(String slotId, String type, String? memo) async {
    await ApiService.post('/consultation/book', {
      'slot_id': slotId,
      'type': type,
      if (memo != null && memo.isNotEmpty) 'memo': memo,
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
