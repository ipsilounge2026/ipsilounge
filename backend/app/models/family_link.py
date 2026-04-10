"""학생-학부모 가족 연결 (다대다)

- parent_user_id: member_type='parent' 사용자
- child_user_id: member_type='student' 사용자
- 학부모 1명이 자녀 N명, 자녀 1명이 학부모 N명(부/모 분리 가정 등) 모두 지원
- 연결 해제 권한은 학부모만 가짐 (라우터에서 검증)
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FamilyLink(Base):
    __tablename__ = "family_links"
    __table_args__ = (
        UniqueConstraint("parent_user_id", "child_user_id", name="uq_family_links_parent_child"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    child_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")  # active / revoked
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )  # 초대를 시작한 쪽
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    parent = relationship("User", foreign_keys=[parent_user_id], back_populates="child_links")
    child = relationship("User", foreign_keys=[child_user_id], back_populates="parent_links")
