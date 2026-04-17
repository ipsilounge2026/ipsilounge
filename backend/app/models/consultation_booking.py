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
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # 학생부분석 / 학종전략 / 학습상담 / 심리상담 / 기타 / 선배상담
    mode: Mapped[str] = mapped_column(String(20), default="in_person")  # in_person / remote
    meeting_url: Mapped[str | None] = mapped_column(Text, nullable=True)  # 비대면 시 화상 링크 (Zoom/Google Meet 등)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="requested")  # requested / confirmed / completed / cancelled
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    google_event_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 상담 기록 작성 기한 관리
    # (선배 V1 §5-1 / 고등학교 V3 §4-8 / 예비고1 V2_2 §3-7 공통 기준)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # status="completed" 로 전환된 시점. 이 시점 + 7일이 기록 작성 기한.
    note_deadline_waived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # super_admin 이 수동으로 기한 체크를 면제한 경우 세팅. None이면 정상 검사 대상.
    note_deadline_waive_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 면제 사유 (장기 부재 등, 감사 용도).

    user = relationship("User", back_populates="consultation_bookings")
    slot = relationship("ConsultationSlot", back_populates="bookings")
    payments = relationship("Payment", back_populates="consultation_booking")
    note = relationship("ConsultationNote", back_populates="booking", uselist=False)
