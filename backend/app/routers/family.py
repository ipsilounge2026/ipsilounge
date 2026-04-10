"""학생-학부모 가족 연결 API

엔드포인트:
- POST /api/family/invite       내가 코드를 생성 (학생/학부모 모두 가능)
- POST /api/family/connect      받은 코드로 연결 활성화
- GET  /api/family/links        내 가족 연결 목록 조회
- DELETE /api/family/links/{id} 연결 해제 (학부모만 가능)

규칙:
- 학생끼리 / 학부모끼리는 연결 불가
- 본인이 본인 코드를 사용하는 것 금지
- 코드는 7일 만료, 1회 사용
- 동일 (parent, child) 쌍이 이미 active 면 중복 생성 차단
"""

import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.family_invite import FamilyInvite
from app.models.family_link import FamilyLink
from app.models.user import User
from app.schemas.family import (
    ConnectRequest,
    FamilyLinkListResponse,
    FamilyLinkResponse,
    FamilyMemberInfo,
    InviteCreateResponse,
)
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/family", tags=["가족 연결"])

# 코드 길이 (대문자+숫자, 헷갈리는 0/O/1/I 제외)
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 8
_INVITE_TTL_DAYS = 7


def _generate_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))


async def _generate_unique_code(db: AsyncSession) -> str:
    """유일한 코드 생성 (충돌 시 재시도)"""
    for _ in range(10):
        code = _generate_code()
        result = await db.execute(select(FamilyInvite).where(FamilyInvite.code == code))
        if result.scalar_one_or_none() is None:
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="초대 코드 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
    )


def _ensure_eligible_role(user: User) -> None:
    if user.member_type not in ("student", "parent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="학생 또는 학부모 계정만 가족 연결을 사용할 수 있습니다",
        )


@router.post("/invite", response_model=InviteCreateResponse)
async def create_invite(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """가족 연결 초대 코드 생성

    학생이 생성하면 → 학부모가 입력해서 연결
    학부모가 생성하면 → 학생이 입력해서 연결
    """
    _ensure_eligible_role(user)

    code = await _generate_unique_code(db)
    invite = FamilyInvite(
        inviter_id=user.id,
        inviter_role=user.member_type,
        code=code,
        expires_at=datetime.utcnow() + timedelta(days=_INVITE_TTL_DAYS),
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    return InviteCreateResponse(
        code=invite.code,
        expires_at=invite.expires_at,
        inviter_role=invite.inviter_role,
    )


@router.post("/connect", response_model=FamilyLinkResponse)
async def connect_with_code(
    data: ConnectRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """초대 코드로 연결 활성화"""
    _ensure_eligible_role(user)

    code = (data.code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="초대 코드를 입력해주세요")

    result = await db.execute(select(FamilyInvite).where(FamilyInvite.code == code))
    invite = result.scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="유효하지 않은 코드입니다")

    if invite.used_at is not None:
        raise HTTPException(status_code=400, detail="이미 사용된 코드입니다")

    if invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="만료된 코드입니다. 새 코드를 발급해주세요")

    # 자기 자신 코드 사용 금지
    if invite.inviter_id == user.id:
        raise HTTPException(status_code=400, detail="본인이 만든 코드는 사용할 수 없습니다")

    # 역할 검증: 학생끼리 / 학부모끼리 연결 금지
    if invite.inviter_role == user.member_type:
        raise HTTPException(
            status_code=400,
            detail="학생-학부모 연결만 가능합니다. 코드 발급자와 동일한 역할입니다.",
        )

    # parent / child 결정
    inviter_result = await db.execute(select(User).where(User.id == invite.inviter_id))
    inviter = inviter_result.scalar_one_or_none()
    if inviter is None:
        raise HTTPException(status_code=404, detail="코드 발급자를 찾을 수 없습니다")

    if user.member_type == "parent":
        parent_user, child_user = user, inviter
    else:
        parent_user, child_user = inviter, user

    # 중복 연결 검사 (이미 active 한 쌍이 있으면 차단)
    existing = await db.execute(
        select(FamilyLink).where(
            and_(
                FamilyLink.parent_user_id == parent_user.id,
                FamilyLink.child_user_id == child_user.id,
                FamilyLink.status == "active",
            )
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="이미 연결된 가족입니다")

    now = datetime.utcnow()
    link = FamilyLink(
        parent_user_id=parent_user.id,
        child_user_id=child_user.id,
        status="active",
        created_by=invite.inviter_id,
        activated_at=now,
    )
    invite.used_at = now
    invite.used_by = user.id
    db.add(link)
    await db.commit()
    await db.refresh(link)

    # 응답: 호출자 입장에서 상대방 정보
    other = child_user if user.member_type == "parent" else parent_user
    other_role = "child" if user.member_type == "parent" else "parent"
    return FamilyLinkResponse(
        link_id=link.id,
        role=other_role,
        member=FamilyMemberInfo.model_validate(
            {
                "user_id": other.id,
                "name": other.name,
                "email": other.email,
                "member_type": other.member_type,
                "school_name": other.school_name,
                "grade": other.grade,
            }
        ),
        created_at=link.created_at,
        can_revoke=(user.member_type == "parent"),
    )


@router.get("/links", response_model=FamilyLinkListResponse)
async def list_my_links(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내 가족 연결 목록"""
    _ensure_eligible_role(user)

    items: list[FamilyLinkResponse] = []

    if user.member_type == "parent":
        # 학부모 → 자녀 연결 목록
        result = await db.execute(
            select(FamilyLink, User)
            .join(User, FamilyLink.child_user_id == User.id)
            .where(
                and_(
                    FamilyLink.parent_user_id == user.id,
                    FamilyLink.status == "active",
                )
            )
            .order_by(FamilyLink.created_at.asc())
        )
        for link, child in result.all():
            items.append(
                FamilyLinkResponse(
                    link_id=link.id,
                    role="child",
                    member=FamilyMemberInfo.model_validate(
                        {
                            "user_id": child.id,
                            "name": child.name,
                            "email": child.email,
                            "member_type": child.member_type,
                            "school_name": child.school_name,
                            "grade": child.grade,
                        }
                    ),
                    created_at=link.created_at,
                    can_revoke=True,
                )
            )
    else:
        # 학생 → 학부모 연결 목록
        result = await db.execute(
            select(FamilyLink, User)
            .join(User, FamilyLink.parent_user_id == User.id)
            .where(
                and_(
                    FamilyLink.child_user_id == user.id,
                    FamilyLink.status == "active",
                )
            )
            .order_by(FamilyLink.created_at.asc())
        )
        for link, parent in result.all():
            items.append(
                FamilyLinkResponse(
                    link_id=link.id,
                    role="parent",
                    member=FamilyMemberInfo.model_validate(
                        {
                            "user_id": parent.id,
                            "name": parent.name,
                            "email": parent.email,
                            "member_type": parent.member_type,
                            "school_name": parent.school_name,
                            "grade": parent.grade,
                        }
                    ),
                    created_at=link.created_at,
                    can_revoke=False,  # 학생은 해제 권한 없음
                )
            )

    return FamilyLinkListResponse(items=items)


@router.delete("/links/{link_id}")
async def revoke_link(
    link_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """가족 연결 해제 — 학부모만 가능"""
    _ensure_eligible_role(user)

    if user.member_type != "parent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="가족 연결 해제는 학부모 계정에서만 가능합니다",
        )

    result = await db.execute(select(FamilyLink).where(FamilyLink.id == link_id))
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="해당 연결을 찾을 수 없습니다")

    if link.parent_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="본인이 연결된 가족만 해제할 수 있습니다",
        )

    if link.status != "active":
        raise HTTPException(status_code=400, detail="이미 해제된 연결입니다")

    link.status = "revoked"
    link.revoked_at = datetime.utcnow()
    await db.commit()
    return {"message": "가족 연결이 해제되었습니다"}
