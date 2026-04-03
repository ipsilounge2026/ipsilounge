import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.config import settings

logger = logging.getLogger(__name__)


async def _send_email(to: str, subject: str, html_body: str) -> bool:
    """내부 이메일 발송 함수. 실패해도 예외를 전파하지 않음."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP 설정이 없어 이메일을 발송하지 않습니다.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            start_tls=True,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
        )
        logger.info(f"이메일 발송 완료: {to} / {subject}")
        return True
    except Exception as e:
        logger.error(f"이메일 발송 실패: {to} / {e}")
        return False


async def send_password_reset_email(to: str, name: str, reset_link: str) -> bool:
    subject = "[입시라운지] 비밀번호 재설정 링크"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">입시라운지 비밀번호 재설정</h2>
      <p>안녕하세요, <strong>{name}</strong>님.</p>
      <p>비밀번호 재설정을 요청하셨습니다. 아래 버튼을 클릭하여 비밀번호를 재설정해 주세요.</p>
      <p>
        <a href="{reset_link}"
           style="display:inline-block; padding:12px 24px; background:#2563eb;
                  color:#fff; text-decoration:none; border-radius:6px; font-size:15px;">
          비밀번호 재설정
        </a>
      </p>
      <p style="color:#6b7280; font-size:13px;">
        이 링크는 <strong>{settings.RESET_TOKEN_EXPIRE_MINUTES}분</strong> 후 만료됩니다.<br>
        본인이 요청하지 않으셨다면 이 메일을 무시하세요.
      </p>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0;">
      <p style="color:#9ca3af; font-size:12px;">입시라운지 | ipsilounge.com</p>
    </div>
    """
    return await _send_email(to, subject, html)


async def send_analysis_complete_email(to: str, name: str) -> bool:
    subject = "[입시라운지] 학생부 분석이 완료되었습니다"
    dashboard_link = f"{settings.FRONTEND_URL}/analysis"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">학생부 분석 완료</h2>
      <p>안녕하세요, <strong>{name}</strong>님.</p>
      <p>요청하신 학생부 분석이 완료되었습니다. 아래 버튼을 클릭하여 결과를 확인하세요.</p>
      <p>
        <a href="{dashboard_link}"
           style="display:inline-block; padding:12px 24px; background:#2563eb;
                  color:#fff; text-decoration:none; border-radius:6px; font-size:15px;">
          분석 결과 확인
        </a>
      </p>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0;">
      <p style="color:#9ca3af; font-size:12px;">입시라운지 | ipsilounge.com</p>
    </div>
    """
    return await _send_email(to, subject, html)


async def send_consultation_confirmed_email(
    to: str, name: str, date_str: str, time_str: str
) -> bool:
    subject = "[입시라운지] 상담 예약이 확정되었습니다"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">상담 예약 확정</h2>
      <p>안녕하세요, <strong>{name}</strong>님.</p>
      <p>상담 예약이 확정되었습니다.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 16px 8px 0; color: #6b7280;">날짜</td>
          <td style="padding: 8px 0;"><strong>{date_str}</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 16px 8px 0; color: #6b7280;">시간</td>
          <td style="padding: 8px 0;"><strong>{time_str}</strong></td>
        </tr>
      </table>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0;">
      <p style="color:#9ca3af; font-size:12px;">입시라운지 | ipsilounge.com</p>
    </div>
    """
    return await _send_email(to, subject, html)


async def send_consultation_cancelled_email(
    to: str, name: str, date_str: str, time_str: str, cancel_reason: str | None = None
) -> bool:
    subject = "[입시라운지] 상담 예약이 취소되었습니다"
    reason_html = f"<p><strong>취소 사유:</strong> {cancel_reason}</p>" if cancel_reason else ""
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ef4444;">상담 예약 취소 안내</h2>
      <p>안녕하세요, <strong>{name}</strong>님.</p>
      <p>아래 상담 예약이 취소되었습니다.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 16px 8px 0; color: #6b7280;">날짜</td>
          <td style="padding: 8px 0;"><strong>{date_str}</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 16px 8px 0; color: #6b7280;">시간</td>
          <td style="padding: 8px 0;"><strong>{time_str}</strong></td>
        </tr>
      </table>
      {reason_html}
      <p>새로운 상담 예약은 입시라운지에서 다시 신청해 주세요.</p>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0;">
      <p style="color:#9ca3af; font-size:12px;">입시라운지 | ipsilounge.com</p>
    </div>
    """
    return await _send_email(to, subject, html)


async def send_seminar_approved_email(
    to: str, name: str, schedule_title: str, date_str: str, time_slot: str
) -> bool:
    time_label = {"morning": "오전", "afternoon": "오후", "evening": "저녁"}.get(time_slot, time_slot)
    subject = "[입시라운지] 설명회 예약이 승인되었습니다"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">설명회 예약 승인</h2>
      <p>안녕하세요, <strong>{name}</strong>님.</p>
      <p>설명회 예약이 승인되었습니다.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 16px 8px 0; color: #6b7280;">설명회</td>
          <td style="padding: 8px 0;"><strong>{schedule_title}</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 16px 8px 0; color: #6b7280;">날짜</td>
          <td style="padding: 8px 0;"><strong>{date_str}</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 16px 8px 0; color: #6b7280;">시간대</td>
          <td style="padding: 8px 0;"><strong>{time_label}</strong></td>
        </tr>
      </table>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0;">
      <p style="color:#9ca3af; font-size:12px;">입시라운지 | ipsilounge.com</p>
    </div>
    """
    return await _send_email(to, subject, html)


async def send_seminar_cancelled_email(
    to: str, name: str, schedule_title: str, cancel_reason: str | None = None
) -> bool:
    subject = "[입시라운지] 설명회 예약이 취소되었습니다"
    reason_html = f"<p><strong>취소 사유:</strong> {cancel_reason}</p>" if cancel_reason else ""
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ef4444;">설명회 예약 취소 안내</h2>
      <p>안녕하세요, <strong>{name}</strong>님.</p>
      <p><strong>{schedule_title}</strong> 설명회 예약이 취소되었습니다.</p>
      {reason_html}
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0;">
      <p style="color:#9ca3af; font-size:12px;">입시라운지 | ipsilounge.com</p>
    </div>
    """
    return await _send_email(to, subject, html)


async def send_seminar_bulk_email(to: str, subject: str, body: str) -> bool:
    """설명회 일괄 메일 발송"""
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="white-space: pre-wrap; line-height: 1.6;">{body}</div>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0;">
      <p style="color:#9ca3af; font-size:12px;">입시라운지 | ipsilounge.com</p>
    </div>
    """
    return await _send_email(to, subject, html)


async def send_consultation_reminder_email(
    to: str, name: str, date_str: str, time_str: str
) -> bool:
    subject = "[입시라운지] 내일 상담 예약이 있습니다"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">상담 리마인더</h2>
      <p>안녕하세요, <strong>{name}</strong>님.</p>
      <p>내일 상담 예약이 있습니다. 잊지 마세요!</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 16px 8px 0; color: #6b7280;">날짜</td>
          <td style="padding: 8px 0;"><strong>{date_str}</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 16px 8px 0; color: #6b7280;">시간</td>
          <td style="padding: 8px 0;"><strong>{time_str}</strong></td>
        </tr>
      </table>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0;">
      <p style="color:#9ca3af; font-size:12px;">입시라운지 | ipsilounge.com</p>
    </div>
    """
    return await _send_email(to, subject, html)
