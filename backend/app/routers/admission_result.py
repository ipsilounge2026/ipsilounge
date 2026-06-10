"""사용자 입결 조회 API (비로그인 접근 가능).

핵심:
- display_year (예: 2027) = 사용자가 보는 학년도 페이지
- data_year (예: 2026) = 실제 입결이 발생한 연도 = display_year - 1
  → 즉 사용자 2027학년도 페이지의 "전년도 입시결과" = DB의 year=2026 자료

데이터 매칭:
- university_guides (대학어디가) 의 university_code → adiga_admission_results 의 university_code
- year 매칭 시 자동으로 -1 처리
"""

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.adiga_admission_result import AdigaAdmissionResult
from app.models.university_guide import UniversityGuide

router = APIRouter(prefix="/api/university-guide/result", tags=["입결 조회"])


def _to_response(item: AdigaAdmissionResult) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "university": item.university,
        "university_code": item.university_code,
        "year": item.year,
        "admission_category": item.admission_category,
        "admission_name": item.admission_name,
        "recruitment_type": item.recruitment_type,
        "major": item.major,
        "recruit_count": item.recruit_count,
        "competition_rate": item.competition_rate,
        "additional_count": item.additional_count,
        "gpa_score_50": item.gpa_score_50,
        "gpa_score_70": item.gpa_score_70,
        "gpa_grade_50": item.gpa_grade_50,
        "gpa_grade_70": item.gpa_grade_70,
        "conv_score_50": item.conv_score_50,
        "conv_score_70": item.conv_score_70,
        "percentile_50": item.percentile_50,
        "percentile_70": item.percentile_70,
        "note": item.note,
    }


@router.get("/")
async def get_admission_result(
    university_code: str = Query(..., description="대학 코드 (7자리). university_guides.university_code"),
    display_year: int = Query(..., description="사용자가 보는 학년도 (예: 2027). 실제 입결 조회는 display_year - 1"),
    recruitment_type: str | None = Query(None, description="수시 / 정시"),
    admission_category: str | None = Query(None, description="전형유형: 종합/교과/논술/수능 등"),
    search: str | None = Query(None, description="학과명 부분 검색"),
    db: AsyncSession = Depends(get_db),
):
    """
    대학별 전년도 입결 데이터 조회.

    예: 2027학년도 페이지에서 서울대 입결 → display_year=2027, university_code=0000019
        → 내부적으로 year=2026 인 데이터를 조회.
    """
    data_year = display_year - 1

    # 1) 우리 university_guides 에서 해당 대학명 조회 (헤더 표시용)
    ug_res = await db.execute(
        select(UniversityGuide).where(
            and_(
                UniversityGuide.university_code == university_code,
                UniversityGuide.year == display_year,
            )
        )
    )
    guide = ug_res.scalar_one_or_none()
    university_name = guide.university if guide else None

    # 2) 입결 데이터 조회 (year = data_year)
    conditions = [
        AdigaAdmissionResult.university_code == university_code,
        AdigaAdmissionResult.year == data_year,
    ]
    if recruitment_type:
        conditions.append(AdigaAdmissionResult.recruitment_type == recruitment_type)
    if admission_category:
        conditions.append(AdigaAdmissionResult.admission_category == admission_category)
    if search:
        conditions.append(AdigaAdmissionResult.major.ilike(f"%{search}%"))

    # 총 개수
    total = (
        await db.execute(
            select(func.count())
            .select_from(AdigaAdmissionResult)
            .where(and_(*conditions))
        )
    ).scalar() or 0

    # 데이터
    data_q = (
        select(AdigaAdmissionResult)
        .where(and_(*conditions))
        .order_by(
            AdigaAdmissionResult.recruitment_type.asc(),
            AdigaAdmissionResult.admission_category.asc(),
            AdigaAdmissionResult.major.asc(),
        )
    )
    data_res = await db.execute(data_q)
    items = data_res.scalars().all()

    # 필터용 메타: 이 대학·학년도에 있는 카테고리·구분 종류
    meta_q = await db.execute(
        select(
            AdigaAdmissionResult.recruitment_type,
            AdigaAdmissionResult.admission_category,
        )
        .where(
            and_(
                AdigaAdmissionResult.university_code == university_code,
                AdigaAdmissionResult.year == data_year,
            )
        )
        .distinct()
    )
    meta_rows = meta_q.all()
    available_recruitment_types = sorted({r[0] for r in meta_rows if r[0]})
    available_categories = sorted({r[1] for r in meta_rows if r[1]})

    return {
        "university": university_name,
        "university_code": university_code,
        "display_year": display_year,
        "data_year": data_year,
        "total": total,
        "items": [_to_response(it) for it in items],
        "available_recruitment_types": available_recruitment_types,
        "available_categories": available_categories,
    }


@router.get("/available-years")
async def get_available_data_years(
    university_code: str = Query(..., description="대학 코드"),
    db: AsyncSession = Depends(get_db),
):
    """대학별로 우리 DB 에 있는 입결 데이터의 연도 목록 (display_year 기준 반환)."""
    res = await db.execute(
        select(AdigaAdmissionResult.year)
        .where(AdigaAdmissionResult.university_code == university_code)
        .distinct()
        .order_by(AdigaAdmissionResult.year.desc())
    )
    data_years = [row[0] for row in res.all()]
    display_years = [y + 1 for y in data_years]
    return {
        "university_code": university_code,
        "data_years": data_years,
        "display_years": display_years,
    }


@router.get("/timeline")
async def get_admission_timeline(
    university_code: str = Query(..., description="대학 코드"),
    major: str = Query(..., description="학과/모집단위"),
    recruitment_type: str | None = Query(None, description="수시 / 정시"),
    admission_category: str | None = Query(None, description="전형유형"),
    admission_name: str | None = Query(None, description="전형명 (선택, 정확 매칭)"),
    db: AsyncSession = Depends(get_db),
):
    """
    같은 학과·전형의 여러 학년도 추이 (그래프용).

    매칭 키: university_code + major (+ recruitment_type + admission_category + admission_name).
    매칭이 너무 엄격하면 데이터가 적게 나오므로 admission_name 은 선택.
    """
    conditions = [
        AdigaAdmissionResult.university_code == university_code,
        AdigaAdmissionResult.major == major,
    ]
    if recruitment_type:
        conditions.append(AdigaAdmissionResult.recruitment_type == recruitment_type)
    if admission_category:
        conditions.append(AdigaAdmissionResult.admission_category == admission_category)
    if admission_name:
        conditions.append(AdigaAdmissionResult.admission_name == admission_name)

    res = await db.execute(
        select(AdigaAdmissionResult)
        .where(and_(*conditions))
        .order_by(AdigaAdmissionResult.year.asc())
    )
    items = res.scalars().all()

    points = []
    for it in items:
        avg50 = (it.percentile_50 or {}).get("average_percentile") if it.percentile_50 else None
        avg70 = (it.percentile_70 or {}).get("average_percentile") if it.percentile_70 else None
        points.append({
            "data_year": it.year,
            "display_year": it.year + 1,
            "admission_name": it.admission_name,
            "recruit_count": it.recruit_count,
            "competition_rate": it.competition_rate,
            "additional_count": it.additional_count,
            "gpa_grade_50": it.gpa_grade_50,
            "gpa_grade_70": it.gpa_grade_70,
            "avg_percentile_50": avg50,
            "avg_percentile_70": avg70,
        })

    return {
        "university_code": university_code,
        "major": major,
        "recruitment_type": recruitment_type,
        "admission_category": admission_category,
        "total": len(points),
        "points": points,
    }
