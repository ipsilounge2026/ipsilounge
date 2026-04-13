"""정시 입결 데이터 모델

admission_db.xlsx의 정시입결RAW 시트 데이터를 저장하는 테이블.
C4 유형 판정 시 정시 가능 대학 라인 산출에 사용됨.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class JeongsiAdmissionData(Base):
    __tablename__ = "jeongsi_admission_data"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tier: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)  # 수준 (상위6, 상위15, 등)
    field: Mapped[str | None] = mapped_column(String(100), nullable=True)  # 분야 (간호, 의예 등)
    general_local: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 일반/지역
    category2: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 구분2
    track: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)  # 계열 (인문/자연)
    university: Mapped[str] = mapped_column(String(100), nullable=False, index=True)  # 대학
    major: Mapped[str] = mapped_column(String(200), nullable=False, index=True)  # 모집단위명
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # 연도
    gun: Mapped[str | None] = mapped_column(String(10), nullable=True)  # 군 (가/나/다)
    initial_count: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 최초인원
    transfer_count: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 이월인원
    final_count: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 최종인원
    applicants: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 지원자
    competition_rate: Mapped[float | None] = mapped_column(Float, nullable=True)  # 경쟁률
    chu_hap: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 추합
    chung_won_rate: Mapped[float | None] = mapped_column(Float, nullable=True)  # 충원율
    converted_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 환��점수
    percentile_70: Mapped[float | None] = mapped_column(Float, nullable=True)  # 백분위 70%
    univ_percentile: Mapped[float | None] = mapped_column(Float, nullable=True)  # 대학발표 백분위
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
