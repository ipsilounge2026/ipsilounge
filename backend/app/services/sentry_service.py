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

from app.config import settings

logger = logging.getLogger(__name__)

_INITIALIZED = False


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
