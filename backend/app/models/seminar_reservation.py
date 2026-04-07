import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SeminarReservation(Base):
    __tablename__ = "seminar_reservations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    schedule_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("seminar_schedules.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    branch_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    reservation_date: Mapped[date] = mapped_column(Date, nullable=False)  # 예약 날짜
    time_slot: Mapped[str] = mapped_column(String(20), nullable=False)  # morning / afternoon / evening
    attendee_count: Mapped[int] = mapped_column(Integer, nullable=False)  # 참석 예정 인원
    actual_attendee_count: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 실제 참석 인원
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending / modified / approved / cancelled
    applied_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    modify_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    google_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    schedule = relationship("SeminarSchedule", back_populates="reservations")
    user = relationship("User", back_populates="seminar_reservations")
