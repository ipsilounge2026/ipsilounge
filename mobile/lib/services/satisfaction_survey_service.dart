import 'api_service.dart';

class SatisfactionSurveyService {
  /// 스키마 조회 (인증 불필요)
  static Future<Map<String, dynamic>> getSchema(String surveyType) async {
    return Map<String, dynamic>.from(
      await ApiService.get('/satisfaction-surveys/schema?survey_type=$surveyType', auth: false),
    );
  }

  /// 내 만족도 설문 목록
  static Future<List<Map<String, dynamic>>> listMy() async {
    final res = await ApiService.get('/satisfaction-surveys');
    final surveys = res['surveys'] as List<dynamic>? ?? [];
    return surveys.map((e) => Map<String, dynamic>.from(e)).toList();
  }

  /// 단건 조회
  static Future<Map<String, dynamic>> get(String id) async {
    return Map<String, dynamic>.from(
      await ApiService.get('/satisfaction-surveys/$id'),
    );
  }

  /// 부분 저장
  static Future<Map<String, dynamic>> patch(String id, {Map<String, int>? scores, Map<String, String>? freeText}) async {
    final body = <String, dynamic>{};
    if (scores != null) body['scores'] = scores;
    if (freeText != null) body['free_text'] = freeText;
    return Map<String, dynamic>.from(
      await ApiService.patch('/satisfaction-surveys/$id', body),
    );
  }

  /// 제출
  static Future<Map<String, dynamic>> submit(String id) async {
    return Map<String, dynamic>.from(
      await ApiService.post('/satisfaction-surveys/$id/submit', {}),
    );
  }
}
