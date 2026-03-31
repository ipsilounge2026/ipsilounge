class User {
  final String id;
  final String email;
  final String name;
  final String? phone;
  final String createdAt;

  User({
    required this.id,
    required this.email,
    required this.name,
    this.phone,
    required this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      email: json['email'],
      name: json['name'],
      phone: json['phone'],
      createdAt: json['created_at'],
    );
  }
}
