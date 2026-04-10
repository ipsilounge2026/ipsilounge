import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../models/consultation.dart';
import '../services/consultation_service.dart';
import '../services/survey_service.dart';
import '../services/user_service.dart';
import 'analysis_list_screen.dart';
import 'survey_screen.dart';

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
      _loadSurveys();
    } else {
      _counselorLoading = false;
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
              gradient: const LinearGradient(
                colors: [Color(0xFF3B82F6), Color(0xFF2563EB)],
              ),
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
                const Text('회원 정보', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
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
                  const Text('담당 상담자', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
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
                        const Text('사전 조사', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
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
                  const Text('빠른 메뉴', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
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
        ],
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
    child: Text(text, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Color(0xFF374151))),
  );

  Widget _infoRow(String label, String value) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label, style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
      Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
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
          Text(label, style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
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
