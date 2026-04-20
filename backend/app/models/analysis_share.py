import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class AnalysisShare(Base):
    __tablename__ = "analysis_shares"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("analysis_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    analysis_order = relationship("AnalysisOrder", back_populates="shares")
