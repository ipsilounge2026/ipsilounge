import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/blog_news_item.dart';
import 'api_service.dart';

/// 입시 뉴스(네이버 블로그 RSS) 서비스.
/// 백엔드 `/api/blog-news` 호출 (1시간 캐싱이 백엔드에 적용됨).
class BlogNewsService {
  static const String _path = '/blog-news';

  /// 최근 [limit] 건의 입시 뉴스를 반환.
  /// 백엔드가 실패하면 [BlogNewsResult.error] 에 사유.
  static Future<BlogNewsResult> fetchNews({int limit = 20}) async {
    try {
      final uri = Uri.parse('${ApiService.baseUrl}$_path?limit=$limit');
      final resp = await http.get(uri, headers: {'Content-Type': 'application/json'});
      if (resp.statusCode != 200) {
        return BlogNewsResult(items: const [], error: 'HTTP ${resp.statusCode}');
      }
      final body = json.decode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
      final items = ((body['items'] ?? []) as List)
          .map((e) => BlogNewsItem.fromJson(e as Map<String, dynamic>))
          .toList();
      return BlogNewsResult(
        items: items,
        blogUrl: (body['blog_url'] ?? '').toString(),
        error: body['error']?.toString(),
      );
    } catch (e) {
      return BlogNewsResult(items: const [], error: e.toString());
    }
  }
}

class BlogNewsResult {
  final List<BlogNewsItem> items;
  final String blogUrl;
  final String? error;

  BlogNewsResult({
    required this.items,
    this.blogUrl = 'https://blog.naver.com/consultinggogo',
    this.error,
  });
}
