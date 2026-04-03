import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SeminarSchedule(Base):
    __tablename__ = "seminar_schedules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)  # 신청 가능 시작일
    end_date: Mapped[date] = mapped_column(Date, nullable=False)  # 신청 가능 종료일
    blocked_dates: Mapped[str | None] = mapped_column(Text, nullable=True)  # 쉼표 구분 "2025-04-03,2025-04-07"
    morning_max: Mapped[int] = mapped_column(Integer, default=0)  # 오전 최대 예약 수 (0=미운영)
    afternoon_max: Mapped[int] = mapped_column(Integer, default=0)
    evening_max: Mapped[int] = mapped_column(Integer, default=0)
    deadline_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)  # 예약 마감일시
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    reservations = relationship("SeminarReservation", back_populates="schedule")
