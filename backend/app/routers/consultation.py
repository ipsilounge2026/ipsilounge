import uuid
from datetime import date, datetime

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel

from app.database import get_db
from app.models.admin import Admin, AdminStudentAssignment
from app.models.consultation_booking import ConsultationBooking
from app.models.consultation_slot import ConsultationSlot
from app.models.counselor_change_request import CounselorChangeRequest
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
from app.utils.family import get_visible_owner_ids


async def _get_assigned_admin(user_id, db: AsyncSession):
    """사용자에게 매칭된 주 담당자 조회"""
    result = await db.execute(
        select(AdminStudentAssignment).where(AdminStudentAssignment.user_id == user_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        return None
    admin_result = await db.execute(
        select(Admin).where(Admin.id == assignment.admin_id, Admin.is_active == True)
    )
    return admin_result.scalar_one_or_none()

router = APIRouter(prefix="/api/consultation", tags=["상담예약"])


@router.get("/counselors")
async def get_counselors(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """상담 가능한 관리자/상담자 목록 (사용자용) - 주 담당자가 있으면 그 사람만 반환"""
    assigned_admin = await _get_assigned_admin(user.id, db)

    if assigned_admin:
        # 주 담당자가 있으면 그 담당자만 반환 (+ 활성 슬롯이 있는지 여부도 함께)
        slot_check = await db.execute(
            select(ConsultationSlot.id).where(
                ConsultationSlot.admin_id == str(assigned_admin.id),
                ConsultationSlot.is_active == True,
                ConsultationSlot.date >= date.today(),
            ).limit(1)
        )
        has_slots = slot_check.scalar_one_or_none() is not None
        return {
            "assigned": True,
            "counselors": [{"id": str(assigned_admin.id), "name": assigned_admin.name}],
            "has_slots": has_slots,
        }

    # 주 담당자 없으면 활성 슬롯이 있는 전체 상담자 반환
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
        return {"assigned": False, "counselors": [], "has_slots": False}

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

    return {"assigned": False, "counselors": counselors, "has_slots": True}


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
    # 3개월 쿨다운 확인 (실제 상담 진행일 기준)
    last_booking_result = await db.execute(
        select(ConsultationBooking, ConsultationSlot)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .where(
            ConsultationBooking.user_id == user.id,
            ConsultationBooking.status != "cancelled",
        )
        .order_by(ConsultationSlot.date.desc())
    )
    last_row = last_booking_result.first()
    if last_row:
        last_slot_date = last_row[1].date  # ConsultationSlot.date
        cooldown_end = last_slot_date + relativedelta(months=3)
        if date.today() < cooldown_end:
            raise HTTPException(
                status_code=400,
                detail=f"이전 상담일({last_slot_date.strftime('%Y.%m.%d')}) 기준 3개월 이후({cooldown_end.strftime('%Y.%m.%d')})부터 재예약이 가능합니다."
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

    # 주 담당자가 없는 경우 → 선택한 상담자를 자동으로 주 담당자로 매칭
    if slot.admin_id:
        existing_assignment = await db.execute(
            select(AdminStudentAssignment).where(AdminStudentAssignment.user_id == user.id)
        )
        if existing_assignment.scalar_one_or_none() is None:
            try:
                admin_uuid = uuid.UUID(slot.admin_id)
                new_assignment = AdminStudentAssignment(admin_id=admin_uuid, user_id=user.id)
                db.add(new_assignment)
            except ValueError:
                pass

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
        cancel_reason=booking.cancel_reason,
        admin_name=admin_name,
        created_at=booking.created_at,
    )


@router.get("/check-booking-cooldown")
async def check_booking_cooldown(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """상담 예약 쿨다운 확인 (실제 상담 진행일 기준)"""
    last_booking_result = await db.execute(
        select(ConsultationBooking, ConsultationSlot)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .where(
            ConsultationBooking.user_id == user.id,
            ConsultationBooking.status != "cancelled",
        )
        .order_by(ConsultationSlot.date.desc())
    )
    last_row = last_booking_result.first()
    if not last_row:
        return {"can_book": True, "cooldown_until": None, "last_booked": None}

    last_slot_date = last_row[1].date  # ConsultationSlot.date
    cooldown_end = last_slot_date + relativedelta(months=3)
    can_book = date.today() >= cooldown_end
    return {
        "can_book": can_book,
        "cooldown_until": cooldown_end.isoformat() if not can_book else None,
        "last_booked": last_slot_date.isoformat(),
    }


@router.get("/my", response_model=MyBookingListResponse)
async def get_my_bookings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내 상담 예약 목록.

    가시성 규칙:
    - 학생: 본인 예약만
    - 학부모: 본인 + 연결된 자녀들의 예약 (가족 연결 도입 전 학부모 직접 예약분 포함)
    """
    visible_ids = await get_visible_owner_ids(user, db)
    result = await db.execute(
        select(ConsultationBooking, ConsultationSlot)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .where(ConsultationBooking.user_id.in_(visible_ids))
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
            cancel_reason=booking.cancel_reason,
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

    # Google Calendar 일정 삭제
    if booking.google_event_id:
        from app.services.calendar_service import delete_consultation_event
        await delete_consultation_event(booking.google_event_id)
        booking.google_event_id = None

    booking.status = "cancelled"

    # 슬롯 예약 수 감소
    slot_result = await db.execute(select(ConsultationSlot).where(ConsultationSlot.id == booking.slot_id))
    slot = slot_result.scalar_one_or_none()
    if slot and slot.current_bookings > 0:
        slot.current_bookings -= 1

    await db.commit()
    return {"message": "상담 예약이 취소되었습니다"}


# --- 내 담당자 관련 ---

@router.get("/my-counselor")
async def get_my_counselor(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내 주 담당자 조회"""
    assigned_admin = await _get_assigned_admin(user.id, db)
    if assigned_admin:
        return {
            "assigned": True,
            "counselor": {"id": str(assigned_admin.id), "name": assigned_admin.name},
        }
    return {"assigned": False, "counselor": None}


@router.get("/available-counselors")
async def get_available_counselors(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """담당자 변경 시 선택 가능한 상담자 목록 (현재 담당자 제외)"""
    assigned_admin = await _get_assigned_admin(user.id, db)
    current_admin_id = assigned_admin.id if assigned_admin else None

    result = await db.execute(
        select(Admin).where(Admin.is_active == True, Admin.role.in_(["admin", "counselor", "super_admin"]))
    )
    admins = result.scalars().all()

    counselors = [
        {"id": str(a.id), "name": a.name}
        for a in admins
        if a.id != current_admin_id
    ]
    return counselors


class CounselorChangeRequestCreate(BaseModel):
    requested_admin_id: str | None = None  # None = 추천 희망
    reason: str


@router.post("/change-counselor-request")
async def create_counselor_change_request(
    data: CounselorChangeRequestCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """담당자 변경 요청"""
    # 이미 대기중인 요청이 있는지 확인
    existing = await db.execute(
        select(CounselorChangeRequest).where(
            CounselorChangeRequest.user_id == user.id,
            CounselorChangeRequest.status == "pending",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 처리 대기 중인 변경 요청이 있습니다.")

    assigned_admin = await _get_assigned_admin(user.id, db)

    req = CounselorChangeRequest(
        user_id=user.id,
        current_admin_id=assigned_admin.id if assigned_admin else None,
        requested_admin_id=uuid.UUID(data.requested_admin_id) if data.requested_admin_id else None,
        reason=data.reason,
    )
    db.add(req)
    await db.commit()
    return {"message": "담당자 변경 요청이 접수되었습니다."}
