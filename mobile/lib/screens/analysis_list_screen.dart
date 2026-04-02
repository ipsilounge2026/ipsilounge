import 'package:flutter/material.dart';
import '../services/analysis_service.dart';
import '../models/analysis_order.dart';
import '../widgets/status_badge.dart';

class AnalysisListScreen extends StatefulWidget {
  const AnalysisListScreen({super.key});

  @override
  State<AnalysisListScreen> createState() => _AnalysisListScreenState();
}

class _AnalysisListScreenState extends State<AnalysisListScreen> {
  List<AnalysisOrder> _orders = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  Future<void> _loadOrders() async {
    setState(() => _isLoading = true);
    try {
      final orders = await AnalysisService.getList();
      setState(() => _orders = orders);
    } catch (_) {} finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('분석 라운지'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadOrders,
              child: Column(
                children: [
                  // 신청 버튼 영역
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.description_outlined, size: 18),
                            label: const Text('학생부 라운지 신청'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFF3B82F6),
                              side: const BorderSide(color: Color(0xFF3B82F6)),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                            onPressed: () async {
                              await Navigator.pushNamed(context, '/analysis/apply', arguments: '학생부라운지');
                              _loadOrders();
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.school_outlined, size: 18),
                            label: const Text('학종 라운지 신청'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFF22C55E),
                              side: const BorderSide(color: Color(0xFF22C55E)),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                            onPressed: () async {
                              await Navigator.pushNamed(context, '/analysis/apply', arguments: '학종라운지');
                              _loadOrders();
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                  // 목록
                  Expanded(
                    child: _orders.isEmpty
                        ? ListView(
                            children: [
                              SizedBox(
                                height: MediaQuery.of(context).size.height * 0.4,
                                child: const Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.description_outlined,
                                        size: 56, color: Color(0xFFD1D5DB)),
                                    SizedBox(height: 16),
                                    Text(
                                      '분석 요청 내역이 없습니다',
                                      style: TextStyle(color: Color(0xFF6B7280)),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(16),
                            itemCount: _orders.length,
                            itemBuilder: (context, i) {
                              final o = _orders[i];
                              return GestureDetector(
                                onTap: () async {
                                  await Navigator.pushNamed(
                                      context, '/analysis/${o.id}');
                                  _loadOrders();
                                },
                                child: Container(
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
                                        children: [
                                          // 서비스 타입 뱃지
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: o.serviceType == '학종라운지'
                                                  ? const Color(0xFFDCFCE7)
                                                  : const Color(0xFFEDE9FE),
                                              borderRadius: BorderRadius.circular(4),
                                            ),
                                            child: Text(
                                              o.serviceType == '학종라운지' ? '학종' : '학생부',
                                              style: TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w600,
                                                color: o.serviceType == '학종라운지'
                                                    ? const Color(0xFF16A34A)
                                                    : const Color(0xFF7C3AED),
                                              ),
                                            ),
                                          ),
                                          const Spacer(),
                                          StatusBadge(status: o.status),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      Row(
                                        children: [
                                          Container(
                                            width: 40,
                                            height: 40,
                                            decoration: BoxDecoration(
                                              color: const Color(0xFFEFF6FF),
                                              borderRadius: BorderRadius.circular(10),
                                            ),
                                            child: const Icon(Icons.insert_drive_file,
                                                color: Color(0xFF3B82F6), size: 22),
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  o.schoolRecordFilename ?? '파일 미업로드',
                                                  style: TextStyle(
                                                    fontSize: 14,
                                                    fontWeight: FontWeight.w600,
                                                    color: o.schoolRecordFilename != null
                                                        ? const Color(0xFF111827)
                                                        : const Color(0xFFEF4444),
                                                  ),
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                                const SizedBox(height: 2),
                                                Text(
                                                  _formatDate(o.createdAt),
                                                  style: const TextStyle(
                                                      fontSize: 12, color: Color(0xFF9CA3AF)),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                      // 미업로드 시 업로드 버튼
                                      if (o.status == 'applied') ...[
                                        const SizedBox(height: 10),
                                        SizedBox(
                                          width: double.infinity,
                                          child: OutlinedButton.icon(
                                            icon: const Icon(Icons.upload_file, size: 16),
                                            label: const Text('파일 업로드'),
                                            style: OutlinedButton.styleFrom(
                                              foregroundColor: const Color(0xFF3B82F6),
                                              side: const BorderSide(color: Color(0xFF3B82F6)),
                                              padding: const EdgeInsets.symmetric(vertical: 8),
                                            ),
                                            onPressed: () async {
                                              await Navigator.pushNamed(
                                                  context, '/analysis/upload', arguments: o.id);
                                              _loadOrders();
                                            },
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.year}.${dt.month.toString().padLeft(2, '0')}.${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}
