import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_service.dart';

/// 대학모집요강 서비스.
/// 백엔드 `/api/university-guide` 호출 (비로그인 접근 가능).
class UniversityGuideService {
  static const String _path = '/university-guide/';

  static Future<UniversityGuideListResult> fetchGuides({
    int? year,
    String? search,
  }) async {
    try {
      final params = <String, String>{};
      if (year != null) params['year'] = year.toString();
      if (search != null && search.isNotEmpty) params['search'] = search;
      final qs = params.isEmpty
          ? ''
          : '?' + params.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');
      final uri = Uri.parse('${ApiService.baseUrl}$_path$qs');
      final resp = await http.get(uri, headers: {'Content-Type': 'application/json'});
      if (resp.statusCode != 200) {
        return UniversityGuideListResult(
          items: const [],
          availableYears: const [],
          error: 'HTTP ${resp.statusCode}',
        );
      }
      final body = json.decode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
      final items = ((body['items'] ?? []) as List)
          .map((e) => UniversityGuideItem.fromJson(e as Map<String, dynamic>))
          .toList();
      final years = ((body['available_years'] ?? []) as List).cast<int>();
      return UniversityGuideListResult(items: items, availableYears: years);
    } catch (e) {
      return UniversityGuideListResult(
        items: const [],
        availableYears: const [],
        error: e.toString(),
      );
    }
  }
}

class UniversityGuideListResult {
  final List<UniversityGuideItem> items;
  final List<int> availableYears;
  final String? error;

  UniversityGuideListResult({
    required this.items,
    required this.availableYears,
    this.error,
  });
}

class UniversityGuideItem {
  final String id;
  final String university;
  final int year;
  final String? officialAdmissionUrl;
  final String? officialJonghapGuidebookUrl;
  final String? officialResultUrl;
  final String? adigaAdmissionPlanUrl;
  final String? adigaSusiGuideUrl;
  final String? adigaJeongsiGuideUrl;
  final String? adigaResultUrl;
  final String? adigaPriorLearningEvalUrl;

  UniversityGuideItem({
    required this.id,
    required this.university,
    required this.year,
    this.officialAdmissionUrl,
    this.officialJonghapGuidebookUrl,
    this.officialResultUrl,
    this.adigaAdmissionPlanUrl,
    this.adigaSusiGuideUrl,
    this.adigaJeongsiGuideUrl,
    this.adigaResultUrl,
    this.adigaPriorLearningEvalUrl,
  });

  static String? _s(dynamic v) => v == null ? null : v.toString();

  factory UniversityGuideItem.fromJson(Map<String, dynamic> j) {
    return UniversityGuideItem(
      id: j['id'].toString(),
      university: (j['university'] ?? '').toString(),
      year: (j['year'] ?? 0) as int,
      officialAdmissionUrl: _s(j['official_admission_url']),
      officialJonghapGuidebookUrl: _s(j['official_jonghap_guidebook_url']),
      officialResultUrl: _s(j['official_result_url']),
      adigaAdmissionPlanUrl: _s(j['adiga_admission_plan_url']),
      adigaSusiGuideUrl: _s(j['adiga_susi_guide_url']),
      adigaJeongsiGuideUrl: _s(j['adiga_jeongsi_guide_url']),
      adigaResultUrl: _s(j['adiga_result_url']),
      adigaPriorLearningEvalUrl: _s(j['adiga_prior_learning_eval_url']),
    );
  }
}
