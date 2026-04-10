"""
선배 상담 사전 설문 — 학생용 API

엔드포인트:
- POST   /api/senior-pre-surveys                      사전 설문 생성/저장
- GET    /api/senior-pre-surveys                      내 사전 설문 목록
- GET    /api/senior-pre-surveys/{id}                 단건 조회
- PATCH  /api/senior-pre-surveys/{id}                 부분 저장
- POST   /api/senior-pre-surveys/{id}/submit          제출
- GET    /api/senior-pre-surveys/schema               스키마 조회
"""

import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.senior_pre_survey import SeniorPreSurvey
from app.models.user import User
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/senior-pre-surveys", tags=["선배 사전 설문"])


class SurveyCreateRequest(BaseModel):
    session_number: int = Field(ge=1, le=4)
    session_timing: str | None = None
    booking_id: str | None = None
    answers: dict | None = None


class SurveyPatchRequest(BaseModel):
    answers: dict


@router.get("/schema")
async def get_schema(session_timing: str | None = None):
    """사전 설문 스키마 조회 (인증 불필요)"""
    path = Path(__file__).resolve().parent.parent / "surveys" / "schemas" / "senior_pre_survey.json"
    with open(path, "r", encoding="utf-8") as f:
        schema = json.load(f)
    if session_timing and session_timing in schema.get("session_questions", {}):
        session = schema["session_questions"][session_timing]
        return {
            "common_questions": schema["common_questions"],
            "session_timing": session_timing,
            "session_label": session["label"],
            "Q3_options": session["Q3_options"],
            "session_questions": session["questions"],
        }
    return schema


@router.post("")
async def create_survey(
    data: SurveyCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """사전 설문 생성. 동일 (user, session_number) draft가 있으면 그것을 반환."""
    # 기존 draft 확인
    existing_q = select(SeniorPreSurvey).where(
        SeniorPreSurvey.user_id == user.id,
        SeniorPreSurvey.session_number == data.session_number,
        SeniorPreSurvey.status == "draft",
    )
    existing = (await db.execute(existing_q)).scalar_one_or_none()
    if existing:
        return _to_dict(existing)

    survey = SeniorPreSurvey(
        user_id=user.id,
        session_number=data.session_number,
        session_timing=data.session_timing,
        booking_id=uuid.UUID(data.booking_id) if data.booking_id else None,
        answers=data.answers or {},
    )
    db.add(survey)
    await db.commit()
    await db.refresh(survey)
    return _to_dict(survey)


@router.get("")
async def list_my_surveys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내 사전 설문 목록"""
    result = await db.execute(
        select(SeniorPreSurvey)
        .where(SeniorPreSurvey.user_id == user.id)
        .order_by(SeniorPreSurvey.session_number)
    )
    surveys = result.scalars().all()
    return {"surveys": [_to_dict(s) for s in surveys]}


@router.get("/{survey_id}")
async def get_survey(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """단건 조회"""
    survey = await _get_owned(survey_id, user, db)
    return _to_dict(survey)


@router.patch("/{survey_id}")
async def patch_survey(
    survey_id: uuid.UUID,
    data: SurveyPatchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """부분 저장"""
    survey = await _get_owned(survey_id, user, db)
    if survey.status != "draft":
        raise HTTPException(status_code=400, detail="제출된 설문은 수정할 수 없습니다")

    merged = dict(survey.answers or {})
    merged.update(data.answers)
    survey.answers = merged
    await db.commit()
    await db.refresh(survey)
    return _to_dict(survey)


@router.post("/{survey_id}/submit")
async def submit_survey(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """제출"""
    survey = await _get_owned(survey_id, user, db)
    if survey.status == "submitted":
        raise HTTPException(status_code=400, detail="이미 제출된 설문입니다")

    survey.status = "submitted"
    survey.submitted_at = datetime.utcnow()
    await db.commit()
    await db.refresh(survey)
    return _to_dict(survey)


# ---- 헬퍼 ----

async def _get_owned(survey_id: uuid.UUID, user: User, db: AsyncSession) -> SeniorPreSurvey:
    result = await db.execute(
        select(SeniorPreSurvey).where(
            SeniorPreSurvey.id == survey_id,
            SeniorPreSurvey.user_id == user.id,
        )
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")
    return survey


def _to_dict(survey: SeniorPreSurvey) -> dict:
    return {
        "id": str(survey.id),
        "user_id": str(survey.user_id),
        "booking_id": str(survey.booking_id) if survey.booking_id else None,
        "session_number": survey.session_number,
        "session_timing": survey.session_timing,
        "status": survey.status,
        "answers": survey.answers or {},
        "submitted_at": survey.submitted_at.isoformat() if survey.submitted_at else None,
        "created_at": survey.created_at.isoformat() if survey.created_at else None,
    }
