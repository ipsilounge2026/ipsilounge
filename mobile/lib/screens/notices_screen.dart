import 'package:flutter/material.dart';
import '../services/user_service.dart';

class NoticesScreen extends StatefulWidget {
  const NoticesScreen({super.key});

  @override
  State<NoticesScreen> createState() => _NoticesScreenState();
}

class _NoticesScreenState extends State<NoticesScreen> {
  List<Map<String, dynamic>> _notices = [];
  bool _isLoading = true;
  final Set<String> _expandedIds = {};

  @override
  void initState() {
    super.initState();
    _loadNotices();
  }

  Future<void> _loadNotices() async {
    setState(() => _isLoading = true);
    try {
      final items = await UserService.getActiveNotices();
      // Sort: pinned first, then by created_at descending
      items.sort((a, b) {
        final aPinned = a['is_pinned'] == true ? 0 : 1;
        final bPinned = b['is_pinned'] == true ? 0 : 1;
        if (aPinned != bPinned) return aPinned.compareTo(bPinned);
        final aDate = a['created_at'] ?? '';
        final bDate = b['created_at'] ?? '';
        return bDate.compareTo(aDate);
      });
      setState(() => _notices = items);
    } catch (_) {} finally {
      setState(() => _isLoading = false);
    }
  }

  String _audienceLabel(String? audience) {
    switch (audience) {
      case 'all':
        return '전체';
      case 'student':
        return '학생';
      case 'parent':
        return '학부모';
      case 'branch_manager':
        return '지점 담당자';
      default:
        return '전체';
    }
  }

  Color _audienceColor(String? audience) {
    switch (audience) {
      case 'student':
        return const Color(0xFF3B82F6);
      case 'parent':
        return const Color(0xFF8B5CF6);
      case 'branch_manager':
        return const Color(0xFFF59E0B);
      default:
        return const Color(0xFF6B7280);
    }
  }

  String _formatDate(String? iso) {
    if (iso == null) return '';
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.year}.${dt.month.toString().padLeft(2, '0')}.${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('공지사항')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadNotices,
              child: _notices.isEmpty
                  ? ListView(
                      children: [
                        SizedBox(
                          height: MediaQuery.of(context).size.height * 0.5,
                          child: const Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.campaign_outlined,
                                  size: 56, color: Color(0xFFD1D5DB)),
                              SizedBox(height: 16),
                              Text(
                                '공지사항이 없습니다',
                                style: TextStyle(color: Color(0xFF6B7280)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _notices.length,
                      itemBuilder: (context, i) {
                        final notice = _notices[i];
                        final id = notice['id']?.toString() ?? '$i';
                        final isPinned = notice['is_pinned'] == true;
                        final isExpanded = _expandedIds.contains(id);
                        final audience = notice['target_audience'] as String?;

                        return GestureDetector(
                          onTap: () {
                            setState(() {
                              if (isExpanded) {
                                _expandedIds.remove(id);
                              } else {
                                _expandedIds.add(id);
                              }
                            });
                          },
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: isPinned
                                    ? const Color(0xFFBFDBFE)
                                    : const Color(0xFFE5E7EB),
                              ),
                              boxShadow: const [
                                BoxShadow(
                                  color: Color(0x0A000000),
                                  blurRadius: 6,
                                  offset: Offset(0, 2),
                                ),
                              ],
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Top row: badge + pin + date
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: _audienceColor(audience)
                                            .withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        _audienceLabel(audience),
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: _audienceColor(audience),
                                        ),
                                      ),
                                    ),
                                    if (isPinned) ...[
                                      const SizedBox(width: 6),
                                      const Icon(Icons.push_pin,
                                          size: 14, color: Color(0xFF3B82F6)),
                                    ],
                                    const Spacer(),
                                    Text(
                                      _formatDate(notice['created_at'] as String?),
                                      style: const TextStyle(
                                          fontSize: 11, color: Color(0xFF9CA3AF)),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                // Title
                                Text(
                                  notice['title'] ?? '',
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF111827),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                // Content
                                Text(
                                  notice['content'] ?? '',
                                  maxLines: isExpanded ? null : 2,
                                  overflow: isExpanded
                                      ? TextOverflow.visible
                                      : TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: Color(0xFF6B7280),
                                    height: 1.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}
