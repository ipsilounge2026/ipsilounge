import 'api_service.dart';

class SeniorPreSurveyService {
  /// 스키마 조회 (인증 불필요)
  static Future<Map<String, dynamic>> getSchema({String? sessionTiming}) async {
    String path = '/senior-pre-surveys/schema';
    if (sessionTiming != null) path += '?session_timing=$sessionTiming';
    return Map<String, dynamic>.from(
      await ApiService.get(path, auth: false),
    );
  }

  /// 설문 생성 (동일 session_number draft가 있으면 그것을 반환)
  static Future<Map<String, dynamic>> create({
    required int sessionNumber,
    String? sessionTiming,
    String? bookingId,
  }) async {
    return Map<String, dynamic>.from(
      await ApiService.post('/senior-pre-surveys', {
        'session_number': sessionNumber,
        if (sessionTiming != null) 'session_timing': sessionTiming,
        if (bookingId != null) 'booking_id': bookingId,
      }),
    );
  }

  /// 내 설문 목록
  static Future<List<Map<String, dynamic>>> listMy() async {
    final res = await ApiService.get('/senior-pre-surveys');
    final surveys = res['surveys'] as List<dynamic>? ?? [];
    return surveys.map((e) => Map<String, dynamic>.from(e)).toList();
  }

  /// 단건 조회
  static Future<Map<String, dynamic>> get(String id) async {
    return Map<String, dynamic>.from(
      await ApiService.get('/senior-pre-surveys/$id'),
    );
  }

  /// 부분 저장
  static Future<Map<String, dynamic>> patch(String id, Map<String, dynamic> answers) async {
    return Map<String, dynamic>.from(
      await ApiService.patch('/senior-pre-surveys/$id', {'answers': answers}),
    );
  }

  /// 제출
  static Future<Map<String, dynamic>> submit(String id) async {
    return Map<String, dynamic>.from(
      await ApiService.post('/senior-pre-surveys/$id/submit', {}),
    );
  }
}
