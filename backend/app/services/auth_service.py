from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import Admin
from app.models.user import User
from app.schemas.user import TokenResponse, UserRegister
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


async def register_user(data: UserRegister, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 등록된 이메일입니다")

    # 지점 담당자는 관리자 승인 전까지 비활성 상태
    is_active = data.member_type != "branch_manager"

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        name=data.name,
        phone=data.phone,
        member_type=data.member_type,
        student_name=data.student_name,
        student_birth=data.student_birth,
        birth_date=data.birth_date,
        school_name=data.school_name,
        grade=data.grade,
        branch_name=data.branch_name,
        is_active=is_active,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def login_user(email: str, password: str, db: AsyncSession) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다")
    if not user.is_active:
        if user.member_type == "branch_manager":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="승인 대기 중입니다. 관리자 승인 후 로그인할 수 있습니다.",
            )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="비활성화된 계정입니다")

    token_data = {"sub": str(user.id), "role": "user", "member_type": user.member_type}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


async def login_admin(email: str, password: str, db: AsyncSession) -> TokenResponse:
    result = await db.execute(select(Admin).where(Admin.email == email))
    admin = result.scalar_one_or_none()
    if admin is None or not verify_password(password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다")

    token_data = {"sub": str(admin.id), "role": "admin"}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


async def refresh_tokens(refresh_token: str, db: AsyncSession) -> TokenResponse:
    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 리프레시 토큰입니다")

    role = payload.get("role")
    sub = payload.get("sub")
    token_data = {"sub": sub, "role": role}

    # member_type 보존
    if payload.get("member_type"):
        token_data["member_type"] = payload["member_type"]

    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )
