import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.notice import Notice
from app.schemas.notice import (
    NoticeCreate,
    NoticeListResponse,
    NoticeResponse,
    NoticeUpdate,
)
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/notices", tags=["관리자-공지사항"])


def _to_response(notice: Notice, admin_name: str | None = None) -> NoticeResponse:
    return NoticeResponse(
        id=notice.id,
        title=notice.title,
        content=notice.content,
        target_audience=notice.target_audience,
        is_pinned=notice.is_pinned,
        is_active=notice.is_active,
        send_push=notice.send_push,
        admin_name=admin_name,
        created_at=notice.created_at,
        updated_at=notice.updated_at,
    )


@router.post("/", response_model=NoticeResponse)
async def create_notice(
    data: NoticeCreate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """공지사항 생성"""
    notice = Notice(
        admin_id=admin.id,
        title=data.title,
        content=data.content,
        target_audience=data.target_audience,
        is_pinned=data.is_pinned,
        is_active=data.is_active,
        send_push=data.send_push,
    )
    db.add(notice)
    await db.commit()
    await db.refresh(notice)

    # TODO: send_push가 True이면 FCM 푸시 알림 발송
    # target_audience에 해당하는 사용자들에게 푸시 발송

    return _to_response(notice, admin.name)


@router.get("/", response_model=NoticeListResponse)
async def get_notices(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    target_audience: str | None = None,
    is_active: bool | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """공지사항 목록 조회"""
    conditions = []
    if target_audience:
        conditions.append(Notice.target_audience == target_audience)
    if is_active is not None:
        conditions.append(Notice.is_active == is_active)

    query = select(Notice)
    if conditions:
        query = query.where(and_(*conditions))
    query = query.order_by(Notice.is_pinned.desc(), Notice.created_at.desc())

    # 총 개수
    count_query = select(func.count()).select_from(Notice)
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total = (await db.execute(count_query)).scalar() or 0

    # 페이지네이션
    result = await db.execute(query.offset((page - 1) * size).limit(size))
    notices = result.scalars().all()

    # admin_name 조회
    admin_ids = set(n.admin_id for n in notices)
    admin_names = {}
    for aid in admin_ids:
        admin_result = await db.execute(select(Admin).where(Admin.id == aid))
        admin_obj = admin_result.scalar_one_or_none()
        if admin_obj:
            admin_names[aid] = admin_obj.name

    items = [_to_response(n, admin_names.get(n.admin_id)) for n in notices]
    return NoticeListResponse(items=items, total=total)


@router.get("/{notice_id}", response_model=NoticeResponse)
async def get_notice(
    notice_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """공지사항 상세 조회"""
    result = await db.execute(select(Notice).where(Notice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise HTTPException(status_code=404, detail="공지사항을 찾을 수 없습니다")

    admin_result = await db.execute(select(Admin).where(Admin.id == notice.admin_id))
    admin_obj = admin_result.scalar_one_or_none()
    return _to_response(notice, admin_obj.name if admin_obj else None)


@router.put("/{notice_id}", response_model=NoticeResponse)
async def update_notice(
    notice_id: uuid.UUID,
    data: NoticeUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """공지사항 수정"""
    result = await db.execute(select(Notice).where(Notice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise HTTPException(status_code=404, detail="공지사항을 찾을 수 없습니다")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(notice, field, value)

    await db.commit()
    await db.refresh(notice)

    admin_result = await db.execute(select(Admin).where(Admin.id == notice.admin_id))
    admin_obj = admin_result.scalar_one_or_none()
    return _to_response(notice, admin_obj.name if admin_obj else None)


@router.delete("/{notice_id}")
async def delete_notice(
    notice_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """공지사항 삭제"""
    result = await db.execute(select(Notice).where(Notice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise HTTPException(status_code=404, detail="공지사항을 찾을 수 없습니다")

    await db.delete(notice)
    await db.commit()
    return {"message": "공지사항이 삭제되었습니다"}
