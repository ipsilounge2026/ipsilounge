"""대학모집요강 사용자 라우터 (비로그인 접근 가능)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.university_guide import UniversityGuide
from app.schemas.university_guide import (
    UniversityGuideListResponse,
    UniversityGuideResponse,
)

router = APIRouter(prefix="/api/university-guide", tags=["대학모집요강"])


@router.get("/", response_model=UniversityGuideListResponse)
async def list_university_guides(
    year: int | None = Query(None, description="학년도 (미지정 시 최신 학년도)"),
    search: str | None = Query(None, description="대학명 부분 검색"),
    db: AsyncSession = Depends(get_db),
):
    """
    대학모집요강 목록 조회 (비로그인 접근 가능).

    - year 미지정 시 가장 최신 학년도 자동 선택.
    - is_active=True 항목만 노출.
    - sort_order ASC, university ASC.
    """
    # 사용 가능한 학년도 목록
    year_result = await db.execute(
        select(distinct(UniversityGuide.year))
        .where(UniversityGuide.is_active == True)
        .order_by(UniversityGuide.year.desc())
    )
    available_years = [row[0] for row in year_result.all()]

    # 학년도 미지정 시 최신
    target_year = year if year is not None else (available_years[0] if available_years else None)

    if target_year is None:
        return UniversityGuideListResponse(items=[], total=0, available_years=[])

    conditions = [
        UniversityGuide.is_active == True,
        UniversityGuide.year == target_year,
    ]
    if search:
        conditions.append(UniversityGuide.university.ilike(f"%{search}%"))

    # 총 개수
    count_query = select(func.count()).select_from(UniversityGuide).where(and_(*conditions))
    total = (await db.execute(count_query)).scalar() or 0

    # 목록
    query = (
        select(UniversityGuide)
        .where(and_(*conditions))
        .order_by(UniversityGuide.sort_order.asc(), UniversityGuide.university.asc())
    )
    result = await db.execute(query)
    guides = result.scalars().all()

    items = [UniversityGuideResponse.model_validate(g) for g in guides]
    return UniversityGuideListResponse(
        items=items,
        total=total,
        available_years=available_years,
    )
