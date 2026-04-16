"""
슈퍼관리자 전용 감사 로그 조회 API (V1 §10-2 사후 교정).

선배 ↔ 상담사 간 데이터 공유 흐름에서 기록된 접근 로그를 조회한다.
super_admin 만 접근 가능.
"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.consultation_data_access_log import ConsultationDataAccessLog
from app.utils.dependencies import get_current_super_admin

router = APIRouter(prefix="/api/admin/audit", tags=["감사 로그"])


@router.get("/consultation-data-access")
async def list_consultation_data_access_logs(
    target_user_id: uuid.UUID | None = Query(default=None),
    viewer_role: Literal["senior", "counselor", "admin", "super_admin"] | None = Query(default=None),
    access_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    _super_admin: Admin = Depends(get_current_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담 데이터 접근 이력 조회 (슈퍼관리자 전용). accessed_at DESC 정렬."""
    q = select(ConsultationDataAccessLog).order_by(
        ConsultationDataAccessLog.accessed_at.desc()
    )
    if target_user_id is not None:
        q = q.where(ConsultationDataAccessLog.target_user_id == target_user_id)
    if viewer_role:
        q = q.where(ConsultationDataAccessLog.viewer_role == viewer_role)
    if access_type:
        q = q.where(ConsultationDataAccessLog.access_type == access_type)
    q = q.limit(limit)

    result = await db.execute(q)
    logs = result.scalars().all()

    return {
        "items": [
            {
                "id": str(log.id),
                "viewer_admin_id": (
                    str(log.viewer_admin_id) if log.viewer_admin_id else None
                ),
                "viewer_role": log.viewer_role,
                "target_user_id": str(log.target_user_id),
                "access_type": log.access_type,
                "source_type": log.source_type,
                "source_id": str(log.source_id) if log.source_id else None,
                "meta": log.meta,
                "accessed_at": log.accessed_at.isoformat() if log.accessed_at else None,
            }
            for log in logs
        ]
    }
