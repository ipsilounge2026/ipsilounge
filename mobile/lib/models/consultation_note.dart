class ConsultationNote {
  final String id;
  final String category;
  final String consultationDate;
  final String? studentGrade;
  final String? goals;
  final String? mainContent;
  final String? adviceGiven;
  final String? nextSteps;
  final String? nextTopic;

  ConsultationNote({
    required this.id,
    required this.category,
    required this.consultationDate,
    this.studentGrade,
    this.goals,
    this.mainContent,
    this.adviceGiven,
    this.nextSteps,
    this.nextTopic,
  });

  factory ConsultationNote.fromJson(Map<String, dynamic> json) {
    return ConsultationNote(
      id: json['id'],
      category: json['category'],
      consultationDate: json['consultation_date'],
      studentGrade: json['student_grade'],
      goals: json['goals'],
      mainContent: json['main_content'],
      adviceGiven: json['advice_given'],
      nextSteps: json['next_steps'],
      nextTopic: json['next_topic'],
    );
  }

  String get categoryLabel {
    switch (category) {
      case '학생부분석': return '학생부 분석';
      case '입시전략': return '입시 전략';
      case '학교생활': return '학교생활';
      case '공부법': return '공부법';
      case '진로': return '진로';
      case '심리정서': return '심리/정서';
      case '기타': return '기타';
      default: return category;
    }
  }
}
