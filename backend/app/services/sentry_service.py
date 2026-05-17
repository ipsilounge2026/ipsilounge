"""
Sentry SDK 초기화 (에러 모니터링).

서버 시작 직전(앱 import 단계)에 호출. SENTRY_DSN 환경변수 미설정 시
graceful 비활성 — 에러는 발생해도 Sentry 전송하지 않을 뿐 앱 동작에 영향 없음.

운영 적용:
- Sentry.io 무료 계정 → 프로젝트 생성 (Python · FastAPI) → DSN 발급
- EC2 .env 또는 systemd EnvironmentFile 에 다음 추가:
    SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
    SENTRY_ENVIRONMENT=production   (또는 staging)
    SENTRY_TRACES_SAMPLE_RATE=0.1   (필요 시 조정)
- 서버 재시작 후 Sentry 대시보드에서 첫 이벤트 확인

운영 vs 개발:
- DEV_MODE=true 는 보통 SENTRY_DSN 비어있어 자동 비활성
- staging 환경에서는 environment="staging" 으로 분리해 production 이벤트와 섞이지 않게
"""

from __future__ import annotations

import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

_INITIALIZED = False


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """전송 전 필터. 무료 플랜(5k errors/월) 한도를 노이즈로 낭비하지 않도록,
    '실제 서버 장애(5xx)'만 남기고 아래는 드롭한다:

    - 예상된 클라이언트 오류: HTTPException status < 500 (401/403/404/422 등)
    - 레이트리밋 초과(slowapi RateLimitExceeded) — 정상적인 차단이지 버그 아님
    - .env / wp-login 등 봇·취약점 스캐너의 404 탐침

    드롭해도 앱 동작·로그에는 영향 없음 (Sentry 전송만 생략).
    """
    exc_info = hint.get("exc_info")
    if exc_info:
        exc = exc_info[1]

        # slowapi 레이트리밋 — 정상 방어 동작
        try:
            from slowapi.errors import RateLimitExceeded

            if isinstance(exc, RateLimitExceeded):
                return None
        except Exception:
            pass

        # Starlette/FastAPI HTTPException 중 5xx 미만은 클라이언트 측 오류 → 드롭
        try:
            from starlette.exceptions import HTTPException as StarletteHTTPException

            if isinstance(exc, StarletteHTTPException):
                status = getattr(exc, "status_code", 500)
                if status < 500:
                    return None
        except Exception:
            pass

    # 봇 스캐너 404 탐침 경로 드롭 (.env, wp-login, phpmyadmin 등)
    req = (event.get("request") or {})
    url = (req.get("url") or "")
    if any(p in url for p in (
        "/.env", "/wp-login", "/wp-admin", "/phpmyadmin",
        "/.git", "/vendor/", "/.aws", "/config.json",
    )):
        return None

    return event


def init_sentry() -> bool:
    """Sentry 초기화. 앱 시작 시 1회 호출.

    Returns:
        True if Sentry 활성, False if 미설정 / 초기화 실패 (graceful)
    """
    global _INITIALIZED
    if _INITIALIZED:
        return True

    dsn = (settings.SENTRY_DSN or "").strip()
    if not dsn:
        logger.info("[sentry] SENTRY_DSN 미설정 → 에러 모니터링 비활성 모드")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=settings.SENTRY_ENVIRONMENT,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            # 민감 정보 자동 스크러빙 (이메일 등 PII) — Sentry 기본 + 명시
            send_default_pii=False,
            # 무료 플랜 한도/알림 노이즈 절약: 예상된 4xx·레이트리밋·봇 스캔 드롭
            before_send=_before_send,
            integrations=[
                FastApiIntegration(),
                StarletteIntegration(),
                SqlalchemyIntegration(),
            ],
        )
        _INITIALIZED = True
        logger.info(
            f"[sentry] 초기화 완료 — environment={settings.SENTRY_ENVIRONMENT} "
            f"traces_sample_rate={settings.SENTRY_TRACES_SAMPLE_RATE}"
        )
        return True
    except Exception as e:
        logger.exception(f"[sentry] 초기화 실패: {e}")
        return False


def is_initialized() -> bool:
    return _INITIALIZED
