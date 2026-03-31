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
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending / processing / completed / cancelled
    school_record_url: Mapped[str] = mapped_column(String(500), nullable=False)
    school_record_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    target_university: Mapped[str | None] = mapped_column(String(100), nullable=True)
    target_major: Mapped[str | None] = mapped_column(String(100), nullable=True)
    report_excel_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    report_pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    processing_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user = relationship("User", back_populates="analysis_orders")
    payments = relationship("Payment", back_populates="analysis_order")
    interview_questions = relationship("InterviewQuestion", back_populates="analysis_order")
    shares = relationship("AnalysisShare", back_populates="analysis_order")
