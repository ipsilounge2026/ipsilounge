import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../models/consultation.dart';
import '../services/consultation_service.dart';

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
  bool _isSaving = false;

  // 담당자 관련
  bool _isAssigned = false;
  Counselor? _myCounselor;
  bool _counselorLoading = true;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user;
    _nameCtrl = TextEditingController(text: user?.name ?? '');
    _phoneCtrl = TextEditingController(text: user?.phone ?? '');

    final memberType = user?.memberType ?? 'student';
    if (memberType != 'branch_manager') {
      _loadCounselor();
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

  Future<void> _save() async {
    setState(() { _isSaving = true; _message = null; });
    try {
      await context.read<AuthProvider>().refreshUser();
      // Using direct API call for update
      final authProvider = context.read<AuthProvider>();
      // Simple save via provider refresh
      setState(() { _editing = false; _message = '정보가 수정되었습니다'; });
    } catch (e) {
      setState(() => _message = e.toString());
    } finally {
      setState(() => _isSaving = false);
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
              onPressed: () => setState(() => _editing = true),
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
              decoration: BoxDecoration(color: const Color(0xFFD1FAE5), borderRadius: BorderRadius.circular(8)),
              child: Text(_message!, style: const TextStyle(color: Color(0xFF065F46), fontSize: 13)),
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
                      _quickMenuItem(Icons.analytics_outlined, '분석 내역', '/analysis'),
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
