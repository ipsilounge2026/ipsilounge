"""
consultation.py 의 _check_lead_time / check_booking_cooldown 단위 테스트.

기획서 §4-8-2: 상담 유형별 예약 리드타임 정책
  - 학생부분석 / 학종전략: 업로드 + 7일 필수
  - 학습상담: 사전 설문 제출 + 7일 필수
  - 선배상담: 선배 매칭 필수 (리드타임 없음)
  - 심리상담 / 기타: 리드타임 없음 (early return)

3개월 쿨다운: 이전 상담 진행일 기준 + 3개월 이후부터 재예약 가능.
"""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.routers.consultation import _check_lead_time


@pytest.mark.asyncio
async def test_lead_time_psychology_no_check():
    """심리상담은 리드타임 없이 즉시 예약 가능 (early return)."""
    db = AsyncMock()
    # slot_date 를 오늘로 두어도 통과해야 함
    await _check_lead_time(
        consultation_type="심리상담",
        owner_id="any",
        slot_date=date.today(),
        db=db,
    )
    # DB 쿼리가 실행되지 않음을 검증 (early return)
    assert db.execute.await_count == 0


@pytest.mark.asyncio
async def test_lead_time_other_no_check():
    """'기타' 상담도 리드타임 없음."""
    db = AsyncMock()
    await _check_lead_time(
        consultation_type="기타",
        owner_id="any",
        slot_date=date.today(),
        db=db,
    )
    assert db.execute.await_count == 0


@pytest.mark.asyncio
async def test_lead_time_senior_requires_matching_missing_raises():
    """선배상담 은 매칭된 선배가 없으면 400."""
    db = AsyncMock()

    # _get_assigned_senior 가 None 반환하도록 mock
    # consultation.py 의 _get_assigned_senior 는 내부 query → db.execute 결과가 None
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc_info:
        await _check_lead_time(
            consultation_type="선배상담",
            owner_id="some-user-id",
            slot_date=date.today() + timedelta(days=10),
            db=db,
        )
    assert exc_info.value.status_code == 400
    assert "선배" in exc_info.value.detail or "매칭" in exc_info.value.detail


@pytest.mark.asyncio
async def test_lead_time_learning_consultation_without_submitted_survey_raises():
    """학습상담: 제출된 설문이 없으면 400."""
    db = AsyncMock()

    # 첫 쿼리(설문 조회) 결과 scalar_one_or_none → None
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc_info:
        await _check_lead_time(
            consultation_type="학습상담",
            owner_id="some-user-id",
            slot_date=date.today() + timedelta(days=10),
            db=db,
        )
    assert exc_info.value.status_code == 400
    # "사전 설문" / "제출" / "7일" 문구 중 하나 포함 기대
    detail = str(exc_info.value.detail)
    assert (
        "설문" in detail
        or "제출" in detail
        or "7일" in detail
        or "학습" in detail
    ), f"예상 문구 없음: {detail}"


@pytest.mark.asyncio
async def test_lead_time_analysis_type_without_upload_raises():
    """학생부분석 은 업로드된 주문이 없으면 400 ('업로드된 학생부를 찾을 수 없음')."""
    db = AsyncMock()
    mock_result = MagicMock()
    # scalars().all() → [] (업로드 주문 없음)
    mock_result.scalars.return_value.all.return_value = []
    db.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc_info:
        await _check_lead_time(
            consultation_type="학생부분석",
            owner_id="some-user-id",
            slot_date=date.today() + timedelta(days=10),
            db=db,
        )
    assert exc_info.value.status_code == 400
    detail = str(exc_info.value.detail)
    assert "업로드" in detail or "학생부" in detail or "7일" in detail
