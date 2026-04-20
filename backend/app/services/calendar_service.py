"""Google Calendar 연동 서비스

설명회 예약 승인, 상담 예약 확정 시 관리자 캘린더에 자동으로 일정을 생성/수정/삭제합니다.
여러 캘린더(관리자 개인 + 입시라운지 등)에 동시 연동됩니다.
"""

import logging

from google.oauth2 import service_account
from googleapiclient.discovery import build

from app.config import settings

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar"]

# 시간대 매핑 (설명회)
SEMINAR_TIME_SLOTS = {
    "morning": ("11:00", "13:00"),
    "afternoon": ("14:00", "16:00"),
    "evening": ("19:00", "21:00"),
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


def _get_all_calendar_ids() -> list[str]:
    """모든 캘린더 ID 목록 반환 (메인 + 추가)"""
    ids = [settings.GOOGLE_CALENDAR_ID]
    if settings.GOOGLE_CALENDAR_EXTRA_IDS:
        for extra_id in settings.GOOGLE_CALENDAR_EXTRA_IDS.split(","):
            extra_id = extra_id.strip()
            if extra_id:
                ids.append(extra_id)
    return ids


def _create_event_on_all(service, event_body: dict) -> str | None:
    """모든 캘린더에 일정 생성, 쉼표 구분 event_id 문자열 반환"""
    calendar_ids = _get_all_calendar_ids()
    event_ids = []

    for cal_id in calendar_ids:
        try:
            created = service.events().insert(
                calendarId=cal_id,
                body=event_body,
            ).execute()
            event_ids.append(created.get("id", ""))
            logger.info(f"캘린더 일정 생성 완료: cal={cal_id}, event={created.get('id')}")
        except Exception as e:
            logger.error(f"캘린더 일정 생성 실패: cal={cal_id}, error={e}")
            event_ids.append("")

    # 쉼표 구분으로 저장 (빈 문자열도 위치 유지)
    return ",".join(event_ids) if any(event_ids) else None


def _update_event_on_all(service, stored_event_ids: str, event_body: dict) -> bool:
    """모든 캘린더의 일정 수정"""
    calendar_ids = _get_all_calendar_ids()
    event_id_list = stored_event_ids.split(",") if stored_event_ids else []
    success = False

    for i, cal_id in enumerate(calendar_ids):
        eid = event_id_list[i].strip() if i < len(event_id_list) else ""
        if not eid:
            # 이전에 생성 실패했던 캘린더에는 새로 생성
            try:
                created = service.events().insert(
                    calendarId=cal_id,
                    body=event_body,
                ).execute()
                logger.info(f"캘린더 일정 신규 생성 (update 보정): cal={cal_id}")
                success = True
            except Exception as e:
                logger.error(f"캘린더 일정 생성 실패 (update 보정): cal={cal_id}, error={e}")
            continue

        try:
            service.events().update(
                calendarId=cal_id,
                eventId=eid,
                body=event_body,
            ).execute()
            logger.info(f"캘린더 일정 수정 완료: cal={cal_id}, event={eid}")
            success = True
        except Exception as e:
            logger.error(f"캘린더 일정 수정 실패: cal={cal_id}, event={eid}, error={e}")

    return success


def _delete_event_on_all(service, stored_event_ids: str) -> bool:
    """모든 캘린더의 일정 삭제"""
    calendar_ids = _get_all_calendar_ids()
    event_id_list = stored_event_ids.split(",") if stored_event_ids else []
    success = False

    for i, cal_id in enumerate(calendar_ids):
        eid = event_id_list[i].strip() if i < len(event_id_list) else ""
        if not eid:
            continue
        try:
            service.events().delete(
                calendarId=cal_id,
                eventId=eid,
            ).execute()
            logger.info(f"캘린더 일정 삭제 완료: cal={cal_id}, event={eid}")
            success = True
        except Exception as e:
            logger.error(f"캘린더 일정 삭제 실패: cal={cal_id}, event={eid}, error={e}")

    return success


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

    start_time, end_time = SEMINAR_TIME_SLOTS.get(time_slot, ("11:00", "13:00"))
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

    return _create_event_on_all(service, event)


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

    start_time, end_time = SEMINAR_TIME_SLOTS.get(time_slot, ("11:00", "13:00"))
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

    return _update_event_on_all(service, event_id, event)


async def delete_seminar_event(event_id: str) -> bool:
    """설명회 예약 취소 시 캘린더 일정 삭제"""
    service = _get_calendar_service()
    if not service or not event_id:
        return False

    return _delete_event_on_all(service, event_id)


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

    return _create_event_on_all(service, event)


async def delete_consultation_event(event_id: str) -> bool:
    """상담 예약 취소 시 캘린더 일정 삭제"""
    service = _get_calendar_service()
    if not service or not event_id:
        return False

    return _delete_event_on_all(service, event_id)
