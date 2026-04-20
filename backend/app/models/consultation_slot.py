import uuid
from datetime import date, time

from sqlalchemy import Boolean, Date, Integer, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ConsultationSlot(Base):
    __tablename__ = "consultation_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)  # 담당 관리자/상담자 ID
    repeat_group_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)  # 반복 생성 그룹 ID
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    max_bookings: Mapped[int] = mapped_column(Integer, default=1)
    current_bookings: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    bookings = relationship("ConsultationBooking", back_populates="slot")
