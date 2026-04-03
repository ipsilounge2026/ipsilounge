import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SeminarMailLog(Base):
    __tablename__ = "seminar_mail_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    schedule_names: Mapped[str | None] = mapped_column(Text, nullable=True)  # 대상 설명회명 (쉼표 구분)
    branch_names: Mapped[str | None] = mapped_column(Text, nullable=True)  # 대상 지점명 (쉼표 구분)
    total_count: Mapped[int] = mapped_column(Integer, default=0)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    recipients: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: [{branch_name, email}, ...]
