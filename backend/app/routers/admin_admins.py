import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin, AdminStudentAssignment, SeniorStudentAssignment
from app.models.analysis_order import AnalysisOrder
from app.models.consultation_booking import ConsultationBooking
from app.models.counselor_change_request import CounselorChangeRequest
from app.models.senior_change_request import SeniorChangeRequest
from app.models.user import User
from app.utils.dependencies import get_current_admin, get_current_super_admin
from app.utils.security import hash_password

router = APIRouter(prefix="/api/admin/admins", tags=["관리자 계정 관리"])

# 전체 메뉴 목록 (키, 라벨)
ALL_MENUS = [
    {"key": "dashboard", "label": "대시보드"},
    {"key": "analysis", "label": "분석 관리"},
    {"key": "consultation", "label": "상담 관리"},
    {"key": "surveys", "label": "사전설문 관리"},
    {"key": "users", "label": "회원 관리"},
    {"key": "payments", "label": "결제 현황"},
    {"key": "admins", "label": "담당자 관리"},
    {"key": "seminar", "label": "설명회 관리"},
    {"key": "notice", "label": "공지사항 관리"},
    {"key": "assignments", "label": "학생-담당자 매칭"},
    {"key": "settings", "label": "설정"},
]


VALID_ROLES = {"super_admin", "admin", "counselor", "senior"}

ROLE_LABELS = {
    "super_admin": "최고관리자",
    "admin": "관리자",
    "counselor": "상담사",
    "senior": "선배",
}

# 역할별 기본 메뉴 (새 계정 생성 시 기본값)
ROLE_DEFAULT_MENUS = {
    "admin": ["dashboard", "analysis", "consultation", "surveys", "seminar", "notice", "assignments"],
    "counselor": ["dashboard", "consultation", "surveys"],
    "senior": ["dashboard", "consultation", "surveys"],
}


class AdminCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "admin"  # admin / super_admin / counselor
    allowed_menus: list[str] | None = None


class AdminPromote(BaseModel):
    user_id: str
    role: str = "admin"  # admin / counselor
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
    """전체 메뉴 목록 조회 (super_admin 전용) + 역할별 기본 메뉴"""
    return {
        "menus": ALL_MENUS,
        "role_defaults": ROLE_DEFAULT_MENUS,
    }


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
            "user_id": str(a.user_id) if a.user_id else None,
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


@router.post("/promote")
async def promote_user_to_admin(
    data: AdminPromote,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """회원을 관리자로 승격 (super_admin 전용)"""
    if data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 역할입니다. ({', '.join(VALID_ROLES)})")

    # 사용자 조회
    try:
        uid = uuid.UUID(data.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="유효하지 않은 사용자 ID입니다.")
    user_result = await db.execute(select(User).where(User.id == uid))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    # 이미 관리자인지 확인
    existing = await db.execute(select(Admin).where(Admin.email == user.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 관리자로 등록된 사용자입니다.")

    allowed = ",".join(data.allowed_menus) if data.allowed_menus else "dashboard"
    admin = Admin(
        email=user.email,
        password_hash=user.password_hash,
        name=user.name,
        role=data.role,
        allowed_menus=allowed,
        user_id=str(user.id),
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
    try:
        aid = uuid.UUID(admin_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="유효하지 않은 관리자 ID입니다.")
    result = await db.execute(select(Admin).where(Admin.id == aid))
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

    try:
        aid = uuid.UUID(admin_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="유효하지 않은 관리자 ID입니다.")
    result = await db.execute(select(Admin).where(Admin.id == aid))
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
    try:
        aid = uuid.UUID(assignment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="유효하지 않은 ID입니다.")
    await db.execute(delete(AdminStudentAssignment).where(AdminStudentAssignment.id == aid))
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


@router.get("/assignments/unmatched")
async def list_unmatched_students(
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """담당자 미매칭 학생 목록 (라운지 신청 또는 상담 신청한 학생 중 매칭 안 된 학생)"""
    # 매칭된 user_id 목록
    matched_result = await db.execute(select(AdminStudentAssignment.user_id))
    matched_user_ids = set(row[0] for row in matched_result.all())

    # 라운지 신청한 user_id
    analysis_result = await db.execute(
        select(AnalysisOrder.user_id).distinct()
    )
    analysis_user_ids = set(row[0] for row in analysis_result.all())

    # 상담 신청한 user_id
    booking_result = await db.execute(
        select(ConsultationBooking.user_id).where(
            ConsultationBooking.status != "cancelled"
        ).distinct()
    )
    booking_user_ids = set(row[0] for row in booking_result.all())

    # 라운지 또는 상담 신청했지만 매칭 안 된 user_id
    unmatched_ids = (analysis_user_ids | booking_user_ids) - matched_user_ids

    if not unmatched_ids:
        return []

    users_result = await db.execute(
        select(User)
        .where(User.id.in_(unmatched_ids))
        .where(User.member_type != "branch_manager")
        .order_by(User.created_at.desc())
    )
    users = users_result.scalars().all()

    items = []
    for user in users:
        # 어떤 서비스를 신청했는지 표기
        services = []
        if user.id in analysis_user_ids:
            services.append("라운지")
        if user.id in booking_user_ids:
            services.append("상담")

        items.append({
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "member_type": user.member_type,
            "student_name": user.student_name,
            "services": services,
            "created_at": user.created_at.isoformat(),
        })

    return items


# --- 담당자 변경 요청 관리 ---

@router.get("/change-requests")
async def list_change_requests(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """담당자 변경 요청 목록 (super_admin 전용)"""
    query = select(CounselorChangeRequest).order_by(CounselorChangeRequest.created_at.desc())
    if status_filter:
        query = query.where(CounselorChangeRequest.status == status_filter)
    result = await db.execute(query)
    requests = result.scalars().all()

    items = []
    for req in requests:
        user_result = await db.execute(select(User).where(User.id == req.user_id))
        user = user_result.scalar_one_or_none()

        current_admin_name = None
        if req.current_admin_id:
            a_result = await db.execute(select(Admin).where(Admin.id == req.current_admin_id))
            a = a_result.scalar_one_or_none()
            current_admin_name = a.name if a else None

        requested_admin_name = "추천 희망"
        if req.requested_admin_id:
            a_result = await db.execute(select(Admin).where(Admin.id == req.requested_admin_id))
            a = a_result.scalar_one_or_none()
            requested_admin_name = a.name if a else "알 수 없음"

        items.append({
            "id": str(req.id),
            "user_id": str(req.user_id),
            "user_name": user.name if user else "",
            "user_email": user.email if user else "",
            "current_admin_name": current_admin_name,
            "requested_admin_name": requested_admin_name,
            "requested_admin_id": str(req.requested_admin_id) if req.requested_admin_id else None,
            "reason": req.reason,
            "status": req.status,
            "admin_memo": req.admin_memo,
            "created_at": req.created_at.isoformat(),
            "processed_at": req.processed_at.isoformat() if req.processed_at else None,
        })
    return items


class ChangeRequestProcess(BaseModel):
    status: str  # approved / rejected
    new_admin_id: str | None = None  # 승인 시 배정할 관리자 (추천 희망인 경우 필요)
    admin_memo: str | None = None


@router.put("/change-requests/{request_id}")
async def process_change_request(
    request_id: str,
    data: ChangeRequestProcess,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """담당자 변경 요청 처리 (super_admin 전용)"""
    try:
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="유효하지 않은 ID입니다.")

    result = await db.execute(select(CounselorChangeRequest).where(CounselorChangeRequest.id == rid))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="변경 요청을 찾을 수 없습니다.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="이미 처리된 요청입니다.")

    req.status = data.status
    req.admin_memo = data.admin_memo
    req.processed_at = datetime.utcnow()

    if data.status == "approved":
        new_admin_id = data.new_admin_id or (str(req.requested_admin_id) if req.requested_admin_id else None)
        if not new_admin_id:
            raise HTTPException(status_code=400, detail="배정할 담당자를 지정해주세요.")

        await db.execute(
            delete(AdminStudentAssignment).where(AdminStudentAssignment.user_id == req.user_id)
        )
        new_assignment = AdminStudentAssignment(
            admin_id=uuid.UUID(new_admin_id),
            user_id=req.user_id,
        )
        db.add(new_assignment)

    await db.commit()
    return {"message": f"변경 요청이 {'승인' if data.status == 'approved' else '거절'}되었습니다."}


# --- 학생-선배 매칭 ---


@router.get("/senior-assignments")
async def list_senior_assignments(
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """학생-선배 매칭 목록"""
    if current_admin.role == "super_admin":
        result = await db.execute(select(SeniorStudentAssignment))
    elif current_admin.role == "senior":
        result = await db.execute(
            select(SeniorStudentAssignment).where(SeniorStudentAssignment.senior_id == current_admin.id)
        )
    else:
        result = await db.execute(select(SeniorStudentAssignment))
    assignments = result.scalars().all()

    items = []
    for a in assignments:
        senior_result = await db.execute(select(Admin).where(Admin.id == a.senior_id))
        senior = senior_result.scalar_one_or_none()
        user_result = await db.execute(select(User).where(User.id == a.user_id))
        user = user_result.scalar_one_or_none()
        items.append({
            "id": str(a.id),
            "senior_id": str(a.senior_id),
            "senior_name": senior.name if senior else "",
            "user_id": str(a.user_id),
            "user_name": user.name if user else "",
            "user_email": user.email if user else "",
            "created_at": a.created_at.isoformat(),
        })
    return items


@router.post("/senior-assignments")
async def create_senior_assignment(
    data: AssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """학생-선배 매칭 생성 (super_admin 전용)"""
    # 선배 역할 확인
    senior_result = await db.execute(select(Admin).where(Admin.id == data.admin_id))
    senior = senior_result.scalar_one_or_none()
    if not senior or senior.role != "senior":
        raise HTTPException(status_code=400, detail="선배 역할의 담당자만 매칭할 수 있습니다.")

    existing = await db.execute(
        select(SeniorStudentAssignment).where(
            SeniorStudentAssignment.senior_id == data.admin_id,
            SeniorStudentAssignment.user_id == data.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 매칭된 조합입니다.")

    assignment = SeniorStudentAssignment(senior_id=data.admin_id, user_id=data.user_id)
    db.add(assignment)
    await db.commit()
    return {"message": "선배 매칭 완료"}


@router.delete("/senior-assignments/{assignment_id}")
async def delete_senior_assignment(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """학생-선배 매칭 삭제 (super_admin 전용)"""
    try:
        aid = uuid.UUID(assignment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="유효하지 않은 ID입니다.")
    await db.execute(delete(SeniorStudentAssignment).where(SeniorStudentAssignment.id == aid))
    await db.commit()
    return {"message": "선배 매칭 해제 완료"}


# --- 선배 변경 요청 관리 ---


@router.get("/senior-change-requests")
async def list_senior_change_requests(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """선배 변경 요청 목록 (super_admin 전용)"""
    query = select(SeniorChangeRequest).order_by(SeniorChangeRequest.created_at.desc())
    if status_filter:
        query = query.where(SeniorChangeRequest.status == status_filter)
    result = await db.execute(query)
    requests = result.scalars().all()

    items = []
    for req in requests:
        user_result = await db.execute(select(User).where(User.id == req.user_id))
        user = user_result.scalar_one_or_none()

        current_senior_name = None
        if req.current_senior_id:
            s_result = await db.execute(select(Admin).where(Admin.id == req.current_senior_id))
            s = s_result.scalar_one_or_none()
            current_senior_name = s.name if s else None

        requested_senior_name = "추천 희망"
        if req.requested_senior_id:
            s_result = await db.execute(select(Admin).where(Admin.id == req.requested_senior_id))
            s = s_result.scalar_one_or_none()
            requested_senior_name = s.name if s else "알 수 없음"

        items.append({
            "id": str(req.id),
            "user_id": str(req.user_id),
            "user_name": user.name if user else "",
            "user_email": user.email if user else "",
            "current_senior_name": current_senior_name,
            "requested_senior_name": requested_senior_name,
            "requested_senior_id": str(req.requested_senior_id) if req.requested_senior_id else None,
            "reason": req.reason,
            "status": req.status,
            "admin_memo": req.admin_memo,
            "created_at": req.created_at.isoformat(),
            "processed_at": req.processed_at.isoformat() if req.processed_at else None,
        })
    return items


@router.put("/senior-change-requests/{request_id}")
async def process_senior_change_request(
    request_id: str,
    data: ChangeRequestProcess,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_super_admin),
):
    """선배 변경 요청 처리 (super_admin 전용)"""
    try:
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="유효하지 않은 ID입니다.")

    result = await db.execute(select(SeniorChangeRequest).where(SeniorChangeRequest.id == rid))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="변경 요청을 찾을 수 없습니다.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="이미 처리된 요청입니다.")

    req.status = data.status
    req.admin_memo = data.admin_memo
    req.processed_at = datetime.utcnow()

    if data.status == "approved":
        new_senior_id = data.new_admin_id or (str(req.requested_senior_id) if req.requested_senior_id else None)
        if not new_senior_id:
            raise HTTPException(status_code=400, detail="배정할 선배를 지정해주세요.")

        await db.execute(
            delete(SeniorStudentAssignment).where(SeniorStudentAssignment.user_id == req.user_id)
        )
        new_assignment = SeniorStudentAssignment(
            senior_id=uuid.UUID(new_senior_id),
            user_id=req.user_id,
        )
        db.add(new_assignment)

    await db.commit()
    return {"message": f"선배 변경 요청이 {'승인' if data.status == 'approved' else '거절'}되었습니다."}
