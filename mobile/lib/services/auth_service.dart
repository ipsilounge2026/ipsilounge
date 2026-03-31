import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

class AuthService {
  static Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await ApiService.post(
      '/auth/login',
      {'email': email, 'password': password},
      auth: false,
    );
    final token = res['access_token'];
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_token', token);
    return res;
  }

  static Future<void> register(
      String email, String password, String name, String? phone) async {
    await ApiService.post(
      '/auth/register',
      {
        'email': email,
        'password': password,
        'name': name,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
      },
      auth: false,
    );
  }

  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('user_token');
  }

  static Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.containsKey('user_token');
  }

  static Future<void> saveFcmToken(String fcmToken) async {
    try {
      await ApiService.put('/users/me/fcm-token', {'fcm_token': fcmToken});
      // PUT /api/users/me/fcm-token
    } catch (_) {}
  }
}
