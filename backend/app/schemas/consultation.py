import uuid
from datetime import date, datetime, time

from pydantic import BaseModel

# --- 사용자용 ---

class AvailableSlotResponse(BaseModel):
    id: uuid.UUID
    date: date
    start_time: time
    end_time: time
    remaining: int  # 남은 예약 가능 수
    admin_id: str | None = None
    admin_name: str | None = None
    # 기획서 §4-8-2: 학습상담 7일 리드타임 등 타입별 예약 가능 여부.
    # consultation_type 쿼리가 주어졌을 때만 의미있는 값이 채워짐.
    available: bool = True
    unavailable_reason: str | None = None

    model_config = {"from_attributes": True}


class CounselorResponse(BaseModel):
    id: str
    name: str

    model_config = {"from_attributes": True}


class BookingRequest(BaseModel):
    slot_id: uuid.UUID
    type: str  # 학생부분석 / 입시전략 / 학습상담 / 심리상담 / 기타
    mode: str = "in_person"  # in_person / remote
    memo: str | None = None
    analysis_order_id: uuid.UUID | None = None
    owner_user_id: str | None = None  # 학부모가 자녀 대신 예약 시 자녀 user_id


class BookingResponse(BaseModel):
    id: uuid.UUID
    slot_date: date
    slot_start_time: time
    slot_end_time: time
    type: str
    mode: str = "in_person"
    meeting_url: str | None = None
    memo: str | None
    status: str
    cancel_reason: str | None = None
    admin_name: str | None = None
    created_at: datetime


class MyBookingListResponse(BaseModel):
    items: list[BookingResponse]
    total: int


# --- 관리자용 ---

class SlotCreateRequest(BaseModel):
    admin_id: str | None = None
    date: date
    start_time: time
    end_time: time
    max_bookings: int = 1
    repeat_type: str | None = None  # None / "weekly" / "monthly"
    repeat_count: int = 0  # 반복 횟수 (0이면 반복 없음)


class SlotBulkCreateRequest(BaseModel):
    admin_id: str | None = None
    start_date: date
    end_date: date
    weekdays: list[int]  # 0=월 ~ 6=일
    start_time: time
    end_time: time
    duration_minutes: int = 60
    max_bookings: int = 1


class SlotUpdateRequest(BaseModel):
    start_time: time | None = None
    end_time: time | None = None
    max_bookings: int | None = None
    is_active: bool | None = None
    update_scope: str = "single"  # "single" / "future_all"


class AdminSlotResponse(BaseModel):
    id: uuid.UUID
    admin_id: str | None = None
    admin_name: str | None = None
    repeat_group_id: str | None = None
    date: date
    start_time: time
    end_time: time
    max_bookings: int
    current_bookings: int
    is_active: bool

    model_config = {"from_attributes": True}


class AdminBookingResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    user_email: str
    user_phone: str | None
    slot_date: date
    slot_start_time: time
    slot_end_time: time
    admin_name: str | None = None
    type: str
    mode: str = "in_person"
    meeting_url: str | None = None
    memo: str | None
    status: str
    cancel_reason: str | None = None
    created_at: datetime


class BookingStatusUpdate(BaseModel):
    status: str  # requested / confirmed / completed / cancelled
    cancel_reason: str | None = None


class ManualBookingRequest(BaseModel):
    user_id: uuid.UUID
    date: date
    start_time: time
    end_time: time
    type: str = "기타"  # 학생부분석 / 입시전략 / 학습상담 / 심리상담 / 기타
    mode: str = "in_person"  # in_person / remote
    meeting_url: str | None = None
    memo: str | None = None
