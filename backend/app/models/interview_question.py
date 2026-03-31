from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.database import Base


class QuestionCategory(str, enum.Enum):
    setuek = "세특기반"
    changche = "창체기반"
    haengtuk = "행특기반"
    motivation = "지원동기"
    career = "진로계획"
    comprehensive = "종합"


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("analysis_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    question = Column(Text, nullable=False)
    category = Column(SAEnum(QuestionCategory), nullable=False)
    hint = Column(Text, nullable=True)   # 답변 방향 힌트
    created_at = Column(DateTime, default=datetime.utcnow)

    analysis_order = relationship("AnalysisOrder", back_populates="interview_questions")
