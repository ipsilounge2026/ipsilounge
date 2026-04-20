import uuid
from datetime import date, datetime

from pydantic import BaseModel

# --- 설명회 일정 ---

class SeminarScheduleCreate(BaseModel):
    title: str
    description: str | None = None
    start_date: date
    end_date: date
    blocked_dates: list[str] | None = None  # ["2025-04-03", "2025-04-07"]
    morning_max: int = 0
    afternoon_max: int = 0
    evening_max: int = 0
    deadline_at: datetime
    is_visible: bool = True


class SeminarScheduleUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    blocked_dates: list[str] | None = None
    morning_max: int | None = None
    afternoon_max: int | None = None
    evening_max: int | None = None
    deadline_at: datetime | None = None
    is_visible: bool | None = None


class SeminarScheduleResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    start_date: date
    end_date: date
    blocked_dates: list[str] | None = None
    morning_max: int
    afternoon_max: int
    evening_max: int
    deadline_at: datetime
    is_visible: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- 예약 (지점 담당자용) ---

class SeminarReservationCreate(BaseModel):
    schedule_id: uuid.UUID
    reservation_date: date
    time_slot: str  # morning / afternoon / evening
    contact_name: str
    contact_phone: str
    attendee_count: int
    memo: str | None = None


class SeminarReservationUpdate(BaseModel):
    reservation_date: date | None = None
    time_slot: str | None = None  # morning / afternoon / evening
    contact_name: str | None = None
    contact_phone: str | None = None
    attendee_count: int | None = None
    memo: str | None = None
    modify_reason: str  # 수정 사유 필수


class SeminarReservationCancel(BaseModel):
    cancel_reason: str  # 취소 사유 필수


class SeminarReservationResponse(BaseModel):
    id: uuid.UUID
    schedule_id: uuid.UUID
    schedule_title: str | None = None
    branch_name: str
    contact_name: str
    contact_phone: str
    reservation_date: date
    time_slot: str
    attendee_count: int
    actual_attendee_count: int | None = None
    memo: str | None
    status: str
    applied_at: datetime
    approved_at: datetime | None = None
    modify_reason: str | None = None
    cancel_reason: str | None = None
    deadline_at: datetime | None = None


# --- 예약 (관리자용) ---

class AdminReservationResponse(BaseModel):
    id: uuid.UUID
    schedule_id: uuid.UUID
    schedule_title: str | None = None
    user_id: uuid.UUID
    user_name: str | None = None
    user_email: str | None = None
    branch_name: str
    contact_name: str
    contact_phone: str
    reservation_date: date
    time_slot: str
    attendee_count: int
    actual_attendee_count: int | None = None
    memo: str | None
    status: str
    applied_at: datetime
    approved_at: datetime | None = None
    modify_reason: str | None = None
    cancel_reason: str | None = None


class AdminActualAttendeeUpdate(BaseModel):
    actual_attendee_count: int


# --- 대시보드 ---

class SeminarDashboardResponse(BaseModel):
    total_reservations: int
    pending_count: int
    modified_count: int
    approved_count: int
    cancelled_count: int
    total_attendee_count: int
    total_actual_attendee_count: int


# --- 메일 ---

class SeminarMailSendRequest(BaseModel):
    schedule_ids: list[uuid.UUID] | None = None  # None이면 전체
    branch_names: list[str] | None = None  # None이면 전체
    subject: str
    body: str


class SeminarMailLogResponse(BaseModel):
    id: uuid.UUID
    sent_at: datetime
    subject: str
    body: str
    schedule_names: str | None = None
    branch_names: str | None = None
    total_count: int
    success_count: int
    recipients: str | None = None  # JSON string

    model_config = {"from_attributes": True}


# --- 캘린더용 가용 정보 ---

class DateAvailability(BaseModel):
    date: date
    morning_remaining: int
    afternoon_remaining: int
    evening_remaining: int


class ScheduleAvailabilityResponse(BaseModel):
    schedule: SeminarScheduleResponse
    available_dates: list[DateAvailability]
