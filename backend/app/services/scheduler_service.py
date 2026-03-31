import logging
from datetime import date, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session
from app.models.consultation_booking import ConsultationBooking
from app.models.consultation_slot import ConsultationSlot
from app.models.user import User
from app.services.email_service import send_consultation_reminder_email
from app.services.notification_service import send_push_notification_by_token

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="Asia/Seoul")


async def _send_reminders():
    """내일 상담이 있는 사용자에게 리마인더 알림 발송"""
    tomorrow = date.today() + timedelta(days=1)
    logger.info(f"리마인더 발송 시작: {tomorrow}")

    async with async_session() as db:
        result = await db.execute(
            select(ConsultationBooking)
            .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
            .where(
                ConsultationSlot.date == tomorrow,
                ConsultationBooking.status == "confirmed",
            )
            .options(
                selectinload(ConsultationBooking.user),
                selectinload(ConsultationBooking.slot),
            )
        )
        bookings = result.scalars().all()

    for booking in bookings:
        user: User = booking.user
        slot: ConsultationSlot = booking.slot
        date_str = slot.date.strftime("%Y년 %m월 %d일")
        time_str = slot.start_time.strftime("%H:%M")

        # FCM 푸시 알림
        if user.fcm_token:
            await send_push_notification_by_token(
                token=user.fcm_token,
                title="내일 상담 예약 리마인더",
                body=f"{date_str} {time_str} 상담이 예정되어 있습니다.",
                data={"type": "consultation_remind", "booking_id": str(booking.id)},
            )

        # 이메일 알림
        await send_consultation_reminder_email(user.email, user.name, date_str, time_str)

    logger.info(f"리마인더 발송 완료: {len(bookings)}건")


def start_scheduler():
    """서버 시작 시 스케줄러 등록 및 실행"""
    # 매일 오전 9시 (한국 시간) 리마인더 발송
    scheduler.add_job(_send_reminders, "cron", hour=9, minute=0, id="consultation_reminder")
    scheduler.start()
    logger.info("스케줄러 시작 완료")


def stop_scheduler():
    """서버 종료 시 스케줄러 중단"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("스케줄러 중단 완료")
