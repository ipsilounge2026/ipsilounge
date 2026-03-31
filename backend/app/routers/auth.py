import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.schemas.user import (
    AdminLogin,
    TokenRefresh,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.services.auth_service import login_admin, login_user, refresh_tokens, register_user
from app.services.email_service import send_password_reset_email
from app.utils.security import hash_password

router = APIRouter(prefix="/api/auth", tags=["인증"])


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/register", response_model=UserResponse)
async def api_register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """회원가입"""
    return await register_user(data, db)


@router.post("/login", response_model=TokenResponse)
async def api_login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    """사용자 로그인"""
    return await login_user(data.email, data.password, db)


@router.post("/refresh", response_model=TokenResponse)
async def api_refresh(data: TokenRefresh, db: AsyncSession = Depends(get_db)):
    """토큰 갱신"""
    return await refresh_tokens(data.refresh_token, db)


@router.post("/admin/login", response_model=TokenResponse)
async def api_admin_login(data: AdminLogin, db: AsyncSession = Depends(get_db)):
    """관리자 로그인"""
    return await login_admin(data.email, data.password, db)


@router.post("/forgot-password")
async def api_forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """비밀번호 재설정 링크 이메일 발송"""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    # 보안상 사용자 존재 여부를 노출하지 않음
    if user and user.is_active:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)
        reset_token = PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=expires_at,
        )
        db.add(reset_token)
        await db.commit()

        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        await send_password_reset_email(user.email, user.name, reset_link)

    return {"message": "입력하신 이메일로 비밀번호 재설정 링크를 발송했습니다."}


@router.post("/reset-password")
async def api_reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """비밀번호 재설정"""
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == data.token,
            PasswordResetToken.is_used == False,  # noqa: E712
            PasswordResetToken.expires_at > datetime.utcnow(),
        )
    )
    reset_token = result.scalar_one_or_none()
    if not reset_token:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 링크입니다.")

    user_result = await db.execute(select(User).where(User.id == reset_token.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user.password_hash = hash_password(data.new_password)
    reset_token.is_used = True
    await db.commit()

    return {"message": "비밀번호가 성공적으로 변경되었습니다."}
