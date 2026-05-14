"""네이버 블로그 RSS 조회 + 메모리 캐싱.

입시라운지 네이버 블로그(consultinggogo)의 최근 글 목록을 RSS 로 가져와
1시간 TTL 메모리 캐시에 저장. 프론트엔드(웹·모바일)는 백엔드의
`/api/blog-news` 를 호출하므로 CORS 이슈 + 네이버 측 rate-limit 부담이 없다.

캐시는 프로세스 메모리이므로 워커가 여러 개라면 워커별로 분리되지만,
1시간 TTL 기준 부하는 무시 가능 수준이다.
"""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from datetime import UTC
from email.utils import parsedate_to_datetime
from typing import Any
from xml.etree import ElementTree as ET

import httpx

logger = logging.getLogger(__name__)

BLOG_ID = "consultinggogo"
RSS_URL = f"https://rss.blog.naver.com/{BLOG_ID}.xml"
BLOG_HOMEPAGE = f"https://blog.naver.com/{BLOG_ID}"

CACHE_TTL_SECONDS = 60 * 60  # 1시간
HTTP_TIMEOUT_SECONDS = 10.0

# 모듈 레벨 캐시
_cache: dict[str, Any] = {"fetched_at": 0.0, "items": [], "error": None}


@dataclass
class BlogNewsItem:
    title: str
    link: str
    category: str
    description: str  # HTML 태그 제거 + 길이 200 자 컷
    thumbnail: str | None
    published_at: str  # ISO 8601 형식

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "link": self.link,
            "category": self.category,
            "description": self.description,
            "thumbnail": self.thumbnail,
            "published_at": self.published_at,
        }


def _strip_html(text: str) -> str:
    """HTML 태그 + 연속 공백 제거. RSS description 정리용."""
    if not text:
        return ""
    no_tags = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", no_tags).strip()


def _extract_thumbnail(description_html: str) -> str | None:
    """description 내 <img src="..."> 첫 번째 URL 추출."""
    if not description_html:
        return None
    match = re.search(r'<img[^>]+src="([^"]+)"', description_html)
    return match.group(1) if match else None


def _normalize_link(link: str) -> str:
    """RSS link 의 ?fromRss=true&trackingCode=rss 쿼리 제거."""
    return link.split("?")[0]


def _parse_pubdate(raw: str) -> str:
    """RFC 2822 형식 (예: 'Thu, 14 May 2026 15:18:43 +0900') → ISO 8601 (UTC)."""
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC).isoformat()
    except Exception:
        return ""


def _parse_rss(xml_text: str) -> list[BlogNewsItem]:
    """RSS XML 을 파싱해 BlogNewsItem 리스트로."""
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    if channel is None:
        return []

    items: list[BlogNewsItem] = []
    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        link_raw = (item.findtext("link") or "").strip()
        category = (item.findtext("category") or "").strip()
        desc_html = item.findtext("description") or ""
        pub_date = item.findtext("pubDate") or ""

        if not title or not link_raw:
            continue

        items.append(
            BlogNewsItem(
                title=title,
                link=_normalize_link(link_raw),
                category=category,
                description=_strip_html(desc_html)[:200],
                thumbnail=_extract_thumbnail(desc_html),
                published_at=_parse_pubdate(pub_date),
            )
        )
    return items


async def _fetch_rss() -> list[BlogNewsItem]:
    """네이버 블로그 RSS 를 가져와 파싱."""
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(RSS_URL, headers={"User-Agent": "ipsilounge-backend/1.0"})
        resp.raise_for_status()
        return _parse_rss(resp.text)


async def get_blog_news(force_refresh: bool = False) -> dict[str, Any]:
    """캐시 우선 조회. TTL 만료 또는 force_refresh=True 시 RSS 재요청.

    캐시 만료 후 fetch 가 실패하면 직전 캐시(있다면) 를 반환하고 error 필드에 사유 명시.
    """
    now = time.time()
    age = now - _cache["fetched_at"]
    if (not force_refresh) and _cache["items"] and age < CACHE_TTL_SECONDS:
        return {
            "items": [it.to_dict() for it in _cache["items"]],
            "cached": True,
            "age_seconds": int(age),
            "blog_url": BLOG_HOMEPAGE,
        }

    try:
        items = await _fetch_rss()
        _cache["items"] = items
        _cache["fetched_at"] = now
        _cache["error"] = None
        return {
            "items": [it.to_dict() for it in items],
            "cached": False,
            "age_seconds": 0,
            "blog_url": BLOG_HOMEPAGE,
        }
    except Exception as e:
        logger.warning("Naver blog RSS fetch failed: %s", e)
        _cache["error"] = str(e)
        return {
            "items": [it.to_dict() for it in _cache["items"]],
            "cached": True,
            "age_seconds": int(age) if _cache["items"] else -1,
            "blog_url": BLOG_HOMEPAGE,
            "error": "원격 RSS 조회 실패. 캐시본 반환." if _cache["items"] else "RSS 조회 실패 및 캐시 없음.",
        }
