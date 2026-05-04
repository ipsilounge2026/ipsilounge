"""
Firebase Admin SDK 초기화 + 헬퍼.

서버 시작 시 1회 초기화. 환경변수 우선순위:
  1. FIREBASE_CREDENTIALS_JSON (JSON 문자열) — 컨테이너/CI 환경에서 권장
  2. FIREBASE_CREDENTIALS_PATH (파일 경로) — 로컬 개발 권장
  3. 둘 다 비어있으면 graceful 비활성 (FCM 발송 시도해도 조용히 실패)

운영 환경:
- EC2 의 .env 또는 systemd EnvironmentFile 에 다음 중 하나 설정:
  * FIREBASE_CREDENTIALS_PATH=/home/ubuntu/ipsilounge/backend/firebase-credentials.json
  * 또는 FIREBASE_CREDENTIALS_JSON='{"type":"service_account",...}' (한 줄)

테스트 환경:
- DEV_MODE=true 일 때도 환경변수 설정돼 있으면 초기화 시도. 미설정 시 비활성.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

_INITIALIZED = False
_INITIALIZATION_FAILED = False


def init_firebase_admin() -> bool:
    """Firebase Admin SDK 초기화. 서버 시작 시 1회 호출.

    Returns:
        True if initialized successfully (또는 이미 초기화됨)
        False if not configured (graceful 비활성) or initialization failed
    """
    global _INITIALIZED, _INITIALIZATION_FAILED
    if _INITIALIZED:
        return True
    if _INITIALIZATION_FAILED:
        return False

    cred_json = (settings.FIREBASE_CREDENTIALS_JSON or "").strip()
    cred_path = (settings.FIREBASE_CREDENTIALS_PATH or "").strip()

    # 둘 다 비어있으면 의도된 비활성 — 로그 한 번만 남기고 종료
    if not cred_json and not cred_path:
        logger.info(
            "[firebase] FIREBASE_CREDENTIALS_{JSON,PATH} 미설정 → FCM 비활성 모드. "
            "푸시 알림 시도는 graceful 무시됨."
        )
        _INITIALIZATION_FAILED = True
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials

        # 이미 초기화된 경우 (다른 모듈이 먼저 호출)
        if firebase_admin._apps:  # type: ignore[attr-defined]
            _INITIALIZED = True
            return True

        cred: credentials.Base | None = None
        if cred_json:
            try:
                cred_dict = json.loads(cred_json)
                cred = credentials.Certificate(cred_dict)
                logger.info("[firebase] FIREBASE_CREDENTIALS_JSON 환경변수로 초기화")
            except json.JSONDecodeError as e:
                logger.error(f"[firebase] FIREBASE_CREDENTIALS_JSON 파싱 실패: {e}")
                _INITIALIZATION_FAILED = True
                return False
        elif cred_path:
            path = Path(cred_path)
            if not path.is_absolute():
                # 상대 경로면 backend/ 디렉토리 기준
                path = Path(__file__).resolve().parents[2] / cred_path
            if not path.exists():
                logger.warning(
                    f"[firebase] FIREBASE_CREDENTIALS_PATH={path} 파일 없음 → FCM 비활성"
                )
                _INITIALIZATION_FAILED = True
                return False
            cred = credentials.Certificate(str(path))
            logger.info(f"[firebase] FIREBASE_CREDENTIALS_PATH={path} 로 초기화")

        if cred is None:
            _INITIALIZATION_FAILED = True
            return False

        firebase_admin.initialize_app(cred)
        _INITIALIZED = True
        logger.info("[firebase] Firebase Admin SDK 초기화 완료 — FCM 발송 활성")
        return True
    except Exception as e:  # firebase_admin 미설치, 키 형식 오류 등
        logger.exception(f"[firebase] 초기화 실패: {e}")
        _INITIALIZATION_FAILED = True
        return False


def is_initialized() -> bool:
    """현재 Firebase Admin 활성 여부."""
    return _INITIALIZED
