from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.admission_case import AdmissionCase, AdmissionType
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/admission-cases", tags=["관리자 합격 사례 관리"])


class CaseCreate(BaseModel):
    university: str
    major: str
    admission_year: int
    admission_type: AdmissionType
    grade_average: float | None = None
    grade_details: str | None = None
    setuek_grade: str | None = None
    changche_grade: str | None = None
    haengtuk_grade: str | None = None
    strengths: str | None = None
    key_activities: str | None = None
    notes: str | None = None
    is_public: bool = True


class CaseUpdate(CaseCreate):
    university: str | None = None
    major: str | None = None
    admission_year: int | None = None
    admission_type: AdmissionType | None = None


def _case_to_dict(c: AdmissionCase) -> dict:
    return {
        "id": str(c.id),
        "university": c.university,
        "major": c.major,
        "admission_year": c.admission_year,
        "admission_type": c.admission_type,
        "grade_average": c.grade_average,
        "grade_details": c.grade_details,
        "setuek_grade": c.setuek_grade,
        "changche_grade": c.changche_grade,
        "haengtuk_grade": c.haengtuk_grade,
        "strengths": c.strengths,
        "key_activities": c.key_activities,
        "notes": c.notes,
        "is_public": c.is_public,
        "created_at": c.created_at.isoformat(),
    }


@router.get("")
async def list_cases(
    university: str | None = None,
    major: str | None = None,
    admission_type: AdmissionType | None = None,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """합격 사례 목록"""
    query = select(AdmissionCase).order_by(AdmissionCase.admission_year.desc())
    if university:
        query = query.where(AdmissionCase.university.ilike(f"%{university}%"))
    if major:
        query = query.where(AdmissionCase.major.ilike(f"%{major}%"))
    if admission_type:
        query = query.where(AdmissionCase.admission_type == admission_type)

    result = await db.execute(query)
    return [_case_to_dict(c) for c in result.scalars().all()]


@router.post("")
async def create_case(
    data: CaseCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """합격 사례 등록"""
    case = AdmissionCase(**data.model_dump())
    db.add(case)
    await db.commit()
    await db.refresh(case)
    return _case_to_dict(case)


@router.put("/{case_id}")
async def update_case(
    case_id: str,
    data: CaseUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """합격 사례 수정"""
    result = await db.execute(select(AdmissionCase).where(AdmissionCase.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="합격 사례를 찾을 수 없습니다.")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(case, field, value)

    await db.commit()
    await db.refresh(case)
    return _case_to_dict(case)


@router.delete("/{case_id}")
async def delete_case(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """합격 사례 삭제"""
    result = await db.execute(select(AdmissionCase).where(AdmissionCase.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="합격 사례를 찾을 수 없습니다.")

    await db.delete(case)
    await db.commit()
    return {"message": "삭제 완료"}
