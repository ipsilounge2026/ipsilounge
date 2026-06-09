"""
대학모집요강 안내 모델.

각 대학 × 학년도별로 외부 자료 URL을 모아 사용자에게 카드 형태로 제공.
파일은 호스팅하지 않고, 대학어디가(adiga.go.kr) 또는 대학 입학처 공식 URL만 매핑.

자료 종류별 출처 정책:
- 공시 의무 자료(모집요강/시행계획/선행평가/대교협 입시결과) → 대학어디가
- 대학 고유 자료(가이드북/입학처 메인/자체 입시결과) → 대학 입학처

비로그인 사용자도 접근 가능 (입시 뉴스와 동일 정책).
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UniversityGuide(Base):
    __tablename__ = "university_guides"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # 기본 정보
    university: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    university_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # 대학 입학처 출처 (3개)
    official_admission_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    official_jonghap_guidebook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    official_result_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # 대학어디가 출처 (5개)
    # 주의: adiga_admission_plan_url 은 서울진로진학정보센터(SEN) 프록시 URL 로 채워짐 (사용자 카드 호환).
    # 대학어디가에서는 시행계획 자료 더 이상 수집하지 않음 (1년 반 전 발표 자료가 없기 때문).
    adiga_admission_plan_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    adiga_susi_guide_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    adiga_jeongsi_guide_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    adiga_result_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    adiga_prior_learning_eval_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # 서울진로진학정보센터(SEN) 시행계획 form data
    # SEN 은 POST 다운로드만 가능 + 외부 자동 다운로드 차단 → form data 를 보관해
    # 우리 sen_proxy 라우터가 auto-submit form HTML 로 사용자에게 응답.
    # 구조: {"fields": {"orgfilename":..., "sysfilename":..., "sysfilepath":..., "pdsid":..., "seqno":...}, "sen_university":"가야대학교"}
    sen_plan_meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # 메타
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    last_checked: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("university", "year", name="uq_university_guide_uni_year"),
    )
