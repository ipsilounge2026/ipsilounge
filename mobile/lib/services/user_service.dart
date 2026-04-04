import 'api_service.dart';
import '../models/user.dart';
import '../models/notification_item.dart';

class UserService {
  static Future<User> getMe() async {
    final res = await ApiService.get('/users/me');
    return User.fromJson(res);
  }

  static Future<User> updateMe(String name, String? phone, {
    String? birthDate,
    String? schoolName,
    int? grade,
    String? studentName,
    String? studentBirth,
    String? branchName,
  }) async {
    final body = <String, dynamic>{
      'name': name,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
      if (birthDate != null) 'birth_date': birthDate,
      if (schoolName != null) 'school_name': schoolName,
      if (grade != null) 'grade': grade,
      if (studentName != null) 'student_name': studentName,
      if (studentBirth != null) 'student_birth': studentBirth,
      if (branchName != null) 'branch_name': branchName,
    };
    final res = await ApiService.put('/users/me', body);
    return User.fromJson(res);
  }

  static Future<List<NotificationItem>> getNotifications() async {
    final res = await ApiService.get('/users/notifications');
    final items = res['items'] as List;
    return items.map((e) => NotificationItem.fromJson(e)).toList();
  }

  static Future<void> markNotificationRead(String id) async {
    await ApiService.put('/users/notifications/$id/read', {});
  }

  static Future<List<Map<String, dynamic>>> getActiveNotices() async {
    final res = await ApiService.get('/notices/active');
    final items = res['items'] as List;
    return items.map((e) => Map<String, dynamic>.from(e)).toList();
  }
}
