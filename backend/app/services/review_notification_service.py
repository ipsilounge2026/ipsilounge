"""
검토 완료 시 차기 상담 예약자에게 자동 알림 (V1 §7-1).

V1 §7-1 "검토 완료 → 차기 상담 시작 시 상대 상담자에게 자동 노출" 의
**첫 번째 트리거** 구현. 세션 페이지 pull-기반 노출(1491d6b)은
상대가 화면을 열어야만 인지 가능하므로, 리뷰가 완료된 순간에도
이미 확정된 차기 상담이 있다면 해당 상담자에게 이메일로 push 한다.

흐름:
  [상담사 기록/설문 senior_review_status → 'reviewed']
       ↓
  해당 학생의 예정된 '선배상담' booking 조회 (status=confirmed, slot.date >= today)
       ↓
  있으면 담당 선배 admin 이메일로 "상담 준비 자료 업데이트" 알림

  [선배 노트 review_status → 'reviewed']
       ↓
  해당 학생의 예정된 '학습상담'/'심리상담' booking 조회
       ↓
  있으면 담당 상담사 admin 이메일로 "상담 준비 자료 업데이트" 알림

주의:
- DB Notification 모델은 users 테이블 FK 라 admin 에게 저장 불가 → 이메일만
- Admin 은 fcm_token 필드가 없음 → FCM 발송 안 함
- SMTP 미설정 시 이메일 발송은 graceful 실패 (로그만)
- 이 알림은 best-effort 이며, 세션 페이지 pull-기반 노출이 backup
"""
from __future__ import annotations

import logging
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.admin import Admin
from app.models.consultation_booking import ConsultationBooking
from app.models.consultation_slot import ConsultationSlot
from app.models.user import User
from app.services.email_service import _send_email

logger = logging.getLogger(__name__)


# 리뷰된 기록 종류 → 다음 상담에서 보게 될 상담 유형(type) 매핑
# V1 §7-1: 상담사 기록 reviewed → 선배상담 차례, 선배 기록 reviewed → 학습/심리상담 차례
_TARGET_CONSULTATION_TYPES: dict[str, tuple[str, ...]] = {
    "counselor_to_senior": ("선배상담",),
    "senior_to_counselor": ("학습상담", "심리상담"),
}


async def _find_next_booking(
    db: AsyncSession,
    user_id: uuid.UUID,
    target_types: tuple[str, ...],
) -> ConsultationBooking | None:
    """해당 학생의 예정된 상담 예약 중 가장 가까운 1건 조회.

    기준: status=confirmed, slot.date >= today, type in target_types.
    """
    q = (
        select(ConsultationBooking)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .where(
            ConsultationBooking.user_id == user_id,
            ConsultationBooking.status == "confirmed",
            ConsultationBooking.type.in_(target_types),
            ConsultationSlot.date >= date.today(),
        )
        .options(selectinload(ConsultationBooking.slot))
        .order_by(ConsultationSlot.date.asc(), ConsultationSlot.start_time.asc())
        .limit(1)
    )
    return (await db.execute(q)).scalar_one_or_none()


async def _fetch_admin_email(db: AsyncSession, admin_id: uuid.UUID) -> tuple[str | None, str | None]:
    """담당 admin 의 (email, name) 반환."""
    res = await db.execute(
        select(Admin.email, Admin.name).where(Admin.id == admin_id)
    )
    row = res.first()
    if row is None:
        return None, None
    return row[0], row[1]


async def _fetch_user_name(db: AsyncSession, user_id: uuid.UUID) -> str | None:
    res = await db.execute(select(User.name).where(User.id == user_id))
    return res.scalar_one_or_none()


def _compose_email(
    admin_name: str | None,
    student_name: str | None,
    booking_date: str,
    direction: str,
) -> tuple[str, str]:
    """이메일 제목·본문 생성."""
    direction_label = {
        "counselor_to_senior": "학생의 상담사 상담 기록",
        "senior_to_counselor": "학생의 선배 상담 기록",
    }.get(direction, "상담 기록")
    name = admin_name or "담당자"
    student = student_name or "(학생)"
    subject = f"[상담 준비] {student} 학생의 {direction_label}이 공유 가능해졌습니다"
    body = f"""<html><body style="font-family:Arial,sans-serif;">
<h3>{name}님, 상담 준비 자료가 업데이트되었습니다.</h3>
<p>
  <b>{student}</b> 학생의 <b>{direction_label}</b>에 대한 관리자 검토가 완료되어,
  예정된 <b>{booking_date}</b> 상담 준비 화면에서 바로 확인하실 수 있습니다.
</p>
<p>admin-web 의 해당 상담 세션 페이지에 접속하시면 자동으로 최신 맥락이 노출됩니다.</p>
<hr/>
<p style="color:#6B7280; font-size: 12px;">
  본 알림은 연계규칙 V1 §7-1 에 따라 자동 발송되었습니다.
</p>
</body></html>"""
    return subject, body


async def notify_counselor_record_reviewed(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> bool:
    """상담사 기록/설문이 reviewed 로 전환됐을 때 호출.

    → 해당 학생의 예정된 '선배상담' 예약이 있으면 담당 선배에게 이메일 발송.
    실패해도 예외를 전파하지 않음.
    """
    try:
        booking = await _find_next_booking(
            db, user_id, _TARGET_CONSULTATION_TYPES["counselor_to_senior"],
        )
        if booking is None or booking.admin_id is None:
            return False
        email, admin_name = await _fetch_admin_email(db, booking.admin_id)
        if not email:
            return False
        student_name = await _fetch_user_name(db, user_id)
        subject, body = _compose_email(
            admin_name=admin_name,
            student_name=student_name,
            booking_date=str(booking.slot.date) if booking.slot else "(일정 미지정)",
            direction="counselor_to_senior",
        )
        return await _send_email(email, subject, body)
    except Exception as e:
        logger.warning(f"리뷰 완료 알림 발송 실패 (counselor→senior): {e}")
        return False


async def notify_senior_record_reviewed(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> bool:
    """선배 노트가 reviewed 로 전환됐을 때 호출.

    → 해당 학생의 예정된 '학습상담'/'심리상담' 예약이 있으면 담당 상담사에게 이메일.
    """
    try:
        booking = await _find_next_booking(
            db, user_id, _TARGET_CONSULTATION_TYPES["senior_to_counselor"],
        )
        if booking is None or booking.admin_id is None:
            return False
        email, admin_name = await _fetch_admin_email(db, booking.admin_id)
        if not email:
            return False
        student_name = await _fetch_user_name(db, user_id)
        subject, body = _compose_email(
            admin_name=admin_name,
            student_name=student_name,
            booking_date=str(booking.slot.date) if booking.slot else "(일정 미지정)",
            direction="senior_to_counselor",
        )
        return await _send_email(email, subject, body)
    except Exception as e:
        logger.warning(f"리뷰 완료 알림 발송 실패 (senior→counselor): {e}")
        return False
