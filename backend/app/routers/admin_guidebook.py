"""
가이드북 관리 API (관리자 전용)

- GET    /api/admin/guidebooks           전체 목록
- POST   /api/admin/guidebooks           생성
- PUT    /api/admin/guidebooks/{id}      수정
- DELETE /api/admin/guidebooks/{id}      삭제
- PUT    /api/admin/guidebooks/reorder   정렬 순서 변경
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

VALID_CATEGORIES = ("manual", "timing_guide", "caution")


class GuidebookCreate(BaseModel):
    category: str
    title: str
    content: str
    sort_order: int = 0
    session_timing: str | None = None
    is_active: bool = True


class GuidebookUpdate(BaseModel):
    category: str | None = None
    title: str | None = None
    content: str | None = None
    sort_order: int | None = None
    session_timing: str | None = None
    is_active: bool | None = None


class ReorderItem(BaseModel):
    id: str
    sort_order: int


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


def _to_dict(g: Guidebook) -> dict:
    return {
        "id": str(g.id),
        "category": g.category,
        "title": g.title,
        "content": g.content,
        "sort_order": g.sort_order,
        "session_timing": g.session_timing,
        "is_active": g.is_active,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "updated_at": g.updated_at.isoformat() if g.updated_at else None,
    }


@router.get("")
async def list_guidebooks(
    category: str | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """가이드북 전체 목록 (관리자: 전체, 선배: active만)"""
    q = select(Guidebook).order_by(Guidebook.category, Guidebook.sort_order, Guidebook.created_at)
    if category:
        q = q.where(Guidebook.category == category)
    if admin.role == "senior":
        q = q.where(Guidebook.is_active == True)  # noqa: E712

    result = await db.execute(q)
    items = result.scalars().all()
    return {"guidebooks": [_to_dict(g) for g in items]}


@router.post("")
async def create_guidebook(
    data: GuidebookCreate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """가이드북 생성 (관리자만)"""
    if admin.role == "senior":
        raise HTTPException(status_code=403, detail="관리자만 가이드북을 생성할 수 있습니다")
    if data.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 카테고리: {data.category}")

    g = Guidebook(
        category=data.category,
        title=data.title,
        content=data.content,
        sort_order=data.sort_order,
        session_timing=data.session_timing,
        is_active=data.is_active,
    )
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return _to_dict(g)


@router.put("/{guidebook_id}")
async def update_guidebook(
    guidebook_id: uuid.UUID,
    data: GuidebookUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """가이드북 수정 (관리자만)"""
    if admin.role == "senior":
        raise HTTPException(status_code=403, detail="관리자만 가이드북을 수정할 수 있습니다")

    result = await db.execute(select(Guidebook).where(Guidebook.id == guidebook_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="가이드북을 찾을 수 없습니다")

    if data.category is not None:
        if data.category not in VALID_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"유효하지 않은 카테고리: {data.category}")
        g.category = data.category
    if data.title is not None:
        g.title = data.title
    if data.content is not None:
        g.content = data.content
    if data.sort_order is not None:
        g.sort_order = data.sort_order
    if data.session_timing is not None:
        g.session_timing = data.session_timing
    if data.is_active is not None:
        g.is_active = data.is_active

    await db.commit()
    await db.refresh(g)
    return _to_dict(g)


@router.delete("/{guidebook_id}")
async def delete_guidebook(
    guidebook_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """가이드북 삭제 (관리자만)"""
    if admin.role == "senior":
        raise HTTPException(status_code=403, detail="관리자만 가이드북을 삭제할 수 있습니다")

    result = await db.execute(select(Guidebook).where(Guidebook.id == guidebook_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="가이드북을 찾을 수 없습니다")

    await db.delete(g)
    await db.commit()
    return {"ok": True}


@router.put("/reorder")
async def reorder_guidebooks(
    data: ReorderRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """가이드북 정렬 순서 일괄 변경 (관리자만)"""
    if admin.role == "senior":
        raise HTTPException(status_code=403, detail="관리자만 정렬 순서를 변경할 수 있습니다")

    for item in data.items:
        result = await db.execute(
            select(Guidebook).where(Guidebook.id == uuid.UUID(item.id))
        )
        g = result.scalar_one_or_none()
        if g:
            g.sort_order = item.sort_order

    await db.commit()
    return {"ok": True}
