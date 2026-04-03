import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

NEIS_SCHOOL_INFO_URL = "https://open.neis.go.kr/hub/schoolInfo"


async def search_schools(query: str, max_results: int = 20) -> list[dict]:
    """NEIS API로 학교 검색 (고등학교만)"""
    if not settings.NEIS_API_KEY:
        logger.warning("NEIS_API_KEY가 설정되지 않았습니다")
        return []

    if not query or len(query) < 2:
        return []

    params = {
        "KEY": settings.NEIS_API_KEY,
        "Type": "json",
        "pIndex": 1,
        "pSize": max_results,
        "SCHUL_NM": query,
        "SCHUL_KND_SC_NM": "고등학교",
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(NEIS_SCHOOL_INFO_URL, params=params)
            data = resp.json()

        # NEIS API 응답 구조: {"schoolInfo": [{"head": [...]}, {"row": [...]}]}
        school_info = data.get("schoolInfo")
        if not school_info or len(school_info) < 2:
            return []

        rows = school_info[1].get("row", [])

        results = []
        for row in rows:
            results.append({
                "school_name": row.get("SCHUL_NM", ""),
                "school_code": row.get("SD_SCHUL_CODE", ""),
                "address": row.get("ORG_RDNMA", "") or row.get("ORG_FAXNO", ""),
                "region": row.get("LCTN_SC_NM", ""),
                "school_type": row.get("HS_SC_NM", ""),  # 일반고, 특목고, 자사고 등
            })

        return results

    except Exception as e:
        logger.error(f"학교 검색 실패: {e}")
        return []
