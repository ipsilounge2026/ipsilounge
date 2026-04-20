"""
상담 후 만족도 설문 모델

기획서 §10-5 (선배상담), §10 (상담사)
- 상담 완료 후 자동 발송
- 10점 척도, 공통 5문항 + 유형별 3문항 + 서술형 2문항
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database import Base


class SatisfactionSurvey(Base):
    __tablename__ = "satisfaction_surveys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("consultation_bookings.id", ondelete="CASCADE"), nullable=False, unique=True)

    survey_type = Column(String(20), nullable=False)  # "counselor" or "senior"
    status = Column(String(20), default="pending")  # pending / submitted

    # 10-point scale answers (JSONB)
    # {"S1": 8, "S2": 9, ..., "C1": 7, ...} or {"S1": 8, ..., "M1": 9, ...}
    scores = Column(JSONB, default=dict)

    # Free-text answers
    # {"F1": "...", "F2": "..."}
    free_text = Column(JSONB, default=dict)

    submitted_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)  # 7 days after creation
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    booking = relationship("ConsultationBooking")
