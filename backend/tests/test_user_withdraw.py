"""
사용자 회원 탈퇴 엔드포인트 단위 테스트 (V1 §10-1 전면 철회).

커버리지:
1. WithdrawRequest 스키마 정상성
2. /api/users/me/withdraw 라우트가 app 에 등록되어 있음
3. 비밀번호 불일치 시 400
4. 비밀번호 일치 시:
   - User.is_active=False
   - email 익명화
   - password_hash 로그인 불가 상태
   - PII 필드 NULL 처리
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.routers.users import WithdrawRequest, withdraw_account


def test_withdraw_request_schema_accepts_minimal():
    req = WithdrawRequest(password="p@ssw0rd")
    assert req.password == "p@ssw0rd"
    assert req.reason is None


def test_withdraw_request_schema_accepts_reason():
    req = WithdrawRequest(password="x", reason="서비스 불만족")
    assert req.reason == "서비스 불만족"


def test_withdraw_route_registered_in_app():
    from app.main import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/users/me/withdraw" in paths


# ============================================================
# 엔드포인트 단위 테스트 (DB Mock)
# ============================================================

def _make_fake_user(password_hash: str = "$2b$12$dummy.hash"):
    """테스트용 User 객체 — 실제 SQLAlchemy 세션 없이 속성 조작 위주."""
    u = MagicMock()
    u.id = uuid4()
    u.email = "test@example.com"
    u.password_hash = password_hash
    u.name = "홍길동"
    u.phone = "010-1234-5678"
    u.student_name = "자녀"
    u.student_birth = None
    u.school_name = "서울고"
    u.grade = 2
    u.grade_year = 2026
    u.branch_name = "대치점"
    u.is_academy_student = True
    u.fcm_token = "fcm_token_abc"
    u.is_active = True
    return u


@pytest.mark.asyncio
async def test_withdraw_wrong_password_raises_400(monkeypatch):
    user = _make_fake_user()
    # verify_password 는 항상 False 반환
    monkeypatch.setattr(
        "app.routers.users.verify_password",
        lambda plain, hashed: False,
    )
    db = AsyncMock()
    with pytest.raises(HTTPException) as exc:
        await withdraw_account(
            WithdrawRequest(password="wrong"),
            user=user,
            db=db,
        )
    assert exc.value.status_code == 400
    assert "일치" in exc.value.detail

    # 실패 시 DB 수정은 없어야
    # (commit 이 호출되지 않았음을 보장)
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_withdraw_success_anonymizes_pii(monkeypatch):
    user = _make_fake_user()
    original_id = user.id
    monkeypatch.setattr(
        "app.routers.users.verify_password",
        lambda plain, hashed: True,
    )
    db = AsyncMock()
    # execute 는 UPDATE 문에 대해 그냥 성공 return
    db.execute = AsyncMock(return_value=MagicMock())

    result = await withdraw_account(
        WithdrawRequest(password="correct", reason="테스트 사유"),
        user=user,
        db=db,
    )

    assert result["ok"] is True
    # PII 익명화 확인
    assert user.email.startswith("deleted_")
    assert user.email.endswith("@deleted.local")
    assert user.password_hash == "!WITHDRAWN!"
    assert user.name == "탈퇴 회원"
    assert user.phone is None
    assert user.student_name is None
    assert user.student_birth is None
    assert user.school_name is None
    assert user.grade is None
    assert user.grade_year is None
    assert user.branch_name is None
    assert user.is_academy_student is False
    assert user.fcm_token is None
    assert user.is_active is False
    # ID 는 유지 (감사 추적)
    assert user.id == original_id
    # commit 이 한 번 호출됨
    db.commit.assert_awaited_once()
    # execute 가 선배 공유 철회 2건 (survey + note) 호출됨
    assert db.execute.await_count >= 2


@pytest.mark.asyncio
async def test_withdraw_success_graceful_on_revoke_failure(monkeypatch):
    """선배 공유 revoke UPDATE 가 실패해도(구 DB 스키마 등) 탈퇴 자체는 계속 진행."""
    user = _make_fake_user()
    monkeypatch.setattr(
        "app.routers.users.verify_password",
        lambda plain, hashed: True,
    )
    db = AsyncMock()
    # execute 가 예외를 던져도 전체 흐름은 계속되어야
    db.execute = AsyncMock(side_effect=RuntimeError("column not found"))

    result = await withdraw_account(
        WithdrawRequest(password="correct"),
        user=user,
        db=db,
    )

    assert result["ok"] is True
    # PII 는 여전히 익명화됨
    assert user.is_active is False
    assert user.email.startswith("deleted_")
