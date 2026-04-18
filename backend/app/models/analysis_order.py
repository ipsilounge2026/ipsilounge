import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AnalysisOrder(Base):
    __tablename__ = "analysis_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    service_type: Mapped[str] = mapped_column(String(20), default="학생부라운지")  # 학생부라운지 / 학종라운지

    # 분석 흐름 상태 (2026-04-17 Phase C: review 추가)
    # applied       : 사용자 신청 완료
    # uploaded      : 학생부 업로드 완료
    # processing    : 관리자 admin-web "분석 시작" 클릭 → Claude 대화 세션에서 분석 진행 중
    #                 (재분석 시에도 processing 으로 복귀)
    # review        : Claude 가 리포트 업로드 완료 → 관리자 검수 대기
    # completed     : 관리자 "확인 완료" → 사용자 공개 + FCM 알림 발송
    # cancelled     : 취소
    status: Mapped[str] = mapped_column(
        String(20), default="applied"
    )
    school_record_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    school_record_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_university: Mapped[str | None] = mapped_column(String(100), nullable=True)
    target_major: Mapped[str | None] = mapped_column(String(100), nullable=True)
    report_excel_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    report_pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_memo: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Phase C (2026-04-17): 관리자 "재분석 요청" 시 선택적 피드백
    # Claude 가 재분석할 때 참고. 여러 번 rejected 될 경우 이전 피드백은 덮어씌워짐.
    review_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    processing_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Phase C (2026-04-17): Claude 리포트 업로드 → review 진입 시각
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user = relationship("User", back_populates="analysis_orders")
    payments = relationship("Payment", back_populates="analysis_order")
    interview_questions = relationship("InterviewQuestion", back_populates="analysis_order")
    shares = relationship("AnalysisShare", back_populates="analysis_order")
