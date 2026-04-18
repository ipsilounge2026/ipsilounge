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
  bool _isLoading = false;
  String? _errorMessage;
  String? _orderId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final arg = ModalRoute.of(context)?.settings.arguments;
    if (arg is String) {
      _orderId = arg;
    }
  }

  Future<void> _pickFile() async {
    // [2026-04-17 Phase A] PDF 전용. JPG/PNG 차단 (backend file_service 동기화)
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf'],
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
    if (_orderId == null) {
      setState(() => _errorMessage = '신청 정보를 찾을 수 없습니다');
      return;
    }
    setState(() { _isLoading = true; _errorMessage = null; });
    try {
      await AnalysisService.uploadToOrder(_orderId!, _selectedFile!);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('파일이 업로드되었습니다. 분석 완료 후 알림을 보내드립니다.')),
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
      appBar: AppBar(title: const Text('학생부 파일 업로드')),
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
                  ),
                ),
                child: _selectedFile == null
                    ? const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
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
                            'PDF 파일 전용 (최대 20MB)',
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
            const SizedBox(height: 8),
            const Text(
              '※ 정부24·학교에서 다운로드한 텍스트 레이어 포함 PDF 를 권장합니다. '
              '이미지 파일(JPG/PNG)은 업로드가 불가능하며, 스캔본 PDF 는 일부 분석 기능이 제한될 수 있습니다.',
              style: TextStyle(fontSize: 11, color: Color(0xFF6B7280), height: 1.5),
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
                        width: 20, height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2),
                      )
                    : const Text('업로드하기'),
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
                '• 나중에 업로드하려면 뒤로 가기를 누르세요',
                style: TextStyle(fontSize: 12, color: Color(0xFF6B7280), height: 1.7),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
