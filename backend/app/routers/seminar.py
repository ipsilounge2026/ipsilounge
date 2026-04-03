import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.seminar_reservation import SeminarReservation
from app.models.seminar_schedule import SeminarSchedule
from app.models.user import User
from app.schemas.seminar import (
    DateAvailability,
    ScheduleAvailabilityResponse,
    SeminarReservationCancel,
    SeminarReservationCreate,
    SeminarReservationResponse,
    SeminarReservationUpdate,
    SeminarScheduleResponse,
)
from app.utils.dependencies import get_current_branch_manager

router = APIRouter(prefix="/api/seminar", tags=["설명회"])


def _schedule_to_response(schedule: SeminarSchedule) -> SeminarScheduleResponse:
    blocked = schedule.blocked_dates.split(",") if schedule.blocked_dates else None
    return SeminarScheduleResponse(
        id=schedule.id,
        title=schedule.title,
        description=schedule.description,
        start_date=schedule.start_date,
        end_date=schedule.end_date,
        blocked_dates=blocked,
        morning_max=schedule.morning_max,
        afternoon_max=schedule.afternoon_max,
        evening_max=schedule.evening_max,
        deadline_at=schedule.deadline_at,
        is_visible=schedule.is_visible,
        created_at=schedule.created_at,
    )


async def _get_slot_counts(schedule_id: uuid.UUID, db: AsyncSession) -> dict:
    """날짜+시간대별 현재 예약 수 조회 (취소 제외)"""
    result = await db.execute(
        select(
            SeminarReservation.reservation_date,
            SeminarReservation.time_slot,
            func.count(SeminarReservation.id).label("cnt"),
        )
        .where(
            SeminarReservation.schedule_id == schedule_id,
            SeminarReservation.status != "cancelled",
        )
        .group_by(SeminarReservation.reservation_date, SeminarReservation.time_slot)
    )
    counts = {}
    for row in result.all():
        key = (row.reservation_date, row.time_slot)
        counts[key] = row.cnt
    return counts


# --- 공개 일정 조회 ---

@router.get("/schedules", response_model=list[SeminarScheduleResponse])
async def list_visible_schedules(
    user: User = Depends(get_current_branch_manager),
    db: AsyncSession = Depends(get_db),
):
    """공개된 설명회 일정 목록"""
    result = await db.execute(
        select(SeminarSchedule)
        .where(SeminarSchedule.is_visible == True)
        .order_by(SeminarSchedule.start_date.desc())
    )
    schedules = result.scalars().all()
    return [_schedule_to_response(s) for s in schedules]


@router.get("/schedules/{schedule_id}/availability", response_model=ScheduleAvailabilityResponse)
async def get_schedule_availability(
    schedule_id: uuid.UUID,
    user: User = Depends(get_current_branch_manager),
    db: AsyncSession = Depends(get_db),
):
    """설명회 일정 상세 + 날짜별 잔여 현황"""
    result = await db.execute(
        select(SeminarSchedule).where(
            SeminarSchedule.id == schedule_id,
            SeminarSchedule.is_visible == True,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")

    # 마감일 지났으면 빈 리스트
    now = datetime.utcnow()
    if now > schedule.deadline_at:
        return ScheduleAvailabilityResponse(
            schedule=_schedule_to_response(schedule),
            available_dates=[],
        )

    # blocked_dates 파싱
    blocked_set = set()
    if schedule.blocked_dates:
        for d in schedule.blocked_dates.split(","):
            d = d.strip()
            if d:
                try:
                    blocked_set.add(date.fromisoformat(d))
                except ValueError:
                    pass

    # 날짜+시간대별 예약 수
    slot_counts = await _get_slot_counts(schedule_id, db)

    # 가용 날짜 계산
    available_dates = []
    current = schedule.start_date
    today = date.today()
    while current <= schedule.end_date:
        if current >= today and current not in blocked_set:
            m_remaining = schedule.morning_max - slot_counts.get((current, "morning"), 0)
            a_remaining = schedule.afternoon_max - slot_counts.get((current, "afternoon"), 0)
            e_remaining = schedule.evening_max - slot_counts.get((current, "evening"), 0)

            # 최소 하나의 시간대에 잔여가 있어야 표시
            if m_remaining > 0 or a_remaining > 0 or e_remaining > 0:
                available_dates.append(DateAvailability(
                    date=current,
                    morning_remaining=max(0, m_remaining),
                    afternoon_remaining=max(0, a_remaining),
                    evening_remaining=max(0, e_remaining),
                ))

        current += timedelta(days=1)

    return ScheduleAvailabilityResponse(
        schedule=_schedule_to_response(schedule),
        available_dates=available_dates,
    )


# --- 예약 신청 ---

@router.post("/reserve", response_model=SeminarReservationResponse)
async def create_reservation(
    data: SeminarReservationCreate,
    user: User = Depends(get_current_branch_manager),
    db: AsyncSession = Depends(get_db),
):
    """설명회 예약 신청"""
    # 일정 확인
    result = await db.execute(
        select(SeminarSchedule).where(
            SeminarSchedule.id == data.schedule_id,
            SeminarSchedule.is_visible == True,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")

    # 마감일 확인
    if datetime.utcnow() > schedule.deadline_at:
        raise HTTPException(status_code=400, detail="예약 마감일이 지났습니다")

    # 날짜 범위 확인
    if data.reservation_date < schedule.start_date or data.reservation_date > schedule.end_date:
        raise HTTPException(status_code=400, detail="신청 가능 기간이 아닙니다")

    # blocked_dates 확인
    if schedule.blocked_dates:
        blocked = [d.strip() for d in schedule.blocked_dates.split(",") if d.strip()]
        if data.reservation_date.isoformat() in blocked:
            raise HTTPException(status_code=400, detail="해당 날짜는 신청 불가입니다")

    # 시간대 유효성 확인
    if data.time_slot not in ("morning", "afternoon", "evening"):
        raise HTTPException(status_code=400, detail="유효하지 않은 시간대입니다")

    max_for_slot = {"morning": schedule.morning_max, "afternoon": schedule.afternoon_max, "evening": schedule.evening_max}
    if max_for_slot[data.time_slot] == 0:
        raise HTTPException(status_code=400, detail="해당 시간대는 운영하지 않습니다")

    # 정원 확인 (동시성 제어)
    current_count_result = await db.execute(
        select(func.count(SeminarReservation.id)).where(
            SeminarReservation.schedule_id == data.schedule_id,
            SeminarReservation.reservation_date == data.reservation_date,
            SeminarReservation.time_slot == data.time_slot,
            SeminarReservation.status != "cancelled",
        )
    )
    current_count = current_count_result.scalar() or 0
    if current_count >= max_for_slot[data.time_slot]:
        raise HTTPException(status_code=400, detail="해당 시간대의 예약이 마감되었습니다")

    # 동일 날짜+시간대 중복 예약 방지
    existing = await db.execute(
        select(SeminarReservation).where(
            SeminarReservation.schedule_id == data.schedule_id,
            SeminarReservation.user_id == user.id,
            SeminarReservation.reservation_date == data.reservation_date,
            SeminarReservation.time_slot == data.time_slot,
            SeminarReservation.status != "cancelled",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="동일 날짜/시간대에 이미 예약이 있습니다")

    reservation = SeminarReservation(
        schedule_id=data.schedule_id,
        user_id=user.id,
        branch_name=user.branch_name or "",
        contact_name=data.contact_name,
        contact_phone=data.contact_phone,
        reservation_date=data.reservation_date,
        time_slot=data.time_slot,
        attendee_count=data.attendee_count,
        memo=data.memo,
        status="pending",
    )
    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)

    return SeminarReservationResponse(
        id=reservation.id,
        schedule_id=reservation.schedule_id,
        schedule_title=schedule.title,
        branch_name=reservation.branch_name,
        contact_name=reservation.contact_name,
        contact_phone=reservation.contact_phone,
        reservation_date=reservation.reservation_date,
        time_slot=reservation.time_slot,
        attendee_count=reservation.attendee_count,
        memo=reservation.memo,
        status=reservation.status,
        applied_at=reservation.applied_at,
    )


# --- 내 예약 목록 ---

@router.get("/my")
async def get_my_reservations(
    user: User = Depends(get_current_branch_manager),
    db: AsyncSession = Depends(get_db),
):
    """내 설명회 예약 목록"""
    result = await db.execute(
        select(SeminarReservation, SeminarSchedule)
        .join(SeminarSchedule, SeminarReservation.schedule_id == SeminarSchedule.id)
        .where(SeminarReservation.user_id == user.id)
        .order_by(SeminarReservation.applied_at.desc())
    )
    rows = result.all()

    items = [
        SeminarReservationResponse(
            id=res.id,
            schedule_id=res.schedule_id,
            schedule_title=sched.title,
            branch_name=res.branch_name,
            contact_name=res.contact_name,
            contact_phone=res.contact_phone,
            reservation_date=res.reservation_date,
            time_slot=res.time_slot,
            attendee_count=res.attendee_count,
            actual_attendee_count=res.actual_attendee_count,
            memo=res.memo,
            status=res.status,
            applied_at=res.applied_at,
            approved_at=res.approved_at,
            modify_reason=res.modify_reason,
            cancel_reason=res.cancel_reason,
        )
        for res, sched in rows
    ]
    return {"items": items, "total": len(items)}


# --- 예약 수정 ---

@router.put("/{reservation_id}", response_model=SeminarReservationResponse)
async def modify_reservation(
    reservation_id: uuid.UUID,
    data: SeminarReservationUpdate,
    user: User = Depends(get_current_branch_manager),
    db: AsyncSession = Depends(get_db),
):
    """예약 수정 (사유 필수)"""
    result = await db.execute(
        select(SeminarReservation).where(
            SeminarReservation.id == reservation_id,
            SeminarReservation.user_id == user.id,
        )
    )
    reservation = result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")
    if reservation.status == "cancelled":
        raise HTTPException(status_code=400, detail="취소된 예약은 수정할 수 없습니다")

    # 날짜/시간대 변경 시 유효성 검증
    new_date = data.reservation_date or reservation.reservation_date
    new_slot = data.time_slot or reservation.time_slot

    if data.reservation_date or data.time_slot:
        # 일정 조회
        sched_result = await db.execute(
            select(SeminarSchedule).where(SeminarSchedule.id == reservation.schedule_id)
        )
        schedule = sched_result.scalar_one_or_none()
        if not schedule:
            raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")

        if new_date < schedule.start_date or new_date > schedule.end_date:
            raise HTTPException(status_code=400, detail="신청 가능 기간이 아닙니다")

        if schedule.blocked_dates:
            blocked = [d.strip() for d in schedule.blocked_dates.split(",") if d.strip()]
            if new_date.isoformat() in blocked:
                raise HTTPException(status_code=400, detail="해당 날짜는 신청 불가입니다")

        max_for_slot = {"morning": schedule.morning_max, "afternoon": schedule.afternoon_max, "evening": schedule.evening_max}
        if max_for_slot.get(new_slot, 0) == 0:
            raise HTTPException(status_code=400, detail="해당 시간대는 운영하지 않습니다")

        # 정원 확인 (현재 예약 제외)
        current_count_result = await db.execute(
            select(func.count(SeminarReservation.id)).where(
                SeminarReservation.schedule_id == reservation.schedule_id,
                SeminarReservation.reservation_date == new_date,
                SeminarReservation.time_slot == new_slot,
                SeminarReservation.status != "cancelled",
                SeminarReservation.id != reservation_id,
            )
        )
        current_count = current_count_result.scalar() or 0
        if current_count >= max_for_slot[new_slot]:
            raise HTTPException(status_code=400, detail="해당 시간대의 예약이 마감되었습니다")

    # 필드 업데이트
    if data.reservation_date is not None:
        reservation.reservation_date = data.reservation_date
    if data.time_slot is not None:
        reservation.time_slot = data.time_slot
    if data.contact_name is not None:
        reservation.contact_name = data.contact_name
    if data.contact_phone is not None:
        reservation.contact_phone = data.contact_phone
    if data.attendee_count is not None:
        reservation.attendee_count = data.attendee_count
    if data.memo is not None:
        reservation.memo = data.memo

    reservation.modify_reason = data.modify_reason
    reservation.status = "modified"
    reservation.approved_at = None  # 재승인 필요

    await db.commit()
    await db.refresh(reservation)

    # 일정 제목 조회
    sched_result = await db.execute(
        select(SeminarSchedule).where(SeminarSchedule.id == reservation.schedule_id)
    )
    schedule = sched_result.scalar_one_or_none()

    # TODO: 관리자에게 재승인 요청 이메일 발송

    return SeminarReservationResponse(
        id=reservation.id,
        schedule_id=reservation.schedule_id,
        schedule_title=schedule.title if schedule else None,
        branch_name=reservation.branch_name,
        contact_name=reservation.contact_name,
        contact_phone=reservation.contact_phone,
        reservation_date=reservation.reservation_date,
        time_slot=reservation.time_slot,
        attendee_count=reservation.attendee_count,
        memo=reservation.memo,
        status=reservation.status,
        applied_at=reservation.applied_at,
        modify_reason=reservation.modify_reason,
    )


# --- 예약 취소 ---

@router.put("/{reservation_id}/cancel")
async def cancel_reservation(
    reservation_id: uuid.UUID,
    data: SeminarReservationCancel,
    user: User = Depends(get_current_branch_manager),
    db: AsyncSession = Depends(get_db),
):
    """예약 취소 (사유 필수)"""
    result = await db.execute(
        select(SeminarReservation).where(
            SeminarReservation.id == reservation_id,
            SeminarReservation.user_id == user.id,
        )
    )
    reservation = result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")
    if reservation.status == "cancelled":
        raise HTTPException(status_code=400, detail="이미 취소된 예약입니다")

    reservation.status = "cancelled"
    reservation.cancel_reason = data.cancel_reason
    await db.commit()

    # TODO: 취소 안내 이메일 발송

    return {"message": "예약이 취소되었습니다"}
