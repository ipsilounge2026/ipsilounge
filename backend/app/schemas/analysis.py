import uuid
from datetime import datetime

from pydantic import BaseModel


class AnalysisApplyRequest(BaseModel):
    service_type: str = "학생부라운지"  # 학생부라운지 / 학종라운지
    target_university: str | None = None
    target_major: str | None = None
    memo: str | None = None
    owner_user_id: str | None = None  # 학부모가 자녀 대신 신청 시 자녀 user_id


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
    # 상태 전이 (Phase C 2026-04-17: review 추가):
    # applied → uploaded → processing → review → completed / cancelled
    #   review → processing (재분석 루프, approve/reject 엔드포인트 사용 권장)
    status: str
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
    # G6 Phase B (2026-04-17): 스캔 PDF 판별 결과
    # - True:  텍스트 레이어 있음 → 하이라이트 PDF 생성 가능
    # - False: 스캔본 PDF → 하이라이트 PDF 생성 불가 (분석은 가능)
    # - None:  학생부 미업로드 또는 판별 불가
    is_text_pdf: bool | None = None
