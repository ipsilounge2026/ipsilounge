"""
상담 데이터 접근 감사 로그 기록 유틸 (V1 §10-2).

라우터에서 `await log_consultation_data_access(...)` 형태로 호출한다.
로그 기록 실패가 주 흐름을 막지 않도록, 내부에서 예외를 삼키고 warning 로그만
남긴다 (감사 로그는 best-effort).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consultation_data_access_log import ConsultationDataAccessLog

logger = logging.getLogger(__name__)


async def log_consultation_data_access(
    db: AsyncSession,
    *,
    viewer_admin_id: uuid.UUID | None,
    viewer_role: str,
    target_user_id: uuid.UUID,
    access_type: str,
    source_type: str | None = None,
    source_id: uuid.UUID | None = None,
    meta: dict | None = None,
) -> None:
    """감사 로그 1건을 기록한다. 실패 시 warning 로그만 남기고 예외를 전파하지 않는다.

    호출 측에서 commit 을 수행하는 것이 기본이나, 일부 라우터는
    별도 트랜잭션을 열지 않으므로 여기서 flush 만 수행하고 커밋은 호출 측 결정에
    맡긴다. 호출 측이 commit 을 수행하지 않더라도 레코드는 세션 dirty 상태로 남고
    get_db 종료 시점에 commit 되지 않으면 롤백된다.
    """
    try:
        entry = ConsultationDataAccessLog(
            viewer_admin_id=viewer_admin_id,
            viewer_role=viewer_role,
            target_user_id=target_user_id,
            access_type=access_type,
            source_type=source_type,
            source_id=source_id,
            meta=meta,
            accessed_at=datetime.utcnow(),
        )
        db.add(entry)
        await db.commit()
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.warning(
            "[access_log] failed to write access log: access_type=%s target=%s err=%s",
            access_type,
            target_user_id,
            exc,
        )
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass
