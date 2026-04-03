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

  static Future<void> register({
    required String email,
    required String password,
    required String name,
    required String phone,
    String memberType = 'student',
    String? birthDate,
    String? schoolName,
    int? grade,
    String? studentName,
    String? studentBirth,
    String? branchName,
  }) async {
    final body = <String, dynamic>{
      'email': email,
      'password': password,
      'name': name,
      'phone': phone,
      'member_type': memberType,
    };

    if (birthDate != null && birthDate.isNotEmpty) body['birth_date'] = birthDate;
    if (schoolName != null && schoolName.isNotEmpty) body['school_name'] = schoolName;
    if (grade != null) body['grade'] = grade;
    if (studentName != null && studentName.isNotEmpty) body['student_name'] = studentName;
    if (studentBirth != null && studentBirth.isNotEmpty) body['student_birth'] = studentBirth;
    if (branchName != null && branchName.isNotEmpty) body['branch_name'] = branchName;

    await ApiService.post('/auth/register', body, auth: false);
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
    } catch (_) {}
  }

  static Future<List<Map<String, dynamic>>> searchSchools(String query) async {
    final res = await ApiService.get('/schools/search?query=$query', auth: false);
    return List<Map<String, dynamic>>.from(res);
  }
}
