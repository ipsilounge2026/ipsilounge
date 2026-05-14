import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// 입시 뉴스 글 본문을 인앱 WebView 로 표시.
/// 상단 AppBar 의 leading 에 "← 입시라운지" 돌아가기 버튼을 제공하여
/// 사용자가 외부 브라우저로 이탈하지 않고 앱으로 복귀하도록 함.
class BlogNewsWebViewScreen extends StatefulWidget {
  final String url;
  final String title;

  const BlogNewsWebViewScreen({
    super.key,
    required this.url,
    this.title = '입시 뉴스',
  });

  @override
  State<BlogNewsWebViewScreen> createState() => _BlogNewsWebViewScreenState();
}

class _BlogNewsWebViewScreenState extends State<BlogNewsWebViewScreen> {
  late final WebViewController _controller;
  int _progress = 0;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) => setState(() => _progress = p),
          onPageStarted: (_) => setState(() => _loading = true),
          onPageFinished: (_) => setState(() => _loading = false),
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvoked: (didPop) async {
        if (didPop) return;
        // WebView 내부 history 우선, 없으면 화면 종료
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else if (mounted) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            tooltip: '입시라운지로 돌아가기',
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: Text(widget.title, overflow: TextOverflow.ellipsis),
          actions: [
            IconButton(
              icon: const Icon(Icons.home_outlined),
              tooltip: '입시라운지 홈',
              onPressed: () {
                // 홈으로 즉시 복귀 (스택 정리)
                Navigator.of(context).popUntil((route) => route.isFirst);
              },
            ),
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: () => _controller.reload(),
            ),
          ],
        ),
        body: Column(
          children: [
            if (_loading && _progress < 100)
              LinearProgressIndicator(value: _progress / 100.0, minHeight: 2),
            Expanded(child: WebViewWidget(controller: _controller)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: const BoxDecoration(
                color: Color(0xFFF9FAFB),
                border: Border(top: BorderSide(color: Color(0xFFE5E7EB))),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '입시라운지 네이버 블로그',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.arrow_back, size: 16),
                    label: const Text('입시라운지로 돌아가기'),
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFF2563EB),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
