import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/analysis_order.dart';
import '../services/analysis_service.dart';
import '../widgets/status_badge.dart';

class AnalysisDetailScreen extends StatefulWidget {
  final String id;
  const AnalysisDetailScreen({super.key, required this.id});

  @override
  State<AnalysisDetailScreen> createState() => _AnalysisDetailScreenState();
}

class _AnalysisDetailScreenState extends State<AnalysisDetailScreen> {
  AnalysisOrder? _data;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDetail();
  }

  Future<void> _loadDetail() async {
    try {
      final data = await AnalysisService.getDetail(widget.id);
      setState(() => _data = data);
    } catch (_) {} finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _downloadExcel() async {
    try {
      final url = await AnalysisService.getExcelDownloadUrl(widget.id);
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _downloadPdf() async {
    try {
      final url = await AnalysisService.getPdfDownloadUrl(widget.id);
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('분석 상세')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _data == null
              ? const Center(child: Text('데이터를 불러올 수 없습니다'))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    // 진행 상태 바
                    if (_data!.status != 'cancelled')
                      _buildProgressCard(),

                    if (_data!.status == 'cancelled')
                      _buildCancelledCard(),

                    // 파일 업로드 안내 (applied 상태)
                    if (_data!.status == 'applied')
                      _buildUploadPromptCard(),

                    // 기본 정보
                    _buildInfoCard(),

                    // 리포트 다운로드
                    if (_data!.hasReport) _buildReportCard(),

                    // 면접 예상 질문 (완료된 건)
                    if (_data!.status == 'completed') _buildInterviewCard(),

                    if (!_data!.hasReport && _data!.status != 'cancelled')
                      Container(
                        padding: const EdgeInsets.all(24),
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
                        child: const Center(
                          child: Text(
                            '리포트가 준비되면 알림을 보내드립니다',
                            style: TextStyle(color: Color(0xFF6B7280)),
                          ),
                        ),
                      ),
                  ],
                ),
    );
  }

  Widget _buildUploadPromptCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7ED),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFED7AA)),
      ),
      child: Column(
        children: [
          const Text(
            '⚠️ 학생부 파일을 업로드해야 분석이 시작됩니다',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF92400E)),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () async {
                await Navigator.pushNamed(context, '/analysis/upload', arguments: widget.id);
                _loadDetail();
              },
              icon: const Icon(Icons.upload_file, size: 18),
              label: const Text('파일 업로드하기'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF3B82F6),
                minimumSize: const Size(0, 44),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProgressCard() {
    final steps = [
      {'key': 'applied', 'label': '신청', 'date': _data!.createdAt},
      {'key': 'uploaded', 'label': '업로드', 'date': _data!.uploadedAt},
      {'key': 'processing', 'label': '분석중', 'date': _data!.processingAt},
      {'key': 'completed', 'label': '완료', 'date': _data!.completedAt},
    ];
    final currentStep = _data!.status == 'completed' ? 3
        : _data!.status == 'processing' ? 2
        : (_data!.status == 'uploaded' || _data!.status == 'pending') ? 1
        : 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Row(
        children: List.generate(steps.length * 2 - 1, (i) {
          if (i.isOdd) {
            // 연결선
            final stepIndex = i ~/ 2;
            return Expanded(
              child: Container(
                height: 2,
                color: stepIndex < currentStep
                    ? const Color(0xFF3B82F6)
                    : const Color(0xFFE5E7EB),
              ),
            );
          }
          final si = i ~/ 2;
          final step = steps[si];
          final active = si <= currentStep;
          return Column(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: active ? const Color(0xFF3B82F6) : const Color(0xFFE5E7EB),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    '${si + 1}',
                    style: TextStyle(
                      color: active ? Colors.white : const Color(0xFF9CA3AF),
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                step['label']!,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                  color: active ? const Color(0xFF111827) : const Color(0xFF9CA3AF),
                ),
              ),
              if (step['date'] != null)
                Text(
                  _formatDateShort(step['date']!),
                  style: const TextStyle(fontSize: 10, color: Color(0xFF9CA3AF)),
                ),
            ],
          );
        }),
      ),
    );
  }

  Widget _buildCancelledCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        children: [
          StatusBadge(status: _data!.status),
          const SizedBox(height: 8),
          const Text(
            '이 분석 요청은 취소되었습니다',
            style: TextStyle(color: Color(0xFF6B7280)),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(child: _infoItem('파일명', _data!.schoolRecordFilename ?? '미업로드')),
              Expanded(child: _infoItem('접수일', _formatDate(_data!.createdAt))),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _infoItem('지원 대학', _data!.targetUniversity ?? '미지정')),
              Expanded(child: _infoItem('지원 학과', _data!.targetMajor ?? '미지정')),
            ],
          ),
          if (_data!.memo != null) ...[
            const Divider(height: 24),
            _infoItem('메모', _data!.memo!),
          ],
        ],
      ),
    );
  }

  Widget _buildReportCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '분석 리포트',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _downloadExcel,
                  icon: const Icon(Icons.table_chart, size: 18),
                  label: const Text('Excel'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF22C55E),
                    minimumSize: const Size(0, 44),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _downloadPdf,
                  icon: const Icon(Icons.picture_as_pdf, size: 18),
                  label: const Text('PDF'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFEF4444),
                    side: const BorderSide(color: Color(0xFFEF4444)),
                    minimumSize: const Size(0, 44),
                  ),
                ),
              ),
            ],
          ),
          if (_data!.adminMemo != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '분석가 코멘트: ',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  Expanded(
                    child: Text(
                      _data!.adminMemo!,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildInterviewCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('면접 준비', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          const Text(
            '학생부 기반 면접 예상 질문을 확인하세요.',
            style: TextStyle(color: Color(0xFF6B7280), fontSize: 13),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () {
                Navigator.pushNamed(context, '/analysis/${widget.id}/interview');
              },
              icon: const Icon(Icons.quiz_outlined, size: 18),
              label: const Text('면접 예상 질문 보기'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 44),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _infoItem(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
      ],
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.year}.${dt.month.toString().padLeft(2, '0')}.${dt.day.toString().padLeft(2, '0')} '
          '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }

  String _formatDateShort(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.month}/${dt.day}';
    } catch (_) {
      return '';
    }
  }
}
