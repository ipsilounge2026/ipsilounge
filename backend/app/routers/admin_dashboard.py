from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.analysis_order import AnalysisOrder
from app.models.consultation_booking import ConsultationBooking
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
    }


async def _count(db: AsyncSession, model, *conditions):
    query = select(func.count()).select_from(model)
    for condition in conditions:
        query = query.where(condition)
    result = await db.execute(query)
    return result.scalar()
