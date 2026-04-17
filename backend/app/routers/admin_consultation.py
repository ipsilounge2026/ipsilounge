import uuid
from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta

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
    ManualBookingRequest,
    SlotCreateRequest,
    SlotUpdateRequest,
)
from app.services.notification_service import send_booking_confirmed_notification
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/consultation", tags=["관리자-상담"])


async def _get_admin_name(admin_id: str | None, db: AsyncSession) -> str | None:
    if not admin_id:
        return None
    try:
        aid = uuid.UUID(admin_id)
    except ValueError:
        return None
    result = await db.execute(select(Admin).where(Admin.id == aid))
    admin = result.scalar_one_or_none()
    return admin.name if admin else None


async def _build_slot_response(slot: ConsultationSlot, db: AsyncSession, admin_names: dict | None = None) -> AdminSlotResponse:
    if admin_names and slot.admin_id in admin_names:
        name = admin_names[slot.admin_id]
    else:
        name = await _get_admin_name(slot.admin_id, db)
    return AdminSlotResponse(
        id=slot.id,
        admin_id=slot.admin_id,
        admin_name=name,
        repeat_group_id=slot.repeat_group_id,
        date=slot.date,
        start_time=slot.start_time,
        end_time=slot.end_time,
        max_bookings=slot.max_bookings,
        current_bookings=slot.current_bookings,
        is_active=slot.is_active,
    )


# --- 상담 가능한 관리자/상담자 목록 ---

@router.get("/counselors")
async def list_counselors(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담 가능한 관리자/상담자/선배 목록"""
    if admin.role == "super_admin":
        result = await db.execute(
            select(Admin).where(Admin.is_active == True, Admin.role.in_(["admin", "counselor", "senior"]))
        )
        admins = result.scalars().all()
        items = [{"id": str(a.id), "name": a.name, "role": a.role} for a in admins]
        items.insert(0, {"id": str(admin.id), "name": admin.name, "role": admin.role})
        return items
    else:
        return [{"id": str(admin.id), "name": admin.name, "role": admin.role}]


# --- 시간대 관리 ---

@router.post("/slots")
async def create_slot(
    data: SlotCreateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담 시간 생성 (단건 + 반복)"""
    if data.end_time <= data.start_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="종료 시간은 시작 시간보다 이후여야 합니다")

    slot_admin_id = data.admin_id if admin.role == "super_admin" and data.admin_id else str(admin.id)

    # 반복 그룹 ID 생성 (반복인 경우)
    repeat_group_id = str(uuid.uuid4()) if data.repeat_type and data.repeat_count > 0 else None

    dates_to_create = [data.date]

    if data.repeat_type == "weekly" and data.repeat_count > 0:
        for i in range(1, data.repeat_count + 1):
            dates_to_create.append(data.date + timedelta(weeks=i))
    elif data.repeat_type == "monthly" and data.repeat_count > 0:
        for i in range(1, data.repeat_count + 1):
            dates_to_create.append(data.date + relativedelta(months=i))

    created = []
    for d in dates_to_create:
        # 중복 확인
        existing = await db.execute(
            select(ConsultationSlot).where(
                ConsultationSlot.admin_id == slot_admin_id,
                ConsultationSlot.date == d,
                ConsultationSlot.start_time == data.start_time,
            )
        )
        if existing.scalar_one_or_none():
            continue

        slot = ConsultationSlot(
            admin_id=slot_admin_id,
            repeat_group_id=repeat_group_id,
            date=d,
            start_time=data.start_time,
            end_time=data.end_time,
            max_bookings=data.max_bookings,
        )
        db.add(slot)
        created.append(slot)

    await db.commit()
    for s in created:
        await db.refresh(s)

    return {
        "message": f"{len(created)}건의 상담 시간이 생성되었습니다",
        "created_count": len(created),
        "repeat_group_id": repeat_group_id,
    }


@router.get("/slots")
async def list_slots(
    year: int = Query(...),
    month: int = Query(...),
    admin_id: str | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """시간대 목록 조회"""
    start_date = date(year, month, 1)
    end_date = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    conditions = [ConsultationSlot.date >= start_date, ConsultationSlot.date < end_date]

    if admin.role != "super_admin":
        conditions.append(ConsultationSlot.admin_id == str(admin.id))
    elif admin_id:
        conditions.append(ConsultationSlot.admin_id == admin_id)

    result = await db.execute(
        select(ConsultationSlot).where(and_(*conditions))
        .order_by(ConsultationSlot.date, ConsultationSlot.start_time)
    )
    slots = result.scalars().all()

    admin_ids = set(s.admin_id for s in slots if s.admin_id)
    admin_names = {}
    for aid in admin_ids:
        admin_names[aid] = await _get_admin_name(aid, db)

    return [await _build_slot_response(s, db, admin_names) for s in slots]


@router.put("/slots/{slot_id}")
async def update_slot(
    slot_id: uuid.UUID,
    data: SlotUpdateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """시간대 수정 (단건 또는 반복 전체)"""
    if data.start_time is not None and data.end_time is not None and data.end_time <= data.start_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="종료 시간은 시작 시간보다 이후여야 합니다")

    result = await db.execute(select(ConsultationSlot).where(ConsultationSlot.id == slot_id))
    slot = result.scalar_one_or_none()
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="시간대를 찾을 수 없습니다")
    if admin.role != "super_admin" and slot.admin_id != str(admin.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="본인의 시간대만 수정할 수 있습니다")

    # 수정할 슬롯 목록 결정
    if data.update_scope == "future_all" and slot.repeat_group_id:
        # 해당 슬롯 날짜 이후의 동일 반복 그룹 전체
        r = await db.execute(
            select(ConsultationSlot).where(
                ConsultationSlot.repeat_group_id == slot.repeat_group_id,
                ConsultationSlot.date >= slot.date,
            )
        )
        slots_to_update = r.scalars().all()
    else:
        slots_to_update = [slot]

    updated_count = 0
    for s in slots_to_update:
        if data.start_time is not None:
            s.start_time = data.start_time
        if data.end_time is not None:
            s.end_time = data.end_time
        if data.max_bookings is not None:
            s.max_bookings = data.max_bookings
        if data.is_active is not None:
            s.is_active = data.is_active
        updated_count += 1

    await db.commit()
    return {"message": f"{updated_count}건이 수정되었습니다"}


@router.delete("/slots/{slot_id}")
async def delete_slot(
    slot_id: uuid.UUID,
    scope: str = "single",  # "single" / "future_all"
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """시간대 삭제"""
    result = await db.execute(select(ConsultationSlot).where(ConsultationSlot.id == slot_id))
    slot = result.scalar_one_or_none()
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="시간대를 찾을 수 없습니다")
    if admin.role != "super_admin" and slot.admin_id != str(admin.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="본인의 시간대만 삭제할 수 있습니다")

    if scope == "future_all" and slot.repeat_group_id:
        r = await db.execute(
            select(ConsultationSlot).where(
                ConsultationSlot.repeat_group_id == slot.repeat_group_id,
                ConsultationSlot.date >= slot.date,
            )
        )
        slots_to_delete = r.scalars().all()
    else:
        slots_to_delete = [slot]

    deleted = 0
    skipped = 0
    for s in slots_to_delete:
        if s.current_bookings > 0:
            skipped += 1
            continue
        await db.delete(s)
        deleted += 1

    await db.commit()
    msg = f"{deleted}건 삭제 완료"
    if skipped > 0:
        msg += f" ({skipped}건은 예약이 있어 삭제 불가)"
    return {"message": msg, "deleted": deleted, "skipped": skipped}


# --- 예약 관리 ---

@router.get("/bookings")
async def list_bookings(
    status_filter: str | None = None,
    year: int | None = None,
    month: int | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """전체 예약 목록 (담당자/상담자는 본인 슬롯 예약만)"""
    query = (
        select(ConsultationBooking, ConsultationSlot, User)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .join(User, ConsultationBooking.user_id == User.id)
    )

    # 최고관리자가 아니면 본인 슬롯의 예약만
    if admin.role != "super_admin":
        query = query.where(ConsultationSlot.admin_id == str(admin.id))

    if status_filter == "overdue":
        # 완료 미처리: 슬롯 날짜가 지났는데 아직 confirmed 상태인 예약
        query = query.where(
            and_(
                ConsultationBooking.status == "confirmed",
                ConsultationSlot.date < date.today(),
            )
        )
    elif status_filter:
        query = query.where(ConsultationBooking.status == status_filter)

    if year and month:
        start_date = date(year, month, 1)
        end_date = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        query = query.where(and_(ConsultationSlot.date >= start_date, ConsultationSlot.date < end_date))

    query = query.order_by(ConsultationSlot.date.desc(), ConsultationSlot.start_time.desc())

    result = await db.execute(query)
    rows = result.all()

    admin_ids = set(slot.admin_id for _, slot, _ in rows if slot.admin_id)
    admin_names = {}
    for aid in admin_ids:
        admin_names[aid] = await _get_admin_name(aid, db)

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
            admin_name=admin_names.get(slot.admin_id),
            type=booking.type,
            mode=booking.mode,
            meeting_url=booking.meeting_url,
            memo=booking.memo,
            status=booking.status,
            cancel_reason=booking.cancel_reason,
            created_at=booking.created_at,
        )
        for booking, slot, user in rows
    ]

    return {"items": items, "total": len(items)}


@router.get("/bookings/overdue-count")
async def overdue_bookings_count(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """완료 미처리 예약 건수 (과거 일정 + confirmed 상태). 대시보드 뱃지용."""
    from sqlalchemy import func as _func

    q = (
        select(_func.count(ConsultationBooking.id))
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .where(
            and_(
                ConsultationBooking.status == "confirmed",
                ConsultationSlot.date < date.today(),
            )
        )
    )
    if admin.role != "super_admin":
        q = q.where(ConsultationSlot.admin_id == str(admin.id))

    count = (await db.execute(q)).scalar() or 0
    return {"count": int(count)}


@router.get("/bookings/{booking_id}")
async def get_booking_detail(
    booking_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """예약 상세 조회"""
    result = await db.execute(
        select(ConsultationBooking, ConsultationSlot, User)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .join(User, ConsultationBooking.user_id == User.id)
        .where(ConsultationBooking.id == booking_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")

    booking, slot, user = row
    admin_name = await _get_admin_name(slot.admin_id, db) if slot.admin_id else None

    # 해당 학생의 설문 목록도 함께 조회
    from app.models.consultation_survey import ConsultationSurvey
    survey_q = (
        select(ConsultationSurvey)
        .where(ConsultationSurvey.user_id == user.id)
        .order_by(ConsultationSurvey.created_at.desc())
        .limit(5)
    )
    surveys = (await db.execute(survey_q)).scalars().all()

    return {
        "id": str(booking.id),
        "user_id": str(user.id),
        "user_name": user.name,
        "user_email": user.email,
        "user_phone": user.phone,
        "slot_date": str(slot.date),
        "slot_start_time": str(slot.start_time),
        "slot_end_time": str(slot.end_time),
        "admin_name": admin_name,
        "type": booking.type,
        "mode": booking.mode,
        "meeting_url": booking.meeting_url,
        "memo": booking.memo,
        "status": booking.status,
        "cancel_reason": booking.cancel_reason,
        "created_at": booking.created_at.isoformat(),
        "surveys": [
            {
                "id": str(s.id),
                "survey_type": s.survey_type,
                "timing": s.timing,
                "status": s.status,
                "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
            }
            for s in surveys
        ],
    }


@router.put("/bookings/{booking_id}/status")
async def update_booking_status(
    booking_id: uuid.UUID,
    data: BookingStatusUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """예약 상태 변경

    권한:
    - super_admin / admin: 모든 예약 상태 변경 가능
    - counselor / senior: 자신이 담당하는 슬롯의 예약만 변경 가능
    """
    result = await db.execute(select(ConsultationBooking).where(ConsultationBooking.id == booking_id))
    booking = result.scalar_one_or_none()
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="예약을 찾을 수 없습니다")

    # 슬롯 + 담당자 확인 (권한 가드 + 후속 알림용)
    slot_result = await db.execute(select(ConsultationSlot).where(ConsultationSlot.id == booking.slot_id))
    slot = slot_result.scalar_one_or_none()

    if admin.role not in ("super_admin", "admin"):
        # counselor / senior: 본인 슬롯만
        if not slot or str(slot.admin_id) != str(admin.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="본인이 담당하는 예약만 상태를 변경할 수 있습니다",
            )

    booking.status = data.status
    if data.status == "cancelled" and data.cancel_reason:
        booking.cancel_reason = data.cancel_reason

    if data.status == "confirmed":
        user_result = await db.execute(select(User).where(User.id == booking.user_id))
        user = user_result.scalar_one_or_none()
        if user:
            await send_booking_confirmed_notification(user, db)
            # 확정 이메일 발송
            if slot:
                from app.services.email_service import send_consultation_confirmed_email
                await send_consultation_confirmed_email(
                    user.email, user.name,
                    str(slot.date), f"{str(slot.start_time)[:5]} ~ {str(slot.end_time)[:5]}",
                )
                # Google Calendar 연동
                from app.services.calendar_service import create_consultation_event
                event_id = await create_consultation_event(
                    booking_id=str(booking.id),
                    user_name=user.name,
                    consultation_type=booking.type,
                    date=str(slot.date),
                    start_time=str(slot.start_time)[:5],
                    end_time=str(slot.end_time)[:5],
                    memo=booking.memo,
                )
                if event_id:
                    booking.google_event_id = event_id

    if data.status == "cancelled":
        # Google Calendar 일정 삭제
        if booking.google_event_id:
            from app.services.calendar_service import delete_consultation_event
            await delete_consultation_event(booking.google_event_id)
            booking.google_event_id = None

        if slot and slot.current_bookings > 0:
            slot.current_bookings -= 1
        # 취소 이메일 발송
        user_result2 = await db.execute(select(User).where(User.id == booking.user_id))
        user2 = user_result2.scalar_one_or_none()
        if user2 and slot:
            from app.services.email_service import send_consultation_cancelled_email
            await send_consultation_cancelled_email(
                user2.email, user2.name,
                str(slot.date), f"{str(slot.start_time)[:5]} ~ {str(slot.end_time)[:5]}",
                data.cancel_reason,
            )

    if data.status == "completed":
        # 기록 작성 기한 산정 기준 (공통 원칙: 선배 V1 §5-1 / 고등 V3 §4-8 / 예비고1 §3-7)
        # completed_at + 7일이 최초 기록 작성 기한
        if booking.completed_at is None:
            booking.completed_at = datetime.utcnow()
        # 만족도 설문 자동 발송 (기획서 §10-2)
        await _trigger_satisfaction_survey(booking, slot, db)

    await db.commit()
    return {"message": f"예약 상태가 '{data.status}'로 변경되었습니다"}


async def _trigger_satisfaction_survey(
    booking: ConsultationBooking,
    slot: ConsultationSlot | None,
    db: AsyncSession,
) -> None:
    """상담 완료 시 만족도 설문 레코드 생성 + 응답 메일 발송.

    - 이미 설문이 존재하면 중복 생성하지 않음 (booking_id unique).
    - survey_type 결정: 슬롯 담당자(role=senior) → senior, 그 외 → counselor.
      (담당자 미지정 시 booking.type='선배상담' 이면 senior, 아니면 counselor.)
    - 메일 발송 실패는 무시하고 레코드 생성은 유지.
    """
    from datetime import datetime, timedelta
    from app.config import settings
    from app.models.satisfaction_survey import SatisfactionSurvey
    from app.services.email_service import send_satisfaction_survey_invite_email
    from app.services.notification_service import send_satisfaction_survey_notification

    # 중복 방지 (booking_id unique constraint)
    existing = await db.execute(
        select(SatisfactionSurvey).where(SatisfactionSurvey.booking_id == booking.id)
    )
    if existing.scalar_one_or_none() is not None:
        return

    # survey_type 결정
    survey_type = "counselor"
    if slot and slot.admin_id:
        try:
            aid = uuid.UUID(slot.admin_id)
            assigned = (await db.execute(select(Admin).where(Admin.id == aid))).scalar_one_or_none()
            if assigned and assigned.role == "senior":
                survey_type = "senior"
        except (ValueError, TypeError):
            pass
    elif booking.type == "선배상담":
        survey_type = "senior"

    expires_at = datetime.utcnow() + timedelta(days=7)

    survey = SatisfactionSurvey(
        user_id=booking.user_id,
        booking_id=booking.id,
        survey_type=survey_type,
        status="pending",
        scores={},
        free_text={},
        expires_at=expires_at,
    )
    db.add(survey)
    await db.flush()  # id 확보

    # 응답 메일 + FCM 푸시 발송 (기획서 §10 만족도 자동 발송)
    user = (await db.execute(select(User).where(User.id == booking.user_id))).scalar_one_or_none()
    if user and user.email:
        survey_url = (
            f"{settings.FRONTEND_URL}/satisfaction-survey"
            f"?booking_id={booking.id}&type={survey_type}"
        )
        try:
            await send_satisfaction_survey_invite_email(
                to=user.email,
                name=user.name,
                survey_url=survey_url,
                survey_type=survey_type,
                expires_at_str=expires_at.strftime("%Y-%m-%d %H:%M"),
            )
        except Exception:
            # 메일 실패해도 설문 레코드는 유지 (앱/웹에서 응답 가능)
            pass

    # 학생 FCM 푸시 (모바일 앱 사용자 대상)
    if user:
        try:
            await send_satisfaction_survey_notification(user=user, db=db)
        except Exception:
            # 푸시 실패도 설문 레코드/이메일과 무관하게 graceful degrade
            pass


from pydantic import BaseModel as _BaseModel

class BookingModeUpdate(_BaseModel):
    mode: str | None = None  # in_person / remote
    meeting_url: str | None = None


@router.put("/bookings/{booking_id}/mode")
async def update_booking_mode(
    booking_id: uuid.UUID,
    data: BookingModeUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """예약 상담 방식(대면/비대면) 및 화상 링크 수정"""
    result = await db.execute(select(ConsultationBooking).where(ConsultationBooking.id == booking_id))
    booking = result.scalar_one_or_none()
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="예약을 찾을 수 없습니다")

    if data.mode is not None:
        booking.mode = data.mode
    if data.meeting_url is not None:
        booking.meeting_url = data.meeting_url

    await db.commit()
    return {"message": "상담 방식이 변경되었습니다"}


@router.post("/bookings/manual")
async def create_manual_booking(
    data: ManualBookingRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """관리자 직접 예약 생성 (학습상담, 심리상담 등)"""
    # 사용자 존재 확인
    user_result = await db.execute(select(User).where(User.id == data.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    # 비공개 슬롯 생성
    slot = ConsultationSlot(
        admin_id=str(admin.id),
        date=data.date,
        start_time=data.start_time,
        end_time=data.end_time,
        max_bookings=1,
        current_bookings=1,
        is_active=False,
    )
    db.add(slot)
    await db.flush()

    # 확정 상태로 예약 생성
    booking = ConsultationBooking(
        user_id=data.user_id,
        slot_id=slot.id,
        type=data.type,
        mode=data.mode,
        meeting_url=data.meeting_url,
        memo=data.memo,
        status="confirmed",
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)
    await db.refresh(slot)

    return AdminBookingResponse(
        id=booking.id,
        user_id=user.id,
        user_name=user.name,
        user_email=user.email,
        user_phone=user.phone,
        slot_date=slot.date,
        slot_start_time=slot.start_time,
        slot_end_time=slot.end_time,
        admin_name=admin.name,
        type=booking.type,
        mode=booking.mode,
        meeting_url=booking.meeting_url,
        memo=booking.memo,
        status=booking.status,
        cancel_reason=booking.cancel_reason,
        created_at=booking.created_at,
    )


@router.get("/users/search")
async def search_users(
    q: str = Query(..., min_length=1),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """사용자 검색 (이름/이메일)"""
    from sqlalchemy import or_
    result = await db.execute(
        select(User).where(
            or_(
                User.name.ilike(f"%{q}%"),
                User.email.ilike(f"%{q}%"),
            )
        ).limit(10)
    )
    users = result.scalars().all()
    return [{"id": str(u.id), "name": u.name, "email": u.email, "phone": u.phone} for u in users]


# ============================================================
# 상담 기록 작성 기한 관리자 수동 해제
# (선배 V1 §5-1 / 고등 V3 §4-8 / 예비고1 §3-7 공통)
# ============================================================

class NoteDeadlineWaiveRequest(_BaseModel):
    reason: str  # 해제 사유 (감사 용도, 필수)


@router.put("/bookings/{booking_id}/waive-note-deadline")
async def waive_note_deadline(
    booking_id: uuid.UUID,
    data: NoteDeadlineWaiveRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담 기록 작성 기한(7일) 체크를 개별 booking 에 대해 수동 해제.

    장기 부재 등 예외 사유가 있을 때 super_admin 이 해당 건의 기한 검사를 면제.
    면제되면 해당 booking 은 `_check_note_writing_deadline` 검사에서 제외되어
    담당자(상담사·선배)의 신규 예약이 다시 가능해진다. 사유는 감사 용도로 저장.
    """
    if admin.role != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="기록 작성 기한 해제는 최고 관리자만 가능합니다.",
        )

    reason = (data.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="해제 사유를 입력해주세요.")

    result = await db.execute(
        select(ConsultationBooking).where(ConsultationBooking.id == booking_id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")

    booking.note_deadline_waived_at = datetime.utcnow()
    booking.note_deadline_waive_reason = reason
    await db.commit()
    return {
        "message": "기록 작성 기한이 해제되었습니다.",
        "waived_at": booking.note_deadline_waived_at.isoformat(),
        "reason": reason,
    }


@router.delete("/bookings/{booking_id}/waive-note-deadline")
async def revoke_note_deadline_waiver(
    booking_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """수동 해제를 취소하여 다시 기한 검사 대상으로 되돌림."""
    if admin.role != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="기한 해제 취소는 최고 관리자만 가능합니다.",
        )

    result = await db.execute(
        select(ConsultationBooking).where(ConsultationBooking.id == booking_id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")

    booking.note_deadline_waived_at = None
    booking.note_deadline_waive_reason = None
    await db.commit()
    return {"message": "기록 작성 기한 해제가 취소되었습니다."}
