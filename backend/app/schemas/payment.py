import uuid
from datetime import datetime

from pydantic import BaseModel


class TossPaymentReady(BaseModel):
    order_type: str  # analysis / consultation
    order_id: uuid.UUID
    amount: int


class TossPaymentConfirm(BaseModel):
    payment_key: str
    order_id: str
    amount: int


class GooglePaymentVerify(BaseModel):
    purchase_token: str
    product_id: str
    order_type: str  # analysis / consultation
    order_id: uuid.UUID


class PaymentResponse(BaseModel):
    id: uuid.UUID
    amount: int
    method: str
    status: str
    transaction_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentListResponse(BaseModel):
    items: list[PaymentResponse]
    total: int
