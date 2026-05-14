import 'package:flutter/material.dart';
import '../models/blog_news_item.dart';
import '../services/blog_news_service.dart';
import 'blog_news_webview_screen.dart';

/// 입시 뉴스 목록 화면.
/// 네이버 블로그 RSS 의 최근 20건을 카드 형태로 노출.
/// 각 항목 탭 시 인앱 WebView 로 본문 열기 (외부 브라우저 이탈 방지).
class BlogNewsScreen extends StatefulWidget {
  const BlogNewsScreen({super.key});

  @override
  State<BlogNewsScreen> createState() => _BlogNewsScreenState();
}

class _BlogNewsScreenState extends State<BlogNewsScreen> {
  late Future<BlogNewsResult> _future;

  @override
  void initState() {
    super.initState();
    _future = BlogNewsService.fetchNews(limit: 20);
  }

  Future<void> _refresh() async {
    setState(() => _future = BlogNewsService.fetchNews(limit: 20));
    await _future;
  }

  void _openItem(BlogNewsItem item) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BlogNewsWebViewScreen(url: item.link, title: item.title),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('입시 뉴스')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<BlogNewsResult>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            final result = snap.data;
            if (result == null || (result.items.isEmpty && (result.error?.isNotEmpty ?? false))) {
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        result?.error ?? '입시 뉴스를 불러오지 못했습니다.',
                        style: const TextStyle(color: Colors.grey),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: result.items.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final item = result.items[i];
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  leading: item.thumbnail != null && item.thumbnail!.isNotEmpty
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            item.thumbnail!,
                            width: 56,
                            height: 56,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const _ThumbPlaceholder(),
                          ),
                        )
                      : const _ThumbPlaceholder(),
                  title: Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(
                      children: [
                        if (item.category.isNotEmpty) ...[
                          Flexible(
                            child: Text(
                              '[${item.category}]',
                              style: const TextStyle(
                                color: Color(0xFF2563EB),
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                        ],
                        Text(
                          item.publishedDateLabel,
                          style: const TextStyle(color: Colors.grey, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  onTap: () => _openItem(item),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _ThumbPlaceholder extends StatelessWidget {
  const _ThumbPlaceholder();
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        color: const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Icon(Icons.article_outlined, color: Color(0xFFD97706), size: 24),
    );
  }
}
