"""가족 연결 초대 코드

- 학생 또는 학부모가 코드를 생성해서 상대방에게 전달
- 상대방이 회원가입/로그인 후 코드 입력하면 family_links 생성
- 7일 만료, 1회 사용
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FamilyInvite(Base):
    __tablename__ = "family_invites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inviter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inviter_role: Mapped[str] = mapped_column(String(20), nullable=False)  # parent / student
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    used_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    inviter = relationship("User", foreign_keys=[inviter_id])
    user_used = relationship("User", foreign_keys=[used_by])
