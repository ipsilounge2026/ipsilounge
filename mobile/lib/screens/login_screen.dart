import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/auth_provider.dart';
import '../theme/app_palette.dart';

/// 에디토리얼 밑줄형 입력 라벨 (EMAIL · 이메일)
Widget _fieldLabel(String en, String ko) => Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: RichText(
        text: TextSpan(
          children: [
            TextSpan(
              text: en,
              style: const TextStyle(
                color: AppPalette.teal,
                fontSize: 12,
                fontWeight: FontWeight.w800,
                letterSpacing: 1,
              ),
            ),
            TextSpan(
              text: '  ·  $ko',
              style: const TextStyle(
                color: AppPalette.muted,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );

const _underlineDeco = InputDecoration(
  isDense: true,
  contentPadding: EdgeInsets.symmetric(vertical: 10),
  border: UnderlineInputBorder(borderSide: BorderSide(color: AppPalette.lineStrong)),
  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: AppPalette.lineStrong)),
  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: AppPalette.teal, width: 2)),
);

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  String? _errorMessage;
  bool _obscure = true;
  bool _rememberEmail = false;
  bool _keepLoggedIn = false;

  @override
  void initState() {
    super.initState();
    _loadSavedEmail();
  }

  Future<void> _loadSavedEmail() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('saved_email');
    if (saved != null && saved.isNotEmpty) {
      setState(() {
        _emailCtrl.text = saved;
        _rememberEmail = true;
      });
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _errorMessage = null);
    try {
      final prefs = await SharedPreferences.getInstance();
      if (_rememberEmail) {
        await prefs.setString('saved_email', _emailCtrl.text.trim());
      } else {
        await prefs.remove('saved_email');
      }
      await prefs.setBool('keep_logged_in', _keepLoggedIn);
      await context.read<AuthProvider>().login(_emailCtrl.text.trim(), _passwordCtrl.text);
      if (mounted) Navigator.pushReplacementNamed(context, '/home');
    } catch (e) {
      setState(() => _errorMessage = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = context.watch<AuthProvider>().isLoading;

    return Scaffold(
      backgroundColor: AppPalette.cream,
      appBar: AppBar(
        backgroundColor: AppPalette.cream,
        elevation: 0,
        leading: const BackButton(color: AppPalette.navy),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Image.asset('assets/icon/icon.png', width: 30, height: 30),
                  const SizedBox(width: 8),
                  const Text(
                    '입시라운지',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppPalette.navy),
                  ),
                ],
              ),
              const SizedBox(height: 36),
              const Text('§  Sign in',
                  style: TextStyle(fontSize: 15, fontStyle: FontStyle.italic, color: AppPalette.teal, fontWeight: FontWeight.w600)),
              const SizedBox(height: 14),
              const Text(
                '로그인.',
                style: TextStyle(fontSize: 48, fontWeight: FontWeight.w800, color: AppPalette.navy, height: 1.05, letterSpacing: -2),
              ),
              const Text(
                'Sign in.',
                style: TextStyle(fontSize: 48, fontWeight: FontWeight.w700, color: AppPalette.teal, fontStyle: FontStyle.italic, height: 1.05, letterSpacing: -2),
              ),
              const SizedBox(height: 16),
              const Text(
                '학생부 분석 및 상담 서비스를 이용하세요.',
                style: TextStyle(fontSize: 14, color: AppPalette.muted),
              ),
              const SizedBox(height: 36),
              Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _fieldLabel('EMAIL', '이메일'),
                    TextFormField(
                      controller: _emailCtrl,
                      keyboardType: TextInputType.emailAddress,
                      style: const TextStyle(fontSize: 16, color: AppPalette.navy),
                      decoration: _underlineDeco.copyWith(hintText: '이메일을 입력하세요'),
                      validator: (v) =>
                          v?.isEmpty == true ? '이메일을 입력해주세요' : null,
                    ),
                    const SizedBox(height: 24),
                    _fieldLabel('PASSWORD', '비밀번호'),
                    TextFormField(
                      controller: _passwordCtrl,
                      obscureText: _obscure,
                      style: const TextStyle(fontSize: 16, color: AppPalette.navy),
                      decoration: _underlineDeco.copyWith(
                        hintText: '비밀번호를 입력하세요',
                        suffixIcon: IconButton(
                          icon: Icon(
                              _obscure ? Icons.visibility_off : Icons.visibility,
                              color: AppPalette.muted, size: 20),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (v) =>
                          v?.isEmpty == true ? '비밀번호를 입력해주세요' : null,
                    ),
                    if (_errorMessage != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEE2E2),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(color: Color(0xFF991B1B), fontSize: 13),
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        SizedBox(
                          height: 20, width: 20,
                          child: Checkbox(
                            value: _rememberEmail,
                            onChanged: (v) => setState(() => _rememberEmail = v!),
                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                        ),
                        const SizedBox(width: 4),
                        GestureDetector(
                          onTap: () => setState(() => _rememberEmail = !_rememberEmail),
                          child: const Text('아이디 저장', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                        ),
                        const SizedBox(width: 16),
                        SizedBox(
                          height: 20, width: 20,
                          child: Checkbox(
                            value: _keepLoggedIn,
                            onChanged: (v) => setState(() => _keepLoggedIn = v!),
                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                        ),
                        const SizedBox(width: 4),
                        GestureDetector(
                          onTap: () => setState(() => _keepLoggedIn = !_keepLoggedIn),
                          child: const Text('로그인 유지', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                        ),
                        const Spacer(),
                        GestureDetector(
                          onTap: () => Navigator.pushNamed(context, '/forgot-password'),
                          child: const Text('비밀번호 찾기 →', style: TextStyle(fontSize: 13, color: AppPalette.teal, fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: isLoading ? null : _login,
                        child: isLoading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                    color: Colors.white, strokeWidth: 2),
                              )
                            : const Text('로그인  →'),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          '계정이 없으신가요?',
                          style: TextStyle(color: AppPalette.muted, fontSize: 14),
                        ),
                        TextButton(
                          onPressed: () =>
                              Navigator.pushNamed(context, '/register'),
                          child: const Text(
                            '회원가입 →',
                            style: TextStyle(
                                color: AppPalette.teal,
                                fontWeight: FontWeight.w800,
                                fontSize: 14),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
