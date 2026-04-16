"""
사전 상담 설문 (Consultation Survey) Pydantic 스키마

요청/응답 형식 정의:
- 사용자: 작성/이어쓰기/제출
- 상담사: 조회/관리
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ----- 공통 -----

class CategoryStatus(BaseModel):
    """카테고리별 진행 상태"""
    status: str = Field(..., description="not_started | in_progress | skipped | completed")
    updated_at: datetime | None = None


# ----- 생성 -----

class SurveyCreateRequest(BaseModel):
    """
    새 설문 생성 요청.

    timing/mode를 명시하지 않거나 "auto"로 보내면 서버가 자동 판정:
    - timing: User.grade + grade_year + 오늘 날짜 기반 추정
    - mode: 동일 user의 이전 submitted 설문 이력으로 판정
    """
    survey_type: str = Field(..., description="preheigh1 | high")
    timing: str | None = Field(None, description='high 타입 전용: T1|T2|T3|T4 또는 None/"auto"')
    mode: str | None = Field(None, description='full|delta 또는 None/"auto"')
    booking_id: uuid.UUID | None = None
    started_platform: str = Field("web", description="web | mobile")
    owner_user_id: str | None = Field(None, description="학부모가 자녀 대신 작성 시 자녀 user_id")


class SurveySuggestResponse(BaseModel):
    """현재 사용자에게 추천되는 timing/mode 조회 응답"""
    survey_type: str
    suggested_timing: str | None = Field(None, description="추정된 시점 (None이면 학년 정보 부족)")
    suggested_mode: str = Field(..., description="추천 모드: full | delta")
    reason: str = Field(..., description="추정 근거 설명")
    has_prior_submission: bool = Field(..., description="이전 제출 이력 유무 (delta 판정 근거)")


class SurveyCreateResponse(BaseModel):
    """새 설문 생성 응답"""
    id: uuid.UUID
    survey_type: str
    timing: str | None
    mode: str
    status: str
    schema_version: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ----- 부분 저장 (이어쓰기) -----

class SurveyPatchRequest(BaseModel):
    """
    설문 부분 저장 (PATCH).
    클라이언트는 변경된 카테고리/질문만 보내면 됨.
    answers는 카테고리별로 머지(deep merge) 처리.
    """
    answers: dict[str, Any] | None = Field(
        None,
        description='카테고리별 답변. 예: {"A": {"A1": "홍길동", "A2": "대치중"}}',
    )
    category_status: dict[str, str] | None = Field(
        None,
        description='카테고리별 상태. 예: {"A": "completed", "B": "in_progress"}',
    )
    last_category: str | None = None
    last_question: str | None = None
    last_edited_platform: str | None = Field(None, description="web | mobile")
    note: str | None = None
    last_known_updated_at: datetime | None = Field(
        None,
        description="낙관적 잠금: 클라이언트가 마지막으로 받은 updated_at. 서버 값과 다르면 409",
    )


# ----- 제출 -----

class SurveySubmitRequest(BaseModel):
    """
    설문 최종 제출. submitted_at이 기록되고 status가 'submitted'로 변경됨.
    제출 후에도 데이터 자체는 수정 가능 (재제출 허용).
    """
    confirm: bool = Field(True, description="제출 확인 (실수 방지)")


# ----- 조회 -----

class SurveyResponse(BaseModel):
    """설문 단건 조회 응답 (전체 데이터)"""
    id: uuid.UUID
    user_id: uuid.UUID
    survey_type: str
    timing: str | None
    mode: str
    answers: dict
    category_status: dict
    status: str
    last_category: str | None
    last_question: str | None
    started_platform: str
    last_edited_platform: str
    schema_version: str
    booking_id: uuid.UUID | None
    note: str | None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None

    # 기획서 §4-8-1 자동 분석 검증 상태
    # pending|pass|repaired|warn|blocked 중 하나.
    # 학생 리포트 뷰어는 "blocked" 일 때 전체 잠금 UI 를 노출해야 함.
    analysis_status: str = "pending"
    analysis_validation: dict | None = None

    model_config = {"from_attributes": True}


class SurveyListItem(BaseModel):
    """설문 목록 아이템 (요약 정보)"""
    id: uuid.UUID
    user_id: uuid.UUID
    survey_type: str
    timing: str | None
    mode: str
    status: str
    schema_version: str
    booking_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None

    model_config = {"from_attributes": True}


class SurveyListResponse(BaseModel):
    items: list[SurveyListItem]
    total: int


# ----- 이어쓰기 토큰 -----

class ResumeTokenRequest(BaseModel):
    """이어쓰기 토큰 생성 요청 (이메일/딥링크 발송용)"""
    expires_in_hours: int = Field(72, ge=1, le=720, description="토큰 유효 시간 (1~720)")
    send_email: bool = Field(False, description="발급 직후 사용자 이메일로 이어쓰기 링크 발송 여부")


class ResumeTokenResponse(BaseModel):
    """이어쓰기 토큰 응답"""
    survey_id: uuid.UUID
    resume_token: str
    expires_at: datetime
    resume_url: str = Field(..., description="웹 딥링크 URL (모바일도 동일 토큰 사용 가능)")
    email_sent: bool = Field(False, description="이메일 발송 결과")
