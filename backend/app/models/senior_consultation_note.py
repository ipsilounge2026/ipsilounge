"""
선배 상담 전용 기록 모델

기획서 V1 §5.2 — 10개 섹션 구조:
1. 기본 정보 (자동 채움)
2. 사전 설문 확인
3. 이전 상담 체크 포인트 확인
4. 핵심 주제별 진행 결과
5. 선택 주제 진행 여부
6. 자유 질의응답
7. 학생 상태 관찰
8. 학생에게 제안한 실천 사항
9. 다음 상담 시 확인 필요 사항
10. 학원 운영자에게 공유할 내용
"""

from datetime import datetime
import uuid

from sqlalchemy import Column, String, Text, Boolean, DateTime, Date, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


# 선배 상담 세션 타이밍
SENIOR_SESSION_TIMINGS = {
    "S1": "고1-1학기 초",
    "S2": "고1-2학기 초",
    "S3": "고2-1학기 초",
    "S4": "고2-2학기 초",
}


class SeniorConsultationNote(Base):
    __tablename__ = "senior_consultation_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    senior_id = Column(UUID(as_uuid=True), ForeignKey("admins.id", ondelete="SET NULL"), nullable=True)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("consultation_bookings.id", ondelete="SET NULL"), nullable=True)

    session_number = Column(Integer, nullable=False)  # 1, 2, 3, 4
    session_timing = Column(String(10), nullable=True)  # S1, S2, S3, S4
    consultation_date = Column(Date, nullable=False)

    # §5.2-④ 핵심 주제별 진행 결과 (JSONB array)
    # [{topic, progress_status, student_reaction, key_content}, ...]
    core_topics = Column(JSONB, nullable=True)

    # §5.2-⑤ 선택 주제 진행 여부 (JSONB array)
    # [{topic, covered: bool, note}, ...]
    optional_topics = Column(JSONB, nullable=True)

    # §5.2-⑥ 자유 질의응답
    student_questions = Column(Text, nullable=True)   # 학생이 가장 많이 질문한 내용
    senior_answers = Column(Text, nullable=True)      # 선배의 답변 요약

    # §5.2-⑦ 학생 상태 관찰
    student_mood = Column(String(20), nullable=True)  # 😊좋음 / 😐보통 / 😟걱정 / 😢힘들어함
    study_attitude = Column(String(30), nullable=True)  # 적극적 / 보통 / 소극적 / 무기력
    special_observations = Column(Text, nullable=True)  # 특이사항

    # §5.2-⑧ 학생에게 제안한 실천 사항 (JSONB array)
    # [{action, priority}, ...] — 1~2개
    action_items = Column(JSONB, nullable=True)

    # §5.2-⑨ 다음 상담 시 확인 필요 사항 (JSONB array)
    # [{checkpoint, status}, ...] — 1~2개
    next_checkpoints = Column(JSONB, nullable=True)

    # §5.2-⑩ 학원 운영자에게 공유할 내용
    operator_notes = Column(Text, nullable=True)

    # 다음 상담자에게 전달할 맥락 (연계규칙 V1 §5)
    # 선배가 직접 작성 — 다음 선배 또는 상담사에게 전달할 핵심 맥락 요약
    context_for_next = Column(Text, nullable=True)

    # 관리자 리뷰 상태
    review_status = Column(String(20), default="pending")  # pending / reviewed / revision_requested
    review_notes = Column(Text, nullable=True)  # 관리자 리뷰 코멘트

    # 공개 여부
    is_visible_to_user = Column(Boolean, default=False)
    is_visible_to_next_senior = Column(Boolean, default=True)

    # 추가 기록 (append-only)
    addenda = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    senior = relationship("Admin")
    booking = relationship("ConsultationBooking")
