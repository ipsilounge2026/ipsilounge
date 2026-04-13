"""
학생(사용자)용 선배 상담 기록 열람 API

- GET /api/senior-notes  — 내 선배 상담 기록 조회 (공개 설정된 것만)

공개 조건:
1. review_status == "reviewed" (관리자 검토 완료)
2. is_visible_to_user == True (학생 공개 설정됨)

학부모는 연결된 자녀의 기록도 함께 조회.
민감 정보(operator_notes, review_notes, content_checklist 등)는 제외.
sharing_settings에 따라 비공개 항목도 필터링.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.senior_consultation_note import SeniorConsultationNote
from app.models.user import User
from app.utils.dependencies import get_current_user
from app.utils.family import get_visible_owner_ids

router = APIRouter(prefix="/api/senior-notes", tags=["선배 상담 기록 (사용자)"])

# 학생에게 기본적으로 공개하는 항목들
DEFAULT_USER_SHARING = {
    "core_topics": True,
    "optional_topics": True,
    "student_questions": True,
    "student_observation": False,  # 학생 상태 관찰은 기본 비공개
    "action_items": True,
    "next_checkpoints": True,
    "context_for_next": False,  # 상담사 전달 맥락은 학생 비공개
    "operator_notes": False,  # 운영자 메모는 항상 비공개
}


def _note_for_user(note: SeniorConsultationNote, senior_name: str | None = None) -> dict:
    """학생에게 보여줄 선배 상담 기록 dict 구성. 민감 정보 제외."""
    sharing = note.sharing_settings or DEFAULT_USER_SHARING

    result: dict = {
        "id": str(note.id),
        "session_number": note.session_number,
        "session_timing": note.session_timing,
        "consultation_date": note.consultation_date.isoformat() if note.consultation_date else None,
        "senior_name": senior_name,
    }

    # 핵심 주제 (진행 결과만, student_reaction 제외)
    if sharing.get("core_topics", True):
        result["core_topics"] = [
            {
                "topic": t.get("topic", ""),
                "progress_status": t.get("progress_status", ""),
                "key_content": t.get("key_content", ""),
            }
            for t in (note.core_topics or [])
        ]
    else:
        result["core_topics"] = []

    # 선택 주제
    if sharing.get("optional_topics", True):
        result["optional_topics"] = [
            {"topic": t.get("topic", ""), "covered": t.get("covered", False)}
            for t in (note.optional_topics or [])
            if t.get("covered")
        ]
    else:
        result["optional_topics"] = []

    # 자유 질의응답
    if sharing.get("student_questions", True):
        result["student_questions"] = note.student_questions
        result["senior_answers"] = note.senior_answers
    else:
        result["student_questions"] = None
        result["senior_answers"] = None

    # 학생 상태 관찰 (기본 비공개)
    if sharing.get("student_observation", False):
        result["student_mood"] = note.student_mood
        result["study_attitude"] = note.study_attitude
        result["special_observations"] = note.special_observations
    else:
        result["student_mood"] = None
        result["study_attitude"] = None
        result["special_observations"] = None

    # 실천 사항
    if sharing.get("action_items", True):
        result["action_items"] = [
            {"action": a.get("action", ""), "priority": a.get("priority", "중")}
            for a in (note.action_items or [])
        ]
    else:
        result["action_items"] = []

    # 다음 확인 사항
    if sharing.get("next_checkpoints", True):
        result["next_checkpoints"] = [
            {"checkpoint": c.get("checkpoint", "")}
            for c in (note.next_checkpoints or [])
        ]
    else:
        result["next_checkpoints"] = []

    # 추가 기록 (addenda 중 학생에게 공개 가능한 것만)
    result["addenda"] = [
        {"content": a.get("content", ""), "created_at": a.get("created_at", "")}
        for a in (note.addenda or [])
    ]

    return result


@router.get("")
async def get_my_senior_notes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """내 선배 상담 기록 조회.

    가시성 규칙:
    - 학생: 본인 기록만
    - 학부모: 본인 + 연결된 자녀들의 기록
    - review_status == 'reviewed' && is_visible_to_user == True인 것만
    """
    visible_ids = await get_visible_owner_ids(current_user, db)

    result = await db.execute(
        select(SeniorConsultationNote)
        .where(
            SeniorConsultationNote.user_id.in_(visible_ids),
            SeniorConsultationNote.review_status == "reviewed",
            SeniorConsultationNote.is_visible_to_user == True,  # noqa: E712
        )
        .order_by(SeniorConsultationNote.consultation_date.desc())
    )
    notes = result.scalars().all()

    # 선배 이름 일괄 조회
    senior_ids = list({n.senior_id for n in notes if n.senior_id})
    senior_names: dict[uuid.UUID, str] = {}
    if senior_ids:
        admin_result = await db.execute(
            select(Admin.id, Admin.name).where(Admin.id.in_(senior_ids))
        )
        for admin_id, name in admin_result.all():
            senior_names[admin_id] = name

    return [
        _note_for_user(n, senior_names.get(n.senior_id) if n.senior_id else None)
        for n in notes
    ]
