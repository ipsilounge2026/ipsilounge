"""Dev 전용 인증 우회 라우터 (DEV_MODE=true 일 때만 마운트).

L3 검증 harness 가 매번 로그인 폼을 거치지 않고 시드된 사용자로
즉시 정상 JWT 를 받아 검증을 시작할 수 있게 한다.

운영 빌드에서는:
  1) main.py 에서 DEV_MODE 가드로 include_router 자체가 호출되지 않음
  2) 각 엔드포인트 진입점에서도 settings.DEV_MODE 한 번 더 체크 (이중 가드)
  3) 모든 응답에 X-Dev-Mode: true 헤더 추가 (운영 트래픽 혼동 방지)

엔드포인트:
  GET  /api/dev/health                     — DEV_MODE 활성 여부 확인
  POST /api/dev/login-as/{identifier}      — 시드 사용자/관리자로 정상 JWT 발급

식별자(identifier):
  - 학생/학부모: User.email 의 local-part (예: 'student.t1' or 'parent.a')
                  또는 시드 정의의 식별자 (예: 'student_t1', 'parent_a')
  - 관리자: 'admin_a' / 'counselor_a' (Admin.email 의 local-part 도 허용)

spec: ipsilounge/docs/test-environment-spec.md §4
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.admin import Admin
from app.models.user import User
from app.schemas.user import TokenResponse
from app.utils.security import create_access_token, create_refresh_token

router = APIRouter(prefix="/api/dev", tags=["dev"])


# ─── 이중 가드: 라우터 진입점에서 매번 체크 ──────────────────────────
def _enforce_dev_mode() -> None:
    if not settings.DEV_MODE:
        # 운영에서는 라우터가 마운트되지 않아 이 코드 자체가 도달 불가하지만
        # 방어적 이중 가드 (실수로 마운트되는 사고 방지)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="dev endpoint not available",
        )


def _identifier_to_email_candidates(identifier: str) -> list[str]:
    """식별자로부터 시도할 이메일 후보 목록 생성.

    'student_t1'  → ['student_t1@test.local', 'student.t1@test.local']
    'student.t1' → ['student.t1@test.local', 'student_t1@test.local']
    'admin_a'    → ['admin_a@test.local', 'admin.a@test.local']
    'foo@bar'    → ['foo@bar'] (이미 이메일 형식)
    """
    if "@" in identifier:
        return [identifier]
    candidates = [
        f"{identifier}@test.local",
        f"{identifier.replace('_', '.')}@test.local",
        f"{identifier.replace('.', '_')}@test.local",
    ]
    # 중복 제거 (순서 보존)
    seen = set()
    out = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


@router.get("/health")
async def dev_health(response: Response):
    """DEV_MODE 활성 여부 확인 + dev 라우터 마운트 신호."""
    _enforce_dev_mode()
    response.headers["X-Dev-Mode"] = "true"
    return {
        "dev_mode": True,
        "dev_db_path": settings.DEV_SQLITE_PATH,
    }


@router.post("/login-as/{identifier}", response_model=TokenResponse)
async def dev_login_as(
    identifier: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """시드 사용자/관리자의 정상 JWT 발급.

    응답 형식은 운영 /api/auth/login 과 100% 동일 (TokenResponse).
    """
    _enforce_dev_mode()
    response.headers["X-Dev-Mode"] = "true"

    candidates = _identifier_to_email_candidates(identifier)

    # 1) 사용자(User) 우선 시도
    for email in candidates:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is not None:
            token_data = {
                "sub": str(user.id),
                "role": "user",
                "member_type": user.member_type,
            }
            return TokenResponse(
                access_token=create_access_token(token_data),
                refresh_token=create_refresh_token(token_data),
            )

    # 2) 관리자(Admin) 시도
    for email in candidates:
        result = await db.execute(select(Admin).where(Admin.email == email))
        admin = result.scalar_one_or_none()
        if admin is not None:
            token_data = {"sub": str(admin.id), "role": "admin"}
            return TokenResponse(
                access_token=create_access_token(token_data),
                refresh_token=create_refresh_token(token_data),
            )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"identifier '{identifier}' not found in users or admins (tried emails: {candidates})",
    )
