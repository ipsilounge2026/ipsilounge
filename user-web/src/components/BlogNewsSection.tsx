"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchBlogNews, type BlogNewsItem } from "@/lib/api";

type Props = {
  /** 메인 페이지: 5개. /news 페이지: 20개. */
  limit?: number;
  /** 메인 페이지에서는 "전체보기" 버튼 표시 + 카드 스타일. /news 페이지는 그대로 큰 리스트. */
  compact?: boolean;
};

/**
 * 네이버 블로그 RSS 기반 입시 뉴스 섹션.
 * - 본문 클릭 시 새 탭에서 블로그 글 열기 (target="_blank")
 * - 백엔드 1시간 캐싱 + RSS 실패 시 graceful fallback
 */
export default function BlogNewsSection({ limit = 5, compact = true }: Props) {
  const [items, setItems] = useState<BlogNewsItem[]>([]);
  const [blogUrl, setBlogUrl] = useState<string>("https://blog.naver.com/consultinggogo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBlogNews(limit)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setBlogUrl(res.blog_url);
        if (res.error) setError(res.error);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "입시 뉴스 불러오기 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return (
    <section className="card" style={{ padding: 24, marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>입시 뉴스</h2>
        {compact && (
          <Link href="/news" style={{ fontSize: 13, color: "var(--primary, #2563eb)", textDecoration: "none" }}>
            전체보기 →
          </Link>
        )}
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--gray-500)" }}>불러오는 중...</div>
      )}

      {!loading && items.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--gray-500)" }}>
          {error || "표시할 글이 없습니다."}
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, idx) => (
            <li key={`${it.link}-${idx}`}>
              <a
                href={it.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 8px",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: "inherit",
                  alignItems: "center",
                }}
                className="blog-news-row"
              >
                {it.thumbnail && (
                  // 블로그 이미지는 외부 도메인이라 next/image 대신 native img
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.thumbnail}
                    alt=""
                    style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 4 }}>
                    {it.category && (
                      <span style={{ fontSize: 11, color: "var(--primary, #2563eb)", fontWeight: 600, flexShrink: 0 }}>
                        [{it.category}]
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "var(--gray-500)" }}>{formatDate(it.published_at)}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.title}
                  </div>
                  {!compact && it.description && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--gray-600)",
                        marginTop: 4,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                      }}
                    >
                      {it.description}
                    </div>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--gray-200, #e5e7eb)", textAlign: "right" }}>
        <a
          href={blogUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, color: "var(--gray-500)", textDecoration: "none" }}
        >
          입시라운지 네이버 블로그 바로가기 →
        </a>
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  } catch {
    return iso;
  }
}
