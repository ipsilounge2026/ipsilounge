class AnalysisOrder {
  final String id;
  final String serviceType;
  final String status;
  final String? schoolRecordFilename;
  final String? targetUniversity;
  final String? targetMajor;
  final String? memo;
  final String? adminMemo;
  final bool hasReport;
  final String createdAt;
  final String? uploadedAt;
  final String? processingAt;
  final String? completedAt;

  AnalysisOrder({
    required this.id,
    required this.serviceType,
    required this.status,
    this.schoolRecordFilename,
    this.targetUniversity,
    this.targetMajor,
    this.memo,
    this.adminMemo,
    required this.hasReport,
    required this.createdAt,
    this.uploadedAt,
    this.processingAt,
    this.completedAt,
  });

  factory AnalysisOrder.fromJson(Map<String, dynamic> json) {
    return AnalysisOrder(
      id: json['id'],
      serviceType: json['service_type'] ?? '학생부라운지',
      status: json['status'],
      schoolRecordFilename: json['school_record_filename'],
      targetUniversity: json['target_university'],
      targetMajor: json['target_major'],
      memo: json['memo'],
      adminMemo: json['admin_memo'],
      hasReport: json['has_report'] ?? false,
      createdAt: json['created_at'],
      uploadedAt: json['uploaded_at'],
      processingAt: json['processing_at'],
      completedAt: json['completed_at'],
    );
  }

  String get statusLabel {
    switch (status) {
      case 'applied': return '신청완료';
      case 'uploaded': return '업로드완료';
      case 'pending': return '접수완료';
      case 'processing': return '분석중';
      case 'completed': return '완료';
      case 'cancelled': return '취소됨';
      default: return status;
    }
  }

  String get serviceTypeLabel {
    return serviceType == '학종라운지' ? '학종 라운지' : '학생부 라운지';
  }
}
