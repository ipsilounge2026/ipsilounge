from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.consultation_note import ConsultationNote, CONSULTATION_CATEGORIES, STUDENT_GRADES
from app.models.user import User
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/consultation-notes", tags=["관리자 상담 기록"])


class NoteCreate(BaseModel):
    user_id: str
    booking_id: str | None = None
    category: str  # academic / record / admission / mental / other
    consultation_date: date
    student_grade: str | None = None
    timing: str | None = None  # T1 / T2 / T3 / T4 (학업 상담 전용)
    goals: str | None = None
    main_content: str = ""
    advice_given: str | None = None
    next_steps: str | None = None
    next_topic: str | None = None
    # HSGAP-P2-senior-counselor-context-share-ui: 다음 선배에게 전달할 요약 맥락
    next_senior_context: str | None = None
    topic_notes: dict | None = None  # 카테고리별 주제 기록
    admin_private_notes: str | None = None
    is_visible_to_user: bool = False


class AddendumCreate(BaseModel):
    content: str


def _note_to_dict(note: ConsultationNote) -> dict:
    return {
        "id": str(note.id),
        "user_id": str(note.user_id),
        "booking_id": str(note.booking_id) if note.booking_id else None,
        "admin_id": str(note.admin_id) if note.admin_id else None,
        "category": note.category if isinstance(note.category, str) else (note.category.value if hasattr(note.category, "value") else str(note.category)),
        "consultation_date": note.consultation_date.isoformat(),
        "student_grade": note.student_grade if isinstance(note.student_grade, str) else (note.student_grade.value if hasattr(note.student_grade, "value") else note.student_grade),
        "timing": note.timing if hasattr(note, "timing") else None,
        "goals": note.goals,
        "main_content": note.main_content,
        "advice_given": note.advice_given,
        "next_steps": note.next_steps,
        "next_topic": note.next_topic,
        "next_senior_context": getattr(note, "next_senior_context", None),
        "topic_notes": note.topic_notes if hasattr(note, "topic_notes") else None,
        "admin_private_notes": note.admin_private_notes,
        "is_visible_to_user": note.is_visible_to_user,
        "addenda": note.addenda or [],
        "created_at": note.created_at.isoformat(),
    }


@router.get("")
async def list_notes(
    user_id: str | None = None,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """상담 기록 목록 (user_id, category 필터 가능)"""
    query = select(ConsultationNote).order_by(ConsultationNote.consultation_date.desc())
    if user_id:
        query = query.where(ConsultationNote.user_id == user_id)
    if category:
        query = query.where(ConsultationNote.category == category)

    result = await db.execute(query)
    notes = result.scalars().all()
    return [_note_to_dict(n) for n in notes]


@router.get("/user/{user_id}")
async def get_user_notes(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """특정 학생의 전체 상담 이력 + 요약"""
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    notes_result = await db.execute(
        select(ConsultationNote)
        .where(ConsultationNote.user_id == user_id)
        .order_by(ConsultationNote.consultation_date.desc())
    )
    notes = notes_result.scalars().all()

    # 카테고리별 횟수 집계
    category_count: dict = {}
    for n in notes:
        key = n.category if isinstance(n.category, str) else (n.category.value if hasattr(n.category, "value") else str(n.category))
        label = CONSULTATION_CATEGORIES.get(key, key)
        category_count[label] = category_count.get(label, 0) + 1

    return {
        "user": {"id": str(user.id), "name": user.name, "email": user.email},
        "total_count": len(notes),
        "category_summary": category_count,
        "notes": [_note_to_dict(n) for n in notes],
    }


@router.post("")
async def create_note(
    data: NoteCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """상담 기록 작성 (최초 1회, 이후 수정 불가)"""
    # 카테고리 검증
    if data.category not in CONSULTATION_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 카테고리: {data.category}")

    note = ConsultationNote(
        user_id=data.user_id,
        booking_id=data.booking_id,
        admin_id=current_admin.id,
        category=data.category,
        consultation_date=data.consultation_date,
        student_grade=data.student_grade,
        timing=data.timing,
        goals=data.goals,
        main_content=data.main_content or "",
        advice_given=data.advice_given,
        next_steps=data.next_steps,
        next_topic=data.next_topic,
        next_senior_context=data.next_senior_context,
        topic_notes=data.topic_notes,
        admin_private_notes=data.admin_private_notes,
        is_visible_to_user=data.is_visible_to_user,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _note_to_dict(note)


@router.post("/{note_id}/addenda")
async def add_addendum(
    note_id: str,
    data: AddendumCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """상담 기록에 추가 기록 작성 (append-only, 기존 내용 수정/삭제 불가)"""
    result = await db.execute(select(ConsultationNote).where(ConsultationNote.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="상담 기록을 찾을 수 없습니다.")

    if not data.content.strip():
        raise HTTPException(status_code=400, detail="추가 기록 내용을 입력하세요.")

    entry = {
        "content": data.content.strip(),
        "admin_id": str(current_admin.id),
        "admin_name": current_admin.name,
        "created_at": datetime.utcnow().isoformat(),
    }

    existing = list(note.addenda) if note.addenda else []
    existing.append(entry)
    note.addenda = existing

    await db.commit()
    await db.refresh(note)
    return _note_to_dict(note)


@router.patch("/{note_id}/visibility")
async def toggle_visibility(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """학생 공개/비공개 토글 (상담 내용 수정이 아닌 공개 설정만 변경)"""
    result = await db.execute(select(ConsultationNote).where(ConsultationNote.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="상담 기록을 찾을 수 없습니다.")

    note.is_visible_to_user = not note.is_visible_to_user
    await db.commit()
    await db.refresh(note)
    return {"is_visible_to_user": note.is_visible_to_user}
