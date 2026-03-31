import 'package:flutter/material.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../services/user_service.dart';

class AuthProvider extends ChangeNotifier {
  User? _user;
  bool _isLoading = false;

  User? get user => _user;
  bool get isLoading => _isLoading;
  bool get isLoggedIn => _user != null;

  Future<void> checkAuth() async {
    if (await AuthService.isLoggedIn()) {
      try {
        _user = await UserService.getMe();
        notifyListeners();
      } catch (_) {
        await AuthService.logout();
      }
    }
  }

  Future<void> login(String email, String password) async {
    _isLoading = true;
    notifyListeners();
    try {
      await AuthService.login(email, password);
      _user = await UserService.getMe();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await AuthService.logout();
    _user = null;
    notifyListeners();
  }

  Future<void> refreshUser() async {
    try {
      _user = await UserService.getMe();
      notifyListeners();
    } catch (_) {}
  }
}
