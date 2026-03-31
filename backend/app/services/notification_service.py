import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.user import User

logger = logging.getLogger(__name__)


async def send_push_notification(user: User, title: str, body: str, notification_type: str, db: AsyncSession):
    """푸시 알림 발송 + DB 기록"""
    # DB에 알림 기록 저장
    notification = Notification(
        user_id=user.id,
        title=title,
        body=body,
        type=notification_type,
    )
    db.add(notification)
    await db.commit()

    # FCM 푸시 발송 (FCM 토큰이 있는 경우)
    if user.fcm_token:
        try:
            # firebase_admin 초기화 후 사용
            # 실제 배포 시 firebase_admin.messaging.send() 호출
            from firebase_admin import messaging

            message = messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data={"type": notification_type},
                token=user.fcm_token,
            )
            messaging.send(message)
            logger.info(f"FCM 알림 발송 완료: user={user.id}, type={notification_type}")
        except Exception as e:
            logger.warning(f"FCM 알림 발송 실패: user={user.id}, error={e}")
    else:
        logger.info(f"FCM 토큰 없음, DB 알림만 저장: user={user.id}")


async def send_analysis_complete_notification(user: User, db: AsyncSession):
    await send_push_notification(
        user=user,
        title="분석 완료",
        body="학생부 분석이 완료되었습니다. 리포트를 확인해보세요!",
        notification_type="analysis_complete",
        db=db,
    )


async def send_booking_confirmed_notification(user: User, db: AsyncSession):
    await send_push_notification(
        user=user,
        title="상담 예약 확정",
        body="상담 예약이 확정되었습니다. 일정을 확인해주세요.",
        notification_type="consultation_confirmed",
        db=db,
    )


async def send_booking_reminder_notification(user: User, db: AsyncSession):
    await send_push_notification(
        user=user,
        title="상담 리마인드",
        body="내일 상담이 예정되어 있습니다. 준비사항을 확인해주세요.",
        notification_type="consultation_remind",
        db=db,
    )


async def send_push_notification_by_token(token: str, title: str, body: str, data: dict = None):
    """FCM 토큰으로 직접 푸시 알림 발송 (DB 기록 없이, 스케줄러용)"""
    try:
        from firebase_admin import messaging

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            token=token,
        )
        messaging.send(message)
        logger.info(f"FCM 토큰 직접 발송 완료: token={token[:20]}...")
    except Exception as e:
        logger.warning(f"FCM 토큰 직접 발송 실패: {e}")
