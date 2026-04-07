"""Google Calendar 연동 서비스

설명회 예약 승인, 상담 예약 확정 시 관리자 캘린더에 자동으로 일정을 생성/수정/삭제합니다.
"""

import logging
from datetime import datetime, timedelta

from google.oauth2 import service_account
from googleapiclient.discovery import build

from app.config import settings

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar"]

# 시간대 매핑 (설명회)
SEMINAR_TIME_SLOTS = {
    "morning": ("09:00", "12:00"),
    "afternoon": ("13:00", "17:00"),
    "evening": ("18:00", "21:00"),
}


def _get_calendar_service():
    """Google Calendar API 서비스 객체 생성"""
    if not settings.GOOGLE_CALENDAR_CREDENTIALS_PATH or not settings.GOOGLE_CALENDAR_ID:
        logger.warning("Google Calendar 설정이 없습니다. 캘린더 연동을 건너뜁니다.")
        return None

    try:
        credentials = service_account.Credentials.from_service_account_file(
            settings.GOOGLE_CALENDAR_CREDENTIALS_PATH,
            scopes=SCOPES,
        )
        service = build("calendar", "v3", credentials=credentials, cache_discovery=False)
        return service
    except Exception as e:
        logger.error(f"Google Calendar 서비스 생성 실패: {e}")
        return None


# ─── 설명회 관련 ───


async def create_seminar_event(
    reservation_id: str,
    title: str,
    reservation_date: str,
    time_slot: str,
    branch_name: str,
    attendee_count: int,
    contact_name: str,
) -> str | None:
    """설명회 예약 승인 시 캘린더에 일정 생성"""
    service = _get_calendar_service()
    if not service:
        return None

    start_time, end_time = SEMINAR_TIME_SLOTS.get(time_slot, ("09:00", "12:00"))
    slot_label = {"morning": "오전", "afternoon": "오후", "evening": "저녁"}.get(time_slot, time_slot)

    event = {
        "summary": f"[설명회] {title} - {branch_name}",
        "description": (
            f"설명회: {title}\n"
            f"지점: {branch_name}\n"
            f"시간대: {slot_label}\n"
            f"참석 예정: {attendee_count}명\n"
            f"담당자: {contact_name}\n"
            f"예약 ID: {reservation_id}"
        ),
        "start": {
            "dateTime": f"{reservation_date}T{start_time}:00",
            "timeZone": "Asia/Seoul",
        },
        "end": {
            "dateTime": f"{reservation_date}T{end_time}:00",
            "timeZone": "Asia/Seoul",
        },
        "colorId": "9",  # 파란색 계열
    }

    try:
        created = service.events().insert(
            calendarId=settings.GOOGLE_CALENDAR_ID,
            body=event,
        ).execute()
        event_id = created.get("id")
        logger.info(f"설명회 캘린더 일정 생성: {event_id}")
        return event_id
    except Exception as e:
        logger.error(f"설명회 캘린더 일정 생성 실패: {e}")
        return None


async def update_seminar_event(
    event_id: str,
    title: str,
    reservation_date: str,
    time_slot: str,
    branch_name: str,
    attendee_count: int,
    contact_name: str,
) -> bool:
    """설명회 예약 수정 후 재승인 시 캘린더 일정 수정"""
    service = _get_calendar_service()
    if not service or not event_id:
        return False

    start_time, end_time = SEMINAR_TIME_SLOTS.get(time_slot, ("09:00", "12:00"))
    slot_label = {"morning": "오전", "afternoon": "오후", "evening": "저녁"}.get(time_slot, time_slot)

    event = {
        "summary": f"[설명회] {title} - {branch_name}",
        "description": (
            f"설명회: {title}\n"
            f"지점: {branch_name}\n"
            f"시간대: {slot_label}\n"
            f"참석 예정: {attendee_count}명\n"
            f"담당자: {contact_name}"
        ),
        "start": {
            "dateTime": f"{reservation_date}T{start_time}:00",
            "timeZone": "Asia/Seoul",
        },
        "end": {
            "dateTime": f"{reservation_date}T{end_time}:00",
            "timeZone": "Asia/Seoul",
        },
        "colorId": "9",
    }

    try:
        service.events().update(
            calendarId=settings.GOOGLE_CALENDAR_ID,
            eventId=event_id,
            body=event,
        ).execute()
        logger.info(f"설명회 캘린더 일정 수정: {event_id}")
        return True
    except Exception as e:
        logger.error(f"설명회 캘린더 일정 수정 실패: {e}")
        return False


async def delete_seminar_event(event_id: str) -> bool:
    """설명회 예약 취소 시 캘린더 일정 삭제"""
    service = _get_calendar_service()
    if not service or not event_id:
        return False

    try:
        service.events().delete(
            calendarId=settings.GOOGLE_CALENDAR_ID,
            eventId=event_id,
        ).execute()
        logger.info(f"설명회 캘린더 일정 삭제: {event_id}")
        return True
    except Exception as e:
        logger.error(f"설명회 캘린더 일정 삭제 실패: {e}")
        return False


# ─── 상담 관련 ───


async def create_consultation_event(
    booking_id: str,
    user_name: str,
    consultation_type: str,
    date: str,
    start_time: str,
    end_time: str,
    memo: str | None = None,
) -> str | None:
    """상담 예약 확정 시 캘린더에 일정 생성"""
    service = _get_calendar_service()
    if not service:
        return None

    type_labels = {
        "학생부분석": "학생부분석",
        "입시전략": "입시전략",
        "학습상담": "학습상담",
        "심리상담": "심리상담",
        "기타": "기타",
    }
    type_label = type_labels.get(consultation_type, consultation_type)

    description = f"상담 유형: {type_label}\n상담 대상: {user_name}\n예약 ID: {booking_id}"
    if memo:
        description += f"\n메모: {memo}"

    event = {
        "summary": f"[상담] {type_label} - {user_name}",
        "description": description,
        "start": {
            "dateTime": f"{date}T{start_time}:00",
            "timeZone": "Asia/Seoul",
        },
        "end": {
            "dateTime": f"{date}T{end_time}:00",
            "timeZone": "Asia/Seoul",
        },
        "colorId": "10",  # 초록색 계열
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "popup", "minutes": 30},
            ],
        },
    }

    try:
        created = service.events().insert(
            calendarId=settings.GOOGLE_CALENDAR_ID,
            body=event,
        ).execute()
        event_id = created.get("id")
        logger.info(f"상담 캘린더 일정 생성: {event_id}")
        return event_id
    except Exception as e:
        logger.error(f"상담 캘린더 일정 생성 실패: {e}")
        return None


async def delete_consultation_event(event_id: str) -> bool:
    """상담 예약 취소 시 캘린더 일정 삭제"""
    service = _get_calendar_service()
    if not service or not event_id:
        return False

    try:
        service.events().delete(
            calendarId=settings.GOOGLE_CALENDAR_ID,
            eventId=event_id,
        ).execute()
        logger.info(f"상담 캘린더 일정 삭제: {event_id}")
        return True
    except Exception as e:
        logger.error(f"상담 캘린더 일정 삭제 실패: {e}")
        return False
