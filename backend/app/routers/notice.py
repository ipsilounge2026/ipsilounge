from fastapi import APIRouter, Depends
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.notice import Notice
from app.models.user import User
from app.schemas.notice import NoticeResponse
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/notices", tags=["공지사항"])


@router.get("/active", response_model=list[NoticeResponse])
async def get_active_notices(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """현재 사용자에게 표시할 활성 공지사항 목록"""
    result = await db.execute(
        select(Notice)
        .where(
            and_(
                Notice.is_active == True,
                or_(
                    Notice.target_audience == "all",
                    Notice.target_audience == user.member_type,
                ),
            )
        )
        .order_by(Notice.is_pinned.desc(), Notice.created_at.desc())
        .limit(10)
    )
    notices = result.scalars().all()

    # admin_name 조회
    admin_ids = set(n.admin_id for n in notices)
    admin_names = {}
    for aid in admin_ids:
        admin_result = await db.execute(select(Admin).where(Admin.id == aid))
        admin_obj = admin_result.scalar_one_or_none()
        if admin_obj:
            admin_names[aid] = admin_obj.name

    return [
        NoticeResponse(
            id=n.id,
            title=n.title,
            content=n.content,
            target_audience=n.target_audience,
            is_pinned=n.is_pinned,
            is_active=n.is_active,
            send_push=n.send_push,
            admin_name=admin_names.get(n.admin_id),
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in notices
    ]
