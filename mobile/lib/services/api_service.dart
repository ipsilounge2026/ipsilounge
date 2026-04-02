import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, {this.statusCode});
  @override
  String toString() => message;
}

class ApiService {
  static const String baseUrl = 'https://api.ipsilounge.co.kr/api';
  static const String serverBase = 'https://api.ipsilounge.co.kr';

  /// 다운로드 URL이 상대경로(/api/files/...)이면 서버 주소를 붙여서 전체 URL로 변환
  static String toFullUrl(String url) {
    if (url.startsWith('/')) return '$serverBase$url';
    return url;
  }

  static Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('user_token');
  }

  static Future<Map<String, String>> _headers({bool auth = true}) async {
    final headers = {'Content-Type': 'application/json'};
    if (auth) {
      final token = await _getToken();
      if (token != null) headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  static Future<dynamic> get(String path, {bool auth = true}) async {
    final res = await http.get(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(auth: auth),
    );
    return _handleResponse(res);
  }

  static Future<dynamic> post(String path, Map<String, dynamic> body,
      {bool auth = true}) async {
    final res = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(auth: auth),
      body: jsonEncode(body),
    );
    return _handleResponse(res);
  }

  static Future<dynamic> put(String path, Map<String, dynamic> body) async {
    final res = await http.put(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return _handleResponse(res);
  }

  static Future<dynamic> uploadFile(
      String path, File file, String fieldName, Map<String, String> fields) async {
    final token = await _getToken();
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl$path'));
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    request.files.add(await http.MultipartFile.fromPath(fieldName, file.path));
    request.fields.addAll(fields);
    final streamedResponse = await request.send();
    final res = await http.Response.fromStream(streamedResponse);
    return _handleResponse(res);
  }

  static dynamic _handleResponse(http.Response res) {
    final body = jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return body;
    }
    final message = body['detail'] ?? '오류가 발생했습니다';
    throw ApiException(message is String ? message : message.toString(),
        statusCode: res.statusCode);
  }
}
