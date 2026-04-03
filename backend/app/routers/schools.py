from fastapi import APIRouter, Query

from app.services.school_service import search_schools

router = APIRouter(prefix="/api/schools", tags=["학교검색"])


@router.get("/search")
async def api_search_schools(
    query: str = Query(..., min_length=2, description="학교명 검색어 (2글자 이상)"),
):
    """학교 검색 (NEIS API 기반, 고등학교만)"""
    results = await search_schools(query)
    return results
