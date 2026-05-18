import 'package:flutter/material.dart';
import '../theme/app_palette.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../models/consultation.dart';
import '../services/consultation_service.dart';
import '../services/survey_service.dart';
import '../services/user_service.dart';
import '../services/family_service.dart';
import 'analysis_list_screen.dart';
import 'survey_screen.dart';
import 'survey_report_screen.dart';

const _roleLabels = {
  'student': '학생',
  'parent': '학부모',
  'branch_manager': '지점 담당자',
  'admin': '관리자',
  'counselor': '상담자',
};

const _roleColors = {
  'student': Color(0xFF3B82F6),
  'parent': Color(0xFF8B5CF6),
  'branch_manager': Color(0xFFF59E0B),
  'admin': Color(0xFFEF4444),
  'counselor': Color(0xFF10B981),
};

const _branchOptions = [
  '경복궁점', '광화문점', '구리점', '대치점', '대흥점',
  '마포점', '분당점', '은평점', '중계점', '대치스터디센터점',
];

class MypageScreen extends StatefulWidget {
  const MypageScreen({super.key});

  @override
  State<MypageScreen> createState() => _MypageScreenState();
}

class _MypageScreenState extends State<MypageScreen> {
  bool _editing = false;
  Future<List<Map<String, dynamic>>>? _familyFuture; // 연결된 학부모 (초기 1회 + 갱신 시만 재요청)
  late TextEditingController _nameCtrl;
  late TextEditingController _phoneCtrl;
  String? _message;
  bool _isError = false;
  bool _isSaving = false;

  // 재원생/지점 편집 상태
  bool _editIsAcademyStudent = false;
  String? _editBranchName;

  // 담당자 관련
  bool _isAssigned = false;
  Counselor? _myCounselor;
  bool _counselorLoading = true;

  // 담당 선배 관련
  bool _seniorAssigned = false;
  Map<String, dynamic>? _mySenior;
  bool _seniorLoading = true;

  // 설문 관련
  List<Map<String, dynamic>> _surveys = [];

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user;
    _nameCtrl = TextEditingController(text: user?.name ?? '');
    _phoneCtrl = TextEditingController(text: user?.phone ?? '');
    _editIsAcademyStudent = user?.isAcademyStudent ?? false;
    _editBranchName = user?.branchName;

    final memberType = user?.memberType ?? 'student';
    if (memberType != 'branch_manager') {
      _loadCounselor();
      _loadSenior();
      _loadSurveys();
      _familyFuture = FamilyService.getLinks();
    } else {
      _counselorLoading = false;
      _seniorLoading = false;
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadCounselor() async {
    try {
      final res = await ConsultationService.getMyCounselor();
      setState(() {
        _isAssigned = res['assigned'] == true;
        if (res['counselor'] != null) {
          _myCounselor = Counselor.fromJson(res['counselor']);
        }
        _counselorLoading = false;
      });
    } catch (_) {
      setState(() => _counselorLoading = false);
    }
  }

  Future<void> _loadSurveys() async {
    try {
      final list = await SurveyService.listMy();
      setState(() => _surveys = list);
    } catch (_) {}
  }

  Future<void> _loadSenior() async {
    try {
      final res = await ConsultationService.getMySenior();
      setState(() {
        _seniorAssigned = res['assigned'] == true;
        if (res['senior'] != null) {
          _mySenior = Map<String, dynamic>.from(res['senior']);
        }
        _seniorLoading = false;
      });
    } catch (_) {
      setState(() => _seniorLoading = false);
    }
  }

  Future<void> _showSeniorChangeRequestDialog() async {
    final reasonCtrl = TextEditingController();
    bool isSubmitting = false;

    if (!mounted) return;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20, right: 20, top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('선배 변경 요청',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              const Text('변경 사유', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              TextField(
                controller: reasonCtrl,
                maxLines: 3,
                decoration: const InputDecoration(hintText: '선배 변경을 요청하는 사유를 입력해주세요'),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: isSubmitting ? null : () async {
                        if (reasonCtrl.text.trim().isEmpty) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            const SnackBar(content: Text('변경 사유를 입력해주세요.')),
                          );
                          return;
                        }
                        setSheetState(() => isSubmitting = true);
                        try {
                          await ConsultationService.requestSeniorChange(
                            reason: reasonCtrl.text.trim(),
                          );
                          if (ctx.mounted) Navigator.pop(ctx);
                          if (mounted) {
                            setState(() => _message = '선배 변경 요청이 접수되었습니다. 관리자 확인 후 처리됩니다.');
                          }
                        } catch (e) {
                          setSheetState(() => isSubmitting = false);
                          if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              SnackBar(content: Text(e.toString())),
                            );
                          }
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF7C3AED),
                      ),
                      child: isSubmitting
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('변경 요청 제출'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('취소'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _save() async {
    final user = context.read<AuthProvider>().user;
    if (user == null) return;

    final isBranchManager = user.memberType == 'branch_manager';

    // 학생/학부모: 재원생이면 지점 필수
    if (!isBranchManager && _editIsAcademyStudent &&
        (_editBranchName == null || _editBranchName!.isEmpty)) {
      setState(() {
        _message = '재원생이시면 재원 지점을 선택해주세요';
        _isError = true;
      });
      return;
    }

    setState(() { _isSaving = true; _message = null; _isError = false; });
    try {
      // 비재원생으로 바꾸면 지점도 함께 지움
      final shouldClearBranch = !isBranchManager && !_editIsAcademyStudent;

      await UserService.updateMe(
        user.name, // 이름은 수정 불가
        _phoneCtrl.text.trim(),
        branchName: isBranchManager
            ? null // branch_manager 는 마이페이지에서 담당 지점 변경 불가
            : (_editIsAcademyStudent ? _editBranchName : null),
        clearBranch: shouldClearBranch,
        isAcademyStudent: isBranchManager ? null : _editIsAcademyStudent,
      );
      await context.read<AuthProvider>().refreshUser();
      if (!mounted) return;
      setState(() {
        _editing = false;
        _message = '정보가 수정되었습니다';
        _isError = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _message = e.toString();
        _isError = true;
      });
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _showChangeRequestDialog() async {
    List<Counselor> availableCounselors = [];
    try {
      availableCounselors = await ConsultationService.getAvailableCounselors();
    } catch (_) {}

    String? selectedId;
    final reasonCtrl = TextEditingController();
    bool isSubmitting = false;

    if (!mounted) return;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20, right: 20, top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('담당자 변경 요청',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              const Text('변경 희망 담당자', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                value: selectedId,
                hint: const Text('추천 희망 (관리자가 배정)'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('추천 희망 (관리자가 배정)')),
                  ...availableCounselors.map((c) =>
                      DropdownMenuItem(value: c.id, child: Text(c.name))),
                ],
                onChanged: (v) => setSheetState(() => selectedId = v),
                decoration: const InputDecoration(),
              ),
              const SizedBox(height: 16),
              const Text('변경 사유', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              TextField(
                controller: reasonCtrl,
                maxLines: 3,
                decoration: const InputDecoration(hintText: '담당자 변경을 요청하는 사유를 입력해주세요'),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: isSubmitting ? null : () async {
                        if (reasonCtrl.text.trim().isEmpty) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            const SnackBar(content: Text('변경 사유를 입력해주세요.')),
                          );
                          return;
                        }
                        setSheetState(() => isSubmitting = true);
                        try {
                          await ConsultationService.requestCounselorChange(
                            selectedId, reasonCtrl.text.trim(),
                          );
                          if (ctx.mounted) Navigator.pop(ctx);
                          if (mounted) {
                            setState(() => _message = '담당자 변경 요청이 접수되었습니다. 관리자 확인 후 처리됩니다.');
                          }
                        } catch (e) {
                          setSheetState(() => isSubmitting = false);
                          if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              SnackBar(content: Text(e.toString())),
                            );
                          }
                        }
                      },
                      child: isSubmitting
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('변경 요청 제출'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('취소'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    if (user == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    final roleLabel = _roleLabels[user.memberType] ?? user.memberType;
    final roleColor = _roleColors[user.memberType] ?? const Color(0xFF6B7280);
    final isBranchManager = user.memberType == 'branch_manager';

    return Scaffold(
      appBar: AppBar(
        title: const Text('마이페이지'),
        actions: [
          if (!_editing)
            TextButton(
              onPressed: () => setState(() {
                _editing = true;
                _message = null;
                _isError = false;
                // 편집 진입 시 현재 유저 값으로 초기화
                _editIsAcademyStudent = user.isAcademyStudent;
                _editBranchName = user.branchName;
              }),
              child: const Text('수정', style: TextStyle(color: Color(0xFF3B82F6))),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 프로필 헤더 (역할 뱃지 포함)
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppPalette.navy,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.person, color: Colors.white, size: 32),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(user.name, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: roleColor.withOpacity(0.9),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(roleLabel, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(user.email, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // 메시지
          if (_message != null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _isError ? const Color(0xFFFEE2E2) : const Color(0xFFD1FAE5),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _message!,
                style: TextStyle(
                  color: _isError ? const Color(0xFF991B1B) : const Color(0xFF065F46),
                  fontSize: 13,
                ),
              ),
            ),

          // 회원 정보 카드
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('회원 정보', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppPalette.navy, letterSpacing: -0.3)),
                const SizedBox(height: 16),
                if (_editing) ...[
                  _buildLabel('이름'),
                  TextField(
                    controller: _nameCtrl,
                    enabled: false,
                    decoration: const InputDecoration(
                      filled: true, fillColor: Color(0xFFF3F4F6),
                      helperText: '이름은 변경할 수 없습니다',
                      helperStyle: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildLabel('연락처'),
                  TextField(
                    controller: _phoneCtrl,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(hintText: '010-0000-0000'),
                  ),
                  // 지점 담당자: 담당 지점 표시 (읽기 전용)
                  if (isBranchManager) ...[
                    const SizedBox(height: 12),
                    _buildLabel('담당 지점'),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF3F4F6),
                        border: Border.all(color: const Color(0xFFE5E7EB)),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Text(
                            user.branchName ?? '-',
                            style: const TextStyle(fontSize: 14, color: Color(0xFF374151)),
                          ),
                          const Spacer(),
                          const Text(
                            '변경은 관리자에게 문의',
                            style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
                          ),
                        ],
                      ),
                    ),
                  ],
                  // 학생/학부모: 재원생 + 재원 지점 편집
                  if (!isBranchManager) ...[
                    const SizedBox(height: 16),
                    InkWell(
                      onTap: () {
                        setState(() {
                          _editIsAcademyStudent = !_editIsAcademyStudent;
                          if (!_editIsAcademyStudent) _editBranchName = null;
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
                                value: _editIsAcademyStudent,
                                onChanged: (v) {
                                  setState(() {
                                    _editIsAcademyStudent = v ?? false;
                                    if (!_editIsAcademyStudent) _editBranchName = null;
                                  });
                                },
                                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              user.memberType == 'parent'
                                  ? '자녀가 입시라운지 재원생입니다'
                                  : '입시라운지 재원생입니다',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (_editIsAcademyStudent) ...[
                      const SizedBox(height: 10),
                      _buildLabel('재원 지점'),
                      DropdownButtonFormField<String>(
                        value: _editBranchName,
                        items: [
                          const DropdownMenuItem<String>(
                            value: null,
                            child: Text('재원 지점을 선택해주세요'),
                          ),
                          ..._branchOptions.map((b) =>
                              DropdownMenuItem<String>(value: b, child: Text(b))),
                        ],
                        onChanged: (v) => setState(() => _editBranchName = v),
                        decoration: const InputDecoration(),
                      ),
                    ],
                  ],
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(child: ElevatedButton(
                        onPressed: _isSaving ? null : _save,
                        child: _isSaving
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                            : const Text('저장'),
                      )),
                      const SizedBox(width: 8),
                      Expanded(child: OutlinedButton(
                        onPressed: () {
                          setState(() {
                            _editing = false;
                            _nameCtrl.text = user.name;
                            _phoneCtrl.text = user.phone ?? '';
                            _editIsAcademyStudent = user.isAcademyStudent;
                            _editBranchName = user.branchName;
                            _message = null;
                            _isError = false;
                          });
                        },
                        child: const Text('취소'),
                      )),
                    ],
                  ),
                ] else ...[
                  _infoRow('이름', user.name),
                  const Divider(height: 24),
                  _infoRow('이메일', user.email),
                  const Divider(height: 24),
                  _infoRow('연락처', user.phone ?? '-'),
                  const Divider(height: 24),
                  _infoRow('가입일', _formatDate(user.createdAt)),
                  // 지점 담당자: 담당 지점 표시
                  if (isBranchManager) ...[
                    const Divider(height: 24),
                    _branchChipRow(
                      '담당 지점',
                      user.branchName ?? '-',
                      bgColor: const Color(0xFFFFF7ED),
                      textColor: const Color(0xFF9A3412),
                      borderColor: const Color(0xFFFED7AA),
                      icon: Icons.apartment_outlined,
                    ),
                  ],
                  // 학생/학부모: 재원 여부 + 재원 지점
                  if (!isBranchManager) ...[
                    const Divider(height: 24),
                    _academyStatusRow(user.isAcademyStudent, user.branchName),
                  ],
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),

          // 연결된 학부모 (학생/학부모만) — 웹 FamilyLinkSection 대응
          if (!isBranchManager) ...[
            _buildFamilyCard(),
            const SizedBox(height: 12),
          ],

          // 담당 상담자 (학생/학부모만)
          if (!isBranchManager) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('담당 상담자', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppPalette.navy, letterSpacing: -0.3)),
                  const SizedBox(height: 12),
                  if (_counselorLoading)
                    const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
                  else if (_isAssigned && _myCounselor != null)
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 18,
                          backgroundColor: const Color(0xFF22C55E),
                          child: Text(
                            _myCounselor!.name.isNotEmpty ? _myCounselor!.name[0] : '?',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(_myCounselor!.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                        const Spacer(),
                        GestureDetector(
                          onTap: _showChangeRequestDialog,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              border: Border.all(color: const Color(0xFFE5E7EB)),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text('담당자 변경 요청', style: TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                          ),
                        ),
                      ],
                    )
                  else
                    const Text(
                      '아직 배정된 담당자가 없습니다.\n상담 예약 시 자동 배정됩니다.',
                      style: TextStyle(fontSize: 14, color: Color(0xFF9CA3AF), height: 1.5),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // 담당 선배
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('담당 선배', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppPalette.navy, letterSpacing: -0.3)),
                  const SizedBox(height: 12),
                  if (_seniorLoading)
                    const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
                  else if (_seniorAssigned && _mySenior != null)
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 18,
                          backgroundColor: const Color(0xFF7C3AED),
                          child: Text(
                            (_mySenior!['name'] as String? ?? '?').isNotEmpty
                                ? (_mySenior!['name'] as String)[0]
                                : '?',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(_mySenior!['name'] as String? ?? '',
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                        const Spacer(),
                        GestureDetector(
                          onTap: _showSeniorChangeRequestDialog,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              border: Border.all(color: const Color(0xFFE5E7EB)),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text('선배 변경 요청', style: TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                          ),
                        ),
                      ],
                    )
                  else
                    const Text(
                      '아직 배정된 담당 선배가 없습니다.\n선배 상담 예약 시 자동 배정됩니다.',
                      style: TextStyle(fontSize: 14, color: Color(0xFF9CA3AF), height: 1.5),
                    ),
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: () => Navigator.pushNamed(
                        context, '/consultation/senior-notes'),
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF5F3FF),
                        border: Border.all(color: const Color(0xFFDDD6FE)),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.history_edu,
                              size: 18, color: Color(0xFF7C3AED)),
                          const SizedBox(width: 8),
                          const Expanded(
                            child: Text(
                              '내 선배 상담 기록 보기',
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF5B21B6)),
                            ),
                          ),
                          const Icon(Icons.chevron_right,
                              size: 18, color: Color(0xFF9CA3AF)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // 사전 조사
            if (_surveys.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('사전 조사', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppPalette.navy, letterSpacing: -0.3)),
                        GestureDetector(
                          onTap: () => Navigator.pushNamed(context, '/consultation'),
                          child: const Text('새 설문 →', style: TextStyle(fontSize: 13, color: Color(0xFF3B82F6))),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ..._surveys.map((s) {
                      final typeLabel = s['survey_type'] == 'preheigh1' ? '예비고1' : '고등학생';
                      final timing = s['timing'] as String?;
                      final statusText = s['status'] == 'submitted' ? '제출 완료' : '작성 중';
                      final statusColor = s['status'] == 'submitted' ? const Color(0xFF16A34A) : const Color(0xFFF59E0B);
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: InkWell(
                          onTap: () async {
                            await Navigator.push(context, MaterialPageRoute(
                              builder: (_) => SurveyScreen(
                                surveyType: s['survey_type'],
                                timing: timing,
                                existingSurveyId: s['id'],
                              ),
                            ));
                            _loadSurveys();
                          },
                          borderRadius: BorderRadius.circular(10),
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              border: Border.all(color: const Color(0xFFE5E7EB)),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '$typeLabel${timing != null ? " ($timing)" : ""} 사전 조사',
                                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${DateTime.tryParse(s['updated_at'] ?? '')?.toLocal().toString().substring(0, 10) ?? ''} 수정',
                                      style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF)),
                                    ),
                                  ],
                                ),
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                      decoration: BoxDecoration(color: statusColor, borderRadius: BorderRadius.circular(20)),
                                      child: Text(statusText, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                                    ),
                                    if (s['status'] == 'submitted') ...[
                                      const SizedBox(width: 8),
                                      GestureDetector(
                                        onTap: () {
                                          Navigator.push(context, MaterialPageRoute(
                                            builder: (_) => SurveyReportScreen(
                                              surveyId: s['id'],
                                              surveyType: s['survey_type'],
                                            ),
                                          ));
                                        },
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFF4472C4),
                                            borderRadius: BorderRadius.circular(16),
                                          ),
                                          child: const Text('리포트', style: TextStyle(
                                            color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600,
                                          )),
                                        ),
                                      ),
                                    ],
                                    if (s['status'] == 'draft') ...[
                                      const SizedBox(width: 8),
                                      GestureDetector(
                                        onTap: () async {
                                          final confirmed = await showDialog<bool>(
                                            context: context,
                                            builder: (ctx) => AlertDialog(
                                              title: const Text('설문 삭제'),
                                              content: const Text('이 설문을 삭제하시겠습니까?'),
                                              actions: [
                                                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('취소')),
                                                TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('삭제', style: TextStyle(color: Colors.red))),
                                              ],
                                            ),
                                          );
                                          if (confirmed == true) {
                                            try {
                                              await SurveyService.delete(s['id']);
                                              _loadSurveys();
                                            } catch (_) {}
                                          }
                                        },
                                        child: const Text('삭제', style: TextStyle(fontSize: 13, color: Color(0xFFDC2626))),
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }),
                  ],
                ),
              ),
            if (_surveys.isNotEmpty) const SizedBox(height: 12),

            // 빠른 메뉴
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('빠른 메뉴', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppPalette.navy, letterSpacing: -0.3)),
                  const SizedBox(height: 12),
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    childAspectRatio: 3,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    children: [
                      _quickMenuItem(Icons.description_outlined, '상담 기록 보기', '/consultation/notes'),
                      _quickMenuItem(Icons.calendar_today, '예약 현황', '/consultation/my'),
                      _quickMenuItemWidget(Icons.analytics_outlined, '학생부 분석 내역', const AnalysisListScreen(serviceType: '학생부라운지')),
                      _quickMenuItemWidget(Icons.track_changes, '학종 분석 내역', const AnalysisListScreen(serviceType: '학종라운지')),
                      _quickMenuItem(Icons.emoji_events_outlined, '합격 사례', '/admission-cases'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],

          // 공지사항
          _menuItem(Icons.campaign_outlined, '공지사항', onTap: () => Navigator.pushNamed(context, '/notices')),
          const SizedBox(height: 4),

          // 알림
          _menuItem(Icons.notifications_outlined, '알림', onTap: () => Navigator.pushNamed(context, '/notifications')),
          const SizedBox(height: 4),

          // 로그아웃
          _menuItem(
            Icons.logout, '로그아웃',
            color: const Color(0xFFEF4444),
            onTap: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('로그아웃'),
                  content: const Text('로그아웃 하시겠습니까?'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('취소')),
                    TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('로그아웃', style: TextStyle(color: Colors.red))),
                  ],
                ),
              );
              if (confirmed == true && mounted) {
                await context.read<AuthProvider>().logout();
                Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
              }
            },
          ),
          const SizedBox(height: 4),

          // 회원 탈퇴 (V1 §10-1 전면 철회) — 로그아웃 하단
          _menuItem(
            Icons.person_remove_outlined, '회원 탈퇴',
            color: const Color(0xFFB91C1C),
            onTap: _showWithdrawDialog,
          ),
        ],
      ),
    );
  }

  /// 회원 탈퇴 다이얼로그 — 비밀번호 필수, 사유 선택. 성공 시 로그아웃 후 로그인 화면.
  Future<void> _showWithdrawDialog() async {
    final pwCtrl = TextEditingController();
    final reasonCtrl = TextEditingController();
    bool busy = false;
    String? errText;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('회원 탈퇴', style: TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w800)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '탈퇴 시 선배·상담사에게 공유되던 기록이 즉시 비노출되고, 업로드한 학생부 파일·분석 리포트가 삭제됩니다. 되돌릴 수 없습니다.',
                  style: TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.5),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: pwCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: '비밀번호 (필수)'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: reasonCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: '탈퇴 사유 (선택)'),
                ),
                if (errText != null) ...[
                  const SizedBox(height: 10),
                  Text(errText!, style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 13)),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: busy ? null : () => Navigator.pop(ctx),
              child: const Text('취소'),
            ),
            TextButton(
              onPressed: busy
                  ? null
                  : () async {
                      if (pwCtrl.text.trim().isEmpty) {
                        setLocal(() => errText = '비밀번호를 입력해주세요');
                        return;
                      }
                      setLocal(() {
                        busy = true;
                        errText = null;
                      });
                      try {
                        await UserService.withdraw(pwCtrl.text.trim(),
                            reason: reasonCtrl.text);
                        if (!mounted) return;
                        Navigator.pop(ctx);
                        await context.read<AuthProvider>().logout();
                        if (!mounted) return;
                        Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
                      } catch (e) {
                        setLocal(() {
                          busy = false;
                          errText = e.toString().replaceFirst('Exception: ', '');
                        });
                      }
                    },
              child: Text(busy ? '처리 중...' : '탈퇴하기',
                  style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _quickMenuItem(IconData icon, String label, String route) {
    return InkWell(
      onTap: () => Navigator.pushNamed(context, route),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFE5E7EB)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: const Color(0xFF6B7280)),
            const SizedBox(width: 6),
            Expanded(child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis)),
          ],
        ),
      ),
    );
  }

  Widget _quickMenuItemWidget(IconData icon, String label, Widget screen) {
    return InkWell(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => screen)),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFE5E7EB)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: const Color(0xFF6B7280)),
            const SizedBox(width: 6),
            Expanded(child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis)),
          ],
        ),
      ),
    );
  }

  Widget _buildLabel(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppPalette.muted)),
  );

  Widget _infoRow(String label, String value) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label, style: const TextStyle(fontSize: 12, color: AppPalette.muted, fontWeight: FontWeight.w600)),
      Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppPalette.navy)),
    ],
  );

  Widget _branchChipRow(
    String label,
    String branch, {
    required Color bgColor,
    required Color textColor,
    required Color borderColor,
    required IconData icon,
  }) =>
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: AppPalette.muted, fontWeight: FontWeight.w600)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: bgColor,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: borderColor),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 13, color: textColor),
                const SizedBox(width: 4),
                Text(
                  branch,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: textColor),
                ),
              ],
            ),
          ),
        ],
      );

  Widget _academyStatusRow(bool isAcademyStudent, String? branchName) {
    if (!isAcademyStudent) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: const [
          Text('재원 여부', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
          Text('비재원생', style: TextStyle(fontSize: 14, color: Color(0xFF9CA3AF))),
        ],
      );
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 4),
          child: Text('재원 여부', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
        ),
        Flexible(
          child: Wrap(
            alignment: WrapAlignment.end,
            spacing: 6,
            runSpacing: 4,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFD1FAE5),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: const Color(0xFF6EE7B7)),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.check_circle_outline, size: 13, color: Color(0xFF065F46)),
                    SizedBox(width: 4),
                    Text('재원생',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF065F46))),
                  ],
                ),
              ),
              if (branchName != null && branchName.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFDBEAFE),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: const Color(0xFF93C5FD)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.apartment_outlined, size: 13, color: Color(0xFF1E40AF)),
                      const SizedBox(width: 4),
                      Text(branchName,
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF1E40AF))),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  /// 연결된 학부모 카드 (웹 FamilyLinkSection 대응) — 코드 만들기/입력/해제.
  Widget _buildFamilyCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('연결된 학부모',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppPalette.navy, letterSpacing: -0.3)),
              Row(children: [
                OutlinedButton(
                  onPressed: _showEnterCodeDialog,
                  style: OutlinedButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    side: const BorderSide(color: AppPalette.line),
                    foregroundColor: AppPalette.navy,
                  ),
                  child: const Text('코드 입력', style: TextStyle(fontSize: 12)),
                ),
                const SizedBox(width: 6),
                ElevatedButton(
                  onPressed: _showCreateCodeDialog,
                  style: ElevatedButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    backgroundColor: AppPalette.navy,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('코드 만들기', style: TextStyle(fontSize: 12)),
                ),
              ]),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            '학부모님 계정과 연결하면 학부모님이 본인의 신청·결제 내역을 보실 수 있고, 학부모님 관점 사전조사를 작성하실 수 있습니다.',
            style: TextStyle(fontSize: 12, color: AppPalette.muted, height: 1.5),
          ),
          const SizedBox(height: 12),
          FutureBuilder<List<Map<String, dynamic>>>(
            future: _familyFuture,
            builder: (ctx, snap) {
              if (snap.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text('불러오는 중...', style: TextStyle(fontSize: 13, color: AppPalette.muted)),
                );
              }
              if (snap.hasError) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text('가족 연결 정보를 불러오지 못했습니다.',
                      style: TextStyle(fontSize: 13, color: AppPalette.muted)),
                );
              }
              final links = snap.data ?? const <Map<String, dynamic>>[];
              if (links.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text('아직 연결된 가족이 없습니다.', style: TextStyle(fontSize: 13, color: AppPalette.muted)),
                );
              }
              try {
              return Column(
                children: links.map((lnk) {
                  final mv = lnk['member'];
                  final m = mv is Map ? mv : const {};
                  final name = (m['name'] ?? '-').toString();
                  final email = (m['email'] ?? '').toString();
                  final linkId = (lnk['id'] ?? '').toString();
                  return Container(
                    margin: const EdgeInsets.only(top: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      border: Border.all(color: AppPalette.line),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: AppPalette.cream,
                          child: Text(name.isNotEmpty ? name.substring(0, 1) : '?',
                              style: const TextStyle(color: AppPalette.navy, fontWeight: FontWeight.w700, fontSize: 13)),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppPalette.navy)),
                              Text(email, style: const TextStyle(fontSize: 12, color: AppPalette.muted)),
                            ],
                          ),
                        ),
                        TextButton(
                          onPressed: () => _confirmRevokeFamily(linkId, name),
                          child: const Text('해제', style: TextStyle(fontSize: 12, color: Color(0xFFB91C1C))),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              );
              } catch (_) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text('가족 연결 정보를 표시할 수 없습니다.',
                      style: TextStyle(fontSize: 13, color: AppPalette.muted)),
                );
              }
            },
          ),
        ],
      ),
    );
  }

  Future<void> _showCreateCodeDialog() async {
    String? code;
    String? err;
    try {
      final res = await FamilyService.createInvite();
      code = (res['code'] ?? res['invite_code'] ?? '').toString();
    } catch (e) {
      err = e.toString().replaceFirst('Exception: ', '');
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('초대 코드'),
        content: err != null
            ? Text(err, style: const TextStyle(color: Color(0xFFB91C1C)))
            : Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('아래 코드를 학부모님께 전달하세요.', style: TextStyle(fontSize: 13, color: AppPalette.muted)),
                const SizedBox(height: 12),
                SelectableText(code ?? '-',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppPalette.navy, letterSpacing: 2)),
              ]),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('확인'))],
      ),
    );
  }

  Future<void> _showEnterCodeDialog() async {
    final ctrl = TextEditingController();
    bool busy = false;
    String? err;
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('코드 입력'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: ctrl, decoration: const InputDecoration(labelText: '초대 코드')),
            if (err != null) ...[
              const SizedBox(height: 8),
              Text(err!, style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 13)),
            ],
          ]),
          actions: [
            TextButton(onPressed: busy ? null : () => Navigator.pop(ctx), child: const Text('취소')),
            TextButton(
              onPressed: busy
                  ? null
                  : () async {
                      if (ctrl.text.trim().isEmpty) {
                        setLocal(() => err = '코드를 입력해주세요');
                        return;
                      }
                      setLocal(() { busy = true; err = null; });
                      try {
                        await FamilyService.connectByCode(ctrl.text.trim());
                        if (!mounted) return;
                        Navigator.pop(ctx);
                        setState(() => _familyFuture = FamilyService.getLinks());
                      } catch (e) {
                        setLocal(() {
                          busy = false;
                          err = e.toString().replaceFirst('Exception: ', '');
                        });
                      }
                    },
              child: Text(busy ? '연결 중...' : '연결'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmRevokeFamily(String linkId, String name) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('연결 해제'),
        content: Text('$name 님과의 연결을 해제하시겠습니까?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('취소')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('해제', style: TextStyle(color: Color(0xFFB91C1C)))),
        ],
      ),
    );
    if (ok == true) {
      try {
        await FamilyService.revokeLink(linkId);
        if (mounted) setState(() => _familyFuture = FamilyService.getLinks());
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
        }
      }
    }
  }

  Widget _menuItem(IconData icon, String label, {Color? color, required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(
          children: [
            Icon(icon, color: color ?? const Color(0xFF374151), size: 20),
            const SizedBox(width: 12),
            Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: color ?? const Color(0xFF374151))),
            const Spacer(),
            const Icon(Icons.chevron_right, color: Color(0xFF9CA3AF)),
          ],
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.year}.${dt.month.toString().padLeft(2, '0')}.${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}
