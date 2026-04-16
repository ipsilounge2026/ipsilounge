"""
상담 데이터 접근 감사 로그 (V1 §10-2 사후 교정)

선배 ↔ 상담사 간 데이터 공유 흐름에서, 누가 어느 학생의 어느 원본을
언제 조회했는지 기록한다. 정기 감사 및 사고 발생 시 역추적 용도.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class ConsultationDataAccessLog(Base):
    __tablename__ = "consultation_data_access_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # 조회자 (관리자 계정). 관리자 계정이 삭제되면 NULL 로 남긴다.
    viewer_admin_id = Column(
        UUID(as_uuid=True),
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # 조회 시점 역할 스냅샷 (senior / counselor / admin / super_admin)
    viewer_role = Column(String(20), nullable=False, index=True)

    # 대상 학생
    target_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # 접근 유형
    # ex) "senior_views_counselor_summary"
    #     "counselor_views_senior_notes"
    #     "admin_reviews_survey"
    access_type = Column(String(40), nullable=False, index=True)

    # 원천 구분 (snapshot)
    # "survey" / "note" / "senior_note" 등
    source_type = Column(String(20), nullable=True)
    source_id = Column(UUID(as_uuid=True), nullable=True)

    # 부가 정보 (필터된 필드 목록, sharing settings, ip 등)
    meta = Column(JSONB, nullable=True)

    accessed_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
