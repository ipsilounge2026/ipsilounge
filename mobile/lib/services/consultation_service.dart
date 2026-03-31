import 'api_service.dart';
import '../models/consultation.dart';

class ConsultationService {
  static Future<List<ConsultationSlot>> getAvailableSlots(
      int year, int month) async {
    final res =
        await ApiService.get('/consultation/slots?year=$year&month=$month');
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
