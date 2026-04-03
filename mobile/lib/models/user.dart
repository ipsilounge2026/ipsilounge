class User {
  final String id;
  final String email;
  final String name;
  final String? phone;
  final String memberType;
  final String? studentName;
  final String? studentBirth;
  final String? birthDate;
  final String? schoolName;
  final int? grade;
  final String? branchName;
  final bool isActive;
  final String createdAt;

  User({
    required this.id,
    required this.email,
    required this.name,
    this.phone,
    this.memberType = 'student',
    this.studentName,
    this.studentBirth,
    this.birthDate,
    this.schoolName,
    this.grade,
    this.branchName,
    this.isActive = true,
    required this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      email: json['email'],
      name: json['name'],
      phone: json['phone'],
      memberType: json['member_type'] ?? 'student',
      studentName: json['student_name'],
      studentBirth: json['student_birth'],
      birthDate: json['birth_date'],
      schoolName: json['school_name'],
      grade: json['grade'],
      branchName: json['branch_name'],
      isActive: json['is_active'] ?? true,
      createdAt: json['created_at'],
    );
  }
}
