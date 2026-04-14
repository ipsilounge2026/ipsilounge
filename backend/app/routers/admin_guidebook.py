"""
가이드북 관리 API (관리자 전용)

시점별(T1-T4) + 상담 항목별 가이드 관리

- GET    /api/admin/guidebooks              전체 또는 시점별 목록
- PUT    /api/admin/guidebooks/bulk         시점별 일괄 저장 (upsert)
- DELETE /api/admin/guidebooks/{id}         개별 삭제
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.guidebook import Guidebook
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/guidebooks", tags=["가이드북 관리"])

VALID_TIMINGS = ("T1", "T2", "T3", "T4")


class BulkSaveItem(BaseModel):
    topic_id: str
    title: str
    content: str


class BulkSaveRequest(BaseModel):
    timing: str
    items: list[BulkSaveItem]


def _to_dict(g: Guidebook) -> dict:
    return {
        "id": str(g.id),
        "timing": g.category,
        "topic_id": g.session_timing,
        "title": g.title,
        "content": g.content,
        "sort_order": g.sort_order,
        "is_active": g.is_active,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "updated_at": g.updated_at.isoformat() if g.updated_at else None,
    }


@router.get("")
async def list_guidebooks(
    timing: str | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """가이드북 목록 (시점별 필터 가능)"""
    q = select(Guidebook).order_by(Guidebook.category, Guidebook.sort_order, Guidebook.created_at)
    if timing:
        q = q.where(Guidebook.category == timing)
    if admin.role == "senior":
        q = q.where(Guidebook.is_active == True)  # noqa: E712

    result = await db.execute(q)
    items = result.scalars().all()
    return {"guidebooks": [_to_dict(g) for g in items]}


@router.put("/bulk")
async def bulk_save_guidebooks(
    data: BulkSaveRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """시점별 가이드 일괄 저장 (upsert: 내용 있으면 생성/수정, 빈 내용이면 삭제)"""
    if admin.role == "senior":
        raise HTTPException(status_code=403, detail="관리자만 가이드북을 수정할 수 있습니다")
    if data.timing not in VALID_TIMINGS:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 시점: {data.timing}")

    for idx, item in enumerate(data.items):
        result = await db.execute(
            select(Guidebook).where(
                Guidebook.category == data.timing,
                Guidebook.session_timing == item.topic_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            if item.content.strip():
                existing.title = item.title
                existing.content = item.content
                existing.sort_order = idx
            else:
                await db.delete(existing)
        else:
            if item.content.strip():
                g = Guidebook(
                    category=data.timing,
                    title=item.title,
                    content=item.content,
                    session_timing=item.topic_id,
                    sort_order=idx,
                    is_active=True,
                )
                db.add(g)

    await db.commit()
    return {"ok": True}


@router.delete("/{guidebook_id}")
async def delete_guidebook(
    guidebook_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """가이드북 개별 삭제 (관리자만)"""
    if admin.role == "senior":
        raise HTTPException(status_code=403, detail="관리자만 가이드북을 삭제할 수 있습니다")

    result = await db.execute(select(Guidebook).where(Guidebook.id == guidebook_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="가이드북을 찾을 수 없습니다")

    await db.delete(g)
    await db.commit()
    return {"ok": True}
