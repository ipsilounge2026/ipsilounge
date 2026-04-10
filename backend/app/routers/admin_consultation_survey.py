"""
관리자용 사전 상담 설문 조회 API

- 설문 목록 조회 (필터: survey_type, status, 검색)
- 설문 상세 조회 (답변 + 스키마 포함)
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.consultation_survey import ConsultationSurvey
from app.models.user import User
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/surveys", tags=["관리자-사전설문"])


@router.get("")
async def list_surveys(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    survey_type: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None, description="학생 이름 또는 이메일 검색"),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설문 목록 조회 (관리자용)"""
    base = select(ConsultationSurvey).join(User, ConsultationSurvey.user_id == User.id)

    if survey_type:
        base = base.where(ConsultationSurvey.survey_type == survey_type)
    if status:
        base = base.where(ConsultationSurvey.status == status)
    if search:
        pattern = f"%{search}%"
        base = base.where((User.name.ilike(pattern)) | (User.email.ilike(pattern)))

    # total
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # items
    q = (
        base.order_by(ConsultationSurvey.updated_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(q)).scalars().all()

    # user info cache
    user_ids = list({r.user_id for r in rows})
    users_map: dict[uuid.UUID, User] = {}
    if user_ids:
        uresult = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in uresult.scalars().all():
            users_map[u.id] = u

    items = []
    for s in rows:
        u = users_map.get(s.user_id)
        items.append({
            "id": str(s.id),
            "user_id": str(s.user_id),
            "user_name": u.name if u else "?",
            "user_email": u.email if u else "",
            "user_phone": u.phone if u else "",
            "survey_type": s.survey_type,
            "timing": s.timing,
            "mode": s.mode,
            "status": s.status,
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        })

    return {"items": items, "total": total}


@router.get("/{survey_id}")
async def get_survey_detail(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설문 상세 조회 (관리자용) - 답변 데이터 + 스키마 포함"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    # user info
    uresult = await db.execute(select(User).where(User.id == survey.user_id))
    user = uresult.scalar_one_or_none()

    # schema
    from app.surveys.schema_loader import load_schema
    try:
        schema = load_schema(survey.survey_type)
    except Exception:
        schema = None

    return {
        "id": str(survey.id),
        "user_id": str(survey.user_id),
        "user_name": user.name if user else "?",
        "user_email": user.email if user else "",
        "user_phone": user.phone if user else "",
        "survey_type": survey.survey_type,
        "timing": survey.timing,
        "mode": survey.mode,
        "status": survey.status,
        "answers": survey.answers,
        "category_status": survey.category_status,
        "last_category": survey.last_category,
        "last_question": survey.last_question,
        "started_platform": survey.started_platform,
        "last_edited_platform": survey.last_edited_platform,
        "schema_version": survey.schema_version,
        "booking_id": str(survey.booking_id) if survey.booking_id else None,
        "note": survey.note,
        "created_at": survey.created_at.isoformat(),
        "updated_at": survey.updated_at.isoformat(),
        "submitted_at": survey.submitted_at.isoformat() if survey.submitted_at else None,
        "schema": schema,
    }
