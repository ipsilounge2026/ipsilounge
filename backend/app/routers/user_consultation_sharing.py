"""
학생 사후 철회 API (V1 §10-1, §10-2).

학생이 본인의 상담사 설문(ConsultationSurvey)과 상담사 상담기록(ConsultationNote)에
대해 **선배 공유 동의를 사후 철회**할 수 있도록 한다. 철회가 즉시 반영되어
`admin_senior_consultation.get_counselor_summary_for_senior` 등 선배 노출 경로에서
해당 원본이 비노출 처리된다.

설계 원칙:
- 철회는 `senior_review_status` 를 건드리지 않고, `senior_sharing_revoked_at`
  타임스탬프만 세팅한다. 이렇게 하면 학생이 추후 복구(`/restore`)할 때
  관리자 검토 상태가 보존된다.
- 선배 노출 필터(admin_senior_consultation) 는 `revoked_at IS NULL` 조건을 추가
  확인하여 철회된 원본을 제외한다.
- 감사 로그(`consultation_data_access_logs`) 에 access_type="user_revokes_sharing"
  / "user_restores_sharing" 로 남긴다. 학생은 admin 이 아니므로 `viewer_admin_id`
  는 NULL, `viewer_role="user"`, meta 에 `user_id` 기록.

엔드포인트:
- GET  /api/user/consultation-sharing/status    본인의 공유 상태 목록
- POST /api/user/consultation-sharing/revoke    철회 요청
- POST /api/user/consultation-sharing/restore   철회 복구
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
from app.models.consultation_note import ConsultationNote
from app.models.consultation_survey import ConsultationSurvey
from app.models.user import User
from app.services.consultation_access_log_service import log_consultation_data_access
from app.utils.dependencies import get_current_user

router = APIRouter(
    prefix="/api/user/consultation-sharing",
    tags=["학생 사후 철회 (선배 공유)"],
)


# ============================================================
# Pydantic Schemas
# ============================================================

class RevokeRequest(BaseModel):
    # "all" 이면 해당 학생의 모든 surveys + notes 일괄 철회,
    # "by_id" 이면 source_type + source_id 로 특정 1건만 철회.
    scope: Literal["all", "by_id"]
    source_type: Literal["survey", "note"] | None = None
    source_id: uuid.UUID | None = None
    reason: str | None = None


class RestoreRequest(BaseModel):
    scope: Literal["all", "by_id"]
    source_type: Literal["survey", "note"] | None = None
    source_id: uuid.UUID | None = None


# ============================================================
# 내부 헬퍼
# ============================================================

def _effectively_shared(review_status: str | None, revoked_at: datetime | None) -> bool:
    """현재 실제로 선배에게 노출되고 있는지 여부.

    V1 §6 관리자 검토(`reviewed`) + V1 §10-1 학생 철회(`revoked_at IS NULL`) 모두 만족.
    """
    return (review_status == "reviewed") and (revoked_at is None)


async def _log_user_action(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    access_type: str,
    source_type: str,
    source_id: uuid.UUID,
    extra_meta: dict | None = None,
) -> None:
    """학생 본인 행동(철회/복구) 에 대한 감사 로그.

    viewer_admin_id 는 NULL, viewer_role="user", meta.user_id 에 본인 ID 기록.
    """
    meta: dict = {"user_id": str(user_id)}
    if extra_meta:
        meta.update(extra_meta)
    await log_consultation_data_access(
        db,
        viewer_admin_id=None,
        viewer_role="user",
        target_user_id=user_id,
        access_type=access_type,
        source_type=source_type,
        source_id=source_id,
        meta=meta,
    )


# ============================================================
# GET /status — 본인 공유 상태 목록
# ============================================================

@router.get("/status")
async def get_my_sharing_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """본인의 상담사 설문/노트 각각에 대한 현재 공유 상태.

    Response:
        {"items": [
            {"source_type": "survey"|"note", "id": ..., ..., "effectively_shared": bool},
            ...
        ]}
    """
    items: list[dict] = []

    # 상담사 설문 (submitted 만)
    survey_q = (
        select(ConsultationSurvey)
        .where(
            ConsultationSurvey.user_id == user.id,
            ConsultationSurvey.status == "submitted",
        )
        .order_by(ConsultationSurvey.submitted_at.desc())
    )
    for survey in (await db.execute(survey_q)).scalars().all():
        items.append({
            "source_type": "survey",
            "id": str(survey.id),
            "timing": survey.timing,
            "survey_type": survey.survey_type,
            "submitted_at": (
                survey.submitted_at.isoformat() if survey.submitted_at else None
            ),
            "senior_review_status": survey.senior_review_status,
            "revoked_at": (
                survey.senior_sharing_revoked_at.isoformat()
                if survey.senior_sharing_revoked_at else None
            ),
            "revoke_reason": survey.senior_sharing_revoke_reason,
            "effectively_shared": _effectively_shared(
                survey.senior_review_status, survey.senior_sharing_revoked_at
            ),
        })

    # 상담사 상담 기록
    note_q = (
        select(ConsultationNote)
        .where(ConsultationNote.user_id == user.id)
        .order_by(ConsultationNote.consultation_date.desc())
    )
    for note in (await db.execute(note_q)).scalars().all():
        items.append({
            "source_type": "note",
            "id": str(note.id),
            "category": note.category,
            "consultation_date": (
                note.consultation_date.isoformat() if note.consultation_date else None
            ),
            "senior_review_status": note.senior_review_status,
            "revoked_at": (
                note.senior_sharing_revoked_at.isoformat()
                if note.senior_sharing_revoked_at else None
            ),
            "revoke_reason": note.senior_sharing_revoke_reason,
            "effectively_shared": _effectively_shared(
                note.senior_review_status, note.senior_sharing_revoked_at
            ),
        })

    return {"items": items}


# ============================================================
# POST /revoke — 철회
# ============================================================

@router.post("/revoke")
async def revoke_my_sharing(
    data: RevokeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """공유 철회.

    - scope=="all": 본인의 모든 consultation_surveys + consultation_notes 의
      revoked_at 를 현재 시각으로 세팅 (이미 철회된 건은 skip).
    - scope=="by_id": source_type + source_id 로 특정 1건만 철회.
    """
    now = datetime.utcnow()
    revoked_items: list[dict] = []

    if data.scope == "by_id":
        if not data.source_type or not data.source_id:
            raise HTTPException(
                status_code=400, detail="by_id 철회는 source_type 과 source_id 가 필요합니다"
            )

        if data.source_type == "survey":
            result = await db.execute(
                select(ConsultationSurvey).where(
                    ConsultationSurvey.id == data.source_id,
                    ConsultationSurvey.user_id == user.id,
                )
            )
            survey = result.scalar_one_or_none()
            if not survey:
                raise HTTPException(status_code=404, detail="상담사 설문을 찾을 수 없습니다")
            if survey.senior_sharing_revoked_at is None:
                survey.senior_sharing_revoked_at = now
                survey.senior_sharing_revoke_reason = data.reason
                revoked_items.append({"source_type": "survey", "id": str(survey.id)})
        else:  # note
            result = await db.execute(
                select(ConsultationNote).where(
                    ConsultationNote.id == data.source_id,
                    ConsultationNote.user_id == user.id,
                )
            )
            note = result.scalar_one_or_none()
            if not note:
                raise HTTPException(status_code=404, detail="상담사 상담 기록을 찾을 수 없습니다")
            if note.senior_sharing_revoked_at is None:
                note.senior_sharing_revoked_at = now
                note.senior_sharing_revoke_reason = data.reason
                revoked_items.append({"source_type": "note", "id": str(note.id)})
    else:
        # scope == "all"
        survey_q = select(ConsultationSurvey).where(
            ConsultationSurvey.user_id == user.id,
            ConsultationSurvey.senior_sharing_revoked_at.is_(None),
        )
        for survey in (await db.execute(survey_q)).scalars().all():
            survey.senior_sharing_revoked_at = now
            survey.senior_sharing_revoke_reason = data.reason
            revoked_items.append({"source_type": "survey", "id": str(survey.id)})

        note_q = select(ConsultationNote).where(
            ConsultationNote.user_id == user.id,
            ConsultationNote.senior_sharing_revoked_at.is_(None),
        )
        for note in (await db.execute(note_q)).scalars().all():
            note.senior_sharing_revoked_at = now
            note.senior_sharing_revoke_reason = data.reason
            revoked_items.append({"source_type": "note", "id": str(note.id)})

    # DB 본 커밋
    await db.commit()

    # 감사 로그 — 각 항목마다 개별 기록 (best-effort)
    for item in revoked_items:
        await _log_user_action(
            db,
            user_id=user.id,
            access_type="user_revokes_sharing",
            source_type=item["source_type"],
            source_id=uuid.UUID(item["id"]),
            extra_meta={"reason": data.reason, "scope": data.scope},
        )

    return {"revoked_count": len(revoked_items), "items": revoked_items}


# ============================================================
# POST /restore — 철회 복구
# ============================================================

@router.post("/restore")
async def restore_my_sharing(
    data: RestoreRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """철회 복구 — revoked_at 와 revoke_reason 을 None 으로 되돌린다.

    senior_review_status 는 이미 보존되어 있으므로, 이전에 reviewed 상태였다면
    복구 즉시 선배에게 다시 노출된다.
    """
    restored_items: list[dict] = []

    if data.scope == "by_id":
        if not data.source_type or not data.source_id:
            raise HTTPException(
                status_code=400, detail="by_id 복구는 source_type 과 source_id 가 필요합니다"
            )

        if data.source_type == "survey":
            result = await db.execute(
                select(ConsultationSurvey).where(
                    ConsultationSurvey.id == data.source_id,
                    ConsultationSurvey.user_id == user.id,
                )
            )
            survey = result.scalar_one_or_none()
            if not survey:
                raise HTTPException(status_code=404, detail="상담사 설문을 찾을 수 없습니다")
            if survey.senior_sharing_revoked_at is not None:
                survey.senior_sharing_revoked_at = None
                survey.senior_sharing_revoke_reason = None
                restored_items.append({"source_type": "survey", "id": str(survey.id)})
        else:  # note
            result = await db.execute(
                select(ConsultationNote).where(
                    ConsultationNote.id == data.source_id,
                    ConsultationNote.user_id == user.id,
                )
            )
            note = result.scalar_one_or_none()
            if not note:
                raise HTTPException(status_code=404, detail="상담사 상담 기록을 찾을 수 없습니다")
            if note.senior_sharing_revoked_at is not None:
                note.senior_sharing_revoked_at = None
                note.senior_sharing_revoke_reason = None
                restored_items.append({"source_type": "note", "id": str(note.id)})
    else:
        # scope == "all"
        survey_q = select(ConsultationSurvey).where(
            ConsultationSurvey.user_id == user.id,
            ConsultationSurvey.senior_sharing_revoked_at.is_not(None),
        )
        for survey in (await db.execute(survey_q)).scalars().all():
            survey.senior_sharing_revoked_at = None
            survey.senior_sharing_revoke_reason = None
            restored_items.append({"source_type": "survey", "id": str(survey.id)})

        note_q = select(ConsultationNote).where(
            ConsultationNote.user_id == user.id,
            ConsultationNote.senior_sharing_revoked_at.is_not(None),
        )
        for note in (await db.execute(note_q)).scalars().all():
            note.senior_sharing_revoked_at = None
            note.senior_sharing_revoke_reason = None
            restored_items.append({"source_type": "note", "id": str(note.id)})

    await db.commit()

    for item in restored_items:
        await _log_user_action(
            db,
            user_id=user.id,
            access_type="user_restores_sharing",
            source_type=item["source_type"],
            source_id=uuid.UUID(item["id"]),
            extra_meta={"scope": data.scope},
        )

    return {"restored_count": len(restored_items), "items": restored_items}
