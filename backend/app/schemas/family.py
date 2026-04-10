"""학생-학부모 가족 연결 API 스키마"""

import uuid
from datetime import datetime

from pydantic import BaseModel


class InviteCreateResponse(BaseModel):
    """초대 코드 생성 응답"""
    code: str
    expires_at: datetime
    inviter_role: str  # parent / student


class ConnectRequest(BaseModel):
    """초대 코드로 연결"""
    code: str


class FamilyMemberInfo(BaseModel):
    """연결된 가족 구성원 정보"""
    user_id: uuid.UUID
    name: str
    email: str
    member_type: str  # student / parent
    school_name: str | None = None
    grade: int | None = None

    model_config = {"from_attributes": True}


class FamilyLinkResponse(BaseModel):
    """연결 1건 정보"""
    link_id: uuid.UUID
    role: str  # 호출자 입장에서 상대방의 역할: parent / child
    member: FamilyMemberInfo
    created_at: datetime
    can_revoke: bool  # 호출자가 이 연결을 해제할 수 있는지 (학부모만 가능)


class FamilyLinkListResponse(BaseModel):
    """내 가족 연결 목록"""
    items: list[FamilyLinkResponse]
