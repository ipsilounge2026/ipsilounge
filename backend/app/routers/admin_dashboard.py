from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, extract, select, not_, exists
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.admin import Admin, AdminStudentAssignment, SeniorStudentAssignment
from app.models.analysis_order import AnalysisOrder
from app.models.consultation_booking import ConsultationBooking
from app.models.consultation_note import ConsultationNote
from app.models.consultation_survey import ConsultationSurvey
from app.models.counselor_change_request import CounselorChangeRequest
from app.models.payment import Payment
from app.models.senior_consultation_note import SeniorConsultationNote
from app.models.user import User
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/dashboard", tags=["관리자-대시보드"])


@router.get("")
async def get_dashboard(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """역할별 대시보드 통계"""
    today = date.today()
    year = today.year
    month = today.month
    month_start = today.replace(day=1)
    year_start = today.replace(month=1, day=1)
    role = admin.role

    result: dict = {
        "period": {"year": year, "month": month},
        "role": role,
    }

    # ========== 최고관리자 / 관리자 공통 섹션 ==========
    if role in ("super_admin", "admin"):
        # --- 분석 현황 ---
        sb_year = await _analysis_stats(db, "학생부라운지", year_start)
        sb_month = await _analysis_stats(db, "학생부라운지", month_start)
        hj_year = await _analysis_stats(db, "학종라운지", year_start)
        hj_month = await _analysis_stats(db, "학종라운지", month_start)
        result["student_lounge"] = {"year": sb_year, "month": sb_month}
        result["hakjong_lounge"] = {"year": hj_year, "month": hj_month}

        # --- 상담 현황 (전체) ---
        consultation_year = await _consultation_stats(db, year_start)
        consultation_month = await _consultation_stats(db, month_start)
        result["consultation"] = {"year": consultation_year, "month": consultation_month}

        # --- 매칭 대기 현황 ---
        matched_count_result = await db.execute(select(AdminStudentAssignment.user_id).distinct())
        matched_user_ids = set(row[0] for row in matched_count_result.all())
        analysis_users_result = await db.execute(select(AnalysisOrder.user_id).distinct())
        analysis_user_ids = set(row[0] for row in analysis_users_result.all())
        booking_users_result = await db.execute(
            select(ConsultationBooking.user_id).where(ConsultationBooking.status != "cancelled").distinct()
        )
        booking_user_ids = set(row[0] for row in booking_users_result.all())
        service_user_ids = analysis_user_ids | booking_user_ids
        unmatched_count = len(service_user_ids - matched_user_ids)
        result["matching"] = {"unmatched": unmatched_count}

        # --- 담당자 변경 요청 ---
        change_requests_pending = await _count(db, CounselorChangeRequest, CounselorChangeRequest.status == "pending")
        result["change_requests"] = {"pending": change_requests_pending}

        # --- 선배 기록 검토 대기 ---
        senior_review_pending = await _count(
            db, SeniorConsultationNote, SeniorConsultationNote.review_status == "pending"
        )
        result["senior_review"] = {"pending": senior_review_pending}

    # ========== 최고관리자 전용 섹션 ==========
    if role == "super_admin":
        prev_year = year - 1
        prev_year_start = date(prev_year, 1, 1)
        prev_year_end = date(prev_year, 12, 31)
        prev_year_month_start = date(prev_year, month, 1)
        if month == 12:
            prev_year_month_end = date(prev_year, 12, 31)
        else:
            prev_year_month_end = date(prev_year, month + 1, 1) - timedelta(days=1)

        # --- 매출 ---
        revenue_year = await _revenue(db, year_start, today)
        revenue_month = await _revenue(db, month_start, today)
        revenue_prev_year = await _revenue(db, prev_year_start, prev_year_end)
        revenue_prev_year_month = await _revenue(db, prev_year_month_start, prev_year_month_end)
        result["revenue"] = {
            "year": revenue_year,
            "month": revenue_month,
            "prev_year": revenue_prev_year,
            "prev_year_month": revenue_prev_year_month,
        }

        # --- 전체 회원수 / 신규 / 매칭 완료 ---
        total_users = await _count(db, User)
        new_users_month = await _count(db, User, User.created_at >= month_start)
        result["users"] = {
            "total": total_users,
            "new_this_month": new_users_month,
        }
        # matched_user_ids는 위 super_admin/admin 공통 블록에서 이미 계산됨
        result["matching"]["matched"] = len(matched_user_ids)

    # ========== 상담사 / 선배 섹션 ==========
    if role in ("counselor", "senior"):
        # --- 나의 담당 학생 목록 ---
        if role == "counselor":
            assign_result = await db.execute(
                select(AdminStudentAssignment.user_id).where(
                    AdminStudentAssignment.admin_id == admin.id
                )
            )
        else:  # senior
            assign_result = await db.execute(
                select(SeniorStudentAssignment.user_id).where(
                    SeniorStudentAssignment.senior_id == admin.id
                )
            )
        my_student_ids = [row[0] for row in assign_result.all()]
        result["my_students"] = {"count": len(my_student_ids)}

        # --- 나의 다가오는 상담 ---
        from app.models.consultation_slot import ConsultationSlot
        upcoming_query = (
            select(
                ConsultationBooking.id,
                ConsultationBooking.status,
                ConsultationBooking.type,
                ConsultationBooking.mode,
                ConsultationBooking.memo,
                ConsultationSlot.date,
                ConsultationSlot.start_time,
                ConsultationSlot.end_time,
                User.name.label("student_name"),
            )
            .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
            .join(User, ConsultationBooking.user_id == User.id)
            .where(
                ConsultationSlot.admin_id == admin.id,
                ConsultationBooking.status.in_(["requested", "confirmed"]),
                ConsultationSlot.date >= today,
            )
            .order_by(ConsultationSlot.date, ConsultationSlot.start_time)
            .limit(10)
        )
        upcoming_result = await db.execute(upcoming_query)
        upcoming_rows = upcoming_result.all()
        result["upcoming_consultations"] = [
            {
                "id": str(r.id),
                "status": r.status,
                "type": r.type,
                "mode": r.mode,
                "memo": r.memo,
                "date": r.date.isoformat() if r.date else None,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "end_time": r.end_time.isoformat() if r.end_time else None,
                "student_name": r.student_name,
            }
            for r in upcoming_rows
        ]

        # --- 기록 미작성 알림 ---
        # 완료된 상담 중 상담기록이 없는 건
        if role == "counselor":
            note_exists_subq = select(ConsultationNote.booking_id).where(
                ConsultationNote.booking_id == ConsultationBooking.id
            ).correlate(ConsultationBooking)
            unwritten_query = (
                select(
                    ConsultationBooking.id,
                    ConsultationBooking.type,
                    ConsultationSlot.date,
                    User.name.label("student_name"),
                )
                .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
                .join(User, ConsultationBooking.user_id == User.id)
                .where(
                    ConsultationSlot.admin_id == admin.id,
                    ConsultationBooking.status == "completed",
                    ~exists(note_exists_subq),
                )
                .order_by(ConsultationSlot.date.desc())
                .limit(10)
            )
        else:  # senior
            note_exists_subq = select(SeniorConsultationNote.booking_id).where(
                SeniorConsultationNote.booking_id == ConsultationBooking.id
            ).correlate(ConsultationBooking)
            unwritten_query = (
                select(
                    ConsultationBooking.id,
                    ConsultationBooking.type,
                    ConsultationSlot.date,
                    User.name.label("student_name"),
                )
                .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
                .join(User, ConsultationBooking.user_id == User.id)
                .where(
                    ConsultationSlot.admin_id == admin.id,
                    ConsultationBooking.status == "completed",
                    ~exists(note_exists_subq),
                )
                .order_by(ConsultationSlot.date.desc())
                .limit(10)
            )
        unwritten_result = await db.execute(unwritten_query)
        unwritten_rows = unwritten_result.all()
        result["unwritten_records"] = [
            {
                "booking_id": str(r.id),
                "type": r.type,
                "date": r.date.isoformat() if r.date else None,
                "student_name": r.student_name,
            }
            for r in unwritten_rows
        ]

        # --- 담당 학생 설문 현황 ---
        if my_student_ids:
            survey_query = (
                select(
                    ConsultationSurvey.id,
                    ConsultationSurvey.survey_type,
                    ConsultationSurvey.status,
                    ConsultationSurvey.updated_at,
                    User.name.label("student_name"),
                )
                .join(User, ConsultationSurvey.user_id == User.id)
                .where(ConsultationSurvey.user_id.in_(my_student_ids))
                .order_by(ConsultationSurvey.updated_at.desc())
                .limit(10)
            )
            survey_result = await db.execute(survey_query)
            survey_rows = survey_result.all()
            result["student_surveys"] = [
                {
                    "id": str(r.id),
                    "survey_type": r.survey_type,
                    "status": r.status,
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                    "student_name": r.student_name,
                }
                for r in survey_rows
            ]

            # 설문 요약 카운트
            draft_count = sum(1 for r in survey_rows if r.status == "draft")
            submitted_count = sum(1 for r in survey_rows if r.status == "submitted")
            result["student_surveys_summary"] = {
                "draft": draft_count,
                "submitted": submitted_count,
                "total": len(survey_rows),
            }
        else:
            result["student_surveys"] = []
            result["student_surveys_summary"] = {"draft": 0, "submitted": 0, "total": 0}

    # ========== 상담사 전용: 선배 기록 검토 대기 ==========
    if role == "counselor":
        # 상담사가 담당하는 학생의 선배 기록 중 검토 대기
        if my_student_ids:
            senior_pending_query = (
                select(
                    SeniorConsultationNote.id,
                    SeniorConsultationNote.session_timing,
                    SeniorConsultationNote.consultation_date,
                    SeniorConsultationNote.review_status,
                    User.name.label("student_name"),
                )
                .join(User, SeniorConsultationNote.user_id == User.id)
                .where(
                    SeniorConsultationNote.user_id.in_(my_student_ids),
                    SeniorConsultationNote.review_status == "pending",
                )
                .order_by(SeniorConsultationNote.created_at.desc())
                .limit(10)
            )
            senior_pending_result = await db.execute(senior_pending_query)
            senior_pending_rows = senior_pending_result.all()
            result["senior_review"] = {
                "pending": len(senior_pending_rows),
                "items": [
                    {
                        "id": str(r.id),
                        "session_timing": r.session_timing,
                        "consultation_date": r.consultation_date.isoformat() if r.consultation_date else None,
                        "student_name": r.student_name,
                    }
                    for r in senior_pending_rows
                ],
            }
        else:
            result["senior_review"] = {"pending": 0, "items": []}

    return result


# ========== 유틸 함수 ==========

async def _count(db: AsyncSession, model, *conditions):
    query = select(func.count()).select_from(model)
    for condition in conditions:
        query = query.where(condition)
    result = await db.execute(query)
    return result.scalar()


async def _revenue(db: AsyncSession, start, end):
    result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            and_(
                Payment.status == "completed",
                Payment.created_at >= datetime.combine(start, datetime.min.time()),
                Payment.created_at < datetime.combine(end + timedelta(days=1), datetime.min.time()),
            )
        )
    )
    return result.scalar()


async def _analysis_stats(db: AsyncSession, service_type: str, start_date=None):
    """특정 service_type의 상태별 건수 반환"""
    base_conditions = [AnalysisOrder.service_type == service_type]
    if start_date:
        base_conditions.append(AnalysisOrder.created_at >= datetime.combine(start_date, datetime.min.time()))

    applied = await _count(db, AnalysisOrder, *base_conditions, AnalysisOrder.status == "applied")
    uploaded = await _count(db, AnalysisOrder, *base_conditions, AnalysisOrder.status.in_(["uploaded", "pending"]))
    processing = await _count(db, AnalysisOrder, *base_conditions, AnalysisOrder.status == "processing")
    completed = await _count(db, AnalysisOrder, *base_conditions, AnalysisOrder.status == "completed")

    return {"applied": applied, "uploaded": uploaded, "processing": processing, "completed": completed}


CONSULTATION_TYPES = ["학생부분석", "입시전략", "학습상담", "심리상담", "기타"]


async def _consultation_stats(db: AsyncSession, start_date=None):
    """상담 유형별 예약/완료 건수"""
    results = {}
    for ctype in CONSULTATION_TYPES:
        base_conditions = [ConsultationBooking.type == ctype]
        if start_date:
            base_conditions.append(ConsultationBooking.created_at >= datetime.combine(start_date, datetime.min.time()))
        booked = await _count(
            db, ConsultationBooking, *base_conditions,
            ConsultationBooking.status.in_(["requested", "confirmed"]),
        )
        completed = await _count(
            db, ConsultationBooking, *base_conditions,
            ConsultationBooking.status == "completed",
        )
        results[ctype] = {"booked": booked, "completed": completed}
    return results
