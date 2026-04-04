from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin, AdminStudentAssignment
from app.models.analysis_order import AnalysisOrder
from app.models.consultation_booking import ConsultationBooking
from app.models.counselor_change_request import CounselorChangeRequest
from app.models.payment import Payment
from app.models.user import User
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/dashboard", tags=["관리자-대시보드"])


@router.get("")
async def get_dashboard(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """대시보드 통계"""
    today = date.today()
    year = today.year
    month = today.month
    month_start = today.replace(day=1)
    year_start = today.replace(month=1, day=1)
    prev_year = year - 1
    prev_year_start = date(prev_year, 1, 1)
    prev_year_end = date(prev_year, 12, 31)
    prev_year_month_start = date(prev_year, month, 1)
    # 전년 동월 마지막 날
    if month == 12:
        prev_year_month_end = date(prev_year, 12, 31)
    else:
        prev_year_month_end = date(prev_year, month + 1, 1) - timedelta(days=1)

    # ========== 매출 ==========
    async def _revenue(start, end):
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

    revenue_year = await _revenue(year_start, today)
    revenue_month = await _revenue(month_start, today)
    revenue_prev_year = await _revenue(prev_year_start, prev_year_end)
    revenue_prev_year_month = await _revenue(prev_year_month_start, prev_year_month_end)

    # ========== 분석 현황 (service_type별) ==========
    async def _analysis_stats(service_type: str, start_date=None):
        """특정 service_type의 상태별 건수 반환"""
        base_conditions = [AnalysisOrder.service_type == service_type]
        if start_date:
            base_conditions.append(AnalysisOrder.created_at >= datetime.combine(start_date, datetime.min.time()))

        applied = await _count(db, AnalysisOrder, *base_conditions, AnalysisOrder.status == "applied")
        uploaded = await _count(db, AnalysisOrder, *base_conditions, AnalysisOrder.status.in_(["uploaded", "pending"]))
        processing = await _count(db, AnalysisOrder, *base_conditions, AnalysisOrder.status == "processing")

        completed_conds = list(base_conditions) + [AnalysisOrder.status == "completed"]
        completed = await _count(db, AnalysisOrder, *completed_conds)

        return {
            "applied": applied,
            "uploaded": uploaded,
            "processing": processing,
            "completed": completed,
        }

    # 학생부라운지
    sb_year = await _analysis_stats("학생부라운지", year_start)
    sb_month = await _analysis_stats("학생부라운지", month_start)

    # 학종라운지
    hj_year = await _analysis_stats("학종라운지", year_start)
    hj_month = await _analysis_stats("학종라운지", month_start)

    # ========== 상담 현황 (유형별) ==========
    consultation_types = ["학생부분석", "입시전략", "학습상담", "심리상담", "기타"]

    async def _consultation_stats(start_date=None):
        """상담 유형별 예약/완료 건수"""
        results = {}
        for ctype in consultation_types:
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

    consultation_year = await _consultation_stats(year_start)
    consultation_month = await _consultation_stats(month_start)

    # ========== 매칭 현황 ==========
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

    # 담당자 변경 요청 현황
    change_requests_pending = await _count(db, CounselorChangeRequest, CounselorChangeRequest.status == "pending")

    # 회원 수
    total_users = await _count(db, User)
    new_users_month = await _count(db, User, User.created_at >= month_start)

    return {
        "period": {
            "year": year,
            "month": month,
        },
        "revenue": {
            "year": revenue_year,
            "month": revenue_month,
            "prev_year": revenue_prev_year,
            "prev_year_month": revenue_prev_year_month,
        },
        "student_lounge": {
            "year": sb_year,
            "month": sb_month,
        },
        "hakjong_lounge": {
            "year": hj_year,
            "month": hj_month,
        },
        "consultation": {
            "year": consultation_year,
            "month": consultation_month,
        },
        "users": {
            "total": total_users,
            "new_this_month": new_users_month,
        },
        "matching": {
            "matched": len(matched_user_ids),
            "unmatched": unmatched_count,
        },
        "change_requests": {
            "pending": change_requests_pending,
        },
    }


async def _count(db: AsyncSession, model, *conditions):
    query = select(func.count()).select_from(model)
    for condition in conditions:
        query = query.where(condition)
    result = await db.execute(query)
    return result.scalar()
