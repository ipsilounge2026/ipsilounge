from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin, AdminStudentAssignment
from app.models.user import User
from app.utils.dependencies import get_current_admin, get_current_super_admin
from app.utils.security import hash_password

router = APIRouter(prefix="/api/admin/admins", tags=["관리자 계정 관리"])

# 전체 메뉴 목록 (키, 라벨)
ALL_MENUS = [
    {"key": "dashboard", "label": "대시보드"},
    {"key": "analysis", "label": "분석 관리"},
    {"key": "consultation", "label": "상담 관리"},
    {"key": "users", "label": "회원 관리"},
    {"key": "payments", "label": "결제 현황"},
    {"key": "admins", "label": "담당자 관리"},
    {"key": "assignments", "label": "학생-담당자 매칭"},
    {"key": "settings", "label": "설정"},
]


class AdminCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "admin"  # admin / super_admin
    allowed_menus: list[str] | None = None


class AdminUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    allowed_menus: list[str] | None = None


class AssignmentCreate(BaseModel):
    admin_id: str
    user_id: str


# --- 내 정보 ---

@router.get("/me")
async def get_my_info(
    current_admin: Admin = Depends(get_current_admin),
):
    """현재 로그인한 관리자 정보"""
    if current_admin.role == "super_admin":
        menus = [m["key"] for m in ALL_MENUS]
    else:
        menus = current_admin.allowed_menus.split(",") if current_admin.allowed_menus else ["dashboard"]
    return {
        "id": str(current_admin.id),
        "email": current_admin.email,
        "name": current_admin.name,
        "role": current_admin.role,
        "allowed_menus": menus,
    }


@router.get("/menus")
async def get_all_menus(
    current_admin: Admin = Depends(get_current_super_admin),
):
    """전체 메뉴 목록 조회 (super_admin 전용)"""
    return ALL_MENUS


# --- 관리자 계정 관리 ---

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
            "allowed_menus": a.allowed_menus.split(",") if a.allowed_menus else [],
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

    allowed = ",".join(data.allowed_menus) if data.allowed_menus else "dashboard"
    admin = Admin(
        email=data.email,
        password_hash=hash_password(data.password),
        name=data.name,
        role=data.role,
        allowed_menus=allowed,
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

    if str(admin.id) == str(current_admin.id) and data.is_active is False:
        raise HTTPException(status_code=400, detail="본인 계정을 비활성화할 수 없습니다.")

    if data.name is not None:
        admin.name = data.name
    if data.role is not None:
        admin.role = data.role
    if data.is_active is not None:
        admin.is_active = data.is_active
    if data.allowed_menus is not None:
        admin.allowed_menus = ",".join(data.allowed_menus)

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


# --- 학생-담당자 매칭 ---

@router.get("/assignments")
async def list_assignments(
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """학생-담당자 매칭 목록"""
    if current_admin.role == "super_admin":
        result = await db.execute(select(AdminStudentAssignment))
    else:
        result = await db.execute(
            select(AdminStudentAssignment).where(AdminStudentAssignment.admin_id == current_admin.id)
        )
    assignments = result.scalars().all()

    items = []
    for a in assignments:
        admin_result = await db.execute(select(Admin).where(Admin.id == a.admin_id))
        admin = admin_result.scalar_one_or_none()
        user_result = await db.execute(select(User).where(User.id == a.user_id))
        user = user_result.scalar_one_or_none()
        items.append({
            "id": str(a.id),
            "admin_id": str(a.admin_id),
            "admin_name": admin.name if admin else "",
            "user_id": str(a.user_id),
            "user_name": user.name if user else "",
            "user_email": user.email if user else "",
            "created_at": a.created_at.isoformat(),
        })
    return items


@router.post("/assignments")
async def create_assignment(
    data: AssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """학생-담당자 매칭 생성 (super_admin 전용)"""
    existing = await db.execute(
        select(AdminStudentAssignment).where(
            AdminStudentAssignment.admin_id == data.admin_id,
            AdminStudentAssignment.user_id == data.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 매칭된 조합입니다.")

    assignment = AdminStudentAssignment(admin_id=data.admin_id, user_id=data.user_id)
    db.add(assignment)
    await db.commit()
    return {"message": "매칭 완료"}


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """학생-담당자 매칭 삭제 (super_admin 전용)"""
    await db.execute(delete(AdminStudentAssignment).where(AdminStudentAssignment.id == assignment_id))
    await db.commit()
    return {"message": "매칭 해제 완료"}


@router.get("/my-students")
async def get_my_students(
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """내 담당 학생 목록"""
    result = await db.execute(
        select(AdminStudentAssignment).where(AdminStudentAssignment.admin_id == current_admin.id)
    )
    assignments = result.scalars().all()

    students = []
    for a in assignments:
        user_result = await db.execute(select(User).where(User.id == a.user_id))
        user = user_result.scalar_one_or_none()
        if user:
            students.append({
                "id": str(user.id),
                "name": user.name,
                "email": user.email,
                "phone": user.phone,
                "member_type": user.member_type,
                "student_name": user.student_name,
                "created_at": user.created_at.isoformat(),
            })
    return students
