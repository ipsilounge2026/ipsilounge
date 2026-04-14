"""
선배 상담 가이드북 모델

카테고리:
- manual: 상담 진행 매뉴얼
- timing_guide: 시점별 상담 가이드
- caution: 주의 사항
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, Boolean, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Guidebook(Base):
    __tablename__ = "guidebooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category = Column(String(30), nullable=False)  # manual / timing_guide / caution
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)  # 마크다운 또는 일반 텍스트
    sort_order = Column(Integer, default=0)  # 같은 카테고리 내 정렬 순서
    session_timing = Column(String(10), nullable=True)  # timing_guide인 경우 S1~S4 지정 가능
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
