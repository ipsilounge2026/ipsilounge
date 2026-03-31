class AnalysisOrder {
  final String id;
  final String status;
  final String schoolRecordFilename;
  final String? targetUniversity;
  final String? targetMajor;
  final String? memo;
  final String? adminMemo;
  final bool hasReport;
  final String createdAt;
  final String? processingAt;
  final String? completedAt;

  AnalysisOrder({
    required this.id,
    required this.status,
    required this.schoolRecordFilename,
    this.targetUniversity,
    this.targetMajor,
    this.memo,
    this.adminMemo,
    required this.hasReport,
    required this.createdAt,
    this.processingAt,
    this.completedAt,
  });

  factory AnalysisOrder.fromJson(Map<String, dynamic> json) {
    return AnalysisOrder(
      id: json['id'],
      status: json['status'],
      schoolRecordFilename: json['school_record_filename'],
      targetUniversity: json['target_university'],
      targetMajor: json['target_major'],
      memo: json['memo'],
      adminMemo: json['admin_memo'],
      hasReport: json['has_report'] ?? false,
      createdAt: json['created_at'],
      processingAt: json['processing_at'],
      completedAt: json['completed_at'],
    );
  }

  String get statusLabel {
    switch (status) {
      case 'pending': return '접수완료';
      case 'processing': return '분석중';
      case 'completed': return '완료';
      case 'cancelled': return '취소됨';
      default: return status;
    }
  }
}
