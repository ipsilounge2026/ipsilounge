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


# ============================================================
# V3 §4-8-1: 자동 분석 검증 상태 전환 알림
# ============================================================

def _compose_unblock_email(
    admin_name: str | None,
    student_name: str | None,
    booking_date: str,
) -> tuple[str, str]:
    """blocked → pass/repaired 자동 해제 시 담당 상담사에게 보낼 이메일."""
    name = admin_name or "담당자"
    student = student_name or "(학생)"
    subject = f"[상담 진행 가능] {student} 학생 사전 분석 잠금 해제"
    body = f"""<html><body style="font-family:Arial,sans-serif;">
<h3>{name}님, 상담 진행이 가능해졌습니다.</h3>
<p>
  <b>{student}</b> 학생의 사전 설문 자동 분석 결과 검증이
  <b>통과(pass/repaired)</b>로 자동 전환되었습니다.
</p>
<p>
  예정된 <b>{booking_date}</b> 상담을 정상 진행하실 수 있습니다.
  상담 시작 버튼이 활성화되고 분석 리포트가 열람 가능합니다.
</p>
<hr/>
<p style="color:#6B7280; font-size: 12px;">
  본 알림은 V3 §4-8-1 "슈퍼관리자 점검 후 잠금 자동 해제" 흐름에 따라
  자동 발송되었습니다.
</p>
</body></html>"""
    return subject, body


def _compose_blocked_super_admin_email(
    super_admin_name: str | None,
    student_name: str | None,
    survey_type: str,
    timing: str | None,
    affected_count: int,
    p1_issue_count: int,
) -> tuple[str, str]:
    """P1 잔존 (blocked) 최초 전환 시 super_admin 에게 보낼 이메일."""
    name = super_admin_name or "슈퍼관리자"
    student = student_name or "(학생)"
    survey_label = "고등" if survey_type == "high" else "예비고1"
    timing_str = f" · {timing}" if timing else ""
    subject = f"[🔒 QA BLOCKED] {student} 학생 {survey_label}{timing_str} 사전 분석 검증 실패"
    body = f"""<html><body style="font-family:Arial,sans-serif;">
<h3>{name}님, 자동 분석 검증 차단 건이 발생했습니다.</h3>
<p>
  <b>{student}</b> 학생의 <b>{survey_label}{timing_str}</b> 설문에 대해
  자동 보정 시도 후에도 <b>P1 필수 검증이 {p1_issue_count}건 잔존</b>하여
  상담 진행이 잠겼습니다.
</p>
<p>
  <b>영향 예약: {affected_count}건</b> (학생 화면에는 "관리자 점검 중" 배너가 표시됩니다.)
</p>
<p>
  admin-web 의 <b>QA 이슈 큐 (/super-admin/issues)</b> 페이지에서
  해당 설문의 P1 상세 내역 · 영향 예약 · 점프 링크를 확인하고,
  수정 → 재배포 → "재검증" 버튼으로 즉시 잠금 해제 판정을 수행해 주세요.
</p>
<hr/>
<p style="color:#6B7280; font-size: 12px;">
  본 알림은 V3 §4-8-1 "P1 잔존 시 즉시 슈퍼관리자 알림 큐에 등록" 규정에
  따라 자동 발송되었습니다.
</p>
</body></html>"""
    return subject, body


async def notify_analysis_unblocked(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> bool:
    """사전 분석이 blocked → pass/repaired 로 전환됐을 때 호출.

    V3 §4-8-1: "통과 시 잠금 자동 해제 + 상담사·학생에게 정상 진행 가능 알림"
    학생에게는 별도로 send_report_ready_notification(FCM+DB) 이 발송되므로
    여기서는 담당 상담사(학습/심리상담 booking)에게만 이메일 보낸다.
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
        subject, body = _compose_unblock_email(
            admin_name=admin_name,
            student_name=student_name,
            booking_date=str(booking.slot.date) if booking.slot else "(일정 미지정)",
        )
        return await _send_email(email, subject, body)
    except Exception as e:
        logger.warning(f"분석 잠금 해제 알림 발송 실패: {e}")
        return False


async def notify_analysis_blocked_to_super_admin(
    db: AsyncSession,
    user_id: uuid.UUID,
    survey_type: str,
    timing: str | None,
    p1_issue_count: int,
) -> int:
    """사전 분석이 blocked 로 최초 전환됐을 때 모든 super_admin 에게 이메일.

    V3 §4-8-1: "P1 잔존 시 즉시 슈퍼관리자 알림 큐에 등록"
    Returns 발송된 이메일 개수.
    """
    try:
        # 모든 super_admin 이메일 조회
        res = await db.execute(
            select(Admin.email, Admin.name).where(Admin.role == "super_admin")
        )
        super_admins = res.all()
        if not super_admins:
            return 0

        # 영향 예약 개수 (requested/confirmed 중 오늘 이후)
        from app.models.consultation_booking import ConsultationBooking
        affected_q = (
            select(ConsultationBooking.id)
            .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
            .where(
                ConsultationBooking.user_id == user_id,
                ConsultationBooking.status.in_(["requested", "confirmed"]),
                ConsultationSlot.date >= date.today(),
            )
        )
        affected_count = len((await db.execute(affected_q)).all())

        student_name = await _fetch_user_name(db, user_id)

        sent_count = 0
        for email, super_name in super_admins:
            if not email:
                continue
            subject, body = _compose_blocked_super_admin_email(
                super_admin_name=super_name,
                student_name=student_name,
                survey_type=survey_type,
                timing=timing,
                affected_count=affected_count,
                p1_issue_count=p1_issue_count,
            )
            if await _send_email(email, subject, body):
                sent_count += 1
        return sent_count
    except Exception as e:
        logger.warning(f"QA blocked 슈퍼관리자 알림 발송 실패: {e}")
        return 0
