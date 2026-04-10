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
}
