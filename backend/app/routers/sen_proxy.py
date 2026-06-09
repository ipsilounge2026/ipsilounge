"""
서울진로진학정보센터(SEN) 시행계획 다운로드 프록시.

SEN 은 POST 다운로드 + 외부 자동 호출 차단으로 사용자 브라우저가 직접 POST 해야 함.
- 우리 백엔드는 DB 의 university_guides.sen_plan_meta JSONB 에서 form fields 조회
- auto-submit form HTML 응답 → 사용자 브라우저가 받자마자 POST 제출
- SEN 서버가 PDF 응답 → 사용자가 정상 다운로드

비로그인 접근 가능 (사용자 카드의 시행계획 버튼이 호출).
"""

import logging
from html import escape

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.university_guide import UniversityGuide

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/university-guide/sen", tags=["서울진로진학정보센터 프록시"])

SEN_DOWNLOAD_URL = "https://jinhak.sen.go.kr/cop/uni/downloadUniCollectFile.do"


@router.get("/admission-plan", response_class=Response)
async def proxy_sen_admission_plan(
    university: str = Query(..., description="대학명 (university_guides.university)"),
    year: int = Query(..., description="학년도"),
    db: AsyncSession = Depends(get_db),
):
    """
    DB 에 저장된 SEN form fields 로 auto-submit form HTML 응답.
    사용자 브라우저가 받자마자 POST → SEN 시행계획 PDF 다운로드.
    """
    res = await db.execute(
        select(UniversityGuide).where(
            and_(
                UniversityGuide.university == university,
                UniversityGuide.year == year,
            )
        )
    )
    guide = res.scalar_one_or_none()
    if guide is None or not getattr(guide, "sen_plan_meta", None):
        raise HTTPException(
            status_code=404,
            detail=f"{university} {year}학년도 시행계획 자료가 없습니다. 관리자 페이지에서 'SEN 자동 수집'을 실행하세요.",
        )

    meta = guide.sen_plan_meta or {}
    fields: dict = meta.get("fields", {})
    if not fields.get("orgfilename") or not fields.get("sysfilename"):
        raise HTTPException(status_code=500, detail="SEN form data 가 불완전합니다")

    # 모든 필수 필드 포함 (wherepath 빈 값 기본)
    all_fields = {
        "orgfilename": fields.get("orgfilename", ""),
        "sysfilename": fields.get("sysfilename", ""),
        "sysfilepath": fields.get("sysfilepath", ""),
        "pdsid": fields.get("pdsid", ""),
        "seqno": fields.get("seqno", "1"),
        "wherepath": fields.get("wherepath", ""),
    }

    inputs_html = "\n".join(
        f'<input type="hidden" name="{escape(k)}" value="{escape(v)}" />'
        for k, v in all_fields.items()
    )

    html_doc = f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>시행계획 다운로드 중…</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Pretendard", sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 60vh; color: #6B7B98; }}
  </style>
</head>
<body>
  <form id="f" method="POST" action="{SEN_DOWNLOAD_URL}">
    {inputs_html}
  </form>
  <div>시행계획 PDF 다운로드 중입니다…</div>
  <script>document.getElementById('f').submit();</script>
</body>
</html>"""

    return Response(
        content=html_doc,
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": "no-store"},
    )
