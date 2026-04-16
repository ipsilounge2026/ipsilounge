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

    # --- 선배 공유 검토 게이트 (V1 §6) ---
    # 상담사 상담 기록(ConsultationNote)을 선배에게 공유하기 전 관리자 검토.
    # 학생 공개(is_visible_to_user)와 무관한 별도 플래그.
    # D8/F/G 민감 카테고리는 settings와 무관하게 시스템적으로 차단됨.
    senior_review_status = Column(String(20), default="pending")
    # "pending" | "reviewed" | "revision_requested"
    senior_review_notes = Column(Text, nullable=True)
    # 항목별 공유 설정 (next_senior_context / action_plan_detail 등).
    # 기본값은 services.senior_sharing_service.DEFAULT_NOTE_SENIOR_SHARING 참조.
    senior_sharing_settings = Column(JSONB, nullable=True)
    senior_reviewed_at = Column(DateTime, nullable=True)
    senior_reviewer_admin_id = Column(
        UUID(as_uuid=True),
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- 학생 사후 철회 (V1 §10-1, §10-2) ---
    # 학생이 본인 동의를 사후 철회하면 이 타임스탬프가 세팅된다.
    # senior_review_status 는 건드리지 않고, revoked_at NULL 체크만으로 선배 노출을 막는다.
    # (학생이 다시 복구하는 경우 revoked_at 만 None 으로 되돌림)
    senior_sharing_revoked_at = Column(DateTime, nullable=True)
    senior_sharing_revoke_reason = Column(Text, nullable=True)

    # 추가 기록 (append-only, 수정/삭제 불가)
    addenda = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="consultation_notes")
    booking = relationship("ConsultationBooking", back_populates="note")
    admin = relationship("Admin", back_populates="consultation_notes")
