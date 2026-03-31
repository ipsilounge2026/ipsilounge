from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.utils.dependencies import get_current_super_admin
from app.utils.security import hash_password

router = APIRouter(prefix="/api/admin/admins", tags=["관리자 계정 관리"])


class AdminCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "admin"  # admin / super_admin


class AdminUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None


@router.get("")
async def list_admins(
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """관리자 목록 조회 (super_admin 전용)"""
    result = await db.execute(select(Admin).order_by(Admin.created_at))
    admins = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "email": a.email,
            "name": a.name,
            "role": a.role,
            "is_active": a.is_active,
            "created_at": a.created_at.isoformat(),
        }
        for a in admins
    ]


@router.post("")
async def create_admin(
    data: AdminCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """관리자 계정 생성 (super_admin 전용)"""
    existing = await db.execute(select(Admin).where(Admin.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다.")

    admin = Admin(
        email=data.email,
        password_hash=hash_password(data.password),
        name=data.name,
        role=data.role,
    )
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    return {"id": str(admin.id), "email": admin.email, "name": admin.name, "role": admin.role}


@router.put("/{admin_id}")
async def update_admin(
    admin_id: str,
    data: AdminUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """관리자 정보 수정 (super_admin 전용)"""
    result = await db.execute(select(Admin).where(Admin.id == admin_id))
    admin = result.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=404, detail="관리자를 찾을 수 없습니다.")

    # 자신의 계정은 비활성화 불가
    if str(admin.id) == str(current_admin.id) and data.is_active is False:
        raise HTTPException(status_code=400, detail="본인 계정을 비활성화할 수 없습니다.")

    if data.name is not None:
        admin.name = data.name
    if data.role is not None:
        admin.role = data.role
    if data.is_active is not None:
        admin.is_active = data.is_active

    await db.commit()
    return {"message": "수정 완료"}


@router.put("/{admin_id}/reset-password")
async def reset_admin_password(
    admin_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """관리자 비밀번호 초기화 (super_admin 전용)"""
    new_password = body.get("new_password")
    if not new_password or len(new_password) < 8:
        raise HTTPException(status_code=400, detail="비밀번호는 8자 이상이어야 합니다.")

    result = await db.execute(select(Admin).where(Admin.id == admin_id))
    admin = result.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=404, detail="관리자를 찾을 수 없습니다.")

    admin.password_hash = hash_password(new_password)
    await db.commit()
    return {"message": "비밀번호 초기화 완료"}
