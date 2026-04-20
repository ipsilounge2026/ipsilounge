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
from datetime import UTC, datetime
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

# V1 §7-2 관리자 SLA: 검토 완료까지 48시간 이내 권장
SLA_REVIEW_HOURS = 48


def _compute_sla_meta(reference_time: datetime | None) -> dict:
    """SLA 경과 메타데이터 계산 (V1 §7-2).

    reference_time 은 설문의 submitted_at 또는 상담 기록의 consultation_date 등
    "제출/작성 시점". 아직 검토되지 않은 건의 경과 시간을 계산.

    반환:
      - hours_since_submission: float | None (시간 단위)
      - is_overdue: bool (48시간 초과 여부)
      - sla_hours: int (정책값, 참고용)
    """
    if reference_time is None:
        return {"hours_since_submission": None, "is_overdue": False, "sla_hours": SLA_REVIEW_HOURS}
    # naive datetime 이면 UTC 로 간주 (DB 는 utcnow 저장)
    ref = reference_time if reference_time.tzinfo else reference_time.replace(tzinfo=UTC)
    now = datetime.now(UTC)
    elapsed = (now - ref).total_seconds() / 3600.0
    return {
        "hours_since_submission": round(elapsed, 1),
        "is_overdue": elapsed > SLA_REVIEW_HOURS,
        "sla_hours": SLA_REVIEW_HOURS,
    }


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


class SharingPreviewRequest(BaseModel):
    # V1 §6 UX: 저장 없이 토글만 바꾸었을 때의 선배 노출 모습
    sharing_settings: dict


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
        sla = _compute_sla_meta(survey.submitted_at)
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
            # V1 §7-2 SLA 메타
            "hours_since_submission": sla["hours_since_submission"],
            "is_overdue": sla["is_overdue"],
            "sla_hours": sla["sla_hours"],
        })

    # notes
    note_q = (
        select(ConsultationNote, User.name)
        .join(User, User.id == ConsultationNote.user_id)
        .where(ConsultationNote.senior_review_status == "pending")
        .order_by(ConsultationNote.consultation_date.desc())
    )
    for note, user_name in (await db.execute(note_q)).all():
        # note 는 submitted_at 필드가 없으므로 created_at (기록 작성 시점) 기준
        ref_time = note.created_at
        sla = _compute_sla_meta(ref_time)
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
            # V1 §7-2 SLA 메타 (created_at 기준)
            "hours_since_submission": sla["hours_since_submission"],
            "is_overdue": sla["is_overdue"],
            "sla_hours": sla["sla_hours"],
        })

    # 정렬 정책 (V1 §7-3 "관리자 업무 중 우선순위 항목"):
    # 1) 오버듀(SLA 초과) 항목 먼저, 2) 경과 시간 긴 순
    items.sort(
        key=lambda it: (
            not it.get("is_overdue", False),  # overdue=False → True 정렬 뒤로
            -(it.get("hours_since_submission") or 0),
        )
    )

    overdue_count = sum(1 for it in items if it.get("is_overdue"))
    return {
        "items": items,
        "total_count": len(items),
        "overdue_count": overdue_count,
        "sla_hours": SLA_REVIEW_HOURS,
    }


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


# ============================================================
# POST /{source_type}/{id}/preview — 실시간 미리보기 (V1 §6 UX 개선)
# ============================================================

@router.post("/{source_type}/{item_id}/preview")
async def preview_counselor_sharing(
    source_type: Literal["survey", "note"],
    item_id: uuid.UUID,
    data: SharingPreviewRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """저장 없이 현재 체크박스 상태에서 선배가 실제로 보게 될 결과를 반환.

    V1 §6 UX: 관리자가 토글을 만지작거리는 동안 DB 에 저장하지 않고도
    변경사항을 즉시 확인할 수 있도록 순수 계산 엔드포인트로 분리한다.
    DB write 는 수행하지 않는다.
    """
    _require_counselor_access(admin)

    sharing = data.sharing_settings or {}

    if source_type == "survey":
        result = await db.execute(
            select(ConsultationSurvey).where(ConsultationSurvey.id == item_id)
        )
        survey = result.scalar_one_or_none()
        if not survey:
            raise HTTPException(status_code=404, detail="상담사 설문을 찾을 수 없습니다")

        radar = compute_radar_scores(survey.answers or {}, survey.timing)
        preview = abstract_consultation_for_senior(
            answers=survey.answers or {},
            radar_scores=radar,
            timing=survey.timing,
            sharing=sharing,
        )
        return {"preview_for_senior": preview}

    # note
    result = await db.execute(
        select(ConsultationNote).where(ConsultationNote.id == item_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="상담사 상담 기록을 찾을 수 없습니다")

    note_dict = _note_to_dict(note)
    preview = filter_note_for_senior(note_dict, sharing)
    # preview 에는 검토 메타는 노출하지 않음 (기존 GET /{source_type}/{id} 와 동일 규칙)
    for meta_key in (
        "senior_review_status",
        "senior_review_notes",
        "senior_sharing_settings",
        "senior_reviewed_at",
        "senior_reviewer_admin_id",
        "admin_private_notes",
    ):
        preview.pop(meta_key, None)
    return {"preview_for_senior": preview}
