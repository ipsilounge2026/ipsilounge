import uuid
from datetime import datetime

from pydantic import BaseModel


class NoticeCreate(BaseModel):
    title: str
    content: str
    target_audience: str = "all"  # all / student / parent / branch_manager
    is_pinned: bool = False
    is_active: bool = True
    send_push: bool = False


class NoticeUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    target_audience: str | None = None
    is_pinned: bool | None = None
    is_active: bool | None = None


class NoticeResponse(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    target_audience: str
    is_pinned: bool
    is_active: bool
    send_push: bool
    admin_name: str | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class NoticeListResponse(BaseModel):
    items: list[NoticeResponse]
    total: int
