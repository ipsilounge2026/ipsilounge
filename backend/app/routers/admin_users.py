import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.user import User
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/users", tags=["관리자-회원"])


@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    member_type: str | None = None,
    is_active: bool | None = None,
    exclude_branch_manager: bool = False,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """회원 목록 (member_type, is_active, exclude_branch_manager 필터 지원)"""
    query = select(User)
    count_query = select(func.count()).select_from(User)

    if search:
        search_filter = User.name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    if member_type:
        query = query.where(User.member_type == member_type)
        count_query = count_query.where(User.member_type == member_type)
    elif exclude_branch_manager:
        query = query.where(User.member_type != "branch_manager")
        count_query = count_query.where(User.member_type != "branch_manager")

    if is_active is not None:
        query = query.where(User.is_active == is_active)
        count_query = count_query.where(User.is_active == is_active)

    query = query.order_by(User.created_at.desc()).offset((page - 1) * size).limit(size)

    result = await db.execute(query)
    users = result.scalars().all()

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    return {"items": users, "total": total, "page": page, "size": size}


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_detail(
    user_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """회원 상세"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다")
    return user


@router.put("/{user_id}/activate")
async def activate_user(
    user_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """회원 활성화 (지점 담당자 승인 포함)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다")

    user.is_active = True
    await db.commit()
    return {"message": "사용자가 활성화되었습니다"}


@router.put("/{user_id}/deactivate")
async def deactivate_user(
    user_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """회원 비활성화"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다")

    user.is_active = False
    await db.commit()
    return {"message": "사용자가 비활성화되었습니다"}
