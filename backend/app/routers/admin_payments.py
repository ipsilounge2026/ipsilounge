import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.payment import Payment
from app.models.user import User
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/payments", tags=["관리자-결제"])


@router.get("")
async def list_payments(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """결제 목록"""
    query = select(Payment).join(User, Payment.user_id == User.id)
    count_query = select(func.count()).select_from(Payment)

    if status_filter:
        query = query.where(Payment.status == status_filter)
        count_query = count_query.where(Payment.status == status_filter)

    query = query.order_by(Payment.created_at.desc()).offset((page - 1) * size).limit(size)

    result = await db.execute(query)
    payments = result.scalars().all()

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # 사용자 정보 포함
    items = []
    for p in payments:
        user_result = await db.execute(select(User).where(User.id == p.user_id))
        user = user_result.scalar_one_or_none()
        items.append({
            "id": str(p.id),
            "user_name": user.name if user else "알 수 없음",
            "user_email": user.email if user else "",
            "amount": p.amount,
            "method": p.method,
            "status": p.status,
            "transaction_id": p.transaction_id,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })

    # 매출 합계
    completed_sum_result = await db.execute(
        select(func.sum(Payment.amount)).where(Payment.status == "completed")
    )
    total_revenue = completed_sum_result.scalar() or 0

    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "total_revenue": total_revenue,
    }


@router.get("/stats")
async def payment_stats(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """결제 통계"""
    total_result = await db.execute(select(func.count()).select_from(Payment))
    total = total_result.scalar() or 0

    completed_result = await db.execute(
        select(func.count(), func.sum(Payment.amount))
        .where(Payment.status == "completed")
    )
    completed_row = completed_result.one()
    completed_count = completed_row[0] or 0
    total_revenue = completed_row[1] or 0

    pending_result = await db.execute(
        select(func.count()).select_from(Payment).where(Payment.status == "pending")
    )
    pending_count = pending_result.scalar() or 0

    return {
        "total": total,
        "completed": completed_count,
        "pending": pending_count,
        "total_revenue": total_revenue,
    }


@router.put("/{payment_id}/refund")
async def refund_payment(
    payment_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """결제 환불 처리 (수동)"""
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="결제 내역을 찾을 수 없습니다")
    if payment.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="완료된 결제만 환불할 수 있습니다")

    payment.status = "refunded"
    await db.commit()
    return {"message": "환불 처리되었습니다"}
