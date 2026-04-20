import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.payment import Payment
from app.models.user import User
from app.schemas.payment import (
    GooglePaymentVerify,
    PaymentListResponse,
    PaymentResponse,
    TossPaymentConfirm,
    TossPaymentReady,
)
from app.services.payment_service import verify_google_purchase, verify_toss_payment
from app.utils.dependencies import get_current_user
from app.utils.family import get_visible_owner_ids
from app.utils.rate_limiter import limiter

router = APIRouter(prefix="/api/payment", tags=["결제"])


@router.post("/toss/ready")
@limiter.limit("5/minute")
async def toss_payment_ready(
    request: Request,
    data: TossPaymentReady,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """토스페이먼츠 결제 준비 (주문 ID 생성)"""
    order_id = f"ipsi_{data.order_type}_{uuid.uuid4().hex[:12]}"

    payment = Payment(
        user_id=user.id,
        analysis_order_id=data.order_id if data.order_type == "analysis" else None,
        consultation_booking_id=data.order_id if data.order_type == "consultation" else None,
        amount=data.amount,
        method="toss",
        status="pending",
        transaction_id=order_id,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    return {
        "order_id": order_id,
        "payment_id": str(payment.id),
        "amount": data.amount,
    }


@router.post("/toss/confirm", response_model=PaymentResponse)
@limiter.limit("5/minute")
async def toss_payment_confirm(
    request: Request,
    data: TossPaymentConfirm,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """토스페이먼츠 결제 확인"""
    toss_result = await verify_toss_payment(data.payment_key, data.order_id, data.amount)

    result = await db.execute(
        select(Payment).where(Payment.transaction_id == data.order_id, Payment.user_id == user.id)
    )
    payment = result.scalar_one_or_none()
    if payment:
        payment.status = "completed"
        payment.transaction_id = data.payment_key
        await db.commit()
        await db.refresh(payment)

    return payment


@router.post("/google/verify", response_model=PaymentResponse)
@limiter.limit("5/minute")
async def google_payment_verify(
    request: Request,
    data: GooglePaymentVerify,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Google 인앱결제 검증"""
    is_valid = await verify_google_purchase(data.purchase_token, data.product_id)

    payment = Payment(
        user_id=user.id,
        analysis_order_id=data.order_id if data.order_type == "analysis" else None,
        consultation_booking_id=data.order_id if data.order_type == "consultation" else None,
        amount=0,  # Google Play에서 금액 확인
        method="google_play",
        status="completed" if is_valid else "failed",
        transaction_id=data.purchase_token,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    return payment


@router.get("/my", response_model=PaymentListResponse)
async def get_my_payments(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내 결제 내역.

    가시성 규칙:
    - 학생: 본인 결제만
    - 학부모: 본인 + 연결된 자녀들의 결제 (학부모가 자녀 명의로 결제한 건 포함)
    """
    visible_ids = await get_visible_owner_ids(user, db)
    result = await db.execute(
        select(Payment)
        .where(Payment.user_id.in_(visible_ids))
        .order_by(Payment.created_at.desc())
    )
    payments = result.scalars().all()

    return PaymentListResponse(items=payments, total=len(payments))
