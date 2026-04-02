import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="admin")  # super_admin / admin / counselor
    allowed_menus: Mapped[str | None] = mapped_column(Text, nullable=True)  # 쉼표 구분 메뉴키 (admin만 적용, super_admin은 전체)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # 회원에서 승격된 경우 원본 user_id
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    consultation_notes = relationship("ConsultationNote", back_populates="admin")
    assigned_students = relationship("AdminStudentAssignment", back_populates="admin")


class AdminStudentAssignment(Base):
    __tablename__ = "admin_student_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admins.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    admin = relationship("Admin", back_populates="assigned_students")
    user = relationship("User")
