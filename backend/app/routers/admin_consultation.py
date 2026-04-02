import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.consultation_booking import ConsultationBooking
from app.models.consultation_slot import ConsultationSlot
from app.models.user import User
from app.schemas.consultation import (
    AdminBookingResponse,
    AdminSlotResponse,
    BookingStatusUpdate,
    SlotBulkCreateRequest,
    SlotCreateRequest,
    SlotUpdateRequest,
)
from app.services.consultation_service import create_bulk_slots
from app.services.notification_service import send_booking_confirmed_notification
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/consultation", tags=["관리자-상담"])


# --- 시간대 관리 ---

@router.post("/slots", response_model=AdminSlotResponse)
async def create_slot(
    data: SlotCreateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담 가능 시간 생성"""
    slot = ConsultationSlot(
        date=data.date,
        start_time=data.start_time,
        end_time=data.end_time,
        max_bookings=data.max_bookings,
    )
    db.add(slot)
    await db.commit()
    await db.refresh(slot)
    return slot


@router.post("/slots/bulk")
async def create_slots_bulk(
    data: SlotBulkCreateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """반복 시간 일괄 생성"""
    count = await create_bulk_slots(data, db)
    return {"message": f"{count}개의 상담 시간대가 생성되었습니다", "created_count": count}


@router.get("/slots", response_model=list[AdminSlotResponse])
async def list_slots(
    year: int = Query(...),
    month: int = Query(...),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """시간대 목록 조회"""
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)

    result = await db.execute(
        select(ConsultationSlot)
        .where(and_(ConsultationSlot.date >= start_date, ConsultationSlot.date < end_date))
        .order_by(ConsultationSlot.date, ConsultationSlot.start_time)
    )
    return result.scalars().all()


@router.put("/slots/{slot_id}", response_model=AdminSlotResponse)
async def update_slot(
    slot_id: uuid.UUID,
    data: SlotUpdateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """시간대 수정"""
    result = await db.execute(select(ConsultationSlot).where(ConsultationSlot.id == slot_id))
    slot = result.scalar_one_or_none()
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="시간대를 찾을 수 없습니다")

    if data.max_bookings is not None:
        slot.max_bookings = data.max_bookings
    if data.is_active is not None:
        slot.is_active = data.is_active

    await db.commit()
    await db.refresh(slot)
    return slot


@router.delete("/slots/{slot_id}")
async def delete_slot(
    slot_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """시간대 삭제 (예약이 없는 경우만)"""
    result = await db.execute(select(ConsultationSlot).where(ConsultationSlot.id == slot_id))
    slot = result.scalar_one_or_none()
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="시간대를 찾을 수 없습니다")

    if slot.current_bookings > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="예약이 있는 시간대는 삭제할 수 없습니다. 비활성화를 사용해주세요.")

    await db.delete(slot)
    await db.commit()
    return {"message": "시간대가 삭제되었습니다"}


# --- 예약 관리 ---

@router.get("/bookings")
async def list_bookings(
    status_filter: str | None = None,
    year: int | None = None,
    month: int | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """전체 예약 목록"""
    query = (
        select(ConsultationBooking, ConsultationSlot, User)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .join(User, ConsultationBooking.user_id == User.id)
    )

    if status_filter:
        query = query.where(ConsultationBooking.status == status_filter)

    if year and month:
        start_date = date(year, month, 1)
        end_date = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        query = query.where(and_(ConsultationSlot.date >= start_date, ConsultationSlot.date < end_date))

    query = query.order_by(ConsultationSlot.date.desc(), ConsultationSlot.start_time.desc())

    result = await db.execute(query)
    rows = result.all()

    items = [
        AdminBookingResponse(
            id=booking.id,
            user_id=user.id,
            user_name=user.name,
            user_email=user.email,
            user_phone=user.phone,
            slot_date=slot.date,
            slot_start_time=slot.start_time,
            slot_end_time=slot.end_time,
            type=booking.type,
            memo=booking.memo,
            status=booking.status,
            created_at=booking.created_at,
        )
        for booking, slot, user in rows
    ]

    return {"items": items, "total": len(items)}


@router.put("/bookings/{booking_id}/status")
async def update_booking_status(
    booking_id: uuid.UUID,
    data: BookingStatusUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """예약 상태 변경"""
    result = await db.execute(select(ConsultationBooking).where(ConsultationBooking.id == booking_id))
    booking = result.scalar_one_or_none()
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="예약을 찾을 수 없습니다")

    booking.status = data.status

    # 확정 시 사용자에게 알림
    if data.status == "confirmed":
        user_result = await db.execute(select(User).where(User.id == booking.user_id))
        user = user_result.scalar_one_or_none()
        if user:
            await send_booking_confirmed_notification(user, db)

    # 취소 시 슬롯 예약 수 감소
    if data.status == "cancelled":
        slot_result = await db.execute(select(ConsultationSlot).where(ConsultationSlot.id == booking.slot_id))
        slot = slot_result.scalar_one_or_none()
        if slot and slot.current_bookings > 0:
            slot.current_bookings -= 1

    await db.commit()
    return {"message": f"예약 상태가 '{data.status}'로 변경되었습니다"}
