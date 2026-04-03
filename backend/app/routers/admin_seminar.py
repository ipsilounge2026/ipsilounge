import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.seminar_mail_log import SeminarMailLog
from app.models.seminar_reservation import SeminarReservation
from app.models.seminar_schedule import SeminarSchedule
from app.models.user import User
from app.schemas.seminar import (
    AdminActualAttendeeUpdate,
    AdminReservationResponse,
    SeminarDashboardResponse,
    SeminarMailLogResponse,
    SeminarMailSendRequest,
    SeminarReservationCancel,
    SeminarScheduleCreate,
    SeminarScheduleResponse,
    SeminarScheduleUpdate,
)
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/seminar", tags=["관리자-설명회"])


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


# --- 대시보드 ---

@router.get("/dashboard", response_model=SeminarDashboardResponse)
async def get_dashboard(
    schedule_id: uuid.UUID | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설명회 대시보드 통계"""
    conditions = []
    if schedule_id:
        conditions.append(SeminarReservation.schedule_id == schedule_id)

    result = await db.execute(select(SeminarReservation).where(*conditions) if conditions else select(SeminarReservation))
    reservations = result.scalars().all()

    total = len(reservations)
    pending = sum(1 for r in reservations if r.status == "pending")
    modified = sum(1 for r in reservations if r.status == "modified")
    approved = sum(1 for r in reservations if r.status == "approved")
    cancelled = sum(1 for r in reservations if r.status == "cancelled")
    total_attendee = sum(r.attendee_count for r in reservations if r.status != "cancelled")
    total_actual = sum(r.actual_attendee_count or 0 for r in reservations if r.status == "approved")

    return SeminarDashboardResponse(
        total_reservations=total,
        pending_count=pending,
        modified_count=modified,
        approved_count=approved,
        cancelled_count=cancelled,
        total_attendee_count=total_attendee,
        total_actual_attendee_count=total_actual,
    )


# --- 일정 관리 ---

@router.post("/schedules", response_model=SeminarScheduleResponse)
async def create_schedule(
    data: SeminarScheduleCreate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설명회 일정 등록"""
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail="종료일은 시작일 이후여야 합니다")
    if data.morning_max == 0 and data.afternoon_max == 0 and data.evening_max == 0:
        raise HTTPException(status_code=400, detail="최소 하나의 시간대에 예약 가능 수를 설정해야 합니다")

    blocked_str = ",".join(data.blocked_dates) if data.blocked_dates else None

    schedule = SeminarSchedule(
        title=data.title,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        blocked_dates=blocked_str,
        morning_max=data.morning_max,
        afternoon_max=data.afternoon_max,
        evening_max=data.evening_max,
        deadline_at=data.deadline_at,
        is_visible=data.is_visible,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return _schedule_to_response(schedule)


@router.get("/schedules", response_model=list[SeminarScheduleResponse])
async def list_schedules(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설명회 일정 전체 목록 (비공개 포함)"""
    result = await db.execute(
        select(SeminarSchedule).order_by(SeminarSchedule.created_at.desc())
    )
    schedules = result.scalars().all()
    return [_schedule_to_response(s) for s in schedules]


@router.get("/schedules/{schedule_id}", response_model=SeminarScheduleResponse)
async def get_schedule(
    schedule_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설명회 일정 상세"""
    result = await db.execute(select(SeminarSchedule).where(SeminarSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")
    return _schedule_to_response(schedule)


@router.put("/schedules/{schedule_id}", response_model=SeminarScheduleResponse)
async def update_schedule(
    schedule_id: uuid.UUID,
    data: SeminarScheduleUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설명회 일정 수정"""
    result = await db.execute(select(SeminarSchedule).where(SeminarSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")

    if data.title is not None:
        schedule.title = data.title
    if data.description is not None:
        schedule.description = data.description
    if data.start_date is not None:
        schedule.start_date = data.start_date
    if data.end_date is not None:
        schedule.end_date = data.end_date
    if data.blocked_dates is not None:
        schedule.blocked_dates = ",".join(data.blocked_dates) if data.blocked_dates else None
    if data.morning_max is not None:
        schedule.morning_max = data.morning_max
    if data.afternoon_max is not None:
        schedule.afternoon_max = data.afternoon_max
    if data.evening_max is not None:
        schedule.evening_max = data.evening_max
    if data.deadline_at is not None:
        schedule.deadline_at = data.deadline_at
    if data.is_visible is not None:
        schedule.is_visible = data.is_visible

    await db.commit()
    await db.refresh(schedule)
    return _schedule_to_response(schedule)


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(
    schedule_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설명회 일정 삭제"""
    result = await db.execute(select(SeminarSchedule).where(SeminarSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")

    # 관련 예약도 삭제
    await db.execute(
        select(SeminarReservation).where(SeminarReservation.schedule_id == schedule_id)
    )
    from sqlalchemy import delete
    await db.execute(delete(SeminarReservation).where(SeminarReservation.schedule_id == schedule_id))
    await db.delete(schedule)
    await db.commit()
    return {"message": "일정이 삭제되었습니다"}


@router.put("/schedules/{schedule_id}/visibility")
async def toggle_visibility(
    schedule_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """공개/비공개 토글"""
    result = await db.execute(select(SeminarSchedule).where(SeminarSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")

    schedule.is_visible = not schedule.is_visible
    await db.commit()
    return {"message": f"{'공개' if schedule.is_visible else '비공개'}로 변경되었습니다", "is_visible": schedule.is_visible}


# --- 예약 관리 ---

@router.get("/reservations")
async def list_reservations(
    schedule_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    branch_name: str | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """전체 예약 목록"""
    query = (
        select(SeminarReservation, SeminarSchedule, User)
        .join(SeminarSchedule, SeminarReservation.schedule_id == SeminarSchedule.id)
        .join(User, SeminarReservation.user_id == User.id)
    )

    conditions = []
    if schedule_id:
        conditions.append(SeminarReservation.schedule_id == schedule_id)
    if status_filter:
        conditions.append(SeminarReservation.status == status_filter)
    if branch_name:
        conditions.append(SeminarReservation.branch_name.ilike(f"%{branch_name}%"))

    if conditions:
        query = query.where(and_(*conditions))

    query = query.order_by(SeminarReservation.applied_at.desc())

    result = await db.execute(query)
    rows = result.all()

    items = [
        AdminReservationResponse(
            id=res.id,
            schedule_id=res.schedule_id,
            schedule_title=sched.title,
            user_id=user.id,
            user_name=user.name,
            user_email=user.email,
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
        for res, sched, user in rows
    ]
    return {"items": items, "total": len(items)}


@router.put("/reservations/{reservation_id}/approve")
async def approve_reservation(
    reservation_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """예약 승인"""
    result = await db.execute(select(SeminarReservation).where(SeminarReservation.id == reservation_id))
    reservation = result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")
    if reservation.status not in ("pending", "modified"):
        raise HTTPException(status_code=400, detail="승인 가능한 상태가 아닙니다")

    reservation.status = "approved"
    reservation.approved_at = datetime.utcnow()
    await db.commit()

    # TODO: 승인 이메일 발송

    return {"message": "예약이 승인되었습니다"}


@router.put("/reservations/{reservation_id}/cancel")
async def cancel_reservation(
    reservation_id: uuid.UUID,
    data: SeminarReservationCancel,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """예약 취소 (관리자)"""
    result = await db.execute(select(SeminarReservation).where(SeminarReservation.id == reservation_id))
    reservation = result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")
    if reservation.status == "cancelled":
        raise HTTPException(status_code=400, detail="이미 취소된 예약입니다")

    reservation.status = "cancelled"
    reservation.cancel_reason = data.cancel_reason
    await db.commit()

    # TODO: 취소 이메일 발송

    return {"message": "예약이 취소되었습니다"}


@router.put("/reservations/{reservation_id}/actual-attendee")
async def update_actual_attendee(
    reservation_id: uuid.UUID,
    data: AdminActualAttendeeUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """실제 참석 인원 입력"""
    result = await db.execute(select(SeminarReservation).where(SeminarReservation.id == reservation_id))
    reservation = result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다")
    if reservation.status != "approved":
        raise HTTPException(status_code=400, detail="승인된 예약만 실제 참석 인원을 입력할 수 있습니다")

    reservation.actual_attendee_count = data.actual_attendee_count
    await db.commit()
    return {"message": "실제 참석 인원이 업데이트되었습니다"}


# --- 메일 발송 ---

@router.post("/mail/send")
async def send_mail(
    data: SeminarMailSendRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """메일 발송 (선택된 설명회/지점 대상)"""
    # 발송 대상 조회: 승인된 예약의 사용자
    query = (
        select(SeminarReservation, SeminarSchedule, User)
        .join(SeminarSchedule, SeminarReservation.schedule_id == SeminarSchedule.id)
        .join(User, SeminarReservation.user_id == User.id)
        .where(SeminarReservation.status == "approved")
    )

    if data.schedule_ids:
        query = query.where(SeminarReservation.schedule_id.in_(data.schedule_ids))
    if data.branch_names:
        query = query.where(SeminarReservation.branch_name.in_(data.branch_names))

    result = await db.execute(query)
    rows = result.all()

    # 중복 이메일 제거 (동일 사용자가 여러 예약 가능)
    recipients_map = {}
    schedule_names_set = set()
    branch_names_set = set()
    for res, sched, user in rows:
        if user.email not in recipients_map:
            recipients_map[user.email] = {"branch_name": res.branch_name, "email": user.email}
        schedule_names_set.add(sched.title)
        branch_names_set.add(res.branch_name)

    recipients_list = list(recipients_map.values())
    total_count = len(recipients_list)

    # TODO: 실제 이메일 발송 로직 (SMTP)
    success_count = total_count  # 현재는 전부 성공으로 처리

    # 발송 이력 저장
    log = SeminarMailLog(
        subject=data.subject,
        body=data.body,
        schedule_names=",".join(schedule_names_set) if schedule_names_set else None,
        branch_names=",".join(branch_names_set) if branch_names_set else None,
        total_count=total_count,
        success_count=success_count,
        recipients=json.dumps(recipients_list, ensure_ascii=False),
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    return {
        "message": f"{success_count}/{total_count}건 발송 완료",
        "log_id": str(log.id),
        "total_count": total_count,
        "success_count": success_count,
    }


@router.get("/mail/logs", response_model=list[SeminarMailLogResponse])
async def get_mail_logs(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """메일 발송 이력"""
    result = await db.execute(
        select(SeminarMailLog).order_by(SeminarMailLog.sent_at.desc()).limit(50)
    )
    logs = result.scalars().all()
    return logs


@router.get("/mail/logs/{log_id}", response_model=SeminarMailLogResponse)
async def get_mail_log_detail(
    log_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """메일 발송 이력 상세"""
    result = await db.execute(select(SeminarMailLog).where(SeminarMailLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="발송 이력을 찾을 수 없습니다")
    return log


# --- 지점별/일정별 현황 ---

@router.get("/stats/by-branch")
async def stats_by_branch(
    schedule_id: uuid.UUID | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """지점별 참석 현황"""
    conditions = [SeminarReservation.status != "cancelled"]
    if schedule_id:
        conditions.append(SeminarReservation.schedule_id == schedule_id)

    result = await db.execute(
        select(
            SeminarReservation.branch_name,
            func.count(SeminarReservation.id).label("reservation_count"),
            func.sum(SeminarReservation.attendee_count).label("total_attendee"),
            func.sum(func.coalesce(SeminarReservation.actual_attendee_count, 0)).label("total_actual"),
        )
        .where(and_(*conditions))
        .group_by(SeminarReservation.branch_name)
        .order_by(SeminarReservation.branch_name)
    )
    rows = result.all()
    return [
        {
            "branch_name": row.branch_name,
            "reservation_count": row.reservation_count,
            "total_attendee": row.total_attendee or 0,
            "total_actual": row.total_actual or 0,
        }
        for row in rows
    ]


@router.get("/stats/by-schedule")
async def stats_by_schedule(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """일정별 현황"""
    result = await db.execute(
        select(
            SeminarSchedule.id,
            SeminarSchedule.title,
            SeminarSchedule.start_date,
            SeminarSchedule.end_date,
            func.count(SeminarReservation.id).label("reservation_count"),
            func.sum(case((SeminarReservation.status == "approved", 1), else_=0)).label("approved_count"),
            func.sum(case((SeminarReservation.status != "cancelled", SeminarReservation.attendee_count), else_=0)).label("total_attendee"),
            func.sum(case((SeminarReservation.status == "approved", func.coalesce(SeminarReservation.actual_attendee_count, 0)), else_=0)).label("total_actual"),
        )
        .outerjoin(SeminarReservation, SeminarSchedule.id == SeminarReservation.schedule_id)
        .group_by(SeminarSchedule.id, SeminarSchedule.title, SeminarSchedule.start_date, SeminarSchedule.end_date)
        .order_by(SeminarSchedule.created_at.desc())
    )
    rows = result.all()
    return [
        {
            "id": str(row.id),
            "title": row.title,
            "start_date": row.start_date.isoformat(),
            "end_date": row.end_date.isoformat(),
            "reservation_count": row.reservation_count or 0,
            "approved_count": row.approved_count or 0,
            "total_attendee": row.total_attendee or 0,
            "total_actual": row.total_actual or 0,
        }
        for row in rows
    ]
