import 'dart:async';
import 'package:flutter/material.dart';
import '../services/auth_service.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

const _branchOptions = [
  '경복궁점', '광화문점', '구리점', '대치점', '대흥점',
  '마포점', '분당점', '은평점', '중계점', '대치스터디센터점',
];

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _schoolCtrl = TextEditingController();
  final _studentNameCtrl = TextEditingController();

  bool _isLoading = false;
  String? _errorMessage;
  bool _obscure = true;
  String _memberType = 'student'; // student / parent / branch_manager
  String? _birthDate;
  String? _studentBirth;
  int? _grade;
  String? _branchName; // branch_manager: 담당 지점 / student·parent: 재원 지점
  bool _isAcademyStudent = false;

  // School search
  List<Map<String, dynamic>> _schoolResults = [];
  bool _showSchoolDropdown = false;
  bool _searchingSchool = false;
  bool _schoolSelected = false; // 검색 결과에서 선택했는지 여부
  String _selectedSchoolName = ''; // 선택된 학교명 (실제 전송값)
  Timer? _searchTimer;
  final _schoolFocusNode = FocusNode();
  final LayerLink _schoolLayerLink = LayerLink();
  OverlayEntry? _overlayEntry;

  @override
  void initState() {
    super.initState();
    _schoolCtrl.addListener(_onSchoolTextChanged);
    _schoolFocusNode.addListener(_onSchoolFocusChanged);
  }

  void _onSchoolFocusChanged() {
    if (!_schoolFocusNode.hasFocus) {
      // 포커스를 잃었을 때 검색 결과에서 선택하지 않았으면 입력값 초기화
      Future.delayed(const Duration(milliseconds: 200), () {
        if (!_schoolSelected) {
          _schoolCtrl.removeListener(_onSchoolTextChanged);
          _schoolCtrl.text = '';
          _schoolCtrl.addListener(_onSchoolTextChanged);
        }
        _removeOverlay();
      });
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _schoolCtrl.dispose();
    _studentNameCtrl.dispose();
    _schoolFocusNode.dispose();
    _searchTimer?.cancel();
    _removeOverlay();
    super.dispose();
  }

  void _onSchoolTextChanged() {
    final query = _schoolCtrl.text.trim();
    _searchTimer?.cancel();
    // 타이핑 중에는 선택 상태 해제
    if (_schoolSelected && _schoolCtrl.text != _selectedSchoolName) {
      setState(() {
        _schoolSelected = false;
        _selectedSchoolName = '';
      });
    }
    if (query.length < 2) {
      _removeOverlay();
      return;
    }
    _searchTimer = Timer(const Duration(milliseconds: 400), () => _searchSchools(query));
  }

  Future<void> _searchSchools(String query) async {
    setState(() => _searchingSchool = true);
    try {
      final results = await AuthService.searchSchools(query);
      setState(() {
        _schoolResults = results;
        _searchingSchool = false;
      });
      if (results.isNotEmpty) {
        _showOverlay();
      } else {
        _removeOverlay();
      }
    } catch (_) {
      setState(() => _searchingSchool = false);
      _removeOverlay();
    }
  }

  void _showOverlay() {
    _removeOverlay();
    final overlay = Overlay.of(context);
    final renderBox = _schoolFocusNode.context?.findRenderObject() as RenderBox?;
    if (renderBox == null) return;

    _overlayEntry = OverlayEntry(
      builder: (context) => Positioned(
        width: renderBox.size.width,
        child: CompositedTransformFollower(
          link: _schoolLayerLink,
          showWhenUnlinked: false,
          offset: Offset(0, renderBox.size.height + 4),
          child: Material(
            elevation: 4,
            borderRadius: BorderRadius.circular(8),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 200),
              child: ListView.builder(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                itemCount: _schoolResults.length,
                itemBuilder: (context, index) {
                  final school = _schoolResults[index];
                  return InkWell(
                    onTap: () {
                      final name = school['school_name'] ?? '';
                      _schoolCtrl.removeListener(_onSchoolTextChanged);
                      _schoolCtrl.text = name;
                      _schoolCtrl.addListener(_onSchoolTextChanged);
                      setState(() {
                        _schoolSelected = true;
                        _selectedSchoolName = name;
                      });
                      _removeOverlay();
                      _schoolFocusNode.unfocus();
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(school['school_name'] ?? '',
                              style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
                          if (school['region'] != null)
                            Text('${school['region']} ${school['school_type'] ?? ''}',
                                style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
    overlay.insert(_overlayEntry!);
  }

  void _removeOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  Future<void> _pickDate({required bool isStudentBirth}) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 17),
      firstDate: DateTime(1980),
      lastDate: now,
      locale: const Locale('ko'),
    );
    if (picked != null) {
      final dateStr = '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      setState(() {
        if (isStudentBirth) {
          _studentBirth = dateStr;
        } else {
          _birthDate = dateStr;
        }
      });
    }
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;

    // 추가 검증
    if (_memberType == 'student' || _memberType == 'parent') {
      if (_birthDate == null) {
        setState(() => _errorMessage = '생년월일을 입력해주세요');
        return;
      }
      if (!_schoolSelected || _selectedSchoolName.isEmpty) {
        setState(() => _errorMessage = '재학 학교를 검색하여 선택해주세요');
        return;
      }
      if (_grade == null) {
        setState(() => _errorMessage = '학년을 선택해주세요');
        return;
      }
    }
    if (_memberType == 'parent') {
      if (_studentNameCtrl.text.trim().isEmpty) {
        setState(() => _errorMessage = '자녀 이름을 입력해주세요');
        return;
      }
      if (_studentBirth == null) {
        setState(() => _errorMessage = '자녀 생년월일을 입력해주세요');
        return;
      }
    }
    if (_memberType == 'branch_manager' && (_branchName == null || _branchName!.isEmpty)) {
      setState(() => _errorMessage = '담당 지점을 선택해주세요');
      return;
    }
    if ((_memberType == 'student' || _memberType == 'parent') &&
        _isAcademyStudent &&
        (_branchName == null || _branchName!.isEmpty)) {
      setState(() => _errorMessage = '재원생이시면 재원 지점을 선택해주세요');
      return;
    }

    setState(() { _isLoading = true; _errorMessage = null; });
    try {
      // 지점명 결정: branch_manager 는 담당 지점, 학생/학부모는 재원생일 때만 지점
      String? branchToSend;
      if (_memberType == 'branch_manager') {
        branchToSend = _branchName;
      } else if (_isAcademyStudent) {
        branchToSend = _branchName;
      }

      await AuthService.register(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
        name: _nameCtrl.text.trim(),
        phone: _phoneCtrl.text.trim(),
        memberType: _memberType,
        birthDate: _birthDate,
        schoolName: _selectedSchoolName.isNotEmpty ? _selectedSchoolName : null,
        grade: _grade,
        studentName: _memberType == 'parent' ? _studentNameCtrl.text.trim() : null,
        studentBirth: _memberType == 'parent' ? _studentBirth : null,
        branchName: branchToSend,
        isAcademyStudent: (_memberType != 'branch_manager') && _isAcademyStudent,
      );
      if (mounted) {
        final msg = _memberType == 'branch_manager'
            ? '회원가입이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.'
            : '회원가입이 완료되었습니다. 로그인해주세요.';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
        Navigator.pop(context);
      }
    } catch (e) {
      setState(() => _errorMessage = e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('회원가입'),
        backgroundColor: Colors.white,
        elevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('계정 만들기',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                const Text('정보를 입력하고 서비스를 시작하세요',
                    style: TextStyle(fontSize: 14, color: Color(0xFF6B7280))),
                const SizedBox(height: 24),

                // 회원 유형 선택
                _buildLabel('회원 유형'),
                Row(
                  children: [
                    _buildTypeButton('student', '학생'),
                    const SizedBox(width: 8),
                    _buildTypeButton('parent', '학부모'),
                    const SizedBox(width: 8),
                    _buildTypeButton('branch_manager', '지점 담당자'),
                  ],
                ),
                const SizedBox(height: 20),

                // 공통 필드
                _buildLabel('이름'),
                TextFormField(
                  controller: _nameCtrl,
                  decoration: const InputDecoration(hintText: '홍길동'),
                  validator: (v) => v?.isEmpty == true ? '이름을 입력해주세요' : null,
                ),
                const SizedBox(height: 16),
                _buildLabel('이메일'),
                TextFormField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(hintText: 'example@email.com'),
                  validator: (v) {
                    if (v?.isEmpty == true) return '이메일을 입력해주세요';
                    if (!v!.contains('@')) return '올바른 이메일을 입력해주세요';
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                _buildLabel('비밀번호'),
                TextFormField(
                  controller: _passwordCtrl,
                  obscureText: _obscure,
                  decoration: InputDecoration(
                    hintText: '8자 이상',
                    suffixIcon: IconButton(
                      icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility,
                          color: const Color(0xFF9CA3AF)),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  validator: (v) {
                    if (v?.isEmpty == true) return '비밀번호를 입력해주세요';
                    if (v!.length < 8) return '비밀번호는 8자 이상이어야 합니다';
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                _buildLabel('비밀번호 확인'),
                TextFormField(
                  controller: _confirmCtrl,
                  obscureText: _obscure,
                  decoration: const InputDecoration(hintText: '비밀번호 재입력'),
                  validator: (v) {
                    if (v != _passwordCtrl.text) return '비밀번호가 일치하지 않습니다';
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                _buildLabel('연락처'),
                TextFormField(
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(hintText: '010-0000-0000'),
                  validator: (v) => v?.isEmpty == true ? '연락처를 입력해주세요' : null,
                ),
                const SizedBox(height: 16),

                // 학생/학부모 추가 필드
                if (_memberType == 'student' || _memberType == 'parent') ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF9FAFB),
                      border: Border.all(color: const Color(0xFFE5E7EB)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _memberType == 'student' ? '학생 정보' : '학부모 및 자녀 정보',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF374151)),
                        ),
                        const SizedBox(height: 12),

                        // 본인 생년월일
                        _buildLabel('생년월일'),
                        GestureDetector(
                          onTap: () => _pickDate(isStudentBirth: false),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                            decoration: BoxDecoration(
                              border: Border.all(color: const Color(0xFFD1D5DB)),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                Text(
                                  _birthDate ?? '생년월일을 선택하세요',
                                  style: TextStyle(
                                    fontSize: 14,
                                    color: _birthDate != null ? const Color(0xFF111827) : const Color(0xFF9CA3AF),
                                  ),
                                ),
                                const Spacer(),
                                const Icon(Icons.calendar_today, size: 18, color: Color(0xFF9CA3AF)),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),

                        // 학부모: 자녀 정보
                        if (_memberType == 'parent') ...[
                          _buildLabel('자녀 이름'),
                          TextFormField(
                            controller: _studentNameCtrl,
                            decoration: const InputDecoration(hintText: '자녀 이름을 입력하세요'),
                          ),
                          const SizedBox(height: 12),
                          _buildLabel('자녀 생년월일'),
                          GestureDetector(
                            onTap: () => _pickDate(isStudentBirth: true),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                              decoration: BoxDecoration(
                                border: Border.all(color: const Color(0xFFD1D5DB)),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                children: [
                                  Text(
                                    _studentBirth ?? '생년월일을 선택하세요',
                                    style: TextStyle(
                                      fontSize: 14,
                                      color: _studentBirth != null ? const Color(0xFF111827) : const Color(0xFF9CA3AF),
                                    ),
                                  ),
                                  const Spacer(),
                                  const Icon(Icons.calendar_today, size: 18, color: Color(0xFF9CA3AF)),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],

                        // 학교 검색
                        _buildLabel(_memberType == 'parent' ? '자녀 재학 학교' : '재학 학교'),
                        CompositedTransformTarget(
                          link: _schoolLayerLink,
                          child: TextFormField(
                            controller: _schoolCtrl,
                            focusNode: _schoolFocusNode,
                            decoration: InputDecoration(
                              hintText: '학교명 검색 후 선택 (2글자 이상)',
                              suffixIcon: _searchingSchool
                                  ? const Padding(
                                      padding: EdgeInsets.all(12),
                                      child: SizedBox(width: 18, height: 18,
                                          child: CircularProgressIndicator(strokeWidth: 2)),
                                    )
                                  : null,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),

                        // 학년
                        _buildLabel(_memberType == 'parent' ? '자녀 학년' : '학년'),
                        DropdownButtonFormField<int>(
                          value: _grade,
                          items: const [
                            DropdownMenuItem(value: null, child: Text('선택하세요')),
                            DropdownMenuItem(value: 1, child: Text('1학년')),
                            DropdownMenuItem(value: 2, child: Text('2학년')),
                            DropdownMenuItem(value: 3, child: Text('3학년')),
                          ],
                          onChanged: (v) => setState(() => _grade = v),
                          decoration: const InputDecoration(),
                        ),
                        const SizedBox(height: 12),

                        // 재원생 여부
                        InkWell(
                          onTap: () {
                            setState(() {
                              _isAcademyStudent = !_isAcademyStudent;
                              if (!_isAcademyStudent) _branchName = null;
                            });
                          },
                          borderRadius: BorderRadius.circular(6),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              children: [
                                SizedBox(
                                  width: 18, height: 18,
                                  child: Checkbox(
                                    value: _isAcademyStudent,
                                    onChanged: (v) {
                                      setState(() {
                                        _isAcademyStudent = v ?? false;
                                        if (!_isAcademyStudent) _branchName = null;
                                      });
                                    },
                                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  _memberType == 'parent'
                                      ? '자녀가 입시라운지 재원생입니다'
                                      : '입시라운지 재원생입니다',
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                                ),
                              ],
                            ),
                          ),
                        ),

                        // 재원 지점 (재원생 선택 시만)
                        if (_isAcademyStudent) ...[
                          const SizedBox(height: 10),
                          _buildLabel('재원 지점'),
                          DropdownButtonFormField<String>(
                            value: _branchName,
                            items: [
                              const DropdownMenuItem<String>(
                                value: null,
                                child: Text('재원 지점을 선택해주세요'),
                              ),
                              ..._branchOptions.map((b) => DropdownMenuItem<String>(value: b, child: Text(b))),
                            ],
                            onChanged: (v) => setState(() => _branchName = v),
                            decoration: const InputDecoration(),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // 지점 담당자 추가 필드
                if (_memberType == 'branch_manager') ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF7ED),
                      border: Border.all(color: const Color(0xFFFED7AA)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('지점 담당자 정보',
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF9A3412))),
                        const SizedBox(height: 12),
                        _buildLabel('담당 지점'),
                        DropdownButtonFormField<String>(
                          value: _branchName,
                          items: [
                            const DropdownMenuItem<String>(
                              value: null,
                              child: Text('담당 지점을 선택해주세요'),
                            ),
                            ..._branchOptions.map((b) => DropdownMenuItem<String>(value: b, child: Text(b))),
                          ],
                          onChanged: (v) => setState(() => _branchName = v),
                          decoration: const InputDecoration(),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          '* 지점 담당자 가입은 관리자 승인 후 이용 가능합니다.',
                          style: TextStyle(fontSize: 12, color: Color(0xFFB45309)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                if (_errorMessage != null) ...[
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
                  const SizedBox(height: 16),
                ],

                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _register,
                    child: _isLoading
                        ? const SizedBox(width: 20, height: 20,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Text('회원가입'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTypeButton(String type, String label) {
    final selected = _memberType == type;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() {
          _memberType = type;
          // 회원 유형 변경 시 지점 및 재원생 플래그 초기화
          _branchName = null;
          _isAcademyStudent = false;
        }),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            border: Border.all(
              color: selected ? const Color(0xFF2563EB) : const Color(0xFFE5E7EB),
              width: 2,
            ),
            borderRadius: BorderRadius.circular(8),
            color: selected ? const Color(0xFFEFF6FF) : Colors.white,
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                color: selected ? const Color(0xFF2563EB) : const Color(0xFF374151),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Color(0xFF374151)),
      ),
    );
  }
}
