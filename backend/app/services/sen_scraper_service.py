"""
서울진로진학정보센터(jinhak.sen.go.kr) 시행계획 스크래퍼.

대학별 시행계획 자료가 학년도 단위로 등록되어 있음.
- 대학어디가에는 발표 1년 반 전 자료가 없는데 (예: 2028학년도)
  서울진로진학정보센터에는 발표 직후 등록됨.
- 학년도 관계없이 시행계획은 이 출처에서 수집.

흐름:
1. GET 페이지네이션으로 학년도별 304+개 form data 수집
2. 각 row = (대학명, orgfilename, sysfilename, sysfilepath, pdsid, seqno)
3. DB의 university_guides 테이블의 sen_plan_meta JSONB 와 adiga_admission_plan_url 채움
   - adiga_admission_plan_url 은 우리 SEN 프록시 URL (사용자 카드 호환 유지)
4. 대학명 매칭: SEN "가야대학교" → 우리 "가야대학교[본교]"

다운로드 자체는 우리 백엔드에서 외부에서 못 함 (POST + 세션 검증으로 차단)
→ sen_proxy 라우터가 auto-submit form HTML 응답해서 사용자 브라우저가 직접 POST
"""

import logging
import re
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.university_guide import UniversityGuide

logger = logging.getLogger(__name__)

SEN_BASE = "https://jinhak.sen.go.kr"
SEN_LIST_URL = f"{SEN_BASE}/subList/20000000268"
SEN_DOWNLOAD_URL = f"{SEN_BASE}/cop/uni/downloadUniCollectFile.do"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

import os as _os

PUBLIC_API_BASE = _os.environ.get("PUBLIC_API_BASE", "https://api.ipsilounge.co.kr")
SEN_PROXY_URL = f"{PUBLIC_API_BASE}/api/university-guide/sen/admission-plan"


# 페이지에서 각 대학 행을 <tr> 단위로 분리하여 정확히 매칭.
RE_TR_BLOCK = re.compile(r"<tr[^>]*>([\s\S]*?)</tr>", re.IGNORECASE)
# 대학명: 행 안의 <a href="...대학홈" target="_blank">대학명</a>
RE_UNIVERSITY_NAME = re.compile(
    r'<a[^>]+target="_blank"[^>]*>\s*([가-힣A-Za-z0-9()·\s]+?대학(?:교|원)[가-힣A-Za-z0-9()·\s]*?)\s*</a>',
    re.IGNORECASE,
)
# form 안의 hidden inputs
RE_FORM_BLOCK = re.compile(
    r'<form[^>]*action="/cop/uni/downloadUniCollectFile\.do"[^>]*>([\s\S]{0,2000}?)</form>',
    re.IGNORECASE,
)
RE_HIDDEN = re.compile(r'name=["\']([^"\']+)["\']\s+value=["\']([^"\']*)')


def _parse_form_fields(form_html: str) -> dict[str, str]:
    """form 안의 hidden input 들을 dict 로."""
    fields: dict[str, str] = {}
    for m in RE_HIDDEN.finditer(form_html):
        k, v = m.group(1), m.group(2)
        if k in ("orgfilename", "sysfilename", "sysfilepath", "pdsid", "seqno", "wherepath"):
            fields[k] = v
    return fields


async def _fetch_page(client: httpx.AsyncClient, year: int, page: int, size: int = 50) -> list[dict[str, Any]]:
    """한 페이지의 (대학명, form fields) 쌍 추출."""
    res = await client.get(
        SEN_LIST_URL,
        params={
            "lNum": "",
            "pageIndex": str(page),
            "recordCountPerPage": str(size),
            "searchCollectYear": str(year),
        },
    )
    res.raise_for_status()
    html = res.text

    rows = []
    for tr_m in RE_TR_BLOCK.finditer(html):
        tr_html = tr_m.group(1)
        # 같은 <tr> 안의 대학명 + form
        name_m = RE_UNIVERSITY_NAME.search(tr_html)
        if not name_m:
            continue
        form_m = RE_FORM_BLOCK.search(tr_html)
        if not form_m:
            continue
        fields = _parse_form_fields(form_m.group(1))
        if not fields.get("orgfilename"):
            continue
        rows.append({
            "university": name_m.group(1).strip(),
            "fields": fields,
        })
    return rows


async def fetch_admission_plans(year: int, *, max_pages: int = 15) -> list[dict[str, Any]]:
    """학년도 전체 시행계획 자료 수집 (페이지네이션)."""
    async with httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        # 세션 쿠키 받기
        await client.get(f"{SEN_LIST_URL}?lNum=")

        all_rows: list[dict[str, Any]] = []
        for page in range(1, max_pages + 1):
            try:
                rows = await _fetch_page(client, year, page)
            except Exception as e:
                logger.warning(f"sen: 페이지 {page} 실패 — {e}")
                break
            if not rows:
                # 빈 페이지 = 더 이상 데이터 없음
                break
            all_rows.extend(rows)

    logger.info(f"sen: {year}학년도 시행계획 {len(all_rows)}개 수집")
    return all_rows


def _normalize_name(name: str) -> str:
    """대학명을 매칭용 키로 정규화: 공백·괄호·캠퍼스 표시 제거 후 소문자."""
    s = re.sub(r"\[[^\]]+\]", "", name)  # [본교] [제2캠퍼스] 제거
    s = re.sub(r"\([^)]+\)", "", s)       # (글로컬) 제거
    s = re.sub(r"\s+", "", s)
    return s.strip().lower()


def build_sen_proxy_url(university: str, year: int) -> str:
    """우리 SEN 프록시 URL (사용자 카드의 시행계획 버튼이 호출)."""
    from urllib.parse import quote
    return f"{SEN_PROXY_URL}?university={quote(university)}&year={year}"


async def sync_admission_plans(
    year: int,
    db: AsyncSession,
) -> dict:
    """
    학년도별 시행계획 자료를 수집해 university_guides 테이블에 반영.

    동작:
    - SEN 에서 row 수집
    - 각 row 의 university 명을 우리 university_guides 와 매칭 (정규화 후 부분 일치)
    - 매칭된 row 의 sen_plan_meta JSONB 채움 + adiga_admission_plan_url 을 우리 프록시 URL 로 갱신

    Returns: {"total_fetched", "matched", "updated", "unmatched_samples"}
    """
    try:
        sen_rows = await fetch_admission_plans(year)
    except Exception as e:
        logger.error(f"sen: 수집 실패 — {e}")
        return {"total_fetched": 0, "matched": 0, "updated": 0, "unmatched_samples": [], "error": str(e)}

    # 우리 DB 의 해당 학년도 university_guides 가져오기
    res = await db.execute(
        select(UniversityGuide).where(UniversityGuide.year == year)
    )
    guides = res.scalars().all()
    guide_index: dict[str, UniversityGuide] = {}
    for g in guides:
        guide_index[_normalize_name(g.university)] = g

    matched = 0
    updated = 0
    unmatched: list[str] = []

    for row in sen_rows:
        key = _normalize_name(row["university"])
        guide = guide_index.get(key)
        if guide is None:
            # 부분 일치 fallback
            for ig_key, ig_guide in guide_index.items():
                if key and (ig_key.startswith(key) or key.startswith(ig_key)):
                    guide = ig_guide
                    break

        if guide is None:
            unmatched.append(row["university"])
            continue

        matched += 1
        # SEN form data 저장
        meta = {
            "fields": row["fields"],
            "sen_university": row["university"],
        }
        # JSONB 컬럼 (모델에서 sen_plan_meta 추가됨)
        # 모델에 없으면 동적 setattr 으로도 무관 (마이그레이션 시 추가)
        guide.sen_plan_meta = meta
        # adiga_admission_plan_url 을 우리 SEN 프록시 URL 로 교체
        guide.adiga_admission_plan_url = build_sen_proxy_url(guide.university, year)
        updated += 1

    await db.commit()

    logger.info(
        f"sen sync(year={year}): fetched={len(sen_rows)}, matched={matched}, "
        f"updated={updated}, unmatched={len(unmatched)}"
    )
    return {
        "total_fetched": len(sen_rows),
        "matched": matched,
        "updated": updated,
        "unmatched_count": len(unmatched),
        "unmatched_samples": unmatched[:20],
    }
