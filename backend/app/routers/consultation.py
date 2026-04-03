import uuid
from datetime import date, datetime

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.consultation_booking import ConsultationBooking
from app.models.consultation_slot import ConsultationSlot
from app.models.user import User
from app.schemas.consultation import (
    AvailableSlotResponse,
    BookingRequest,
    BookingResponse,
    CounselorResponse,
    MyBookingListResponse,
)
from app.services.consultation_service import check_slot_available
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/consultation", tags=["상담예약"])


@router.get("/counselors")
async def get_counselors(
    db: AsyncSession = Depends(get_db),
):
    """상담 가능한 관리자/상담자 목록 (사용자용)"""
    # 활성 슬롯이 있는 관리자만 반환
    result = await db.execute(
        select(ConsultationSlot.admin_id)
        .where(
            ConsultationSlot.is_active == True,
            ConsultationSlot.date >= date.today(),
            ConsultationSlot.admin_id.isnot(None),
        )
        .distinct()
    )
    admin_ids = [row[0] for row in result.all()]

    if not admin_ids:
        return []

    counselors = []
    for aid in admin_ids:
        try:
            aid_uuid = uuid.UUID(aid)
        except ValueError:
            continue
        admin_result = await db.execute(
            select(Admin).where(Admin.id == aid_uuid, Admin.is_active == True)
        )
        admin = admin_result.scalar_one_or_none()
        if admin:
            counselors.append({"id": str(admin.id), "name": admin.name})

    return counselors


@router.get("/slots", response_model=list[AvailableSlotResponse])
async def get_available_slots(
    year: int = Query(...),
    month: int = Query(...),
    admin_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """예약 가능 시간대 조회 (달력용)"""
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)

    conditions = [
        ConsultationSlot.date >= start_date,
        ConsultationSlot.date < end_date,
        ConsultationSlot.is_active == True,
        ConsultationSlot.date >= date.today(),
    ]

    if admin_id:
        conditions.append(ConsultationSlot.admin_id == admin_id)

    result = await db.execute(
        select(ConsultationSlot).where(and_(*conditions))
        .order_by(ConsultationSlot.date, ConsultationSlot.start_time)
    )
    slots = result.scalars().all()

    # admin_name 일괄 조회
    admin_ids = set(s.admin_id for s in slots if s.admin_id)
    admin_names = {}
    for aid in admin_ids:
        try:
            aid_uuid = uuid.UUID(aid)
        except ValueError:
            continue
        admin_result = await db.execute(select(Admin).where(Admin.id == aid_uuid))
        admin_obj = admin_result.scalar_one_or_none()
        if admin_obj:
            admin_names[aid] = admin_obj.name

    return [
        AvailableSlotResponse(
            id=s.id,
            date=s.date,
            start_time=s.start_time,
            end_time=s.end_time,
            remaining=s.max_bookings - s.current_bookings,
            admin_id=s.admin_id,
            admin_name=admin_names.get(s.admin_id),
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
    # 3개월 쿨다운 확인
    last_booking_result = await db.execute(
        select(ConsultationBooking).where(
            ConsultationBooking.user_id == user.id,
            ConsultationBooking.status != "cancelled",
        ).order_by(ConsultationBooking.created_at.desc())
    )
    last_b = last_booking_result.scalar_one_or_none()
    if last_b:
        cooldown_end = last_b.created_at + relativedelta(months=3)
        if datetime.utcnow() < cooldown_end:
            raise HTTPException(
                status_code=400,
                detail=f"이전 상담 예약일({last_b.created_at.strftime('%Y.%m.%d')}) 기준 3개월 이후({cooldown_end.strftime('%Y.%m.%d')})부터 재예약이 가능합니다."
            )

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

    # 관리자 이름 조회
    admin_name = None
    if slot.admin_id:
        try:
            aid_uuid = uuid.UUID(slot.admin_id)
            admin_result = await db.execute(select(Admin).where(Admin.id == aid_uuid))
            admin_obj = admin_result.scalar_one_or_none()
            if admin_obj:
                admin_name = admin_obj.name
        except ValueError:
            pass

    return BookingResponse(
        id=booking.id,
        slot_date=slot.date,
        slot_start_time=slot.start_time,
        slot_end_time=slot.end_time,
        type=booking.type,
        memo=booking.memo,
        status=booking.status,
        admin_name=admin_name,
        created_at=booking.created_at,
    )


@router.get("/check-booking-cooldown")
async def check_booking_cooldown(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """상담 예약 쿨다운 확인"""
    last_booking_result = await db.execute(
        select(ConsultationBooking).where(
            ConsultationBooking.user_id == user.id,
            ConsultationBooking.status != "cancelled",
        ).order_by(ConsultationBooking.created_at.desc())
    )
    last = last_booking_result.scalar_one_or_none()
    if not last:
        return {"can_book": True, "cooldown_until": None, "last_booked": None}

    cooldown_end = last.created_at + relativedelta(months=3)
    can_book = datetime.utcnow() >= cooldown_end
    return {
        "can_book": can_book,
        "cooldown_until": cooldown_end.strftime("%Y-%m-%d") if not can_book else None,
        "last_booked": last.created_at.strftime("%Y-%m-%d"),
    }


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

    # admin_name 조회
    admin_ids = set(slot.admin_id for _, slot in rows if slot.admin_id)
    admin_names = {}
    for aid in admin_ids:
        try:
            aid_uuid = uuid.UUID(aid)
            admin_result = await db.execute(select(Admin).where(Admin.id == aid_uuid))
            admin_obj = admin_result.scalar_one_or_none()
            if admin_obj:
                admin_names[aid] = admin_obj.name
        except ValueError:
            pass

    items = [
        BookingResponse(
            id=booking.id,
            slot_date=slot.date,
            slot_start_time=slot.start_time,
            slot_end_time=slot.end_time,
            type=booking.type,
            memo=booking.memo,
            status=booking.status,
            admin_name=admin_names.get(slot.admin_id),
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
