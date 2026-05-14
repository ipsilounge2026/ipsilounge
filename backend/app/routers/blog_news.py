"""입시 뉴스(네이버 블로그 RSS) 공개 라우터.

비로그인 사용자도 접근 가능. 1시간 캐싱이라 부하 부담 없음.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from ..services.naver_blog_service import get_blog_news

router = APIRouter(prefix="/api/blog-news", tags=["blog-news"])


@router.get("")
async def list_blog_news(
    limit: int = Query(20, ge=1, le=50, description="반환할 글 개수 (기본 20, 최대 50)"),
    refresh: bool = Query(False, description="캐시 무시하고 즉시 RSS 재요청 (관리/디버그용)"),
):
    """네이버 블로그 입시라운지(consultinggogo)의 최근 글 목록."""
    data = await get_blog_news(force_refresh=refresh)
    items = data["items"][:limit]
    return {
        "items": items,
        "total": len(items),
        "blog_url": data["blog_url"],
        "cached": data.get("cached", False),
        "age_seconds": data.get("age_seconds", 0),
        "error": data.get("error"),
    }
