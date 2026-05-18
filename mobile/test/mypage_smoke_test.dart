// 마이페이지 런타임 빌드 예외 진단용 스모크 테스트.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:ipsilounge/providers/auth_provider.dart';
import 'package:ipsilounge/models/user.dart';
import 'package:ipsilounge/screens/mypage_screen.dart';

class _FakeAuth extends AuthProvider {
  final User _u;
  _FakeAuth(this._u);
  @override
  User? get user => _u;
}

void main() {
  testWidgets('MypageScreen builds without runtime exception', (tester) async {
    final u = User(
      id: 'test-id',
      email: 'test@example.com',
      name: '권창욱',
      memberType: 'student',
      createdAt: '2026-04-03T00:00:00Z',
    );
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthProvider>.value(
        value: _FakeAuth(u),
        child: const MaterialApp(home: MypageScreen()),
      ),
    );
    // 한 프레임만 펌프 (네트워크 future 는 미완료 상태로 둠)
    await tester.pump(const Duration(milliseconds: 100));
    expect(tester.takeException(), isNull);
  });
}
