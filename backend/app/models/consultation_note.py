from sqlalchemy import Column, String, Text, Boolean, DateTime, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


# 상담 카테고리 (5개)
# academic: 학업 상담 (고등학교 기획서 T1~T4 기반)
# record: 학생부 상담 (학생부 분석 결과 기반)
# admission: 학종 상담 (학생부종합전형 전략)
# mental: 심리 상담
# other: 기타 상담
CONSULTATION_CATEGORIES = {
    "academic": "학업 상담",
    "record": "학생부 상담",
    "admission": "학종 상담",
    "mental": "심리 상담",
    "other": "기타 상담",
}

# 학년
STUDENT_GRADES = {
    "pre_high1": "예비고1",
    "grade1": "고1",
    "grade2": "고2",
    "grade3": "고3",
    "reexam": "재수생",
    "other": "기타",
}

# 학업 상담 시점 (고등학교 기획서 기반)
ACADEMIC_TIMINGS = {
    "T1": "고1-1학기 말 (7월)",
    "T2": "고1-2학기 말 (2월)",
    "T3": "고2-1학기 말 (7월)",
    "T4": "고2-2학기 말 (2월)",
}


class ConsultationNote(Base):
    __tablename__ = "consultation_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("consultation_bookings.id", ondelete="SET NULL"), nullable=True)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("admins.id", ondelete="SET NULL"), nullable=True)

    category = Column(String(30), nullable=False)       # academic / record / admission / mental / other
    consultation_date = Column(Date, nullable=False)
    student_grade = Column(String(20), nullable=True)    # pre_high1 / grade1 / grade2 / grade3 / reexam / other
    timing = Column(String(10), nullable=True)           # T1 / T2 / T3 / T4 (학업 상담 전용)

    # 기존 범용 필드 (하위 호환)
    goals = Column(Text, nullable=True)          # 상담 목표/요청사항
    main_content = Column(Text, nullable=False)  # 주요 상담 내용 (기타/레거시용)
    advice_given = Column(Text, nullable=True)   # 제공한 조언
    next_steps = Column(Text, nullable=True)     # 다음 실행 계획
    next_topic = Column(Text, nullable=True)     # 다음 상담 예정 주제
    # HSGAP-P2-senior-counselor-context-share-ui: 다음 선배 상담사에게 전달할 요약 맥락
    # (민감정보는 제외한 핵심 포인트, 선배 상담사 "담당 학생 요약" 페이지에 노출)
    next_senior_context = Column(Text, nullable=True)

    # 카테고리별 주제 기록 (JSONB) — 카테고리+학년+시점에 따라 구조가 달라짐
    # 예: {"topic_1": "...", "topic_2": "...", ...}
    topic_notes = Column(JSONB, nullable=True)

    # 관리자 전용 메모 (학생에게 미노출)
    admin_private_notes = Column(Text, nullable=True)

    # 학생 공개 여부
    is_visible_to_user = Column(Boolean, default=False)

    # 추가 기록 (append-only, 수정/삭제 불가)
    addenda = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="consultation_notes")
    booking = relationship("ConsultationBooking", back_populates="note")
    admin = relationship("Admin", back_populates="consultation_notes")
