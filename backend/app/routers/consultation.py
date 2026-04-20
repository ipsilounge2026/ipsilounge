import uuid
from datetime import date, datetime, timedelta

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin, AdminStudentAssignment, SeniorStudentAssignment
from app.models.analysis_order import AnalysisOrder
from app.models.consultation_booking import ConsultationBooking
from app.models.consultation_note import ConsultationNote
from app.models.consultation_slot import ConsultationSlot
from app.models.consultation_survey import ConsultationSurvey
from app.models.counselor_change_request import CounselorChangeRequest
from app.models.senior_change_request import SeniorChangeRequest
from app.models.senior_consultation_note import SeniorConsultationNote
from app.models.user import User
from app.schemas.consultation import (
    AvailableSlotResponse,
    BookingRequest,
    BookingResponse,
    MyBookingListResponse,
)
from app.services.consultation_service import check_slot_available
from app.utils.dependencies import get_current_user
from app.utils.family import get_visible_owner_ids, resolve_owner_id


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


async def _get_assigned_senior(user_id, db: AsyncSession):
    """사용자에게 매칭된 선배 조회 (선배상담 전용)"""
    result = await db.execute(
        select(SeniorStudentAssignment).where(SeniorStudentAssignment.user_id == user_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        return None
    senior_result = await db.execute(
        select(Admin).where(
            Admin.id == assignment.senior_id,
            Admin.is_active == True,
            Admin.role == "senior",
        )
    )
    return senior_result.scalar_one_or_none()

async def _check_lead_time(
    consultation_type: str,
    owner_id,
    slot_date: date,
    db: AsyncSession,
) -> None:
    """기획서 §4-8-2: 상담 유형별 예약 리드타임(7일) 검증.

    - 학생부분석:  학생부 업로드 + 7일 이후 슬롯만 허용
    - 학종전략:    학종 학생부 업로드 + 7일 이후 슬롯만 허용
    - 학습상담:    사전 설문 제출 + 7일 이후 슬롯만 허용
    - 선배상담:    매칭된 선배 슬롯만 허용 (리드타임 없음)
    - 심리상담/기타: 리드타임 없음
    """
    if consultation_type in ("심리상담", "기타"):
        return

    # 선배상담 — 매칭 필수 (리드타임 없음)
    if consultation_type == "선배상담":
        senior = await _get_assigned_senior(owner_id, db)
        if not senior:
            raise HTTPException(
                status_code=400,
                detail="선배와 매칭이 필요합니다. 학원에 문의해주세요.",
            )
        return

    # 학생부분석 / 학종전략 — 학생부 업로드 기준
    type_to_service = {
        "학생부분석": "학생부라운지",
        "학종전략": "학종라운지",
    }
    service_type = type_to_service.get(consultation_type)
    if service_type:
        upload_result = await db.execute(
            select(AnalysisOrder)
            .where(
                AnalysisOrder.user_id == owner_id,
                AnalysisOrder.service_type == service_type,
                AnalysisOrder.status.in_(["uploaded", "processing", "completed"]),
                AnalysisOrder.uploaded_at.isnot(None),
            )
            .order_by(AnalysisOrder.uploaded_at.asc())
        )
        orders = upload_result.scalars().all()
        if not orders:
            raise HTTPException(
                status_code=400,
                detail=f"{consultation_type} 상담을 위해 먼저 학생부를 업로드해주세요.",
            )
        latest_upload = orders[-1].uploaded_at
        earliest = (latest_upload + timedelta(days=7)).date()
        if slot_date < earliest:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{consultation_type} 상담은 학생부 업로드일({latest_upload.date().isoformat()}) 기준 "
                    f"7일 이후({earliest.isoformat()})부터 예약 가능합니다."
                ),
            )
        return

    # 학습상담 — 사전 설문 제출 기준
    if consultation_type == "학습상담":
        survey_result = await db.execute(
            select(ConsultationSurvey)
            .where(
                ConsultationSurvey.user_id == owner_id,
                ConsultationSurvey.status == "submitted",
                ConsultationSurvey.survey_type.in_(["high", "preheigh1"]),
            )
            .order_by(ConsultationSurvey.submitted_at.desc())
        )
        survey = survey_result.scalar_one_or_none()
        if not survey or not survey.submitted_at:
            raise HTTPException(
                status_code=400,
                detail="학습상담 예약을 위해 먼저 사전 설문을 제출해주세요.",
            )
        earliest = (survey.submitted_at + timedelta(days=7)).date()
        if slot_date < earliest:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"학습상담은 사전 설문 제출일({survey.submitted_at.date().isoformat()}) 기준 "
                    f"7일 이후({earliest.isoformat()})부터 예약 가능합니다."
                ),
            )


# ============================================================
# 상담 기록 작성 기한 (선배 V1 §5-1 / 고등 V3 §4-8 / 예비고1 §3-7 공통)
# ============================================================

NOTE_WRITE_DEADLINE_DAYS = 7


async def _check_note_writing_deadline(
    consultation_type: str,
    slot_admin_id,
    db: AsyncSession,
) -> None:
    """담당자(상담사·선배)의 기한 초과 미작성 기록이 있으면 신규 예약 차단.

    - 대상 booking: status="completed" + completed_at ≥ 7일 경과
    - 면제 조건: `note_deadline_waived_at` 이 None 이 아닌 booking 은 검사 제외
    - 기록 판정: 상담사 → ConsultationNote / 선배 → SeniorConsultationNote
    - 리드타임이 없는 유형(심리/기타/선배)에도 적용 (선배는 기록 품질이 오히려 더 중요)
    """
    if slot_admin_id is None:
        return

    cutoff = datetime.utcnow() - timedelta(days=NOTE_WRITE_DEADLINE_DAYS)

    # 이 담당자의 슬롯에서 "completed + 7일 경과 + 면제 아님" 인 booking 조회
    overdue_q = (
        select(ConsultationBooking.id, ConsultationBooking.type)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .where(
            ConsultationSlot.admin_id == slot_admin_id,
            ConsultationBooking.status == "completed",
            ConsultationBooking.completed_at.isnot(None),
            ConsultationBooking.completed_at <= cutoff,
            ConsultationBooking.note_deadline_waived_at.is_(None),
        )
    )
    overdue_rows = (await db.execute(overdue_q)).all()
    if not overdue_rows:
        return

    # 각 overdue booking 에 대해 기록 존재 여부 체크 (상담 유형별로 테이블 다름)
    overdue_bookings = [r for r in overdue_rows]
    overdue_ids = [r.id for r in overdue_bookings]

    # 상담사 노트 존재 booking_id
    counselor_note_ids = set(
        (await db.execute(
            select(ConsultationNote.booking_id).where(
                ConsultationNote.booking_id.in_(overdue_ids)
            )
        )).scalars().all()
    )
    # 선배 노트 존재 booking_id
    senior_note_ids = set(
        (await db.execute(
            select(SeniorConsultationNote.booking_id).where(
                SeniorConsultationNote.booking_id.in_(overdue_ids)
            )
        )).scalars().all()
    )

    # 이 담당자 슬롯이 어느 종류인지 한 건도 기록 없는 booking 이 있으면 차단
    unwritten_count = 0
    for r in overdue_bookings:
        if r.type == "선배상담":
            if r.id not in senior_note_ids:
                unwritten_count += 1
        else:
            if r.id not in counselor_note_ids:
                unwritten_count += 1

    if unwritten_count > 0:
        is_senior_consult = consultation_type == "선배상담"
        subject = "담당 선배" if is_senior_consult else "담당 상담사"
        raise HTTPException(
            status_code=400,
            detail=(
                f"{subject}의 이전 상담 기록 작성이 완료되어야 신규 예약이 가능합니다. "
                f"(기한 경과 미작성 {unwritten_count}건)"
            ),
        )


async def _compute_slot_availability(
    consultation_type: str | None,
    owner_id,
    db: AsyncSession,
) -> tuple[date | None, str | None]:
    """기획서 §4-8-2: 리드타임/선배매칭을 계산하여 UI 가드용으로 반환.

    - 반환: (earliest_allowed_date, unavailable_reason)
      - earliest_allowed_date: 이 날짜 이전 슬롯은 `available=False` 처리
      - unavailable_reason: 사용자 안내 메시지 (None이면 전 구간 예약 가능)
    - 에러를 raise 하지 않음 — 캘린더 UI에서 호출되므로 계산 결과만 반환.
    - consultation_type 이 None 또는 owner_id 가 None 이면 (None, None) 반환.
    """
    if not consultation_type or owner_id is None:
        return None, None

    # 리드타임 없는 유형
    if consultation_type in ("심리상담", "기타"):
        return None, None

    # 선배상담: 매칭 없으면 전체 비활성
    if consultation_type == "선배상담":
        senior = await _get_assigned_senior(owner_id, db)
        if not senior:
            # UI에서 전체 슬롯 비활성화를 의도. 먼 미래 날짜를 earliest 로 설정.
            return (
                date.max,
                "선배 매칭이 필요합니다. 학원에 문의해주세요.",
            )
        return None, None

    # 학생부분석 / 학종전략: 학생부 업로드 기준 7일
    type_to_service = {
        "학생부분석": "학생부라운지",
        "학종전략": "학종라운지",
    }
    service_type = type_to_service.get(consultation_type)
    if service_type:
        upload_result = await db.execute(
            select(AnalysisOrder)
            .where(
                AnalysisOrder.user_id == owner_id,
                AnalysisOrder.service_type == service_type,
                AnalysisOrder.status.in_(["uploaded", "processing", "completed"]),
                AnalysisOrder.uploaded_at.isnot(None),
            )
            .order_by(AnalysisOrder.uploaded_at.asc())
        )
        orders = upload_result.scalars().all()
        if not orders:
            return (
                date.max,
                f"{consultation_type} 상담을 위해 먼저 학생부를 업로드해주세요.",
            )
        latest_upload = orders[-1].uploaded_at
        earliest = (latest_upload + timedelta(days=7)).date()
        return (
            earliest,
            (
                f"{consultation_type} 상담은 학생부 업로드일"
                f"({latest_upload.date().isoformat()}) 기준 7일 이후"
                f"({earliest.isoformat()})부터 예약 가능합니다."
            ),
        )

    # 학습상담: 사전 설문 제출 기준 7일
    if consultation_type == "학습상담":
        survey_result = await db.execute(
            select(ConsultationSurvey)
            .where(
                ConsultationSurvey.user_id == owner_id,
                ConsultationSurvey.status == "submitted",
                ConsultationSurvey.survey_type.in_(["high", "preheigh1"]),
            )
            .order_by(ConsultationSurvey.submitted_at.desc())
        )
        survey = survey_result.scalar_one_or_none()
        if not survey or not survey.submitted_at:
            return (
                date.max,
                "학습상담 예약을 위해 먼저 사전 설문을 제출해주세요.",
            )
        earliest = (survey.submitted_at + timedelta(days=7)).date()
        return (
            earliest,
            (
                f"학습상담은 사전 설문 제출일"
                f"({survey.submitted_at.date().isoformat()}) 기준 7일 이후"
                f"({earliest.isoformat()})부터 예약 가능합니다."
            ),
        )

    return None, None


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

    # 주 담당자 없으면 활성 슬롯이 있는 상담사만 반환 (관리자/선배 제외)
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
            select(Admin).where(
                Admin.id == aid_uuid,
                Admin.is_active == True,
                Admin.role == "counselor",
            )
        )
        admin = admin_result.scalar_one_or_none()
        if admin:
            counselors.append({"id": str(admin.id), "name": admin.name})

    return {"assigned": False, "counselors": counselors, "has_slots": True}


@router.get("/seniors")
async def get_seniors(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """선배상담용 매칭된 선배 조회

    - 매칭된 선배가 있으면 해당 선배만 반환 (+ 활성 슬롯 존재 여부)
    - 매칭 안 됐으면 빈 리스트 + assigned=False + 안내 메시지
      (학습상담과 달리 '아무나 선택' 경로 없음 — 매칭 전제 조건)
    """
    assigned_senior = await _get_assigned_senior(user.id, db)

    if not assigned_senior:
        return {
            "assigned": False,
            "seniors": [],
            "has_slots": False,
            "message": "선배와 매칭이 필요합니다. 학원에 문의해주세요.",
        }

    slot_check = await db.execute(
        select(ConsultationSlot.id).where(
            ConsultationSlot.admin_id == str(assigned_senior.id),
            ConsultationSlot.is_active == True,
            ConsultationSlot.date >= date.today(),
        ).limit(1)
    )
    has_slots = slot_check.scalar_one_or_none() is not None
    return {
        "assigned": True,
        "seniors": [{"id": str(assigned_senior.id), "name": assigned_senior.name}],
        "has_slots": has_slots,
        "message": None,
    }


@router.get("/slots", response_model=list[AvailableSlotResponse])
async def get_available_slots(
    year: int = Query(...),
    month: int = Query(...),
    admin_id: str | None = None,
    consultation_type: str | None = Query(
        None,
        description=(
            "상담 유형 — 지정하면 기획서 §4-8-2 리드타임/매칭을 계산하여 "
            "각 슬롯에 available/unavailable_reason 채움."
        ),
    ),
    owner_user_id: str | None = Query(
        None,
        description="학부모가 자녀 예약 시 자녀 user_id (지정 안 하면 user 본인 기준)",
    ),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """예약 가능 시간대 조회 (달력용).

    기획서 §4-8-2: consultation_type 이 주어지면 각 슬롯에
    `available` / `unavailable_reason` 필드를 채워 UI에서 비활성 표시 가능.
    """
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

    # 기획서 §4-8-2: 리드타임 계산 (consultation_type 주어진 경우만)
    earliest_date: date | None = None
    lead_reason: str | None = None
    if consultation_type:
        try:
            owner_id = await resolve_owner_id(user, db, owner_user_id)
        except HTTPException:
            # 권한 없으면 전체 비활성화 (안전 기본값)
            owner_id = None
        earliest_date, lead_reason = await _compute_slot_availability(
            consultation_type, owner_id, db
        )

    items: list[AvailableSlotResponse] = []
    for s in slots:
        if s.current_bookings >= s.max_bookings:
            continue

        slot_available = True
        slot_reason: str | None = None
        if earliest_date is not None and s.date < earliest_date:
            slot_available = False
            slot_reason = lead_reason

        items.append(
            AvailableSlotResponse(
                id=s.id,
                date=s.date,
                start_time=s.start_time,
                end_time=s.end_time,
                remaining=s.max_bookings - s.current_bookings,
                admin_id=s.admin_id,
                admin_name=admin_names.get(s.admin_id),
                available=slot_available,
                unavailable_reason=slot_reason,
            )
        )
    return items


@router.post("/book", response_model=BookingResponse)
async def book_consultation(
    data: BookingRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """상담 예약 신청"""
    owner_id = await resolve_owner_id(user, db, data.owner_user_id)

    # 3개월 쿨다운 확인 (실제 상담 진행일 기준, owner 기준)
    last_booking_result = await db.execute(
        select(ConsultationBooking, ConsultationSlot)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .where(
            ConsultationBooking.user_id == owner_id,
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

    # 기획서 §4-8-2: 상담 유형별 7일 리드타임 검증
    await _check_lead_time(data.type, owner_id, slot.date, db)

    # 공통 §5-1 / §4-8 / §3-7: 담당자의 기록 작성 기한(7일) 초과 미작성 건 → 신규 예약 차단
    await _check_note_writing_deadline(data.type, slot.admin_id, db)

    # 동일 시간대 중복 예약 확인 (owner 기준)
    existing = await db.execute(
        select(ConsultationBooking).where(
            and_(
                ConsultationBooking.user_id == owner_id,
                ConsultationBooking.slot_id == data.slot_id,
                ConsultationBooking.status.in_(["requested", "confirmed"]),
            )
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 해당 시간에 예약이 있습니다")

    booking = ConsultationBooking(
        user_id=owner_id,
        slot_id=data.slot_id,
        analysis_order_id=data.analysis_order_id,
        type=data.type,
        mode=data.mode,
        memo=data.memo,
    )
    db.add(booking)

    slot.current_bookings += 1

    # 주 담당자가 없는 경우 → 선택한 상담자를 자동으로 주 담당자로 매칭
    if slot.admin_id:
        existing_assignment = await db.execute(
            select(AdminStudentAssignment).where(AdminStudentAssignment.user_id == owner_id)
        )
        if existing_assignment.scalar_one_or_none() is None:
            try:
                admin_uuid = uuid.UUID(slot.admin_id)
                new_assignment = AdminStudentAssignment(admin_id=admin_uuid, user_id=owner_id)
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
        mode=booking.mode,
        meeting_url=booking.meeting_url,
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
            mode=booking.mode,
            meeting_url=booking.meeting_url,
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


@router.get("/my-senior")
async def get_my_senior(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내 담당 선배 조회"""
    result = await db.execute(
        select(SeniorStudentAssignment).where(SeniorStudentAssignment.user_id == user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        return {"assigned": False, "senior": None}
    admin = await db.get(Admin, row.senior_id)
    return {
        "assigned": True,
        "senior": {"id": str(admin.id), "name": admin.name} if admin else None,
    }


@router.get("/available-counselors")
async def get_available_counselors(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """담당자 변경 시 선택 가능한 상담사 목록 (현재 담당자 제외, 상담사만)"""
    assigned_admin = await _get_assigned_admin(user.id, db)
    current_admin_id = assigned_admin.id if assigned_admin else None

    result = await db.execute(
        select(Admin).where(Admin.is_active == True, Admin.role == "counselor")
    )
    admins = result.scalars().all()

    counselors = [
        {"id": str(a.id), "name": a.name}
        for a in admins
        if a.id != current_admin_id
    ]
    return counselors


@router.get("/available-seniors")
async def get_available_seniors(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """선배 변경 시 선택 가능한 선배 목록 (현재 선배 제외, 선배만)"""
    senior_assign = await db.execute(
        select(SeniorStudentAssignment).where(SeniorStudentAssignment.user_id == user.id)
    )
    current_assignment = senior_assign.scalar_one_or_none()
    current_senior_id = current_assignment.senior_id if current_assignment else None

    result = await db.execute(
        select(Admin).where(Admin.is_active == True, Admin.role == "senior")
    )
    seniors = result.scalars().all()

    return [
        {"id": str(s.id), "name": s.name}
        for s in seniors
        if s.id != current_senior_id
    ]


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


class SeniorChangeRequestCreate(BaseModel):
    requested_senior_id: str | None = None
    reason: str


@router.post("/change-senior-request")
async def create_senior_change_request(
    data: SeniorChangeRequestCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """선배 변경 요청"""
    existing = await db.execute(
        select(SeniorChangeRequest).where(
            SeniorChangeRequest.user_id == user.id,
            SeniorChangeRequest.status == "pending",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 처리 대기 중인 선배 변경 요청이 있습니다.")

    # 현재 배정된 선배 조회
    senior_assign = await db.execute(
        select(SeniorStudentAssignment).where(SeniorStudentAssignment.user_id == user.id)
    )
    current_assignment = senior_assign.scalar_one_or_none()

    req = SeniorChangeRequest(
        user_id=user.id,
        current_senior_id=current_assignment.senior_id if current_assignment else None,
        requested_senior_id=uuid.UUID(data.requested_senior_id) if data.requested_senior_id else None,
        reason=data.reason,
    )
    db.add(req)
    await db.commit()
    return {"message": "선배 변경 요청이 접수되었습니다."}


@router.get("/change-senior-request/my")
async def list_my_senior_change_requests(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """본인이 제출한 선배 변경 요청 이력 조회 (대기/승인/거절 포함)"""
    result = await db.execute(
        select(SeniorChangeRequest)
        .where(SeniorChangeRequest.user_id == user.id)
        .order_by(SeniorChangeRequest.created_at.desc())
    )
    requests = result.scalars().all()

    # 선배 이름 조회를 위한 id 집합
    senior_ids: set[uuid.UUID] = set()
    for r in requests:
        if r.current_senior_id:
            senior_ids.add(r.current_senior_id)
        if r.requested_senior_id:
            senior_ids.add(r.requested_senior_id)

    senior_name_map: dict[uuid.UUID, str] = {}
    if senior_ids:
        admin_rows = await db.execute(select(Admin).where(Admin.id.in_(senior_ids)))
        for a in admin_rows.scalars().all():
            senior_name_map[a.id] = a.name

    items = []
    for r in requests:
        items.append({
            "id": str(r.id),
            "current_senior_id": str(r.current_senior_id) if r.current_senior_id else None,
            "current_senior_name": senior_name_map.get(r.current_senior_id) if r.current_senior_id else None,
            "requested_senior_id": str(r.requested_senior_id) if r.requested_senior_id else None,
            "requested_senior_name": senior_name_map.get(r.requested_senior_id) if r.requested_senior_id else None,
            "reason": r.reason,
            "status": r.status,
            "admin_memo": r.admin_memo,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "processed_at": r.processed_at.isoformat() if r.processed_at else None,
        })

    return {"items": items}
