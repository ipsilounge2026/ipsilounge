"""
선배 상담 전용 API

엔드포인트:
- POST   /api/admin/senior-consultation/notes                  기록 생성 (선배 전용)
- GET    /api/admin/senior-consultation/notes                  기록 목록 (관리자/선배)
- GET    /api/admin/senior-consultation/notes/{id}             기록 단건
- PUT    /api/admin/senior-consultation/notes/{id}/review      관리자 리뷰 상태 변경
- POST   /api/admin/senior-consultation/notes/{id}/addendum    추가 기록 (append-only)
- GET    /api/admin/senior-consultation/pre-survey/schema      사전 설문 스키마 조회
- GET    /api/admin/senior-consultation/pre-surveys             사전 설문 목록 (관리자)
- GET    /api/admin/senior-consultation/pre-surveys/{id}        사전 설문 단건
"""

import json
import uuid
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.consultation_survey import ConsultationSurvey
from app.models.senior_consultation_note import SeniorConsultationNote
from app.models.senior_pre_survey import SeniorPreSurvey
from app.models.user import User
from app.services.senior_sharing_service import abstract_consultation_for_senior
from app.services.survey_scoring_service import compute_radar_scores
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/senior-consultation", tags=["선배 상담"])


# ============================================================
# Schemas
# ============================================================

class SeniorNoteCreate(BaseModel):
    user_id: str
    booking_id: str | None = None
    session_number: int = Field(ge=1, le=4)
    session_timing: str | None = None  # S1~S4
    consultation_date: date
    core_topics: list[dict] | None = None
    optional_topics: list[dict] | None = None
    student_questions: str | None = None
    senior_answers: str | None = None
    student_mood: str | None = None
    study_attitude: str | None = None
    special_observations: str | None = None
    action_items: list[dict] | None = None
    next_checkpoints: list[dict] | None = None
    operator_notes: str | None = None
    context_for_next: str | None = None
    is_visible_to_user: bool = False


class ReviewUpdate(BaseModel):
    review_status: str  # reviewed / revision_requested
    review_notes: str | None = None


class AddendumCreate(BaseModel):
    content: str


# ============================================================
# 선배 상담 기록 CRUD
# ============================================================

def _note_to_dict(note: SeniorConsultationNote) -> dict:
    return {
        "id": str(note.id),
        "user_id": str(note.user_id),
        "senior_id": str(note.senior_id) if note.senior_id else None,
        "booking_id": str(note.booking_id) if note.booking_id else None,
        "session_number": note.session_number,
        "session_timing": note.session_timing,
        "consultation_date": note.consultation_date.isoformat(),
        "core_topics": note.core_topics or [],
        "optional_topics": note.optional_topics or [],
        "student_questions": note.student_questions,
        "senior_answers": note.senior_answers,
        "student_mood": note.student_mood,
        "study_attitude": note.study_attitude,
        "special_observations": note.special_observations,
        "action_items": note.action_items or [],
        "next_checkpoints": note.next_checkpoints or [],
        "operator_notes": note.operator_notes,
        "context_for_next": note.context_for_next,
        "review_status": note.review_status,
        "review_notes": note.review_notes,
        "is_visible_to_user": note.is_visible_to_user,
        "is_visible_to_next_senior": note.is_visible_to_next_senior,
        "addenda": note.addenda or [],
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
    }


@router.post("/notes")
async def create_senior_note(
    data: SeniorNoteCreate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """선배 상담 기록 생성 (선배 또는 관리자)"""
    # 학생 존재 확인
    user_result = await db.execute(select(User).where(User.id == uuid.UUID(data.user_id)))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다")

    note = SeniorConsultationNote(
        user_id=uuid.UUID(data.user_id),
        senior_id=admin.id,
        booking_id=uuid.UUID(data.booking_id) if data.booking_id else None,
        session_number=data.session_number,
        session_timing=data.session_timing,
        consultation_date=data.consultation_date,
        core_topics=data.core_topics,
        optional_topics=data.optional_topics,
        student_questions=data.student_questions,
        senior_answers=data.senior_answers,
        student_mood=data.student_mood,
        study_attitude=data.study_attitude,
        special_observations=data.special_observations,
        action_items=data.action_items,
        next_checkpoints=data.next_checkpoints,
        operator_notes=data.operator_notes,
        context_for_next=data.context_for_next,
        is_visible_to_user=data.is_visible_to_user,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _note_to_dict(note)


@router.get("/notes")
async def list_senior_notes(
    user_id: str | None = None,
    senior_id: str | None = None,
    session_timing: str | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """선배 상담 기록 목록 (관리자: 전체, 선배: 본인 기록만)"""
    q = select(SeniorConsultationNote).order_by(SeniorConsultationNote.consultation_date.desc())

    # 선배 역할이면 본인 기록만
    if admin.role == "senior":
        q = q.where(SeniorConsultationNote.senior_id == admin.id)
    elif senior_id:
        q = q.where(SeniorConsultationNote.senior_id == uuid.UUID(senior_id))

    if user_id:
        q = q.where(SeniorConsultationNote.user_id == uuid.UUID(user_id))
    if session_timing:
        q = q.where(SeniorConsultationNote.session_timing == session_timing)

    result = await db.execute(q)
    notes = result.scalars().all()
    return {"notes": [_note_to_dict(n) for n in notes]}


@router.get("/notes/{note_id}")
async def get_senior_note(
    note_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """선배 상담 기록 단건 조회"""
    q = select(SeniorConsultationNote).where(SeniorConsultationNote.id == note_id)
    if admin.role == "senior":
        q = q.where(SeniorConsultationNote.senior_id == admin.id)

    result = await db.execute(q)
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다")

    # 이전 세션의 체크 포인트 자동 로드
    prev_checkpoints = None
    if note.session_number > 1:
        prev_q = (
            select(SeniorConsultationNote)
            .where(
                SeniorConsultationNote.user_id == note.user_id,
                SeniorConsultationNote.session_number == note.session_number - 1,
            )
            .order_by(SeniorConsultationNote.created_at.desc())
            .limit(1)
        )
        prev_result = await db.execute(prev_q)
        prev_note = prev_result.scalar_one_or_none()
        if prev_note:
            prev_checkpoints = prev_note.next_checkpoints

    resp = _note_to_dict(note)
    resp["prev_checkpoints"] = prev_checkpoints
    return resp


@router.put("/notes/{note_id}/review")
async def review_senior_note(
    note_id: uuid.UUID,
    data: ReviewUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """관리자 리뷰 상태 변경 (관리자만)"""
    if admin.role == "senior":
        raise HTTPException(status_code=403, detail="관리자만 리뷰할 수 있습니다")

    result = await db.execute(
        select(SeniorConsultationNote).where(SeniorConsultationNote.id == note_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다")

    note.review_status = data.review_status
    note.review_notes = data.review_notes
    await db.commit()
    await db.refresh(note)
    return _note_to_dict(note)


@router.post("/notes/{note_id}/addendum")
async def add_senior_note_addendum(
    note_id: uuid.UUID,
    data: AddendumCreate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """추가 기록 (append-only)"""
    result = await db.execute(
        select(SeniorConsultationNote).where(SeniorConsultationNote.id == note_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다")

    addenda = list(note.addenda or [])
    addenda.append({
        "content": data.content,
        "author_id": str(admin.id),
        "author_name": admin.name,
        "created_at": datetime.utcnow().isoformat(),
    })
    note.addenda = addenda
    await db.commit()
    await db.refresh(note)
    return _note_to_dict(note)


# ============================================================
# 상담사 → 선배 공유 (추상화 요약)
# ============================================================

@router.get("/student/{user_id}/counselor-summary")
async def get_counselor_summary_for_senior(
    user_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    선배용 상담사 설문 추상화 요약 조회.

    연계규칙 V1 §3-4:
    - 상담사 설문의 답변을 선배에게 공유할 때 추상화 변환
    - 관리자 리뷰(reviewed)를 통과한 선배 기록이 있는 학생만 조회 가능
    - D8, F, G 등 민감정보는 비공유
    """
    uid = uuid.UUID(user_id)

    # 학생의 최신 submitted 상담사 설문 조회
    survey_q = (
        select(ConsultationSurvey)
        .where(
            ConsultationSurvey.user_id == uid,
            ConsultationSurvey.status == "submitted",
        )
        .order_by(ConsultationSurvey.submitted_at.desc())
        .limit(1)
    )
    survey_result = await db.execute(survey_q)
    survey = survey_result.scalar_one_or_none()

    if not survey:
        raise HTTPException(status_code=404, detail="상담사 설문 데이터가 없습니다")

    # 레이더 점수 산출
    answers = survey.answers or {}
    radar = compute_radar_scores(answers, survey.timing)

    # 추상화 변환
    abstracted = abstract_consultation_for_senior(
        answers=answers,
        radar_scores=radar,
        timing=survey.timing,
    )

    # 이전 선배 기록의 context_for_next 로드
    note_q = (
        select(SeniorConsultationNote)
        .where(
            SeniorConsultationNote.user_id == uid,
            SeniorConsultationNote.review_status == "reviewed",
        )
        .order_by(SeniorConsultationNote.consultation_date.desc())
        .limit(1)
    )
    note_result = await db.execute(note_q)
    prev_note = note_result.scalar_one_or_none()

    return {
        "user_id": user_id,
        "survey_type": survey.survey_type,
        "timing": survey.timing,
        "abstracted_summary": abstracted,
        "prev_senior_context": prev_note.context_for_next if prev_note else None,
        "prev_senior_session": prev_note.session_timing if prev_note else None,
    }


# ============================================================
# 선배 사전 설문
# ============================================================

_SCHEMA_CACHE: dict | None = None


def _load_senior_survey_schema() -> dict:
    global _SCHEMA_CACHE
    if _SCHEMA_CACHE is None:
        path = Path(__file__).resolve().parent.parent / "surveys" / "schemas" / "senior_pre_survey.json"
        with open(path, "r", encoding="utf-8") as f:
            _SCHEMA_CACHE = json.load(f)
    return _SCHEMA_CACHE


@router.get("/pre-survey/schema")
async def get_senior_survey_schema(
    session_timing: str | None = None,
    admin: Admin = Depends(get_current_admin),
):
    """선배 사전 설문 스키마 조회. session_timing 지정 시 해당 세션 질문만 반환."""
    schema = _load_senior_survey_schema()
    if session_timing and session_timing in schema.get("session_questions", {}):
        session = schema["session_questions"][session_timing]
        return {
            "common_questions": schema["common_questions"],
            "session_timing": session_timing,
            "session_label": session["label"],
            "Q3_options": session["Q3_options"],
            "session_questions": session["questions"],
        }
    return schema


@router.get("/pre-surveys")
async def list_senior_pre_surveys(
    user_id: str | None = None,
    session_timing: str | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """선배 사전 설문 목록 (관리자/선배)"""
    q = select(SeniorPreSurvey).order_by(SeniorPreSurvey.created_at.desc())
    if user_id:
        q = q.where(SeniorPreSurvey.user_id == uuid.UUID(user_id))
    if session_timing:
        q = q.where(SeniorPreSurvey.session_timing == session_timing)

    result = await db.execute(q)
    surveys = result.scalars().all()
    return {"surveys": [_survey_to_dict(s) for s in surveys]}


@router.get("/pre-surveys/{survey_id}")
async def get_senior_pre_survey(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """선배 사전 설문 단건 조회"""
    result = await db.execute(
        select(SeniorPreSurvey).where(SeniorPreSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")
    return _survey_to_dict(survey)


def _survey_to_dict(survey: SeniorPreSurvey) -> dict:
    return {
        "id": str(survey.id),
        "user_id": str(survey.user_id),
        "booking_id": str(survey.booking_id) if survey.booking_id else None,
        "session_number": survey.session_number,
        "session_timing": survey.session_timing,
        "status": survey.status,
        "answers": survey.answers or {},
        "submitted_at": survey.submitted_at.isoformat() if survey.submitted_at else None,
        "created_at": survey.created_at.isoformat() if survey.created_at else None,
    }
