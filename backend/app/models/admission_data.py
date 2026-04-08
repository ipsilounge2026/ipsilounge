"""입결 데이터 모델

admission_db.xlsx의 수시입결RAW 시트 데이터를 저장하는 테이블.
대학·학과 드롭다운 선택지의 소스로도 사용됨.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AdmissionData(Base):
    __tablename__ = "admission_data"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    university: Mapped[str] = mapped_column(String(100), nullable=False, index=True)  # 대학
    admission_category: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 전형구분
    admission_name: Mapped[str | None] = mapped_column(String(100), nullable=True)  # 전형명
    major: Mapped[str] = mapped_column(String(200), nullable=False, index=True)  # 모집단위명
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # 학년도
    recruit_count: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 모집인원
    applicants: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 지원자
    competition_rate: Mapped[float | None] = mapped_column(Float, nullable=True)  # 경쟁률
    chu_hap: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 추합
    result_50: Mapped[float | None] = mapped_column(Float, nullable=True)  # 입결 50%
    result_70: Mapped[float | None] = mapped_column(Float, nullable=True)  # 입결 70%
    note: Mapped[str | None] = mapped_column(Text, nullable=True)  # 비고
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
