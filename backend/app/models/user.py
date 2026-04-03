import uuid
from datetime import datetime, date

from sqlalchemy import Boolean, Date, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    member_type: Mapped[str] = mapped_column(String(20), nullable=False, default="student")  # student / parent / branch_manager
    student_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    student_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    school_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grade_year: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 학년 설정 연도 (자동 진급 계산용)
    branch_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fcm_token: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    analysis_orders = relationship("AnalysisOrder", back_populates="user")
    consultation_bookings = relationship("ConsultationBooking", back_populates="user")
    payments = relationship("Payment", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
    reset_tokens = relationship("PasswordResetToken", back_populates="user")
    consultation_notes = relationship("ConsultationNote", back_populates="user")
    seminar_reservations = relationship("SeminarReservation", back_populates="user")
