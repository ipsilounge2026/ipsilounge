import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class AdmissionType(str, enum.Enum):
    school_rec = "학생부교과"
    comprehensive = "학생부종합"
    essay = "논술"
    other = "기타"


class AdmissionCase(Base):
    __tablename__ = "admission_cases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    university = Column(String, nullable=False, index=True)
    major = Column(String, nullable=False)
    admission_year = Column(Integer, nullable=False)
    admission_type = Column(SAEnum(AdmissionType), nullable=False)

    # 성적 정보
    grade_average = Column(Float, nullable=True)        # 내신 평균 등급
    grade_details = Column(Text, nullable=True)         # 과목별 등급 요약 (JSON string)

    # 비교과 정보
    setuek_grade = Column(String, nullable=True)        # 세특 등급 (S/A/B/C/D)
    changche_grade = Column(String, nullable=True)      # 창체 등급
    haengtuk_grade = Column(String, nullable=True)      # 행특 등급

    # 서술 정보
    strengths = Column(Text, nullable=True)             # 합격 강점 요약
    key_activities = Column(Text, nullable=True)        # 주요 활동 특징
    notes = Column(Text, nullable=True)                 # 기타 메모 (관리자용)

    is_public = Column(Boolean, default=True)           # 사용자에게 공개 여부
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
