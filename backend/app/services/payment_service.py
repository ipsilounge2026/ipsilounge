import base64
import json

import httpx
from fastapi import HTTPException, status

from app.config import settings


async def verify_toss_payment(payment_key: str, order_id: str, amount: int) -> dict:
    """토스페이먼츠 결제 승인 요청"""
    secret_key = settings.TOSS_SECRET_KEY
    auth_header = base64.b64encode(f"{secret_key}:".encode()).decode()

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.tosspayments.com/v1/payments/confirm",
            json={"paymentKey": payment_key, "orderId": order_id, "amount": amount},
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/json",
            },
        )

    if response.status_code != 200:
        detail = response.json().get("message", "결제 승인에 실패했습니다")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    return response.json()


async def verify_google_purchase(purchase_token: str, product_id: str) -> bool:
    """Google Play 인앱결제 검증

    Google Play Developer API를 사용해 구매 토큰 유효성 확인.
    서비스 계정 JSON이 설정되지 않으면 스킵 (개발 환경).
    """
    if not settings.GOOGLE_SERVICE_ACCOUNT_JSON:
        # 개발 환경: 검증 스킵
        return True

    try:
        # 서비스 계정으로 액세스 토큰 발급
        access_token = await _get_google_access_token()

        package_name = settings.GOOGLE_PLAY_PACKAGE_NAME

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://androidpublisher.googleapis.com/androidpublisher/v3/"
                f"applications/{package_name}/purchases/products/{product_id}/tokens/{purchase_token}",
                headers={"Authorization": f"Bearer {access_token}"},
            )

        if response.status_code != 200:
            return False

        purchase_data = response.json()
        # purchaseState: 0 = 구매됨, 1 = 취소됨
        return purchase_data.get("purchaseState") == 0

    except Exception:
        return False


async def _get_google_access_token() -> str:
    """서비스 계정 JWT로 Google OAuth 액세스 토큰 발급"""
    import time

    from jose import jwt as jose_jwt

    # 서비스 계정 JSON 파싱
    sa_json = settings.GOOGLE_SERVICE_ACCOUNT_JSON
    if sa_json.endswith(".json"):
        with open(sa_json) as f:
            sa_info = json.load(f)
    else:
        sa_info = json.loads(sa_json)

    now = int(time.time())
    payload = {
        "iss": sa_info["client_email"],
        "scope": "https://www.googleapis.com/auth/androidpublisher",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }

    private_key = sa_info["private_key"]
    assertion = jose_jwt.encode(payload, private_key, algorithm="RS256")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )

    response.raise_for_status()
    return response.json()["access_token"]
