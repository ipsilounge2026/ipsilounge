"""
review_notification_service.py 단위 테스트 (V1 §7-1).

핵심 로직:
- 리뷰 방향(counselor_to_senior / senior_to_counselor)에 따라 차기 상담
  type 이 올바르게 매핑되는지
- 이메일 제목·본문 생성 (_compose_email) 이 학생명·담당자명·방향 정보를
  포함하는지
- SMTP 미설정 등으로 _send_email 이 실패해도 notify_* 가 예외 전파 없이
  False 를 반환하는지 (graceful 실패)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.review_notification_service import (
    _TARGET_CONSULTATION_TYPES,
    _compose_blocked_super_admin_email,
    _compose_email,
    _compose_unblock_email,
    notify_analysis_blocked_to_super_admin,
    notify_analysis_unblocked,
    notify_counselor_record_reviewed,
    notify_senior_record_reviewed,
)

# ============================================================
# 방향별 타겟 상담 유형 매핑
# ============================================================

def test_target_types_counselor_to_senior():
    """상담사 기록 reviewed → 차기 '선배상담' 예약 조회."""
    assert _TARGET_CONSULTATION_TYPES["counselor_to_senior"] == ("선배상담",)


def test_target_types_senior_to_counselor():
    """선배 노트 reviewed → 차기 '학습상담' 또는 '심리상담' 예약 조회."""
    assert _TARGET_CONSULTATION_TYPES["senior_to_counselor"] == ("학습상담", "심리상담")


# ============================================================
# 이메일 본문 생성
# ============================================================

def test_compose_email_counselor_to_senior_direction():
    """상담사→선배 방향은 제목/본문에 '상담사 상담 기록' 이 들어가야."""
    subject, body = _compose_email(
        admin_name="김선배",
        student_name="홍길동",
        booking_date="2026-05-01",
        direction="counselor_to_senior",
    )
    assert "홍길동" in subject
    assert "상담사 상담 기록" in subject
    assert "김선배" in body
    assert "2026-05-01" in body
    assert "상담사 상담 기록" in body
    # V1 §7-1 출처 고지가 본문에 포함되어야 감사 추적 용이
    assert "§7-1" in body


def test_compose_email_senior_to_counselor_direction():
    subject, body = _compose_email(
        admin_name="이상담사",
        student_name="김학생",
        booking_date="2026-05-10",
        direction="senior_to_counselor",
    )
    assert "김학생" in subject
    assert "선배 상담 기록" in subject
    assert "이상담사" in body
    assert "선배 상담 기록" in body


def test_compose_email_missing_names_uses_fallback():
    """admin_name/student_name 이 None 이어도 합리적인 fallback."""
    subject, body = _compose_email(
        admin_name=None,
        student_name=None,
        booking_date="(일정 미지정)",
        direction="counselor_to_senior",
    )
    # 대체 문자열 (담당자 / (학생)) 사용
    assert "담당자" in body
    assert "(학생)" in body or "학생" in body


# ============================================================
# notify_* 호출 시 예약이 없으면 False 반환 (graceful)
# ============================================================

@pytest.mark.asyncio
async def test_notify_counselor_record_reviewed_no_booking_returns_false():
    """해당 학생의 예정된 선배상담 예약이 없으면 False 반환 + 이메일 호출 없음."""
    db = AsyncMock()
    # _find_next_booking 내부 쿼리가 None 반환하도록 mock
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=exec_result)

    import uuid
    user_id = uuid.uuid4()

    with patch(
        "app.services.review_notification_service._send_email",
        new=AsyncMock(return_value=True),
    ) as mock_send:
        result = await notify_counselor_record_reviewed(db, user_id)

    assert result is False
    # 이메일 발송 자체가 시도되지 않아야 함
    mock_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_senior_record_reviewed_no_booking_returns_false():
    db = AsyncMock()
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=exec_result)

    import uuid
    user_id = uuid.uuid4()

    with patch(
        "app.services.review_notification_service._send_email",
        new=AsyncMock(return_value=True),
    ) as mock_send:
        result = await notify_senior_record_reviewed(db, user_id)

    assert result is False
    mock_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_swallows_exceptions():
    """내부 예외가 발생해도 호출자에게 전파되지 않아야 (graceful)."""
    db = AsyncMock()
    # execute 가 예외를 던져도 notify_* 가 예외를 전파하지 말아야
    db.execute = AsyncMock(side_effect=RuntimeError("DB connection lost"))
    import uuid
    user_id = uuid.uuid4()

    # 예외 전파 없이 False 반환
    result = await notify_counselor_record_reviewed(db, user_id)
    assert result is False

    result2 = await notify_senior_record_reviewed(db, user_id)
    assert result2 is False


# ============================================================
# V3 §4-8-1: 자동 분석 검증 상태 전환 알림
# ============================================================

def test_compose_unblock_email_contains_context():
    """잠금 해제 이메일 본문에 학생·담당자·일정·V3 §4-8-1 출처 포함."""
    subject, body = _compose_unblock_email(
        admin_name="김상담사",
        student_name="이학생",
        booking_date="2026-05-20",
    )
    assert "이학생" in subject
    assert "잠금 해제" in subject
    assert "김상담사" in body
    assert "2026-05-20" in body
    assert "pass" in body or "통과" in body
    assert "§4-8-1" in body


def test_compose_blocked_super_admin_email_contains_details():
    """P1 잔존 이메일에 학생·설문 유형·영향 예약 개수·P1 개수 포함."""
    subject, body = _compose_blocked_super_admin_email(
        super_admin_name="운영자",
        student_name="박학생",
        survey_type="high",
        timing="T2",
        affected_count=3,
        p1_issue_count=2,
    )
    assert "박학생" in subject
    assert "BLOCKED" in subject
    assert "고등" in subject
    assert "T2" in subject
    assert "운영자" in body
    assert "고등" in body
    assert "T2" in body
    assert "3" in body  # affected count
    assert "2" in body  # p1 count
    assert "/super-admin/issues" in body  # 점프 링크
    assert "§4-8-1" in body


def test_compose_blocked_super_admin_email_preheigh1_label():
    """preheigh1 설문은 '예비고1' 로 라벨링 되어야."""
    subject, _ = _compose_blocked_super_admin_email(
        super_admin_name=None,
        student_name="김예비",
        survey_type="preheigh1",
        timing=None,
        affected_count=0,
        p1_issue_count=1,
    )
    assert "예비고1" in subject


@pytest.mark.asyncio
async def test_notify_analysis_unblocked_no_booking_returns_false():
    """학습/심리상담 예약이 없으면 False + 이메일 호출 없음."""
    db = AsyncMock()
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=exec_result)

    import uuid
    user_id = uuid.uuid4()

    with patch(
        "app.services.review_notification_service._send_email",
        new=AsyncMock(return_value=True),
    ) as mock_send:
        result = await notify_analysis_unblocked(db, user_id)

    assert result is False
    mock_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_analysis_unblocked_swallows_exceptions():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=RuntimeError("DB down"))
    import uuid
    result = await notify_analysis_unblocked(db, uuid.uuid4())
    assert result is False


@pytest.mark.asyncio
async def test_notify_blocked_to_super_admin_no_super_admin_returns_zero():
    """super_admin 이 한 명도 없으면 0 반환 + 이메일 호출 없음."""
    db = AsyncMock()
    # Admin.role == 'super_admin' 쿼리 결과 빈 리스트
    exec_result = MagicMock()
    exec_result.all.return_value = []
    db.execute = AsyncMock(return_value=exec_result)

    import uuid
    user_id = uuid.uuid4()

    with patch(
        "app.services.review_notification_service._send_email",
        new=AsyncMock(return_value=True),
    ) as mock_send:
        count = await notify_analysis_blocked_to_super_admin(
            db, user_id, survey_type="high", timing="T1", p1_issue_count=1,
        )

    assert count == 0
    mock_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_blocked_to_super_admin_swallows_exceptions():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=RuntimeError("DB down"))
    import uuid
    count = await notify_analysis_blocked_to_super_admin(
        db, uuid.uuid4(), survey_type="preheigh1", timing=None, p1_issue_count=2,
    )
    assert count == 0
