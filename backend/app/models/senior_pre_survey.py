"""
선배 상담 사전 설문 모델

기획서 V1 §3 — 회차별 Q1~Q8:
  Q1~Q5: 공통 질문 (모든 세션)
  Q6~Q8: 세션별 고유 질문 (S1/S2/S3/S4)
"""

from datetime import datetime
import uuid

from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class SeniorPreSurvey(Base):
    __tablename__ = "senior_pre_surveys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("consultation_bookings.id", ondelete="SET NULL"), nullable=True)

    session_number = Column(Integer, nullable=False)  # 1, 2, 3, 4
    session_timing = Column(String(10), nullable=True)  # S1, S2, S3, S4
    status = Column(String(20), default="draft")  # draft / submitted

    # Q1~Q8 답변 (JSONB)
    # {"Q1": "좋음", "Q2": "보통", "Q3": ["첫내신대비", "동아리선택"], ...}
    answers = Column(JSONB, default=dict)

    submitted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    booking = relationship("ConsultationBooking")
