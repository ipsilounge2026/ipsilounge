"""
대학어디가(adiga.kr) 스크래퍼.

흐름:
1. GET /ucp/uvt/uni/univView.do — 세션 쿠키 + CSRF 토큰 획득
2. POST /ucp/uvt/uni/univGroupAjax.do — 220개 (unvCd, 대학명) 일괄 수집
3. 각 대학별 GET /ucp/uvt/uni/univDetail.do — fileId + 입학처 URL 추출
4. PDF URL 자동 생성 (cmm/com/file/fileDown.do)

수집되는 6개 필드:
- 입학처 바로가기 (fnOpenNewUrl "입시홈페이지")
- 대입전형시행계획 / 수시모집요강 / 정시모집요강 / 선행학습영향평가 (PDF 다운로드 URL)
- 입시결과(대교협) — 대학어디가 대학별 페이지 자체 URL

수집되지 않는 2개 필드 (수동 또는 2차):
- 학생부종합 가이드북 / 입시결과(자체발표) — 대학별 입학처에 있음
"""

import asyncio
import html
import logging
import re

import httpx
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.university_guide import UniversityGuide

logger = logging.getLogger(__name__)

ADIGA_BASE = "https://www.adiga.kr"
VIEW_URL = f"{ADIGA_BASE}/ucp/uvt/uni/univView.do?menuId=PCUVTINF2000"
GROUP_AJAX_URL = f"{ADIGA_BASE}/ucp/uvt/uni/univGroupAjax.do"
DETAIL_URL = f"{ADIGA_BASE}/ucp/uvt/uni/univDetail.do"
FILEDOWN_URL = f"{ADIGA_BASE}/cmm/com/file/fileDown.do"
MENU_ID = "PCUVTINF2000"

# 우리 백엔드 공개 URL (사용자가 카드 클릭 시 가는 도메인)
# 사용자 환경에 따라 .env 의 PUBLIC_API_BASE 로 오버라이드 가능
import os as _os

PUBLIC_API_BASE = _os.environ.get("PUBLIC_API_BASE", "https://api.ipsilounge.co.kr")
PROXY_FILE_URL = f"{PUBLIC_API_BASE}/api/university-guide/adiga/file"
PROXY_RESULT_URL = f"{PUBLIC_API_BASE}/api/university-guide/adiga/result-redirect"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# 자료 이름 → (UniversityGuide 모델 필드, 우리 프록시 kind)
FILE_FIELD_MAP = {
    "대학입학전형시행계획": ("adiga_admission_plan_url", "plan"),
    "수시모집요강": ("adiga_susi_guide_url", "susi"),
    "정시모집요강": ("adiga_jeongsi_guide_url", "jeongsi"),
    "선행학습영향평가": ("adiga_prior_learning_eval_url", "prior"),
}

# 정규식
# CSRF 토큰: <input name="_csrf" value="..."> 또는 <meta name="_csrf" content="...">
RE_CSRF_INPUT = re.compile(r'<input[^>]*name="_csrf"[^>]*value="([^"]+)"')
RE_CSRF_META = re.compile(r'<meta[^>]*name="_csrf"[^>]*content="([^"]+)"')

# univGroupAjax 응답: 각 대학이 코드 + 텍스트로 함께 나옴
# 패턴: name="searchUnvCode" value="0002748" 같은 코드 후 같은 row 안에 대학명
# 가장 안전한 방식: HTML 내부에서 code 와 대학명을 row 단위로 추출
RE_UNV_ROW = re.compile(
    r'value="(\d{7})"[^>]*>'  # checkbox value
    r"[\s\S]{0,500}?"  # 사이 마크업
    r"([가-힣A-Z][가-힣A-Za-z0-9·()\s]{1,40}?대학교(?:\([^)]*\))?\[[가-힣A-Z0-9]+\])",
    re.MULTILINE,
)

# 자료 다운로드: fnUnvFileDownOne('FILE_ID', ...)" >...<span>자료이름</span></a>
# 자료 이름이 <span><br />...</span> 처럼 중첩 태그 포함 가능 → </a> 까지 통째로 잡고 HTML 제거
RE_FILE_LINK = re.compile(
    r"fnUnvFileDownOne\('(\d{20})'[^)]*\)[^>]*>"  # fileId + 닫는 ) + 닫는 >
    r"([\s\S]*?)</a>"  # 자료 이름 (HTML 포함, </a> 까지)
)
RE_HTML_TAG = re.compile(r"<[^>]+>")
RE_WHITESPACE = re.compile(r"\s+")

# 입학처/홈페이지: fnOpenNewUrl("URL") + ...라벨...
RE_OPEN_NEW_URL = re.compile(
    r'fnOpenNewUrl\(\s*"([^"]+?)"\s*\)[^>]*>\s*([^<]+?)\s*</a>'
)


def _clean_url(raw: str) -> str:
    r"""대학어디가 응답의 URL 정리: \/ → /, http:// 중복 제거."""
    url = raw.replace("\\/", "/").strip()
    # http://가 이미 있으면 그대로
    if url.startswith(("http://", "https://")):
        return url
    return "http://" + url


def build_pdf_url(file_id: str, unv_cd: str, year: int, kind: str, university: str = "") -> str:
    """우리 프록시 URL 생성 (정상 파일명 + 정상 확장자 응답 보장)."""
    from urllib.parse import quote as _q

    return (
        f"{PROXY_FILE_URL}?fileId={file_id}&unvCd={unv_cd}&year={year}&kind={kind}"
        f"&university={_q(university)}"
    )


def build_university_page_url(unv_cd: str, year: int) -> str:
    """대학별 대학어디가 메인 페이지 (입학처 등 일반 정보용)."""
    return f"{DETAIL_URL}?menuId={MENU_ID}&unvCd={unv_cd}&searchSyr={year}"


def build_result_redirect_url(unv_cd: str, year: int) -> str:
    """입시결과(대교협) 페이지 — 우리 프록시 통한 POST redirect."""
    return f"{PROXY_RESULT_URL}?unvCd={unv_cd}&year={year}"


async def fetch_university_list(year: int) -> list[dict]:
    """
    1. univView.do GET → CSRF 토큰
    2. univGroupAjax.do POST → 220개 (unvCd, 대학명) 수집
    Returns: [{"name": "가야대학교[본교]", "unv_cd": "0002748"}, ...]
    """
    async with httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        # 1) view 페이지 GET — 세션 쿠키 + CSRF 획득
        view_res = await client.get(VIEW_URL)
        view_res.raise_for_status()
        view_html = view_res.text

        csrf_m = RE_CSRF_INPUT.search(view_html) or RE_CSRF_META.search(view_html)
        if not csrf_m:
            logger.error("adiga: CSRF 토큰을 찾지 못함")
            return []
        csrf_token = csrf_m.group(1)

        # 2) group ajax POST — 220개 대학 + 매핑 일괄 수집
        group_res = await client.post(
            GROUP_AJAX_URL,
            data={
                "_csrf": csrf_token,
                "searchSyr": str(year),
                "unvSeCd": "10",  # 10=일반대학
                "unvLink": "option1",
                "searchUnvCodeAllYn": "true",
                "favoriteYn": "N",
            },
            headers={
                "X-Requested-With": "XMLHttpRequest",
                "Referer": VIEW_URL,
            },
        )
        group_res.raise_for_status()
        group_html = html.unescape(group_res.text)

    results = []
    for m in RE_UNV_ROW.finditer(group_html):
        unv_cd = m.group(1)
        name = m.group(2).strip().replace("\r", "").replace("\n", "").replace("\t", "")
        # 공백 정리
        name = re.sub(r"\s+", " ", name)
        if not name or unv_cd == "0000000":
            continue
        results.append({"name": name, "unv_cd": unv_cd})

    # 중복 제거 (대학명+코드 둘 다 일치만 dedupe; code 만으로 dedupe)
    seen = set()
    deduped = []
    for r in results:
        if r["unv_cd"] in seen:
            continue
        seen.add(r["unv_cd"])
        deduped.append(r)

    logger.info(f"adiga: 대학 목록 {len(deduped)}개 수집 (year={year})")
    return deduped


async def fetch_university_detail(
    client: httpx.AsyncClient, unv_cd: str, year: int, university: str = ""
) -> dict:
    """
    대학별 페이지에서 자료 fileId + 입학처 URL 추출.
    AsyncClient 를 외부에서 주입받아 세션·연결 재사용.
    university: 파일명에 사용할 대학명 (선택).
    """
    detail_url = build_university_page_url(unv_cd, year)
    res = await client.get(detail_url)
    res.raise_for_status()
    raw_html = html.unescape(res.text)

    result: dict[str, str | None] = {
        "adiga_admission_plan_url": None,
        "adiga_susi_guide_url": None,
        "adiga_jeongsi_guide_url": None,
        "adiga_prior_learning_eval_url": None,
        # 입시결과 탭은 POST 프록시 → 우리 백엔드 redirect URL
        "adiga_result_url": build_result_redirect_url(unv_cd, year),
        "official_admission_url": None,
    }

    # 1. fileId 들 추출 → 자료 종류별 우리 프록시 PDF URL 생성
    for m in RE_FILE_LINK.finditer(raw_html):
        file_id = m.group(1)
        label_raw = m.group(2)
        label = RE_HTML_TAG.sub("", label_raw)
        label = RE_WHITESPACE.sub("", label).strip()
        mapping = FILE_FIELD_MAP.get(label)
        if mapping:
            field, kind = mapping
            if not result.get(field):
                result[field] = build_pdf_url(file_id, unv_cd, year, kind, university)

    # 2. 입학처(입시홈페이지) URL 추출 — fnOpenNewUrl 중 "입시홈페이지" 텍스트
    for m in RE_OPEN_NEW_URL.finditer(raw_html):
        url = m.group(1).strip()
        label = m.group(2).strip()
        if "입시" in label and "홈페이지" in label:
            result["official_admission_url"] = _clean_url(url)
            break

    # 입시홈페이지 없으면 일반 홈페이지로 폴백
    if not result["official_admission_url"]:
        for m in RE_OPEN_NEW_URL.finditer(raw_html):
            url = m.group(1).strip()
            label = m.group(2).strip()
            if "홈페이지" in label:
                result["official_admission_url"] = _clean_url(url)
                break

    return result


async def sync_all_universities(
    year: int,
    db: AsyncSession,
    *,
    concurrency: int = 5,
    limit: int | None = None,
) -> dict:
    """
    대학어디가 자동 동기화 전체 실행.

    Returns: {"total", "created", "updated", "errors", "error_count"}
    """
    # 1. 대학 목록 수집
    try:
        unv_list = await fetch_university_list(year)
    except Exception as e:
        logger.error(f"adiga: 대학 목록 수집 실패 — {e}")
        return {"total": 0, "created": 0, "updated": 0, "errors": [f"list: {e}"]}

    if limit is not None:
        unv_list = unv_list[:limit]

    semaphore = asyncio.Semaphore(concurrency)
    errors: list[str] = []
    AUTOMATED_FIELDS = (
        "adiga_admission_plan_url",
        "adiga_susi_guide_url",
        "adiga_jeongsi_guide_url",
        "adiga_prior_learning_eval_url",
        "adiga_result_url",
        "official_admission_url",
    )

    async with httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    ) as client:

        async def fetch_with_sem(unv: dict) -> tuple[dict, dict | None]:
            async with semaphore:
                try:
                    detail = await fetch_university_detail(
                        client, unv["unv_cd"], year, university=unv["name"]
                    )
                    return unv, detail
                except Exception as e:
                    err = f"{unv['name']}({unv['unv_cd']}): {e}"
                    logger.warning(f"adiga: 상세 실패 — {err}")
                    errors.append(err)
                    return unv, None

        pairs = await asyncio.gather(*[fetch_with_sem(u) for u in unv_list])

    # 2. DB upsert
    created = 0
    updated = 0

    for unv, detail in pairs:
        if detail is None:
            continue

        res = await db.execute(
            select(UniversityGuide).where(
                and_(
                    UniversityGuide.university == unv["name"],
                    UniversityGuide.year == year,
                )
            )
        )
        existing = res.scalar_one_or_none()

        if existing:
            for field in AUTOMATED_FIELDS:
                setattr(existing, field, detail.get(field))
            existing.university_code = unv["unv_cd"]
            updated += 1
        else:
            new = UniversityGuide(
                university=unv["name"],
                university_code=unv["unv_cd"],
                year=year,
                is_active=True,
                **{f: detail.get(f) for f in AUTOMATED_FIELDS},
            )
            db.add(new)
            created += 1

    await db.commit()

    logger.info(
        f"adiga sync(year={year}): total={len(unv_list)}, "
        f"created={created}, updated={updated}, errors={len(errors)}"
    )
    return {
        "total": len(unv_list),
        "created": created,
        "updated": updated,
        "errors": errors[:20],
        "error_count": len(errors),
    }
