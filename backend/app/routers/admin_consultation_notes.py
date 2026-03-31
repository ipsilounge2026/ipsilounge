from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.admin import Admin
from app.models.consultation_note import ConsultationCategory, ConsultationNote, StudentStatus
from app.models.user import User
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/consultation-notes", tags=["관리자 상담 기록"])


class NoteCreate(BaseModel):
    user_id: str
    booking_id: str | None = None
    category: ConsultationCategory
    consultation_date: date
    student_grade: StudentStatus | None = None
    goals: str | None = None
    main_content: str
    advice_given: str | None = None
    next_steps: str | None = None
    next_topic: str | None = None
    admin_private_notes: str | None = None
    is_visible_to_user: bool = False


class NoteUpdate(BaseModel):
    category: ConsultationCategory | None = None
    consultation_date: date | None = None
    student_grade: StudentStatus | None = None
    goals: str | None = None
    main_content: str | None = None
    advice_given: str | None = None
    next_steps: str | None = None
    next_topic: str | None = None
    admin_private_notes: str | None = None
    is_visible_to_user: bool | None = None


def _note_to_dict(note: ConsultationNote) -> dict:
    return {
        "id": str(note.id),
        "user_id": str(note.user_id),
        "booking_id": str(note.booking_id) if note.booking_id else None,
        "admin_id": str(note.admin_id) if note.admin_id else None,
        "category": note.category,
        "consultation_date": note.consultation_date.isoformat(),
        "student_grade": note.student_grade,
        "goals": note.goals,
        "main_content": note.main_content,
        "advice_given": note.advice_given,
        "next_steps": note.next_steps,
        "next_topic": note.next_topic,
        "admin_private_notes": note.admin_private_notes,
        "is_visible_to_user": note.is_visible_to_user,
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
    }


@router.get("")
async def list_notes(
    user_id: str | None = None,
    category: ConsultationCategory | None = None,
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
        key = n.category.value if hasattr(n.category, "value") else n.category
        category_count[key] = category_count.get(key, 0) + 1

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
    """상담 기록 작성"""
    note = ConsultationNote(
        user_id=data.user_id,
        booking_id=data.booking_id,
        admin_id=current_admin.id,
        category=data.category,
        consultation_date=data.consultation_date,
        student_grade=data.student_grade,
        goals=data.goals,
        main_content=data.main_content,
        advice_given=data.advice_given,
        next_steps=data.next_steps,
        next_topic=data.next_topic,
        admin_private_notes=data.admin_private_notes,
        is_visible_to_user=data.is_visible_to_user,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _note_to_dict(note)


@router.put("/{note_id}")
async def update_note(
    note_id: str,
    data: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """상담 기록 수정"""
    result = await db.execute(select(ConsultationNote).where(ConsultationNote.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="상담 기록을 찾을 수 없습니다.")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(note, field, value)

    await db.commit()
    await db.refresh(note)
    return _note_to_dict(note)


@router.delete("/{note_id}")
async def delete_note(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """상담 기록 삭제"""
    result = await db.execute(select(ConsultationNote).where(ConsultationNote.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="상담 기록을 찾을 수 없습니다.")

    await db.delete(note)
    await db.commit()
    return {"message": "삭제 완료"}
