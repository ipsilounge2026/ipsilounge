import 'package:flutter/material.dart';
import '../services/analysis_service.dart';

class AnalysisApplyScreen extends StatefulWidget {
  const AnalysisApplyScreen({super.key});

  @override
  State<AnalysisApplyScreen> createState() => _AnalysisApplyScreenState();
}

class _AnalysisApplyScreenState extends State<AnalysisApplyScreen> {
  final _universityCtrl = TextEditingController();
  final _majorCtrl = TextEditingController();
  final _memoCtrl = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;
  String _serviceType = '학생부라운지';

  // 쿨다운 상태
  bool _canApply = true;
  String? _cooldownUntil;
  String? _lastApplied;

  @override
  void initState() {
    super.initState();
    _checkCooldown();
  }

  Future<void> _checkCooldown() async {
    try {
      final result = await AnalysisService.checkApplyCooldown();
      setState(() {
        _canApply = result['can_apply'] == true;
        _cooldownUntil = result['cooldown_until'];
        _lastApplied = result['last_applied'];
      });
    } catch (_) {}
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final arg = ModalRoute.of(context)?.settings.arguments;
    if (arg is String) {
      _serviceType = arg;
    }
  }

  @override
  void dispose() {
    _universityCtrl.dispose();
    _majorCtrl.dispose();
    _memoCtrl.dispose();
    super.dispose();
  }

  bool get _isHakjong => _serviceType == '학종라운지';

  Future<void> _apply() async {
    setState(() { _isLoading = true; _errorMessage = null; });
    try {
      final result = await AnalysisService.apply(
        serviceType: _serviceType,
        targetUniversity: _universityCtrl.text.trim(),
        targetMajor: _majorCtrl.text.trim(),
        memo: _memoCtrl.text.trim(),
      );
      if (mounted) {
        final orderId = result['id'];
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('신청이 완료되었습니다. 학생부 파일을 업로드해주세요.')),
        );
        // 바로 파일 업로드 화면으로 이동
        Navigator.pushReplacementNamed(context, '/analysis/upload', arguments: orderId);
      }
    } catch (e) {
      setState(() => _errorMessage = e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isHakjong ? '학종 라운지 신청' : '학생부 라운지 신청'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // 서비스 설명
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: _isHakjong ? const Color(0xFFF0FDF4) : const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _isHakjong ? const Color(0xFF86EFAC) : const Color(0xFF93C5FD),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        _isHakjong ? Icons.school : Icons.description,
                        color: _isHakjong ? const Color(0xFF22C55E) : const Color(0xFF3B82F6),
                        size: 24,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _isHakjong ? '학종 라운지' : '학생부 라운지',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: _isHakjong ? const Color(0xFF16A34A) : const Color(0xFF2563EB),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _isHakjong
                        ? '지원 대학과 학과를 지정하면 입결 비교, 교과 이수 충실도까지 포함된 맞춤 리포트를 제공합니다.'
                        : '학생부 PDF를 업로드하면 내신, 세특, 창체, 행특을 종합 분석한 리포트를 받아볼 수 있습니다.',
                    style: const TextStyle(fontSize: 13, color: Color(0xFF374151), height: 1.5),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // 쿨다운 배너
            if (!_canApply && _lastApplied != null && _cooldownUntil != null)
              Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFFDE68A)),
                ),
                child: Text(
                  '이전 신청일(${_lastApplied!.replaceAll('-', '.')}) 기준 3개월 이후(${_cooldownUntil!.replaceAll('-', '.')})부터 재신청이 가능합니다.',
                  style: const TextStyle(fontSize: 13, color: Color(0xFF92400E), height: 1.5),
                ),
              ),

            if (_isHakjong) ...[
              _buildLabel('지원 대학'),
              TextField(
                controller: _universityCtrl,
                decoration: const InputDecoration(hintText: '예: 서울대학교'),
              ),
              const SizedBox(height: 16),
              _buildLabel('지원 학과'),
              TextField(
                controller: _majorCtrl,
                decoration: const InputDecoration(hintText: '예: 컴퓨터공학과'),
              ),
              const SizedBox(height: 16),
            ] else ...[
              _buildLabel('지원 대학 (선택)'),
              TextField(
                controller: _universityCtrl,
                decoration: const InputDecoration(hintText: '예: 서울대학교'),
              ),
              const SizedBox(height: 16),
              _buildLabel('지원 학과 (선택)'),
              TextField(
                controller: _majorCtrl,
                decoration: const InputDecoration(hintText: '예: 컴퓨터공학과'),
              ),
              const SizedBox(height: 16),
            ],

            _buildLabel('메모 (선택)'),
            TextField(
              controller: _memoCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: '분석 시 참고할 내용이 있으면 입력해주세요',
              ),
            ),
            if (_errorMessage != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _errorMessage!,
                  style: const TextStyle(color: Color(0xFF991B1B), fontSize: 13),
                ),
              ),
            ],
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: (_isLoading || !_canApply) ? null : _apply,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _isHakjong ? const Color(0xFF22C55E) : const Color(0xFF3B82F6),
                ),
                child: _isLoading
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : Text(!_canApply ? '쿨다운 기간' : '신청하기', style: const TextStyle(color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text,
        style: const TextStyle(
            fontSize: 13, fontWeight: FontWeight.w500, color: Color(0xFF374151)),
      ),
    );
  }
}
