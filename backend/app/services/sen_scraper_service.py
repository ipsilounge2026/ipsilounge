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


# SEN 표기 → 우리 대학명 (교명 통합 등 특수 케이스)
SEN_NAME_ALIASES = {
    "강원대학교강릉원주캠퍼스": "국립강릉원주대학교",
}

# '대학교' 뒤에 붙는 캠퍼스 토큰: '건국대학교글로컬캠퍼스' → '글로컬', '강원대학교 강릉원주캠퍼스' → '강릉원주'
RE_CAMPUS_WORD = re.compile(r"대학교?\s*([가-힣A-Za-z0-9]+?)\s*캠퍼스")


def _split_name(name: str) -> tuple[str, str]:
    """대학명 → (base 키, 캠퍼스 토큰).

    예: '한양대학교(ERICA)[분교]' → ('한양대학교', 'erica분교')
        '고려대학교세종캠퍼스'    → ('고려대학교', '세종')
        '국립창원대학교[본교]'    → ('창원대학교', '본교')
    """
    raw = name.strip()
    campus_parts: list[str] = []
    campus_parts += re.findall(r"\(([^)]+)\)", raw)
    campus_parts += re.findall(r"\[([^\]]+)\]", raw)
    rest = re.sub(r"\([^)]*\)|\[[^\]]*\]", "", raw)
    m = RE_CAMPUS_WORD.search(rest)
    if m:
        campus_parts.append(m.group(1))
        # '대학교' 는 남기고 캠퍼스 토큰+'캠퍼스' 만 제거
        rest = rest[: m.start(1)] + rest[m.end():]
    base = re.sub(r"\s+", "", rest).strip().lower()
    base = re.sub(r"^국립", "", base)
    campus = re.sub(r"\s+", "", "".join(campus_parts)).lower()
    return base, campus


def _campus_match(sen_campus: str, guide_campus: str) -> bool:
    """캠퍼스 토큰 매칭: 'erica' ↔ 'erica분교', '세종' ↔ '세종분교'."""
    if not sen_campus or not guide_campus:
        return False
    return sen_campus in guide_campus or guide_campus in sen_campus


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

    매칭 (캠퍼스 인식 2단계):
    1. 캠퍼스 표기가 있는 SEN row (예: '한양대학교(ERICA)', '고려대학교 세종캠퍼스')
       → 캠퍼스 토큰이 일치하는 guide 만 갱신
    2. base SEN row (예: '가톨릭대학교')
       → 같은 base 의 guide 중 1단계에서 매칭 안 된 캠퍼스 전부 갱신
       (시행계획은 대학 전체 문서이므로 모든 캠퍼스에 동일 적용)

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
    guides_by_base: dict[str, list[UniversityGuide]] = {}
    for g in guides:
        base, _campus = _split_name(g.university)
        guides_by_base.setdefault(base, []).append(g)

    matched = 0
    updated = 0
    unmatched: list[str] = []
    updated_ids: set = set()

    def _apply(guide: UniversityGuide, row: dict) -> None:
        nonlocal updated
        guide.sen_plan_meta = {
            "fields": row["fields"],
            "sen_university": row["university"],
        }
        guide.adiga_admission_plan_url = build_sen_proxy_url(guide.university, year)
        if guide.id not in updated_ids:
            updated_ids.add(guide.id)
            updated += 1

    # 교명 alias 적용 + 캠퍼스/base 분리
    parsed_rows = []
    for row in sen_rows:
        raw = row["university"]
        alias_key = re.sub(r"\s+", "", raw).lower()
        effective = SEN_NAME_ALIASES.get(alias_key, raw)
        base, campus = _split_name(effective)
        parsed_rows.append((base, campus, row))

    # 1단계: 캠퍼스 표기 있는 row → 캠퍼스 일치 guide 만
    campus_orphans: list[tuple[str, dict]] = []  # base 는 있는데 캠퍼스가 안 맞는 row
    for base, campus, row in parsed_rows:
        if not campus:
            continue
        cands = guides_by_base.get(base, [])
        hits = [g for g in cands if _campus_match(campus, _split_name(g.university)[1])]
        if hits:
            matched += 1
            for g in hits:
                _apply(g, row)
        elif cands:
            campus_orphans.append((base, row))
        else:
            unmatched.append(row["university"])

    # 2단계: base row → 같은 base 의 미갱신 guide 전부
    for base, campus, row in parsed_rows:
        if campus:
            continue
        cands = [g for g in guides_by_base.get(base, []) if g.id not in updated_ids]
        if cands:
            matched += 1
            for g in cands:
                _apply(g, row)
        elif base not in guides_by_base:
            unmatched.append(row["university"])
        # base 의 모든 캠퍼스가 이미 갱신됨 → 정상 (중복 row)

    # 3단계: 캠퍼스가 안 맞았던 row → base row 도 없었다면 미갱신 guide 에 best-effort 적용
    # (예: SEN '단국대학교죽전캠퍼스'/'단국대학교천안캠퍼스' 만 있고 우리는 [본교]/[제2캠퍼스] 표기)
    orphans_by_base: dict[str, list[dict]] = {}
    for base, row in campus_orphans:
        orphans_by_base.setdefault(base, []).append(row)

    def _campus_order(g: UniversityGuide) -> str:
        # 본교 → 제2 → 제3 순 정렬 키 (SEN 도 본교 캠퍼스를 먼저 나열하는 관례)
        c = _split_name(g.university)[1]
        return "0" if "본교" in c else c

    for base, rows in orphans_by_base.items():
        cands = sorted(
            (g for g in guides_by_base.get(base, []) if g.id not in updated_ids),
            key=_campus_order,
        )
        if not cands:
            continue  # 이미 다른 row 로 갱신됨 — 정상
        matched += 1
        if len(rows) == len(cands):
            # 캠퍼스 수와 파일 수가 같으면 순서대로 1:1 배정
            for g, row in zip(cands, rows, strict=False):
                _apply(g, row)
        else:
            for g in cands:
                _apply(g, rows[0])

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
