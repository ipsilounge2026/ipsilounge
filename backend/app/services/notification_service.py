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
        # Firebase Admin SDK 초기화 여부 먼저 확인 (graceful 비활성)
        from app.services.firebase_admin_service import is_initialized
        if not is_initialized():
            logger.debug(
                f"[fcm] Firebase Admin 미초기화 → 발송 스킵 (user={user.id})"
            )
        else:
            try:
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


async def send_satisfaction_survey_notification(user: User, db: AsyncSession):
    """상담 완료 시 만족도 설문 응답 요청 푸시 (기획서 §10)."""
    await send_push_notification(
        user=user,
        title="상담 만족도 설문",
        body="상담이 완료되었습니다. 서비스 개선을 위해 만족도 설문에 응답해주세요.",
        notification_type="satisfaction_survey",
        db=db,
    )


async def send_report_ready_notification(user: User, db: AsyncSession):
    """사전 설문 분석 리포트가 상담사 검토까지 완료되어 학생 열람 가능해졌을 때 (기획서 §7-1)."""
    await send_push_notification(
        user=user,
        title="분석 리포트 준비 완료",
        body="사전 설문 분석 리포트가 준비되었습니다. 앱에서 결과를 확인해보세요.",
        notification_type="report_ready",
        db=db,
    )


async def send_push_notification_by_token(token: str, title: str, body: str, data: dict = None):
    """FCM 토큰으로 직접 푸시 알림 발송 (DB 기록 없이, 스케줄러용)"""
    from app.services.firebase_admin_service import is_initialized
    if not is_initialized():
        logger.debug("[fcm] Firebase Admin 미초기화 → token 직접 발송 스킵")
        return
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
