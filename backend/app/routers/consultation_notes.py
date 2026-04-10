from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.consultation_note import ConsultationNote
from app.models.user import User
from app.utils.dependencies import get_current_user
from app.utils.family import get_visible_owner_ids

router = APIRouter(prefix="/api/consultation-notes", tags=["상담 기록 (사용자)"])


@router.get("")
async def get_my_notes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """내 상담 기록 조회 (관리자가 공개 설정한 항목만).

    가시성 규칙:
    - 학생: 본인 기록만
    - 학부모: 본인 + 연결된 자녀들의 기록
    """
    visible_ids = await get_visible_owner_ids(current_user, db)
    result = await db.execute(
        select(ConsultationNote)
        .where(
            ConsultationNote.user_id.in_(visible_ids),
            ConsultationNote.is_visible_to_user == True,  # noqa: E712
        )
        .order_by(ConsultationNote.consultation_date.desc())
    )
    notes = result.scalars().all()
    return [
        {
            "id": str(n.id),
            "category": n.category if isinstance(n.category, str) else (n.category.value if hasattr(n.category, "value") else str(n.category)),
            "consultation_date": n.consultation_date.isoformat(),
            "student_grade": n.student_grade if isinstance(n.student_grade, str) else (n.student_grade.value if hasattr(n.student_grade, "value") else n.student_grade),
            "timing": getattr(n, "timing", None),
            "goals": n.goals,
            "main_content": n.main_content,
            "advice_given": n.advice_given,
            "next_steps": n.next_steps,
            "next_topic": n.next_topic,
            "topic_notes": getattr(n, "topic_notes", None),
            "addenda": [
                {"content": a["content"], "created_at": a["created_at"]}
                for a in (n.addenda or [])
            ],
            # admin_private_notes 는 미노출
        }
        for n in notes
    ]
