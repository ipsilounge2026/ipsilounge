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

    model_config = {"from_attributes": True}


class BookingRequest(BaseModel):
    slot_id: uuid.UUID
    type: str  # 학생부분석 / 입시전략 / 기타
    memo: str | None = None
    analysis_order_id: uuid.UUID | None = None


class BookingResponse(BaseModel):
    id: uuid.UUID
    slot_date: date
    slot_start_time: time
    slot_end_time: time
    type: str
    memo: str | None
    status: str
    created_at: datetime


class MyBookingListResponse(BaseModel):
    items: list[BookingResponse]
    total: int


# --- 관리자용 ---

class SlotCreateRequest(BaseModel):
    date: date
    start_time: time
    end_time: time
    max_bookings: int = 1


class SlotBulkCreateRequest(BaseModel):
    start_date: date
    end_date: date
    weekdays: list[int]  # 0=월 ~ 6=일
    start_time: time
    end_time: time
    duration_minutes: int = 60  # 1회 상담 소요시간
    max_bookings: int = 1


class SlotUpdateRequest(BaseModel):
    max_bookings: int | None = None
    is_active: bool | None = None


class AdminSlotResponse(BaseModel):
    id: uuid.UUID
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
    type: str
    memo: str | None
    status: str
    created_at: datetime


class BookingStatusUpdate(BaseModel):
    status: str  # requested / confirmed / completed / cancelled
