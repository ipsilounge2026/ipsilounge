"""
payment_service.py 단위 테스트.

- verify_toss_payment: 외부 API 호출(httpx.AsyncClient.post) mock
- verify_google_purchase: 서비스 계정 미설정 시 개발 환경 fallback

실제 네트워크 호출 없음. httpx.AsyncClient 의 post/get 을 패치.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services import payment_service


def _make_httpx_response(status_code: int, json_body: dict) -> MagicMock:
    """httpx.Response mock — status_code + json()."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_body
    return resp


@pytest.mark.asyncio
async def test_verify_toss_payment_success_returns_payload():
    """Toss 승인 API 가 200 + payload 반환 시 payment_service 도 그대로 전달."""
    expected_body = {
        "paymentKey": "pk_test",
        "orderId": "order123",
        "status": "DONE",
        "approvedAt": "2026-04-19T10:00:00+09:00",
    }
    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(
        return_value=_make_httpx_response(200, expected_body)
    )

    with patch("app.services.payment_service.httpx.AsyncClient", return_value=mock_client):
        result = await payment_service.verify_toss_payment(
            payment_key="pk_test",
            order_id="order123",
            amount=50000,
        )

    assert result == expected_body
    # POST 호출 검증
    assert mock_client.post.await_count == 1
    call_args = mock_client.post.await_args
    assert "tosspayments.com" in call_args.args[0] or (
        call_args.kwargs.get("url") and "tosspayments.com" in call_args.kwargs["url"]
    )
    sent_body = call_args.kwargs["json"]
    assert sent_body["paymentKey"] == "pk_test"
    assert sent_body["orderId"] == "order123"
    assert sent_body["amount"] == 50000
    # Basic Auth 헤더 존재
    assert "Authorization" in call_args.kwargs["headers"]
    assert call_args.kwargs["headers"]["Authorization"].startswith("Basic ")


@pytest.mark.asyncio
async def test_verify_toss_payment_failure_raises_http_400():
    """Toss API 가 400/500 반환 시 HTTPException(400) + message."""
    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(
        return_value=_make_httpx_response(
            400, {"message": "잘못된 결제 정보입니다"}
        )
    )

    with patch("app.services.payment_service.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(HTTPException) as exc_info:
            await payment_service.verify_toss_payment(
                payment_key="pk_bad",
                order_id="order_bad",
                amount=100,
            )

    assert exc_info.value.status_code == 400
    assert "잘못된 결제 정보" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_verify_google_purchase_dev_mode_returns_true(monkeypatch):
    """GOOGLE_SERVICE_ACCOUNT_JSON 미설정 시 dev 환경 fallback — True 반환."""
    monkeypatch.setattr(
        payment_service.settings, "GOOGLE_SERVICE_ACCOUNT_JSON", "", raising=False
    )

    ok = await payment_service.verify_google_purchase(
        purchase_token="anything",
        product_id="product.premium",
    )

    assert ok is True


@pytest.mark.asyncio
async def test_verify_google_purchase_catches_exceptions_returns_false(monkeypatch):
    """외부 API 예외 발생 시 False 반환 (Exception 핸들링)."""
    # 서비스 계정 설정 (uc758 가짜) — 실제로는 _get_google_access_token 이 터져야 함
    monkeypatch.setattr(
        payment_service.settings,
        "GOOGLE_SERVICE_ACCOUNT_JSON",
        '{"invalid": "json_missing_keys"}',
        raising=False,
    )

    ok = await payment_service.verify_google_purchase(
        purchase_token="token",
        product_id="product.x",
    )

    # _get_google_access_token 에서 KeyError("client_email") 터짐 → except 로 False
    assert ok is False
