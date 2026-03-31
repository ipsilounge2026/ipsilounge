import 'api_service.dart';
import '../models/user.dart';
import '../models/notification_item.dart';

class UserService {
  static Future<User> getMe() async {
    final res = await ApiService.get('/users/me');
    return User.fromJson(res);
  }

  static Future<User> updateMe(String name, String? phone) async {
    final res = await ApiService.put('/users/me', {
      'name': name,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
    });
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
}
