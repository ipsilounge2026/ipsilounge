"""L3 검증용 테스트 데이터 시드 스크립트.

DEV_MODE=true 일 때만 동작. dev SQLite 에 다음을 멱등적으로 주입:
- 사용자 7명 (학생 4 + 학부모 1 + 슈퍼관리자 1 + 상담사 1)
- 학부모-자녀 연결 (parent_a ↔ student_t2)
- ConsultationSurvey 4건 (학생당 1건, timing=학생 시점, A4 사전 응답 포함)

stdout 으로 JSON 출력 (L3 harness 가 입력으로 사용).

spec: ipsilounge/docs/test-environment-spec.md §3
사용:
    DEV_MODE=true python scripts/seed_l3_test_data.py            # idempotent
    DEV_MODE=true python scripts/seed_l3_test_data.py --reset    # dev.db 삭제 후 재생성
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# 프로젝트 루트(backend/)를 sys.path 에 추가 (스크립트 단독 실행 지원)
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


# ─── DEV_MODE 가드 (import 전에 체크) ─────────────────────────────────
def _ensure_dev_mode_or_exit() -> None:
    val = os.environ.get("DEV_MODE", "").strip().lower()
    if val not in ("1", "true", "yes", "on"):
        sys.stderr.write(
            "[seed_l3_test_data] ERROR: DEV_MODE=true 환경 변수가 필요합니다.\n"
            "  운영 DB 보호용 안전 가드. 다음 형태로 실행하세요:\n"
            "    DEV_MODE=true python scripts/seed_l3_test_data.py\n"
        )
        sys.exit(2)


_ensure_dev_mode_or_exit()


from sqlalchemy import select  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import Base, async_session, engine  # noqa: E402

# 모든 모델 import (create_all 대상)
from app.models import (  # noqa: E402, F401
    admin as _admin_mod,
    admission_case,
    admission_data,
    analysis_order,
    analysis_share,
    consultation_booking,
    consultation_note,
    consultation_slot,
    consultation_survey,
    counselor_change_request,
    family_invite,
    family_link as _family_link_mod,
    guidebook,
    interview_question,
    notice as _notice_mod,
    notification,
    password_reset_token,
    payment as payment_model,
    satisfaction_survey as ss_model,
    seminar_mail_log,
    seminar_reservation,
    seminar_schedule,
    senior_change_request,
    senior_consultation_note,
    senior_pre_survey as sp_model,
    user as _user_mod,
)
from app.models.admin import Admin  # noqa: E402
from app.models.consultation_slot import ConsultationSlot  # noqa: E402
from app.models.consultation_survey import ConsultationSurvey  # noqa: E402
from app.models.family_link import FamilyLink  # noqa: E402
from app.models.user import User  # noqa: E402
from app.utils.security import hash_password  # noqa: E402


# ─── 시드 정의 ─────────────────────────────────────────────────────────
DEFAULT_PASSWORD = "devpass1!"

# 식별자 ↔ 사용자 정의
STUDENT_DEFS = [
    # (identifier, email, name, timing, school_name, grade)
    ("student_t1", "student.t1@test.local", "테스트학생T1", "T1", "테스트고", 1),  # 예비고1
    ("student_t2", "student.t2@test.local", "테스트학생T2", "T2", "테스트고", 1),  # 고1~고2
    ("student_t3", "student.t3@test.local", "테스트학생T3", "T3", "테스트고", 2),  # 고2~고3
    ("student_t4", "student.t4@test.local", "테스트학생T4", "T4", "테스트고", 3),  # 고3 진입
]

PARENT_DEF = ("parent_a", "parent.a@test.local", "테스트학부모A")
ADMIN_DEFS = [
    # (identifier, email, name, role)
    ("admin_a", "admin.a@test.local", "테스트관리자A", "super_admin"),
    ("counselor_a", "counselor.a@test.local", "테스트상담사A", "counselor"),
]


def _seed_answers_for_timing(timing: str) -> dict:
    """A4(상담시점) 사전 응답을 주입한 answers 본체."""
    return {
        "A": {
            "A1": "테스트학생",
            "A2": "테스트고",
            "A3": "예시반",
            "A4": timing,  # 카테고리 timings 필터 동작 검증용
        },
        "B": {},
    }


# ─── 멱등 헬퍼 ─────────────────────────────────────────────────────────
async def _get_user_by_email(db, email: str) -> User | None:
    res = await db.execute(select(User).where(User.email == email))
    return res.scalar_one_or_none()


async def _get_admin_by_email(db, email: str) -> Admin | None:
    res = await db.execute(select(Admin).where(Admin.email == email))
    return res.scalar_one_or_none()


async def _ensure_student(db, identifier: str, email: str, name: str, school: str, grade: int) -> User:
    existing = await _get_user_by_email(db, email)
    if existing:
        return existing
    u = User(
        email=email,
        password_hash=hash_password(DEFAULT_PASSWORD),
        name=name,
        phone="010-0000-0000",
        member_type="student",
        school_name=school,
        grade=grade,
    )
    db.add(u)
    await db.flush()
    return u


async def _ensure_parent(db, email: str, name: str) -> User:
    existing = await _get_user_by_email(db, email)
    if existing:
        return existing
    u = User(
        email=email,
        password_hash=hash_password(DEFAULT_PASSWORD),
        name=name,
        phone="010-0000-0000",
        member_type="parent",
    )
    db.add(u)
    await db.flush()
    return u


async def _ensure_admin(db, email: str, name: str, role: str) -> Admin:
    existing = await _get_admin_by_email(db, email)
    if existing:
        return existing
    a = Admin(
        email=email,
        password_hash=hash_password(DEFAULT_PASSWORD),
        name=name,
        role=role,
    )
    db.add(a)
    await db.flush()
    return a


async def _ensure_family_link(db, parent_id, child_id, created_by) -> FamilyLink:
    res = await db.execute(
        select(FamilyLink).where(
            FamilyLink.parent_user_id == parent_id,
            FamilyLink.child_user_id == child_id,
        )
    )
    existing = res.scalar_one_or_none()
    if existing:
        return existing
    link = FamilyLink(
        parent_user_id=parent_id,
        child_user_id=child_id,
        status="active",
        created_by=created_by,
    )
    db.add(link)
    await db.flush()
    return link


async def _ensure_slot(
    db,
    admin_id,
    slot_date,
    start_time_obj,
    end_time_obj,
) -> ConsultationSlot:
    """상담 슬롯 멱등 생성. 동일 admin_id + date + start_time 존재 시 재사용.

    admin_id 는 str 로 저장됨(consultation_slots.admin_id = String(36)).
    """
    admin_id_str = str(admin_id)
    res = await db.execute(
        select(ConsultationSlot).where(
            ConsultationSlot.admin_id == admin_id_str,
            ConsultationSlot.date == slot_date,
            ConsultationSlot.start_time == start_time_obj,
        )
    )
    existing = res.scalar_one_or_none()
    if existing:
        return existing
    slot = ConsultationSlot(
        admin_id=admin_id_str,
        date=slot_date,
        start_time=start_time_obj,
        end_time=end_time_obj,
        max_bookings=1,
        current_bookings=0,
        is_active=True,
    )
    db.add(slot)
    await db.flush()
    return slot


async def _ensure_survey(db, user_id, timing: str) -> ConsultationSurvey:
    """학생당 1개의 high 설문 (timing=학생 시점, A4 사전 응답 포함)."""
    res = await db.execute(
        select(ConsultationSurvey).where(
            ConsultationSurvey.user_id == user_id,
            ConsultationSurvey.survey_type == "high",
            ConsultationSurvey.timing == timing,
        )
    )
    existing = res.scalar_one_or_none()
    if existing:
        # answers 가 비어 있으면 채워넣음 (이전 시드 이후 스키마 복구용)
        if not existing.answers or not existing.answers.get("A", {}).get("A4"):
            existing.answers = _seed_answers_for_timing(timing)
            existing.category_status = {"A": "completed"}
        return existing
    s = ConsultationSurvey(
        user_id=user_id,
        survey_type="high",
        timing=timing,
        mode="full",
        status="draft",
        answers=_seed_answers_for_timing(timing),
        category_status={"A": "completed"},
        started_platform="web",
        last_edited_platform="web",
    )
    db.add(s)
    await db.flush()
    return s


# ─── 메인 ──────────────────────────────────────────────────────────────
async def _reset_db() -> None:
    """dev.db 파일 삭제 (DEV_MODE 전용)."""
    db_path = Path(settings.DEV_SQLITE_PATH).resolve()
    if db_path.exists():
        # SQLAlchemy engine 의 풀을 모두 해제 후 삭제
        await engine.dispose()
        db_path.unlink()
        # journal/wal 파일도 정리
        for suffix in ("-journal", "-shm", "-wal"):
            sib = Path(str(db_path) + suffix)
            if sib.exists():
                sib.unlink()
        sys.stderr.write(f"[seed_l3_test_data] dev.db 삭제 완료: {db_path}\n")


async def _create_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _seed() -> dict:
    output = {
        "users": {},
        "admins": {},
        "family_link": None,
        "surveys": {},
        "slots": [],
    }
    async with async_session() as db:
        # 학생 4명
        students: dict[str, User] = {}
        for ident, email, name, timing, school, grade in STUDENT_DEFS:
            u = await _ensure_student(db, ident, email, name, school, grade)
            students[ident] = u
            output["users"][ident] = {
                "id": str(u.id),
                "email": u.email,
                "member_type": u.member_type,
                "timing": timing,
            }

        # 학부모 1명
        p_ident, p_email, p_name = PARENT_DEF
        parent = await _ensure_parent(db, p_email, p_name)
        output["users"][p_ident] = {
            "id": str(parent.id),
            "email": parent.email,
            "member_type": parent.member_type,
        }

        # 관리자 2명
        admin_objs: dict[str, Admin] = {}
        for ident, email, name, role in ADMIN_DEFS:
            a = await _ensure_admin(db, email, name, role)
            admin_objs[ident] = a
            output["admins"][ident] = {
                "id": str(a.id),
                "email": a.email,
                "role": a.role,
            }

        # ─── Sprint 3 (2026-04-19): counselor_a 의 예약 가능 슬롯 ───
        # 상담 예약 E2E 테스트(Sprint 3)용. 리드타임(학습상담 설문제출+7일 경과) 고려해
        # 오늘로부터 8~21일 범위에 하루 3개(오전 10시, 오후 2시, 오후 4시) 총 14일 × 3 = 42 슬롯.
        # 멱등: 동일 (admin_id, date, start_time) 존재 시 재사용.
        from datetime import date as _date_type, time as _time_type, timedelta as _tdelta
        counselor = admin_objs.get("counselor_a")
        if counselor is not None:
            today = _date_type.today()
            for day_offset in range(8, 22):
                slot_date = today + _tdelta(days=day_offset)
                for start_h in (10, 14, 16):
                    slot = await _ensure_slot(
                        db,
                        admin_id=counselor.id,
                        slot_date=slot_date,
                        start_time_obj=_time_type(start_h, 0),
                        end_time_obj=_time_type(start_h + 1, 0),
                    )
                    output["slots"].append({
                        "id": str(slot.id),
                        "admin_id": slot.admin_id,
                        "date": slot.date.isoformat(),
                        "start_time": slot.start_time.strftime("%H:%M"),
                    })

        # parent_a ↔ student_t2 가족 연결
        link = await _ensure_family_link(
            db,
            parent_id=parent.id,
            child_id=students["student_t2"].id,
            created_by=parent.id,
        )
        output["family_link"] = {
            "id": str(link.id),
            "parent_user_id": str(link.parent_user_id),
            "child_user_id": str(link.child_user_id),
            "status": link.status,
        }

        # 학생별 설문 1개씩
        for ident, _email, _name, timing, _school, _grade in STUDENT_DEFS:
            s = await _ensure_survey(db, students[ident].id, timing)
            output["surveys"][ident] = {
                "survey_id": str(s.id),
                "user_id": str(s.user_id),
                "survey_type": s.survey_type,
                "timing": s.timing,
                "answers_a4": s.answers.get("A", {}).get("A4"),
            }

        await db.commit()

    output["meta"] = {
        "default_password": DEFAULT_PASSWORD,
        "dev_db_path": str(Path(settings.DEV_SQLITE_PATH).resolve()),
        "dev_mode": settings.DEV_MODE,
    }
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="L3 검증용 시드 (DEV_MODE 전용)")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="실행 전에 dev.db 파일을 삭제 (스키마부터 재생성)",
    )
    args = parser.parse_args()

    async def _run():
        if args.reset:
            await _reset_db()
        await _create_schema()
        return await _seed()

    try:
        result = asyncio.run(_run())
    except Exception as exc:
        sys.stderr.write(f"[seed_l3_test_data] FAILED: {type(exc).__name__}: {exc}\n")
        return 1

    sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
