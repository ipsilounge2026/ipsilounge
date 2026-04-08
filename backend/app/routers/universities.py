"""대학/학과 드롭다운 조회 API

admission_data 테이블의 최신 학년도 데이터를 기반으로
대학 목록과 모집단위(학과) 목록을 반환합니다.
가나다 순으로 정렬됩니다.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admission_data import AdmissionData

router = APIRouter(prefix="/api/universities", tags=["대학/학과"])


async def _get_latest_year(db: AsyncSession) -> int | None:
    """admission_data 테이블의 최신 학년도 조회"""
    result = await db.execute(select(func.max(AdmissionData.year)))
    return result.scalar()


@router.get("")
async def list_universities(
    db: AsyncSession = Depends(get_db),
):
    """대학 목록 (최신 학년도 기준, 가나다 순)"""
    latest_year = await _get_latest_year(db)
    if latest_year is None:
        return {"year": None, "universities": []}

    result = await db.execute(
        select(AdmissionData.university)
        .where(AdmissionData.year == latest_year)
        .distinct()
    )
    universities = sorted({row[0] for row in result.all() if row[0]})
    return {"year": latest_year, "universities": universities}


@router.get("/majors")
async def list_majors(
    university: str = Query(..., description="대학명"),
    db: AsyncSession = Depends(get_db),
):
    """특정 대학의 모집단위(학과) 목록 (최신 학년도 기준, 가나다 순)"""
    latest_year = await _get_latest_year(db)
    if latest_year is None:
        return {"year": None, "university": university, "majors": []}

    result = await db.execute(
        select(AdmissionData.major)
        .where(
            AdmissionData.university == university,
            AdmissionData.year == latest_year,
        )
        .distinct()
    )
    majors = sorted({row[0] for row in result.all() if row[0]})
    return {"year": latest_year, "university": university, "majors": majors}
