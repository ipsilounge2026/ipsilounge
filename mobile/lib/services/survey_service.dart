import 'api_service.dart';

class SurveyService {
  /// 설문 스키마 조회 (인증 불필요)
  static Future<Map<String, dynamic>> getSchema(String surveyType) async {
    return Map<String, dynamic>.from(
      await ApiService.get('/consultation-surveys/schema/$surveyType', auth: false),
    );
  }

  /// timing/mode 추천
  static Future<Map<String, dynamic>> getSuggest(String surveyType) async {
    return Map<String, dynamic>.from(
      await ApiService.get('/consultation-surveys/suggest/$surveyType'),
    );
  }

  /// 설문 생성
  static Future<Map<String, dynamic>> create({
    required String surveyType,
    String? timing,
    String? mode,
    String startedPlatform = 'mobile',
    String? ownerUserId,
  }) async {
    return Map<String, dynamic>.from(
      await ApiService.post('/consultation-surveys', {
        'survey_type': surveyType,
        if (timing != null) 'timing': timing,
        if (mode != null) 'mode': mode,
        'started_platform': startedPlatform,
        if (ownerUserId != null) 'owner_user_id': ownerUserId,
      }),
    );
  }

  /// 내 설문 목록
  static Future<List<Map<String, dynamic>>> listMy({String? surveyType, String? status}) async {
    String path = '/consultation-surveys?';
    if (surveyType != null) path += 'survey_type=$surveyType&';
    if (status != null) path += 'status=$status&';
    final res = await ApiService.get(path);
    final items = res['items'] as List;
    return items.map((e) => Map<String, dynamic>.from(e)).toList();
  }

  /// 설문 상세 조회
  static Future<Map<String, dynamic>> get(String id) async {
    return Map<String, dynamic>.from(
      await ApiService.get('/consultation-surveys/$id'),
    );
  }

  /// 부분 저장 (자동 저장)
  static Future<Map<String, dynamic>> patch(String id, Map<String, dynamic> data) async {
    return Map<String, dynamic>.from(
      await ApiService.patch('/consultation-surveys/$id', {
        ...data,
        'last_edited_platform': 'mobile',
      }),
    );
  }

  /// 제출
  static Future<void> submit(String id) async {
    await ApiService.post('/consultation-surveys/$id/submit', {'confirm': true});
  }

  /// 삭제 (draft만)
  static Future<void> delete(String id) async {
    await ApiService.delete('/consultation-surveys/$id');
  }

  /// 이어쓰기 토큰 발급
  static Future<Map<String, dynamic>> issueResumeToken(
    String id, {
    int expiresInHours = 72,
    bool sendEmail = false,
  }) async {
    return Map<String, dynamic>.from(
      await ApiService.post('/consultation-surveys/$id/resume-token', {
        'expires_in_hours': expiresInHours,
        'send_email': sendEmail,
      }),
    );
  }
}
