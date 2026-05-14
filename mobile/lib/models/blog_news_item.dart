/// 입시 뉴스(네이버 블로그 RSS) 단일 항목 모델.
class BlogNewsItem {
  final String title;
  final String link;
  final String category;
  final String description;
  final String? thumbnail;
  final String publishedAt;

  BlogNewsItem({
    required this.title,
    required this.link,
    required this.category,
    required this.description,
    required this.thumbnail,
    required this.publishedAt,
  });

  factory BlogNewsItem.fromJson(Map<String, dynamic> json) {
    return BlogNewsItem(
      title: (json['title'] ?? '').toString(),
      link: (json['link'] ?? '').toString(),
      category: (json['category'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      thumbnail: json['thumbnail']?.toString(),
      publishedAt: (json['published_at'] ?? '').toString(),
    );
  }

  /// "2026.05.12" 형식으로 변환.
  String get publishedDateLabel {
    if (publishedAt.isEmpty) return '';
    try {
      final dt = DateTime.parse(publishedAt);
      final y = dt.year.toString();
      final m = dt.month.toString().padLeft(2, '0');
      final d = dt.day.toString().padLeft(2, '0');
      return '$y.$m.$d';
    } catch (_) {
      return publishedAt;
    }
  }
}
