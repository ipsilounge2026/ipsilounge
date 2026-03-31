import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ConsultationBooking(Base):
    __tablename__ = "consultation_bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    slot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("consultation_slots.id"), nullable=False)
    analysis_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analysis_orders.id"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # 학생부분석 / 입시전략 / 기타
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="requested")  # requested / confirmed / completed / cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="consultation_bookings")
    slot = relationship("ConsultationSlot", back_populates="bookings")
    payments = relationship("Payment", back_populates="consultation_booking")
    note = relationship("ConsultationNote", back_populates="booking", uselist=False)
