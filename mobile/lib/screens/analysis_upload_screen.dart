import 'dart:io';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import '../services/analysis_service.dart';

class AnalysisUploadScreen extends StatefulWidget {
  const AnalysisUploadScreen({super.key});

  @override
  State<AnalysisUploadScreen> createState() => _AnalysisUploadScreenState();
}

class _AnalysisUploadScreenState extends State<AnalysisUploadScreen> {
  File? _selectedFile;
  String? _selectedFileName;
  final _universityCtrl = TextEditingController();
  final _majorCtrl = TextEditingController();
  final _memoCtrl = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _universityCtrl.dispose();
    _majorCtrl.dispose();
    _memoCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    );
    if (result != null && result.files.isNotEmpty) {
      setState(() {
        _selectedFile = File(result.files.first.path!);
        _selectedFileName = result.files.first.name;
      });
    }
  }

  Future<void> _upload() async {
    if (_selectedFile == null) {
      setState(() => _errorMessage = '파일을 선택해주세요');
      return;
    }
    setState(() { _isLoading = true; _errorMessage = null; });
    try {
      await AnalysisService.upload(
        _selectedFile!,
        targetUniversity: _universityCtrl.text.trim(),
        targetMajor: _majorCtrl.text.trim(),
        memo: _memoCtrl.text.trim(),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('학생부가 접수되었습니다. 분석 완료 후 알림을 보내드립니다.')),
        );
        Navigator.pop(context);
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
      appBar: AppBar(title: const Text('학생부 업로드')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // 파일 선택
            GestureDetector(
              onTap: _pickFile,
              child: Container(
                height: 140,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _selectedFile != null
                        ? const Color(0xFF3B82F6)
                        : const Color(0xFFD1D5DB),
                    width: 2,
                    style: BorderStyle.solid,
                  ),
                ),
                child: _selectedFile == null
                    ? Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: const [
                          Icon(Icons.cloud_upload_outlined,
                              size: 40, color: Color(0xFF9CA3AF)),
                          SizedBox(height: 8),
                          Text(
                            '학생부 파일 선택',
                            style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF374151)),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'PDF, JPG, PNG 지원',
                            style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF)),
                          ),
                        ],
                      )
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.check_circle,
                              size: 36, color: Color(0xFF3B82F6)),
                          const SizedBox(height: 8),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Text(
                              _selectedFileName!,
                              style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF3B82F6)),
                              textAlign: TextAlign.center,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            '탭하여 파일 변경',
                            style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF)),
                          ),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 20),
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
                onPressed: _isLoading ? null : _upload,
                child: _isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2),
                      )
                    : const Text('분석 요청하기'),
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: const Text(
                '• 파일 업로드 후 관리자가 검토하여 분석을 진행합니다\n'
                '• 분석 완료 시 앱 푸시 알림을 보내드립니다\n'
                '• 현재 무료 서비스 운영 중입니다',
                style: TextStyle(fontSize: 12, color: Color(0xFF6B7280), height: 1.7),
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
