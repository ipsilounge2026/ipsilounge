"""DB 엔진/세션 정의.

DEV_MODE=true 일 때 SQLite + aiosqlite 로 자동 분기하고,
PostgreSQL 전용 타입(JSONB, UUID)을 SQLite 호환 타입으로 컴파일하도록
@compiles 핸들러를 등록한다. (모델 코드는 변경하지 않음)

spec: ipsilounge/docs/test-environment-spec.md §2
"""

import logging

from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger(__name__)


# ─── DEV_MODE 분기: SQLite 호환 타입 컴파일러 등록 ────────────────────────
# 운영(PostgreSQL)에서는 이 핸들러가 호출되지 않으므로 영향 없음.
# SQLite 컴파일 시점에만 동작하여 DDL 을 SQLite 호환 타입으로 치환.
@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(element, compiler, **kw):  # noqa: ARG001
    """SQLite 에서 JSONB → JSON (네이티브 JSON1 모듈 사용)."""
    return "JSON"


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(element, compiler, **kw):  # noqa: ARG001
    """SQLite 에서 UUID → VARCHAR(36)."""
    return "VARCHAR(36)"


# ─── 엔진/세션 생성 ────────────────────────────────────────────────────
_database_url = settings.effective_database_url

if settings.DEV_MODE:
    logger.warning(
        "DEV_MODE active — using SQLite at %s. JSONB→JSON, UUID→VARCHAR(36) auto-applied. "
        "DO NOT use in production.",
        settings.DEV_SQLITE_PATH,
    )
    # SQLite 는 connect_args 로 check_same_thread=False 권장 (async 환경)
    engine = create_async_engine(
        _database_url,
        echo=False,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_async_engine(_database_url, echo=False)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session
