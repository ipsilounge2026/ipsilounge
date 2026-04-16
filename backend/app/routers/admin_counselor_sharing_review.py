"""
상담사 상담 기록/설문의 선배 공유 검토 API (V1 §6 게이트).

상담사 측 소스(ConsultationSurvey, ConsultationNote)를 선배에게 노출하기
전에 super_admin / admin / counselor 가 검토한다. senior 역할은 접근 불가.

엔드포인트:
- GET    /api/admin/counselor-sharing/pending
        선배 공유 검토가 필요한 상담사 설문·노트 목록
- GET    /api/admin/counselor-sharing/{source_type}/{id}
        상세 + 선배가 실제로 보게 될 preview
- PUT    /api/admin/counselor-sharing/{source_type}/{id}/review
        검토 제출 (reviewed / revision_requested)
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.consultation_note import ConsultationNote
from app.models.consultation_survey import ConsultationSurvey
from app.models.user import User
from app.services.senior_sharing_service import (
    DEFAULT_NOTE_SENIOR_SHARING,
    DEFAULT_SURVEY_SENIOR_SHARING,
    abstract_consultation_for_senior,
    filter_note_for_senior,
)
from app.services.survey_scoring_service import compute_radar_scores
from app.utils.dependencies import get_current_admin

router = APIRouter(
    prefix="/api/admin/counselor-sharing",
    tags=["상담사 → 선배 공유 검토"],
)


# ============================================================
# 공통 가드
# ============================================================

_ALLOWED_ROLES: frozenset[str] = frozenset({"super_admin", "admin", "counselor"})


def _require_counselor_access(admin: Admin) -> None:
    if admin.role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=403,
            detail="상담사 측 공유 검토 권한이 없습니다",
        )


# ============================================================
# Pydantic Schemas
# ============================================================

class CounselorSharingReviewUpdate(BaseModel):
    review_status: Literal["reviewed", "revision_requested"]
    review_notes: str | None = None
    sharing_settings: dict | None = None


# ============================================================
# 내부 직렬화 헬퍼
# ============================================================

async def _get_user_name(db: AsyncSession, user_id: uuid.UUID) -> str | None:
    res = await db.execute(select(User.name).where(User.id == user_id))
    return res.scalar_one_or_none()


def _survey_to_dict(survey: ConsultationSurvey) -> dict:
    return {
        "id": str(survey.id),
        "user_id": str(survey.user_id),
        "survey_type": survey.survey_type,
        "timing": survey.timing,
        "mode": survey.mode,
        "status": survey.status,
        "answers": survey.answers or {},
        "submitted_at": survey.submitted_at.isoformat() if survey.submitted_at else None,
        "created_at": survey.created_at.isoformat() if survey.created_at else None,
        "senior_review_status": survey.senior_review_status,
        "senior_review_notes": survey.senior_review_notes,
        "senior_sharing_settings": survey.senior_sharing_settings,
        "senior_reviewed_at": (
            survey.senior_reviewed_at.isoformat() if survey.senior_reviewed_at else None
        ),
        "senior_reviewer_admin_id": (
            str(survey.senior_reviewer_admin_id) if survey.senior_reviewer_admin_id else None
        ),
    }


def _note_to_dict(note: ConsultationNote) -> dict:
    return {
        "id": str(note.id),
        "user_id": str(note.user_id),
        "admin_id": str(note.admin_id) if note.admin_id else None,
        "category": note.category,
        "consultation_date": (
            note.consultation_date.isoformat() if note.consultation_date else None
        ),
        "student_grade": note.student_grade,
        "timing": note.timing,
        "goals": note.goals,
        "main_content": note.main_content,
        "advice_given": note.advice_given,
        "next_steps": note.next_steps,
        "next_topic": note.next_topic,
        "next_senior_context": note.next_senior_context,
        "topic_notes": note.topic_notes,
        "is_visible_to_user": note.is_visible_to_user,
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "senior_review_status": note.senior_review_status,
        "senior_review_notes": note.senior_review_notes,
        "senior_sharing_settings": note.senior_sharing_settings,
        "senior_reviewed_at": (
            note.senior_reviewed_at.isoformat() if note.senior_reviewed_at else None
        ),
        "senior_reviewer_admin_id": (
            str(note.senior_reviewer_admin_id) if note.senior_reviewer_admin_id else None
        ),
    }


# ============================================================
# GET /pending — 검토 대기 목록
# ============================================================

@router.get("/pending")
async def list_pending_sharing_reviews(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """선배 공유 검토 대기 중인 상담사 설문·노트 목록."""
    _require_counselor_access(admin)

    items: list[dict] = []

    # surveys
    survey_q = (
        select(ConsultationSurvey, User.name)
        .join(User, User.id == ConsultationSurvey.user_id)
        .where(
            ConsultationSurvey.status == "submitted",
            ConsultationSurvey.senior_review_status == "pending",
        )
        .order_by(ConsultationSurvey.submitted_at.desc())
    )
    for survey, user_name in (await db.execute(survey_q)).all():
        items.append({
            "source_type": "survey",
            "id": str(survey.id),
            "user_id": str(survey.user_id),
            "user_name": user_name,
            "timing": survey.timing,
            "survey_type": survey.survey_type,
            "created_at": survey.created_at.isoformat() if survey.created_at else None,
            "submitted_at": (
                survey.submitted_at.isoformat() if survey.submitted_at else None
            ),
            "senior_review_status": survey.senior_review_status,
        })

    # notes
    note_q = (
        select(ConsultationNote, User.name)
        .join(User, User.id == ConsultationNote.user_id)
        .where(ConsultationNote.senior_review_status == "pending")
        .order_by(ConsultationNote.consultation_date.desc())
    )
    for note, user_name in (await db.execute(note_q)).all():
        items.append({
            "source_type": "note",
            "id": str(note.id),
            "user_id": str(note.user_id),
            "user_name": user_name,
            "timing": note.timing,
            "category": note.category,
            "created_at": note.created_at.isoformat() if note.created_at else None,
            "consultation_date": (
                note.consultation_date.isoformat() if note.consultation_date else None
            ),
            "senior_review_status": note.senior_review_status,
        })

    # 제출 시각 기준 최신순으로 일괄 정렬 (둘 모두 존재 시)
    items.sort(
        key=lambda it: it.get("submitted_at") or it.get("consultation_date") or "",
        reverse=True,
    )

    return {"items": items}


# ============================================================
# GET /{source_type}/{id} — 단건 + preview
# ============================================================

@router.get("/{source_type}/{item_id}")
async def get_counselor_sharing_item(
    source_type: Literal["survey", "note"],
    item_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상세 조회 + 선배가 실제로 보게 될 preview 반환."""
    _require_counselor_access(admin)

    if source_type == "survey":
        result = await db.execute(
            select(ConsultationSurvey).where(ConsultationSurvey.id == item_id)
        )
        survey = result.scalar_one_or_none()
        if not survey:
            raise HTTPException(status_code=404, detail="상담사 설문을 찾을 수 없습니다")

        body = _survey_to_dict(survey)
        body["user_name"] = await _get_user_name(db, survey.user_id)

        # preview 생성: 현재 저장된 sharing_settings 혹은 기본값
        sharing = survey.senior_sharing_settings or DEFAULT_SURVEY_SENIOR_SHARING
        radar = compute_radar_scores(survey.answers or {}, survey.timing)
        preview = abstract_consultation_for_senior(
            answers=survey.answers or {},
            radar_scores=radar,
            timing=survey.timing,
            sharing=sharing,
        )
        body["preview_for_senior"] = preview
        body["default_sharing_settings"] = DEFAULT_SURVEY_SENIOR_SHARING
        return body

    # note
    result = await db.execute(
        select(ConsultationNote).where(ConsultationNote.id == item_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="상담사 상담 기록을 찾을 수 없습니다")

    body = _note_to_dict(note)
    body["user_name"] = await _get_user_name(db, note.user_id)

    sharing = note.senior_sharing_settings or DEFAULT_NOTE_SENIOR_SHARING
    preview = filter_note_for_senior(body, sharing)
    # preview 에는 검토 메타는 노출하지 않음
    for meta_key in (
        "senior_review_status",
        "senior_review_notes",
        "senior_sharing_settings",
        "senior_reviewed_at",
        "senior_reviewer_admin_id",
        "admin_private_notes",
    ):
        preview.pop(meta_key, None)
    body["preview_for_senior"] = preview
    body["default_sharing_settings"] = DEFAULT_NOTE_SENIOR_SHARING
    return body


# ============================================================
# PUT /{source_type}/{id}/review — 검토 제출
# ============================================================

@router.put("/{source_type}/{item_id}/review")
async def submit_counselor_sharing_review(
    source_type: Literal["survey", "note"],
    item_id: uuid.UUID,
    data: CounselorSharingReviewUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """선배 공유 검토 결과 저장."""
    _require_counselor_access(admin)

    if source_type == "survey":
        result = await db.execute(
            select(ConsultationSurvey).where(ConsultationSurvey.id == item_id)
        )
        survey = result.scalar_one_or_none()
        if not survey:
            raise HTTPException(status_code=404, detail="상담사 설문을 찾을 수 없습니다")

        survey.senior_review_status = data.review_status
        survey.senior_review_notes = data.review_notes
        if data.sharing_settings is not None:
            survey.senior_sharing_settings = data.sharing_settings
        survey.senior_reviewed_at = datetime.utcnow()
        survey.senior_reviewer_admin_id = admin.id
        await db.commit()
        await db.refresh(survey)
        return _survey_to_dict(survey)

    # note
    result = await db.execute(
        select(ConsultationNote).where(ConsultationNote.id == item_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="상담사 상담 기록을 찾을 수 없습니다")

    note.senior_review_status = data.review_status
    note.senior_review_notes = data.review_notes
    if data.sharing_settings is not None:
        note.senior_sharing_settings = data.sharing_settings
    note.senior_reviewed_at = datetime.utcnow()
    note.senior_reviewer_admin_id = admin.id
    await db.commit()
    await db.refresh(note)
    return _note_to_dict(note)
