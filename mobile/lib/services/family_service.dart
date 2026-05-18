import 'api_service.dart';

class FamilyService {
  /// 내 가족 연결 목록 조회
  static Future<List<Map<String, dynamic>>> getLinks() async {
    final res = await ApiService.get('/family/links');
    final items = (res['items'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    return items;
  }

  /// 연결된 자녀 목록만 추출 (학부모 전용)
  static Future<List<Map<String, dynamic>>> getLinkedChildren() async {
    final links = await getLinks();
    return links
        .where((item) => item['role'] == 'child')
        .map((item) => Map<String, dynamic>.from(item['member'] as Map))
        .toList();
  }

  /// 초대 코드 생성
  static Future<Map<String, dynamic>> createInvite() async {
    final res = await ApiService.post('/family/invite', {});
    return Map<String, dynamic>.from(res as Map);
  }

  /// 초대 코드로 연결
  static Future<Map<String, dynamic>> connectByCode(String code) async {
    final res = await ApiService.post('/family/connect', {'code': code});
    return Map<String, dynamic>.from(res as Map);
  }

  /// 연결 해제
  static Future<void> revokeLink(String linkId) async {
    await ApiService.delete('/family/links/$linkId');
  }
}
