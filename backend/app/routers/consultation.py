import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.consultation_booking import ConsultationBooking
from app.models.consultation_slot import ConsultationSlot
from app.models.user import User
from app.schemas.consultation import (
    AvailableSlotResponse,
    BookingRequest,
    BookingResponse,
    MyBookingListResponse,
)
from app.services.consultation_service import check_slot_available
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/consultation", tags=["상담예약"])


@router.get("/slots", response_model=list[AvailableSlotResponse])
async def get_available_slots(
    year: int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """예약 가능 시간대 조회 (달력용)"""
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)

    result = await db.execute(
        select(ConsultationSlot).where(
            and_(
                ConsultationSlot.date >= start_date,
                ConsultationSlot.date < end_date,
                ConsultationSlot.is_active == True,
                ConsultationSlot.date >= date.today(),
            )
        ).order_by(ConsultationSlot.date, ConsultationSlot.start_time)
    )
    slots = result.scalars().all()

    return [
        AvailableSlotResponse(
            id=s.id,
            date=s.date,
            start_time=s.start_time,
            end_time=s.end_time,
            remaining=s.max_bookings - s.current_bookings,
        )
        for s in slots
        if s.current_bookings < s.max_bookings
    ]


@router.post("/book", response_model=BookingResponse)
async def book_consultation(
    data: BookingRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """상담 예약 신청"""
    slot = await check_slot_available(data.slot_id, db)

    # 동일 시간대 중복 예약 확인
    existing = await db.execute(
        select(ConsultationBooking).where(
            and_(
                ConsultationBooking.user_id == user.id,
                ConsultationBooking.slot_id == data.slot_id,
                ConsultationBooking.status.in_(["requested", "confirmed"]),
            )
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 해당 시간에 예약이 있습니다")

    booking = ConsultationBooking(
        user_id=user.id,
        slot_id=data.slot_id,
        analysis_order_id=data.analysis_order_id,
        type=data.type,
        memo=data.memo,
    )
    db.add(booking)

    slot.current_bookings += 1
    await db.commit()
    await db.refresh(booking)

    return BookingResponse(
        id=booking.id,
        slot_date=slot.date,
        slot_start_time=slot.start_time,
        slot_end_time=slot.end_time,
        type=booking.type,
        memo=booking.memo,
        status=booking.status,
        created_at=booking.created_at,
    )


@router.get("/my", response_model=MyBookingListResponse)
async def get_my_bookings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내 상담 예약 목록"""
    result = await db.execute(
        select(ConsultationBooking, ConsultationSlot)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .where(ConsultationBooking.user_id == user.id)
        .order_by(ConsultationSlot.date.desc(), ConsultationSlot.start_time.desc())
    )
    rows = result.all()

    items = [
        BookingResponse(
            id=booking.id,
            slot_date=slot.date,
            slot_start_time=slot.start_time,
            slot_end_time=slot.end_time,
            type=booking.type,
            memo=booking.memo,
            status=booking.status,
            created_at=booking.created_at,
        )
        for booking, slot in rows
    ]

    return MyBookingListResponse(items=items, total=len(items))


@router.put("/{booking_id}/cancel")
async def cancel_booking(
    booking_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """상담 예약 취소"""
    result = await db.execute(
        select(ConsultationBooking).where(
            ConsultationBooking.id == booking_id,
            ConsultationBooking.user_id == user.id,
        )
    )
    booking = result.scalar_one_or_none()
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="예약을 찾을 수 없습니다")
    if booking.status in ("completed", "cancelled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 완료되었거나 취소된 예약입니다")

    booking.status = "cancelled"

    # 슬롯 예약 수 감소
    slot_result = await db.execute(select(ConsultationSlot).where(ConsultationSlot.id == booking.slot_id))
    slot = slot_result.scalar_one_or_none()
    if slot and slot.current_bookings > 0:
        slot.current_bookings -= 1

    await db.commit()
    return {"message": "상담 예약이 취소되었습니다"}
