import logging
from datetime import UTC, date, datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session
from app.models.consultation_booking import ConsultationBooking
from app.models.consultation_note import ConsultationNote
from app.models.consultation_slot import ConsultationSlot
from app.models.consultation_survey import ConsultationSurvey
from app.models.user import User
from app.services.email_service import send_consultation_reminder_email
from app.services.notification_service import send_push_notification_by_token

# V1 §7-2 관리자 SLA (검토 완료까지 48시간 이내 권장)
SLA_REVIEW_HOURS = 48

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


async def _check_sla_overdue_reviews():
    """선배 공유 검토 SLA 초과 건 집계 + 로그 (V1 §7-2: 48시간 이내 권장).

    현재 구현 범위 (MVP):
      - 매일 오전 9:30 KST 실행
      - 검토 대기 중인 설문/상담기록 중 48시간 초과 건 수 집계
      - 로그(WARNING) 기록 → 관리자 Slack/이메일 연계는 추후 확장
      - admin-web /consultation/counselor-sharing 배너가 동일 데이터를
        실시간 반영하므로 admin 은 대시보드 접속 시 바로 인지 가능

    향후 확장 여지:
      - admin 계정 FCM 토큰 보유 시 푸시 발송
      - admin 이메일 SMTP 발송
      - Slack incoming webhook 통지
    """
    now = datetime.now(UTC)
    threshold = now - timedelta(hours=SLA_REVIEW_HOURS)

    async with async_session() as db:
        # 설문: submitted_at < threshold
        survey_q = select(ConsultationSurvey).where(
            ConsultationSurvey.status == "submitted",
            ConsultationSurvey.senior_review_status == "pending",
            ConsultationSurvey.submitted_at.isnot(None),
            ConsultationSurvey.submitted_at < threshold,
        )
        overdue_surveys = (await db.execute(survey_q)).scalars().all()

        # 노트: created_at < threshold
        note_q = select(ConsultationNote).where(
            ConsultationNote.senior_review_status == "pending",
            ConsultationNote.created_at.isnot(None),
            ConsultationNote.created_at < threshold,
        )
        overdue_notes = (await db.execute(note_q)).scalars().all()

    total = len(overdue_surveys) + len(overdue_notes)
    if total > 0:
        logger.warning(
            "[SLA] 선배 공유 검토 SLA(%dh) 초과 건 %d개 — 설문 %d / 노트 %d. "
            "admin-web /consultation/counselor-sharing 에서 확인 요망.",
            SLA_REVIEW_HOURS, total, len(overdue_surveys), len(overdue_notes),
        )
    else:
        logger.info("[SLA] 선배 공유 검토 SLA 초과 건 없음 (기준 %dh).", SLA_REVIEW_HOURS)


def start_scheduler():
    """서버 시작 시 스케줄러 등록 및 실행"""
    # 매일 오전 9시 (한국 시간) 리마인더 발송
    scheduler.add_job(_send_reminders, "cron", hour=9, minute=0, id="consultation_reminder")
    # 매일 오전 9:30 SLA 초과 검토 건 집계 로그 (V1 §7-2)
    scheduler.add_job(_check_sla_overdue_reviews, "cron", hour=9, minute=30, id="sharing_review_sla")
    scheduler.start()
    logger.info("스케줄러 시작 완료")


def stop_scheduler():
    """서버 종료 시 스케줄러 중단"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("스케줄러 중단 완료")
