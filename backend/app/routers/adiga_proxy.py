"""
대학어디가 프록시 라우터 (비로그인 접근 가능).

목적:
1. PDF 다운로드 시 정상 파일명 + 정상 확장자 전달
   - 대학어디가 원본 응답은 Content-Disposition `filename*=` 가 비표준 형식이라
     브라우저가 파일명을 못 읽고 "fileDown.do" 로 저장됨.
   - 우리 프록시가 받아서 표준 형식(filename*=UTF-8''...)으로 재전송.

2. 입시결과(대교협) 페이지 — POST 방식이라 GET URL로 직접 접근 불가
   - 우리가 백엔드에서 POST 호출 → 결과 HTML 그대로 전달
   - 사용자는 우리 도메인에서 대학어디가 페이지 그대로 봄
"""

import logging
import re
from urllib.parse import quote, unquote

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/university-guide/adiga", tags=["대학어디가 프록시"])

ADIGA_BASE = "https://www.adiga.kr"
FILEDOWN_URL = f"{ADIGA_BASE}/cmm/com/file/fileDown.do"
RESULT_VIEW_URL = f"{ADIGA_BASE}/uct/acd/ade/criteriaAndResultView.do"
RESULT_POPUP_URL = f"{ADIGA_BASE}/uct/acd/ade/criteriaAndResultPopup.do"
MENU_ID = "PCUVTINF2000"
RESULT_MENU_ID = "PCUCTACD2000"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# 자료 종류별 표시 이름 (파일명에 사용)
KIND_LABELS = {
    "susi": "수시모집요강",
    "jeongsi": "정시모집요강",
    "plan": "대입전형시행계획",
    "prior": "선행학습영향평가",
}

# CSRF 정규식 (입시결과 페이지에서 토큰 추출)
RE_CSRF_INPUT = re.compile(r'<input[^>]*name="_csrf"[^>]*value="([^"]+)"')


def _parse_filename_from_disposition(cd: str | None) -> str | None:
    """Content-Disposition 헤더에서 파일명 추출.
    대학어디가는 `filename*=KOREAN_PERCENT_ENCODED.pdf` 비표준 형식 사용.
    표준 형식 `filename*=UTF-8''...` 도 호환.
    """
    if not cd:
        return None
    # filename*=UTF-8''... 표준 형식
    m = re.search(r"filename\*=UTF-8''([^;]+)", cd)
    if m:
        return unquote(m.group(1).strip().strip('"'))
    # filename*=... (비표준 — 대학어디가)
    m = re.search(r"filename\*=([^;]+)", cd)
    if m:
        raw = m.group(1).strip().strip('"')
        return unquote(raw)
    # filename="..." 표준 형식
    m = re.search(r'filename="([^"]+)"', cd)
    if m:
        return m.group(1)
    return None


@router.get("/file")
async def proxy_adiga_file(
    fileId: str = Query(..., description="대학어디가 파일 ID (20자리)"),
    unvCd: str = Query(..., description="대학 코드 (7자리)"),
    year: int = Query(..., description="학년도"),
    kind: str = Query("file", description="자료 종류 (susi/jeongsi/plan/prior)"),
    university: str = Query("", description="대학명 (파일명용)"),
):
    """
    대학어디가 PDF를 받아서 정상 헤더로 재전송.

    예: GET /api/university-guide/adiga/file?fileId=00000000000000240559
        &unvCd=0000019&year=2026&kind=susi&university=서울대학교
    """
    upstream_url = (
        f"{FILEDOWN_URL}?fileId={fileId}&fileSn=1&menuId={MENU_ID}"
        f"&downLogYn=Y&unvCd={unvCd}&searchSyr={year}"
    )

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        try:
            res = await client.get(
                upstream_url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Referer": f"{ADIGA_BASE}/ucp/uvt/uni/univDetail.do?menuId={MENU_ID}&unvCd={unvCd}&searchSyr={year}",
                },
            )
        except httpx.HTTPError as e:
            logger.error(f"adiga file proxy: 상위 요청 실패 — {e}")
            raise HTTPException(status_code=502, detail="대학어디가 응답 실패")

    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail="대학어디가에서 자료를 찾을 수 없습니다")

    # 파일명 결정: 원본 응답 헤더 → 없으면 우리 규칙
    upstream_filename = _parse_filename_from_disposition(res.headers.get("content-disposition"))
    if upstream_filename:
        filename = upstream_filename
    else:
        kind_label = KIND_LABELS.get(kind, "자료")
        univ_part = university or unvCd
        filename = f"{year}학년도_{univ_part}_{kind_label}.pdf"

    # PDF 가 아닌 응답이면 그대로 octet-stream 으로 전달
    upstream_ct = res.headers.get("content-type", "application/pdf")
    media_type = "application/pdf" if "pdf" in upstream_ct.lower() or filename.lower().endswith(".pdf") else upstream_ct

    # 표준 Content-Disposition (RFC 5987)
    # HTTP 헤더는 latin-1만 가능 → filename="" 은 ASCII fallback 만, 한국어는 filename*= 에 인코딩.
    ascii_fallback = f"{year}_{unvCd}_{kind}.pdf"
    cd_header = (
        f'attachment; filename="{ascii_fallback}"; '
        f"filename*=UTF-8''{quote(filename)}"
    )

    return Response(
        content=res.content,
        media_type=media_type,
        headers={
            "Content-Disposition": cd_header,
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.get("/result-redirect", response_class=Response)
async def proxy_adiga_result(
    unvCd: str = Query(..., description="대학 코드 (7자리)"),
    year: int = Query(..., description="학년도"),
):
    """
    대학어디가 입시결과 페이지(POST 전용)에 우리가 대신 POST 호출 → 결과 HTML 그대로 전달.

    1) 입시결과 View 페이지 GET → CSRF 토큰 + 세션 쿠키
    2) Popup 페이지 POST → 결과 HTML
    3) HTML 안의 상대 경로(form action, img src 등)를 절대 경로로 보정 후 응답
    """
    async with httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        try:
            # 1) View 페이지에서 CSRF + 세션
            view_res = await client.get(
                f"{RESULT_VIEW_URL}?menuId={RESULT_MENU_ID}"
            )
            view_res.raise_for_status()
            csrf_m = RE_CSRF_INPUT.search(view_res.text)
            if not csrf_m:
                raise HTTPException(status_code=502, detail="CSRF 토큰을 찾지 못했습니다")
            csrf_token = csrf_m.group(1)

            # 2) POST 호출 → 결과 HTML
            popup_res = await client.post(
                RESULT_POPUP_URL,
                data={
                    "_csrf": csrf_token,
                    "menuId": RESULT_MENU_ID,
                    "unvCd": unvCd,
                    "compUnvCd": "",
                    "searchSyr": str(year),
                    "searchConstIndex": "0",
                    "searchUnvComp": "0",
                },
                headers={
                    "Referer": f"{RESULT_VIEW_URL}?menuId={RESULT_MENU_ID}",
                },
            )
            popup_res.raise_for_status()
        except httpx.HTTPError as e:
            logger.error(f"adiga result proxy: 상위 요청 실패 — {e}")
            raise HTTPException(status_code=502, detail="대학어디가 응답 실패")

    # 3) HTML 안의 상대 경로를 절대 경로로 (이미지·CSS·JS 가 정상 로드되도록)
    html_text = popup_res.text
    # /static/, /uct/, /ucp/, /cmm/ 등 절대 경로(이미 슬래시로 시작)는 대학어디가 도메인 prefix
    # 상대 경로(./, 또는 그냥 폴더명) 시도는 거의 없음 → 절대 경로만 처리
    html_text = re.sub(
        r'(href|src|action)="(/[^"]*)"',
        lambda m: f'{m.group(1)}="{ADIGA_BASE}{m.group(2)}"',
        html_text,
    )
    # <head> 안에 <base> 태그 추가 (남은 상대 경로 안전망)
    base_tag = f'<base href="{ADIGA_BASE}/" />'
    if "<head>" in html_text:
        html_text = html_text.replace("<head>", f"<head>{base_tag}", 1)
    else:
        html_text = base_tag + html_text

    return Response(
        content=html_text,
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": "public, max-age=600"},  # 10분 캐시
    )
