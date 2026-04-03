import 'dart:io';
import 'api_service.dart';
import '../models/analysis_order.dart';

class AnalysisService {
  static Future<List<AnalysisOrder>> getList() async {
    final res = await ApiService.get('/analysis/list');
    final items = res['items'] as List;
    return items.map((e) => AnalysisOrder.fromJson(e)).toList();
  }

  static Future<AnalysisOrder> getDetail(String id) async {
    final res = await ApiService.get('/analysis/$id');
    return AnalysisOrder.fromJson(res);
  }

  /// 신청만 (파일 업로드 없이)
  static Future<Map<String, dynamic>> apply({
    required String serviceType,
    String? targetUniversity,
    String? targetMajor,
    String? memo,
  }) async {
    final body = <String, dynamic>{'service_type': serviceType};
    if (targetUniversity != null && targetUniversity.isNotEmpty) {
      body['target_university'] = targetUniversity;
    }
    if (targetMajor != null && targetMajor.isNotEmpty) {
      body['target_major'] = targetMajor;
    }
    if (memo != null && memo.isNotEmpty) {
      body['memo'] = memo;
    }
    return await ApiService.post('/analysis/apply', body);
  }

  /// 기존 신청 건에 파일 업로드
  static Future<void> uploadToOrder(String orderId, File file) async {
    await ApiService.uploadFile('/analysis/$orderId/upload', file, 'file', {});
  }

  /// 레거시: 신청+업로드 동시
  static Future<void> upload(
    File file, {
    String? targetUniversity,
    String? targetMajor,
    String? memo,
  }) async {
    final fields = <String, String>{};
    if (targetUniversity != null && targetUniversity.isNotEmpty) {
      fields['target_university'] = targetUniversity;
    }
    if (targetMajor != null && targetMajor.isNotEmpty) {
      fields['target_major'] = targetMajor;
    }
    if (memo != null && memo.isNotEmpty) {
      fields['memo'] = memo;
    }
    await ApiService.uploadFile('/analysis/upload', file, 'file', fields);
  }

  static Future<Map<String, dynamic>> checkApplyCooldown() async {
    return await ApiService.get('/analysis/check-apply-cooldown');
  }

  static Future<String> getExcelDownloadUrl(String id) async {
    final res = await ApiService.get('/analysis/$id/report/excel');
    return ApiService.toFullUrl(res['download_url']);
  }

  static Future<String> getPdfDownloadUrl(String id) async {
    final res = await ApiService.get('/analysis/$id/report/pdf');
    return ApiService.toFullUrl(res['download_url']);
  }
}
