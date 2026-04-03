import 'package:flutter/material.dart';
import '../services/api_service.dart';

class AdmissionCasesScreen extends StatefulWidget {
  const AdmissionCasesScreen({super.key});

  @override
  State<AdmissionCasesScreen> createState() => _AdmissionCasesScreenState();
}

class _AdmissionCasesScreenState extends State<AdmissionCasesScreen> {
  List<Map<String, dynamic>> _cases = [];
  bool _isLoading = true;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadCases();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadCases({String? query}) async {
    setState(() => _isLoading = true);
    try {
      String url = '/admission-cases';
      if (query != null && query.isNotEmpty) {
        url += '?university=$query&major=$query';
      }
      final res = await ApiService.get(url);
      setState(() => _cases = List<Map<String, dynamic>>.from(res));
    } catch (_) {} finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('입시 사례')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: '대학 또는 학과 검색',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () {
                          _searchCtrl.clear();
                          _loadCases();
                        },
                      )
                    : null,
              ),
              onSubmitted: (v) => _loadCases(query: v.trim()),
            ),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: () => _loadCases(query: _searchCtrl.text.trim()),
                    child: _cases.isEmpty
                        ? ListView(
                            children: [
                              SizedBox(
                                height: MediaQuery.of(context).size.height * 0.4,
                                child: const Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.school_outlined, size: 56, color: Color(0xFFD1D5DB)),
                                    SizedBox(height: 16),
                                    Text('등록된 입시 사례가 없습니다',
                                        style: TextStyle(color: Color(0xFF6B7280))),
                                  ],
                                ),
                              ),
                            ],
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: _cases.length,
                            itemBuilder: (context, index) {
                              final c = _cases[index];
                              return Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withOpacity(0.05),
                                      blurRadius: 8,
                                      offset: const Offset(0, 2),
                                    ),
                                  ],
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Expanded(
                                          child: Text(
                                            '${c['university']} ${c['major']}',
                                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                                          ),
                                        ),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFF0FDF4),
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: Text('${c['admission_year']}학년도',
                                              style: const TextStyle(fontSize: 11, color: Color(0xFF16A34A))),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    if (c['admission_type'] != null)
                                      _infoRow('전형', c['admission_type']),
                                    if (c['grade_average'] != null)
                                      _infoRow('평균 등급', c['grade_average'].toString()),
                                    if (c['setuek_grade'] != null)
                                      _infoRow('세특', c['setuek_grade']),
                                    if (c['changche_grade'] != null)
                                      _infoRow('창체', c['changche_grade']),
                                    if (c['strengths'] != null && (c['strengths'] as String).isNotEmpty) ...[
                                      const SizedBox(height: 8),
                                      const Text('강점',
                                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                                      const SizedBox(height: 4),
                                      Text(c['strengths'], style: const TextStyle(fontSize: 13)),
                                    ],
                                    if (c['key_activities'] != null && (c['key_activities'] as String).isNotEmpty) ...[
                                      const SizedBox(height: 8),
                                      const Text('핵심 활동',
                                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                                      const SizedBox(height: 4),
                                      Text(c['key_activities'], style: const TextStyle(fontSize: 13)),
                                    ],
                                  ],
                                ),
                              );
                            },
                          ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(
            width: 70,
            child: Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
          ),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
