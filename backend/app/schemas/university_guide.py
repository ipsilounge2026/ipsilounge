"""대학모집요강 Pydantic 스키마."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class UniversityGuideBase(BaseModel):
    university: str
    university_code: str | None = None
    year: int

    official_admission_url: str | None = None
    official_jonghap_guidebook_url: str | None = None
    official_result_url: str | None = None

    adiga_admission_plan_url: str | None = None
    adiga_susi_guide_url: str | None = None
    adiga_jeongsi_guide_url: str | None = None
    adiga_result_url: str | None = None
    adiga_prior_learning_eval_url: str | None = None

    is_active: bool = True
    sort_order: int = 0


class UniversityGuideCreate(UniversityGuideBase):
    pass


class UniversityGuideUpdate(BaseModel):
    university: str | None = None
    university_code: str | None = None
    year: int | None = None

    official_admission_url: str | None = None
    official_jonghap_guidebook_url: str | None = None
    official_result_url: str | None = None

    adiga_admission_plan_url: str | None = None
    adiga_susi_guide_url: str | None = None
    adiga_jeongsi_guide_url: str | None = None
    adiga_result_url: str | None = None
    adiga_prior_learning_eval_url: str | None = None

    is_active: bool | None = None
    sort_order: int | None = None


class UniversityGuideResponse(UniversityGuideBase):
    id: uuid.UUID
    last_checked: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class UniversityGuideListResponse(BaseModel):
    items: list[UniversityGuideResponse]
    total: int
    available_years: list[int]


class UniversityGuideBulkCopyRequest(BaseModel):
    """학년도 일괄 복사 — 기존 학년도의 대학 목록을 새 학년도로 복사 (URL은 비움)."""

    from_year: int
    to_year: int
    copy_urls: bool = False  # True이면 URL까지 복사, False이면 대학명만
