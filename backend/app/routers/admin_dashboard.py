from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
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
    month_start = today.replace(day=1)

    # 분석 현황
    analysis_applied = await _count(db, AnalysisOrder, AnalysisOrder.status == "applied")
    analysis_uploaded = await _count(db, AnalysisOrder, AnalysisOrder.status.in_(["uploaded", "pending"]))
    analysis_processing = await _count(db, AnalysisOrder, AnalysisOrder.status == "processing")
    analysis_completed_month = await _count(
        db, AnalysisOrder,
        and_(AnalysisOrder.status == "completed", AnalysisOrder.completed_at >= month_start),
    )

    # 상담 현황
    bookings_today = await _count(
        db, ConsultationBooking,
        and_(
            ConsultationBooking.status.in_(["requested", "confirmed"]),
        ),
    )

    # 회원 수
    total_users = await _count(db, User)
    new_users_month = await _count(db, User, User.created_at >= month_start)

    # 매출 (이번 달)
    revenue_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            and_(Payment.status == "completed", Payment.created_at >= month_start)
        )
    )
    monthly_revenue = revenue_result.scalar()

    # 담당자 매칭 현황
    matched_count = await _count(db, AdminStudentAssignment)
    # 라운지 또는 상담 신청한 고유 사용자 수
    analysis_users_result = await db.execute(select(AnalysisOrder.user_id).distinct())
    analysis_user_ids = set(row[0] for row in analysis_users_result.all())
    booking_users_result = await db.execute(
        select(ConsultationBooking.user_id).where(ConsultationBooking.status != "cancelled").distinct()
    )
    booking_user_ids = set(row[0] for row in booking_users_result.all())
    matched_user_result = await db.execute(select(AdminStudentAssignment.user_id).distinct())
    matched_user_ids = set(row[0] for row in matched_user_result.all())
    service_user_ids = analysis_user_ids | booking_user_ids
    unmatched_count = len(service_user_ids - matched_user_ids)

    # 담당자 변경 요청 현황
    change_requests_pending = await _count(db, CounselorChangeRequest, CounselorChangeRequest.status == "pending")

    return {
        "analysis": {
            "applied": analysis_applied,
            "uploaded": analysis_uploaded,
            "processing": analysis_processing,
            "completed_this_month": analysis_completed_month,
        },
        "consultation": {
            "bookings_active": bookings_today,
        },
        "users": {
            "total": total_users,
            "new_this_month": new_users_month,
        },
        "revenue": {
            "this_month": monthly_revenue,
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
