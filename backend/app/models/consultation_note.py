from sqlalchemy import Column, String, Text, Boolean, DateTime, Date, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.database import Base


class ConsultationCategory(str, enum.Enum):
    analysis = "학생부분석"
    strategy = "입시전략"
    school_life = "학교생활"
    study_method = "공부법"
    career = "진로"
    mental = "심리정서"
    other = "기타"


class StudentStatus(str, enum.Enum):
    grade1 = "고1"
    grade2 = "고2"
    grade3 = "고3"
    reexam = "재수생"
    other = "기타"


class ConsultationNote(Base):
    __tablename__ = "consultation_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("consultation_bookings.id", ondelete="SET NULL"), nullable=True)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("admins.id", ondelete="SET NULL"), nullable=True)

    category = Column(SAEnum(ConsultationCategory), nullable=False)
    consultation_date = Column(Date, nullable=False)
    student_grade = Column(SAEnum(StudentStatus), nullable=True)

    # 상담 내용
    goals = Column(Text, nullable=True)          # 상담 목표/요청사항
    main_content = Column(Text, nullable=False)  # 주요 상담 내용
    advice_given = Column(Text, nullable=True)   # 제공한 조언
    next_steps = Column(Text, nullable=True)     # 다음 실행 계획
    next_topic = Column(Text, nullable=True)     # 다음 상담 예정 주제

    # 관리자 전용 메모 (학생에게 미노출)
    admin_private_notes = Column(Text, nullable=True)

    # 학생 공개 여부
    is_visible_to_user = Column(Boolean, default=False)

    # 추가 기록 (append-only, 수정/삭제 불가)
    # [{content, admin_id, admin_name, created_at}, ...]
    addenda = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="consultation_notes")
    booking = relationship("ConsultationBooking", back_populates="note")
    admin = relationship("Admin", back_populates="consultation_notes")
