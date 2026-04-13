class SeniorConsultationNote {
  final String id;
  final int sessionNumber;
  final String? sessionTiming;
  final String? consultationDate;
  final String? seniorName;
  final List<CoreTopic> coreTopics;
  final List<OptionalTopic> optionalTopics;
  final String? studentQuestions;
  final String? seniorAnswers;
  final String? studentMood;
  final String? studyAttitude;
  final String? specialObservations;
  final List<ActionItem> actionItems;
  final List<NextCheckpoint> nextCheckpoints;
  final List<Addendum> addenda;

  SeniorConsultationNote({
    required this.id,
    required this.sessionNumber,
    this.sessionTiming,
    this.consultationDate,
    this.seniorName,
    this.coreTopics = const [],
    this.optionalTopics = const [],
    this.studentQuestions,
    this.seniorAnswers,
    this.studentMood,
    this.studyAttitude,
    this.specialObservations,
    this.actionItems = const [],
    this.nextCheckpoints = const [],
    this.addenda = const [],
  });

  factory SeniorConsultationNote.fromJson(Map<String, dynamic> json) {
    return SeniorConsultationNote(
      id: json['id'],
      sessionNumber: json['session_number'] ?? 1,
      sessionTiming: json['session_timing'],
      consultationDate: json['consultation_date'],
      seniorName: json['senior_name'],
      coreTopics: (json['core_topics'] as List? ?? [])
          .map((e) => CoreTopic.fromJson(e))
          .toList(),
      optionalTopics: (json['optional_topics'] as List? ?? [])
          .map((e) => OptionalTopic.fromJson(e))
          .toList(),
      studentQuestions: json['student_questions'],
      seniorAnswers: json['senior_answers'],
      studentMood: json['student_mood'],
      studyAttitude: json['study_attitude'],
      specialObservations: json['special_observations'],
      actionItems: (json['action_items'] as List? ?? [])
          .map((e) => ActionItem.fromJson(e))
          .toList(),
      nextCheckpoints: (json['next_checkpoints'] as List? ?? [])
          .map((e) => NextCheckpoint.fromJson(e))
          .toList(),
      addenda: (json['addenda'] as List? ?? [])
          .map((e) => Addendum.fromJson(e))
          .toList(),
    );
  }

  String get displayTiming => sessionTiming ?? 'S$sessionNumber';
}

class CoreTopic {
  final String topic;
  final String progressStatus;
  final String keyContent;

  CoreTopic({required this.topic, required this.progressStatus, required this.keyContent});

  factory CoreTopic.fromJson(Map<String, dynamic> json) {
    return CoreTopic(
      topic: json['topic'] ?? '',
      progressStatus: json['progress_status'] ?? '',
      keyContent: json['key_content'] ?? '',
    );
  }
}

class OptionalTopic {
  final String topic;
  final bool covered;

  OptionalTopic({required this.topic, required this.covered});

  factory OptionalTopic.fromJson(Map<String, dynamic> json) {
    return OptionalTopic(
      topic: json['topic'] ?? '',
      covered: json['covered'] ?? false,
    );
  }
}

class ActionItem {
  final String action;
  final String priority;

  ActionItem({required this.action, required this.priority});

  factory ActionItem.fromJson(Map<String, dynamic> json) {
    return ActionItem(
      action: json['action'] ?? '',
      priority: json['priority'] ?? '중',
    );
  }
}

class NextCheckpoint {
  final String checkpoint;

  NextCheckpoint({required this.checkpoint});

  factory NextCheckpoint.fromJson(Map<String, dynamic> json) {
    return NextCheckpoint(checkpoint: json['checkpoint'] ?? '');
  }
}

class Addendum {
  final String content;
  final String createdAt;

  Addendum({required this.content, required this.createdAt});

  factory Addendum.fromJson(Map<String, dynamic> json) {
    return Addendum(
      content: json['content'] ?? '',
      createdAt: json['created_at'] ?? '',
    );
  }
}
