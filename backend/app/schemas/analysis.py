import uuid
from datetime import datetime

from pydantic import BaseModel


class AnalysisApplyRequest(BaseModel):
    service_type: str = "학생부라운지"  # 학생부라운지 / 학종라운지
    target_university: str | None = None
    target_major: str | None = None
    memo: str | None = None


class AnalysisUploadRequest(BaseModel):
    target_university: str | None = None
    target_major: str | None = None
    memo: str | None = None


class AnalysisOrderResponse(BaseModel):
    id: uuid.UUID
    service_type: str
    status: str
    school_record_filename: str | None
    target_university: str | None
    target_major: str | None
    memo: str | None
    admin_memo: str | None
    created_at: datetime
    uploaded_at: datetime | None
    processing_at: datetime | None
    completed_at: datetime | None
    has_report: bool = False

    model_config = {"from_attributes": True}


class AnalysisListResponse(BaseModel):
    items: list[AnalysisOrderResponse]
    total: int


class AnalysisStatusUpdate(BaseModel):
    status: str  # applied / uploaded / processing / completed / cancelled
    admin_memo: str | None = None


class AdminAnalysisResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    user_email: str
    user_phone: str | None
    service_type: str
    status: str
    school_record_filename: str | None
    target_university: str | None
    target_major: str | None
    memo: str | None
    admin_memo: str | None
    created_at: datetime
    uploaded_at: datetime | None
    processing_at: datetime | None
    completed_at: datetime | None
    has_report: bool = False
