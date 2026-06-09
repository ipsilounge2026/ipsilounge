"""대학어디가 자동 수집 입결 데이터 모델.

자동 수집 프로그램이 생성한 Excel 을 관리자 페이지에서 업로드하면
이 테이블에 학년도별로 저장됩니다.

운영 정책:
- 같은 학년도 재업로드 시: 해당 학년도 row 모두 삭제 후 새로 INSERT (FULL replace)
- 다른 학년도는 영향 없음

원본 Excel 37컬럼 중 핵심 컬럼만 직접 매핑하고, 백분위 등 상세는 JSON 컬럼에 보존.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AdigaAdmissionResult(Base):
    __tablename__ = "adiga_admission_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # 식별·필터용 핵심 컬럼 (Excel 1~6열)
    university: Mapped[str] = mapped_column(String(100), nullable=False, index=True)  # 대학명
    university_code: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # 대학코드 7자리
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # 학년도
    admission_category: Mapped[str | None] = mapped_column(String(30), nullable=True)  # 전형유형: 종합/교과/논술/수능
    admission_name: Mapped[str | None] = mapped_column(String(300), nullable=True)  # 전형명
    recruitment_type: Mapped[str | None] = mapped_column(String(10), nullable=True)  # 구분: 수시/정시
    major: Mapped[str] = mapped_column(String(300), nullable=False)  # 모집단위(학과)

    # 입결 수치 (Excel 7~9열)
    recruit_count: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 모집인원
    competition_rate: Mapped[float | None] = mapped_column(Float, nullable=True)  # 경쟁률
    additional_count: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 충원인원

    # 학생부 환산 점수·등급 (Excel 10~13열, 학생부 위주 전형용)
    gpa_score_50: Mapped[float | None] = mapped_column(Float, nullable=True)
    gpa_score_70: Mapped[float | None] = mapped_column(Float, nullable=True)
    gpa_grade_50: Mapped[float | None] = mapped_column(Float, nullable=True)
    gpa_grade_70: Mapped[float | None] = mapped_column(Float, nullable=True)

    # 환산 점수 (Excel 14~15열)
    conv_score_50: Mapped[float | None] = mapped_column(Float, nullable=True)
    conv_score_70: Mapped[float | None] = mapped_column(Float, nullable=True)

    # 백분위 상세 (Excel 16~25, 26~37열) — 정시·수능 위주 전형용
    # 키 예: 국어/수학/탐구1_사탐/탐구1_과탐/탐구1_직탐/탐구2_사탐/탐구2_과탐/탐구2_직탐/
    #       평균백분위/한국사_등급/영어_등급
    percentile_50: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    percentile_70: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # 비고 (수치 컬럼에 들어간 텍스트 메모 — "미제출 사유 : 3명이하" 등)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 메타
    source_file: Mapped[str | None] = mapped_column(String(200), nullable=True)  # 어떤 Excel에서 import 됐는지
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Index: 가장 흔한 쿼리 — 특정 대학·학년도 조회 / 학년도·수시구분 필터
    __table_args__ = (
        Index("ix_adiga_result_univ_year", "university_code", "year"),
        Index("ix_adiga_result_year_type", "year", "recruitment_type"),
    )
