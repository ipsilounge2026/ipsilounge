from datetime import date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consultation_booking import ConsultationBooking
from app.models.consultation_slot import ConsultationSlot
from app.schemas.consultation import SlotBulkCreateRequest


async def check_slot_available(slot_id, db: AsyncSession) -> ConsultationSlot:
    """예약 가능 여부 확인 후 슬롯 반환"""
    result = await db.execute(select(ConsultationSlot).where(ConsultationSlot.id == slot_id))
    slot = result.scalar_one_or_none()
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="해당 상담 시간대를 찾을 수 없습니다")
    if not slot.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="비활성화된 상담 시간대입니다")
    if slot.current_bookings >= slot.max_bookings:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="해당 시간대의 예약이 마감되었습니다")
    if slot.date < date.today():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="지난 날짜는 예약할 수 없습니다")
    return slot


async def create_bulk_slots(data: SlotBulkCreateRequest, db: AsyncSession) -> int:
    """반복 시간대 일괄 생성. 생성된 슬롯 수 반환."""
    created_count = 0
    current_date = data.start_date

    while current_date <= data.end_date:
        if current_date.weekday() in data.weekdays:
            # 해당 날짜에 시간대 생성
            current_time = datetime.combine(current_date, data.start_time)
            end_datetime = datetime.combine(current_date, data.end_time)

            while current_time + timedelta(minutes=data.duration_minutes) <= end_datetime:
                slot_end = (current_time + timedelta(minutes=data.duration_minutes)).time()

                # 중복 확인
                result = await db.execute(
                    select(ConsultationSlot).where(
                        and_(
                            ConsultationSlot.date == current_date,
                            ConsultationSlot.start_time == current_time.time(),
                        )
                    )
                )
                if result.scalar_one_or_none() is None:
                    slot = ConsultationSlot(
                        date=current_date,
                        start_time=current_time.time(),
                        end_time=slot_end,
                        max_bookings=data.max_bookings,
                    )
                    db.add(slot)
                    created_count += 1

                current_time += timedelta(minutes=data.duration_minutes)

        current_date += timedelta(days=1)

    await db.commit()
    return created_count
