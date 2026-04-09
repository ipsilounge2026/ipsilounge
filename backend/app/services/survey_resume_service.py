"""
사전 상담 설문 — 이어쓰기 토큰 / 딥링크 / 이메일 서비스

- 토큰: secrets.token_urlsafe(32) (URL-safe, 약 43자, 256bit 엔트로피)
- 만료: 기본 72시간, 1시간~30일 사이로 조정 가능
- 딥링크 형식:
    웹: {FRONTEND_URL}/consultation-survey/resume?token=...
    모바일: ipsilounge://consultation-survey/resume?token=...
  (모바일 앱은 동일 토큰을 자체 스킴으로 받을 수 있도록 백엔드는 raw 토큰만 제공)
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.consultation_survey import ConsultationSurvey


def _generate_token() -> str:
    """URL-safe 256-bit 토큰 생성."""
    return secrets.token_urlsafe(32)


def build_resume_url(token: str) -> str:
    """웹 이어쓰기 딥링크 URL 생성."""
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/consultation-survey/resume?token={token}"


async def issue_resume_token(
    survey: ConsultationSurvey,
    db: AsyncSession,
    *,
    expires_in_hours: int = 72,
) -> tuple[str, datetime]:
    """
    설문에 새 이어쓰기 토큰 발급.
    기존 토큰이 있으면 덮어씀 (가장 최근 1개만 유효).
    """
    if expires_in_hours < 1 or expires_in_hours > 24 * 30:
        raise ValueError("expires_in_hours는 1~720 사이여야 합니다")

    token = _generate_token()
    expires_at = datetime.utcnow() + timedelta(hours=expires_in_hours)

    survey.resume_token = token
    survey.resume_token_expires_at = expires_at
    await db.commit()
    await db.refresh(survey)

    return token, expires_at


async def find_survey_by_token(
    token: str,
    db: AsyncSession,
) -> ConsultationSurvey | None:
    """
    토큰으로 설문 조회. 만료된 토큰은 None을 반환.
    토큰이 일치하지만 만료된 경우, DB에서 토큰을 정리하지 않음 (TTL 정책에 맡김).
    """
    if not token:
        return None

    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.resume_token == token)
    )
    survey = result.scalar_one_or_none()
    if survey is None:
        return None

    if survey.resume_token_expires_at is None:
        return None
    if survey.resume_token_expires_at < datetime.utcnow():
        return None

    return survey


async def revoke_resume_token(survey: ConsultationSurvey, db: AsyncSession) -> None:
    """이어쓰기 토큰 즉시 무효화 (제출 완료 후 등)."""
    survey.resume_token = None
    survey.resume_token_expires_at = None
    await db.commit()
