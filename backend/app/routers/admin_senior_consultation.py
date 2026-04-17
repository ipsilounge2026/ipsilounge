"""
선배 상담 전용 API

엔드포인트:
- POST   /api/admin/senior-consultation/notes                  기록 생성 (선배 전용)
- GET    /api/admin/senior-consultation/notes                  기록 목록 (관리자/선배)
- GET    /api/admin/senior-consultation/notes/{id}             기록 단건
- PUT    /api/admin/senior-consultation/notes/{id}/review      관리자 리뷰 상태 변경 (sharing_settings, content_checklist 포함)
- POST   /api/admin/senior-consultation/notes/{id}/addendum    추가 기록 (append-only)
- GET    /api/admin/senior-consultation/student/{user_id}/senior-notes  상담사용 리뷰 완료 선배 기록 조회
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
from app.models.admin import Admin, SeniorStudentAssignment
from app.models.consultation_note import ConsultationNote
from app.models.consultation_survey import ConsultationSurvey
from app.models.senior_consultation_note import SeniorConsultationNote
from app.models.senior_pre_survey import SeniorPreSurvey
from app.models.user import User
from app.services.consultation_access_log_service import log_consultation_data_access
from app.services.senior_sharing_service import (
    DEFAULT_NOTE_SENIOR_SHARING,
    DEFAULT_SURVEY_SENIOR_SHARING,
    abstract_consultation_for_senior,
)
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
    sharing_settings: dict | None = None  # 항목별 공유 설정
    content_checklist: list[dict] | None = None  # 콘텐츠 리뷰 체크리스트
    is_visible_to_user: bool | None = None  # 학생 공개 여부


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
        "sharing_settings": note.sharing_settings,
        "content_checklist": note.content_checklist,
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
    user_uuid = uuid.UUID(data.user_id)
    user_result = await db.execute(select(User).where(User.id == user_uuid))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다")

    # P1-1: 선배 역할이면 담당 학생(SeniorStudentAssignment) 매칭 여부 검증
    if admin.role == "senior":
        assign_result = await db.execute(
            select(SeniorStudentAssignment).where(
                SeniorStudentAssignment.senior_id == admin.id,
                SeniorStudentAssignment.user_id == user_uuid,
            )
        )
        if assign_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=403, detail="담당 학생이 아닙니다")

    note = SeniorConsultationNote(
        user_id=user_uuid,
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
        # P1-3: 선배 역할은 is_visible_to_next_senior 플래그 반영 (본인 기록 예외)
        if admin.role == "senior":
            from sqlalchemy import or_
            prev_q = prev_q.where(
                or_(
                    SeniorConsultationNote.senior_id == admin.id,
                    SeniorConsultationNote.is_visible_to_next_senior == True,  # noqa: E712
                )
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
    if data.sharing_settings is not None:
        note.sharing_settings = data.sharing_settings
    if data.content_checklist is not None:
        note.content_checklist = data.content_checklist
    if data.is_visible_to_user is not None:
        note.is_visible_to_user = data.is_visible_to_user
    await db.commit()
    await db.refresh(note)
    return _note_to_dict(note)


DEFAULT_SHARING_SETTINGS = {
    "core_topics": True,
    "optional_topics": True,
    "student_questions": True,
    "student_observation": True,
    "action_items": True,
    "next_checkpoints": True,
    "context_for_next": True,
    "operator_notes": False,
}


# V1 §6 — 선배 노트 공유 토글 키 → 실제 치환되는 필드 키 매핑.
# P3-① 상담사 UI 가 "선배 판단으로 비공유" 인지 "원래 빈 값" 인지 구분할 수 있도록
# _redacted_fields 메타데이터를 같이 반환한다.
_SHARING_TOGGLE_TO_FIELDS: dict[str, list[str]] = {
    "core_topics": ["core_topics"],
    "optional_topics": ["optional_topics"],
    "student_questions": ["student_questions", "senior_answers"],
    "student_observation": ["student_mood", "study_attitude", "special_observations"],
    "action_items": ["action_items"],
    "next_checkpoints": ["next_checkpoints"],
    "context_for_next": ["context_for_next"],
    "operator_notes": ["operator_notes"],
}


def _apply_sharing_filter(note_dict: dict, sharing: dict) -> dict:
    """sharing_settings 기반으로 비공유 항목을 제거한 dict 반환.

    V1 §6 + P3-①: 공유 OFF 로 가려진 필드는 None/[] 로 치환하되,
    어떤 필드가 "선배 판단으로 비공유" 인지 `_redacted_fields` 배열에 기록.
    상담사 UI 는 이 메타데이터를 이용해 "원래 빈 값"과 "비공유 처리"를 구분해
    배지로 표시할 수 있다.
    """
    filtered = dict(note_dict)
    redacted_fields: list[str] = []
    for toggle, fields in _SHARING_TOGGLE_TO_FIELDS.items():
        # operator_notes 의 기본값만 False, 나머지는 True
        default_value = False if toggle == "operator_notes" else True
        if sharing.get(toggle, default_value):
            continue
        for field in fields:
            # 원본 값이 존재했을 때만 redacted 로 간주 (빈 데이터 혼동 방지)
            original = note_dict.get(field)
            was_present = (
                original is not None
                and original != []
                and original != ""
                and original != {}
            )
            # 치환 (리스트 필드는 [], 그 외는 None)
            if isinstance(original, list):
                filtered[field] = []
            else:
                filtered[field] = None
            if was_present:
                redacted_fields.append(field)
    filtered["_redacted_fields"] = redacted_fields
    # 내부 리뷰 정보는 상담사에게 노출하지 않음
    filtered.pop("review_notes", None)
    filtered.pop("content_checklist", None)
    return filtered


@router.get("/student/{user_id}/senior-notes")
async def get_reviewed_senior_notes_for_student(
    user_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    상담사용: 학생의 리뷰 완료된 선배 상담 기록 조회.

    review_status='reviewed'인 기록만 반환하며,
    sharing_settings에 따라 비공유 항목은 제외됨.
    """
    uid = uuid.UUID(user_id)
    q = (
        select(SeniorConsultationNote)
        .where(
            SeniorConsultationNote.user_id == uid,
            SeniorConsultationNote.review_status == "reviewed",
        )
        .order_by(SeniorConsultationNote.consultation_date.desc())
    )
    result = await db.execute(q)
    notes = result.scalars().all()

    filtered_notes = []
    for note in notes:
        note_dict = _note_to_dict(note)
        sharing = note.sharing_settings or DEFAULT_SHARING_SETTINGS
        filtered_notes.append(_apply_sharing_filter(note_dict, sharing))

    # V1 §10-2: 상담사(또는 관리자)가 선배 노트 요약을 열람한 이력 감사 로그
    await log_consultation_data_access(
        db,
        viewer_admin_id=admin.id,
        viewer_role=admin.role,
        target_user_id=uid,
        access_type="counselor_views_senior_notes",
        source_type="senior_note",
        source_id=None,
        meta={"note_count": len(filtered_notes)},
    )

    return {"notes": filtered_notes}


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
# 이전 세션 체크포인트 조회 + 누적 요약
# ============================================================

@router.get("/student/{user_id}/prev-checkpoints")
async def get_prev_checkpoints(
    user_id: str,
    session_number: int = 1,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """이전 세션의 체크포인트 조회 (선배가 새 기록 작성 전 참조)"""
    uid = uuid.UUID(user_id)
    if session_number <= 1:
        return {"prev_checkpoints": [], "prev_action_items": []}

    prev_q = (
        select(SeniorConsultationNote)
        .where(
            SeniorConsultationNote.user_id == uid,
            SeniorConsultationNote.session_number == session_number - 1,
        )
        .order_by(SeniorConsultationNote.created_at.desc())
        .limit(1)
    )
    # P1-3: 선배 역할이면서 본인이 작성한 기록이 아닌 경우
    #       is_visible_to_next_senior == False 인 노트는 제외.
    #       super_admin / admin 은 모든 노트 조회 가능.
    if admin.role == "senior":
        from sqlalchemy import or_
        prev_q = prev_q.where(
            or_(
                SeniorConsultationNote.senior_id == admin.id,
                SeniorConsultationNote.is_visible_to_next_senior == True,  # noqa: E712
            )
        )
    result = await db.execute(prev_q)
    prev_note = result.scalar_one_or_none()
    if not prev_note:
        return {"prev_checkpoints": [], "prev_action_items": []}

    return {
        "prev_checkpoints": prev_note.next_checkpoints or [],
        "prev_action_items": prev_note.action_items or [],
        "prev_session_timing": prev_note.session_timing,
        "prev_consultation_date": prev_note.consultation_date.isoformat() if prev_note.consultation_date else None,
    }


@router.get("/student/{user_id}/cumulative-summary")
async def get_cumulative_summary(
    user_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    학생의 전체 선배 상담 기록을 누적 요약.

    세션별 주요 정보, 학생 상태 변화 추이, 실천 사항 이행 추적,
    핵심 주제 커버리지 등을 종합적으로 제공.
    """
    uid = uuid.UUID(user_id)
    q = (
        select(SeniorConsultationNote)
        .where(SeniorConsultationNote.user_id == uid)
        .order_by(SeniorConsultationNote.session_number.asc(), SeniorConsultationNote.consultation_date.asc())
    )
    # P1-3: 선배 역할이면 본인 기록 + is_visible_to_next_senior=True 인 타 선배 기록만 노출
    if admin.role == "senior":
        from sqlalchemy import or_
        q = q.where(
            or_(
                SeniorConsultationNote.senior_id == admin.id,
                SeniorConsultationNote.is_visible_to_next_senior == True,  # noqa: E712
            )
        )
    result = await db.execute(q)
    notes = result.scalars().all()

    if not notes:
        return {
            "user_id": user_id,
            "total_sessions": 0,
            "sessions": [],
            "mood_trend": [],
            "attitude_trend": [],
            "action_items_tracking": [],
            "topic_coverage": {},
        }

    # 세션별 요약 구성
    sessions = []
    mood_trend = []
    attitude_trend = []
    all_action_items = []  # (session_number, items)

    for note in notes:
        nd = _note_to_dict(note)
        session_summary = {
            "note_id": str(note.id),
            "session_number": note.session_number,
            "session_timing": note.session_timing,
            "consultation_date": note.consultation_date.isoformat() if note.consultation_date else None,
            "review_status": note.review_status,
            "core_topics_count": len(note.core_topics or []),
            "core_topics_covered": sum(
                1 for t in (note.core_topics or [])
                if t.get("progress_status") in ("충분히 다룸", "간단히 다룸")
            ),
            "optional_topics_covered": sum(
                1 for t in (note.optional_topics or [])
                if t.get("covered")
            ),
            "action_items_count": len(note.action_items or []),
            "has_special_observations": bool(note.special_observations),
            "student_mood": note.student_mood,
            "study_attitude": note.study_attitude,
            "key_content_summary": [
                t.get("key_content", "")
                for t in (note.core_topics or [])
                if t.get("key_content")
            ][:3],  # 상위 3개만
        }
        sessions.append(session_summary)

        # 상태 추이
        if note.student_mood:
            mood_trend.append({
                "session": note.session_timing or f"S{note.session_number}",
                "value": note.student_mood,
            })
        if note.study_attitude:
            attitude_trend.append({
                "session": note.session_timing or f"S{note.session_number}",
                "value": note.study_attitude,
            })

        # 실천 사항 추적
        if note.action_items:
            for item in note.action_items:
                all_action_items.append({
                    "session": note.session_timing or f"S{note.session_number}",
                    "session_number": note.session_number,
                    "action": item.get("action", ""),
                    "priority": item.get("priority", "중"),
                })

    # 실천 사항 이행 추적: 이전 세션의 action_items이 다음 세션의 체크포인트에 반영됐는지
    action_tracking = []
    for i, note in enumerate(notes):
        if not note.action_items:
            continue
        # 다음 세션이 있으면 다음 세션의 체크포인트와 비교
        next_note = notes[i + 1] if i + 1 < len(notes) else None
        next_checkpoints_text = ""
        if next_note and next_note.next_checkpoints:
            next_checkpoints_text = " ".join(
                c.get("checkpoint", "") for c in next_note.next_checkpoints
            )
        for item in note.action_items:
            action_text = item.get("action", "")
            # 간단한 키워드 매칭으로 이행 여부 추정
            followed_up = False
            if next_note:
                # 핵심 주제 key_content에서 관련 내용 찾기
                next_core_text = " ".join(
                    t.get("key_content", "") for t in (next_note.core_topics or [])
                )
                next_observations = next_note.special_observations or ""
                combined = next_core_text + next_checkpoints_text + next_observations
                # 실천 사항의 핵심 단어(3글자 이상)가 다음 세션에 언급되는지 체크
                keywords = [w for w in action_text.split() if len(w) >= 3]
                if keywords:
                    followed_up = any(kw in combined for kw in keywords[:3])

            action_tracking.append({
                "session": note.session_timing or f"S{note.session_number}",
                "action": action_text,
                "priority": item.get("priority", "중"),
                "followed_up": followed_up if next_note else None,  # None = 아직 다음 세션 없음
            })

    # 주제 커버리지: 전체 세션에서 다뤄진 핵심 주제들
    topic_coverage: dict[str, list] = {}
    for note in notes:
        session_label = note.session_timing or f"S{note.session_number}"
        for topic in (note.core_topics or []):
            topic_name = topic.get("topic", "")
            if topic_name not in topic_coverage:
                topic_coverage[topic_name] = []
            topic_coverage[topic_name].append({
                "session": session_label,
                "status": topic.get("progress_status", "미진행"),
            })

    # 학생 이름 조회
    user_result = await db.execute(select(User.name).where(User.id == uid))
    user_name = user_result.scalar_one_or_none() or "알 수 없음"

    return {
        "user_id": user_id,
        "user_name": user_name,
        "total_sessions": len(notes),
        "sessions": sessions,
        "mood_trend": mood_trend,
        "attitude_trend": attitude_trend,
        "action_items_tracking": action_tracking,
        "all_action_items": all_action_items,
        "topic_coverage": topic_coverage,
        "latest_session": _note_to_dict(notes[-1]) if notes else None,
    }


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

    연계규칙 V1 §3-4 / §6:
    - 상담사 설문의 답변을 선배에게 공유할 때 추상화 변환
    - **관리자 선배 공유 검토(senior_review_status='reviewed')를 통과한 설문만 노출**
    - 상담사 ConsultationNote 의 next_senior_context 역시 reviewed 이고 토글 허용 시만
    - D8, F, G 등 민감정보는 시스템적으로 비공유 (senior_sharing_service.BLOCKED_CATEGORIES)
    """
    uid = uuid.UUID(user_id)

    # 학생의 최신 submitted + senior_review='reviewed' + 학생 철회되지 않은 상담사 설문 조회
    # V1 §10-1: 학생이 사후 철회한 경우 revoked_at 세팅 → 선배 비노출
    survey_q = (
        select(ConsultationSurvey)
        .where(
            ConsultationSurvey.user_id == uid,
            ConsultationSurvey.status == "submitted",
            ConsultationSurvey.senior_review_status == "reviewed",
            ConsultationSurvey.senior_sharing_revoked_at.is_(None),
        )
        .order_by(ConsultationSurvey.submitted_at.desc())
        .limit(1)
    )
    survey_result = await db.execute(survey_q)
    survey = survey_result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=404,
            detail="선배에게 공유 가능한 상담사 설문이 없습니다 (관리자 검토 미완료)",
        )

    # 레이더 점수 산출
    answers = survey.answers or {}
    radar = compute_radar_scores(answers, survey.timing)

    # 추상화 변환 (V1 §6 토글 반영)
    survey_sharing = survey.senior_sharing_settings or DEFAULT_SURVEY_SENIOR_SHARING
    abstracted = abstract_consultation_for_senior(
        answers=answers,
        radar_scores=radar,
        timing=survey.timing,
        sharing=survey_sharing,
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

    # V1 §6: 상담사 ConsultationNote — senior_review_status='reviewed' + next_senior_context 토글 ON
    # V1 §10-1: 학생이 사후 철회한 경우 revoked_at 세팅 → 선배 비노출
    # (is_visible_to_user 는 학생 공개 플래그이므로 사용하지 않는다)
    counselor_note_q = (
        select(ConsultationNote)
        .where(
            ConsultationNote.user_id == uid,
            ConsultationNote.senior_review_status == "reviewed",
            ConsultationNote.senior_sharing_revoked_at.is_(None),
        )
        .order_by(ConsultationNote.consultation_date.desc())
        .limit(1)
    )
    counselor_note = (
        await db.execute(counselor_note_q)
    ).scalar_one_or_none()

    counselor_next_senior_context: str | None = None
    counselor_note_date: str | None = None
    counselor_note_category: str | None = None
    if counselor_note is not None:
        note_sharing = counselor_note.senior_sharing_settings or DEFAULT_NOTE_SENIOR_SHARING
        if note_sharing.get("next_senior_context", True):
            counselor_next_senior_context = getattr(
                counselor_note, "next_senior_context", None
            )
        counselor_note_date = (
            counselor_note.consultation_date.isoformat()
            if counselor_note.consultation_date
            else None
        )
        counselor_note_category = counselor_note.category

    # 감사 로그: 선배(또는 관리자)가 상담사 요약을 열람했음을 기록
    await log_consultation_data_access(
        db,
        viewer_admin_id=admin.id,
        viewer_role=admin.role,
        target_user_id=uid,
        access_type="senior_views_counselor_summary",
        source_type="survey",
        source_id=survey.id,
        meta={
            "sharing_settings": survey_sharing,
            "counselor_note_id": str(counselor_note.id) if counselor_note else None,
        },
    )

    return {
        "user_id": user_id,
        "survey_type": survey.survey_type,
        "timing": survey.timing,
        "abstracted_summary": abstracted,
        "prev_senior_context": prev_note.context_for_next if prev_note else None,
        "prev_senior_session": prev_note.session_timing if prev_note else None,
        "counselor_next_senior_context": counselor_next_senior_context,
        "counselor_note_date": counselor_note_date,
        "counselor_note_category": counselor_note_category,
    }


# ============================================================
# 상담사 측 타임라인 조회 (V1 §10-2 — 공유 추적/철회 범위 식별)
# ============================================================

# 시점 라벨 → 정렬 순서 (T1~T4 / S1~S4 공통)
_TIMING_ORDER: dict[str, int] = {
    "T1": 1, "T2": 2, "T3": 3, "T4": 4,
    "S1": 1, "S2": 2, "S3": 3, "S4": 4,
}


def _timing_sort_key(timing: str | None) -> int:
    """timing 문자열을 정렬 키로 변환. 알 수 없는 값은 뒤로."""
    if not timing:
        return 99
    return _TIMING_ORDER.get(timing, 99)


@router.get("/student/{user_id}/counselor-timeline")
async def get_counselor_timeline_for_senior(
    user_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    학생 1명에 대해 **현재 선배에게 공유되고 있는 상담사 측 데이터의 시점 순 타임라인**.

    연계규칙 V1 §10-2:
    - 선배가 "어떤 시점의 데이터가 공유 중인지" 한눈에 파악하고,
      학생이 철회했을 때 어느 범위가 숨어야 하는지 식별할 수 있도록 한다.
    - 응답에는 effectively_visible (review=reviewed AND revoked_at IS NULL) 를 함께 반환.

    권한:
    - super_admin / admin / counselor : 모든 학생 조회 가능
    - senior : 본인 담당 학생(SeniorStudentAssignment) 만
    """
    uid = uuid.UUID(user_id)

    # 선배 역할은 담당 학생 검증
    if admin.role == "senior":
        assign_result = await db.execute(
            select(SeniorStudentAssignment).where(
                SeniorStudentAssignment.senior_id == admin.id,
                SeniorStudentAssignment.user_id == uid,
            )
        )
        if assign_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=403, detail="담당 학생이 아닙니다")

    items: list[dict] = []

    # 상담사 설문 (submitted + reviewed — 철회 포함하여 반환하되 effectively_visible 로 구분)
    survey_q = (
        select(ConsultationSurvey)
        .where(
            ConsultationSurvey.user_id == uid,
            ConsultationSurvey.status == "submitted",
            ConsultationSurvey.senior_review_status == "reviewed",
        )
    )
    for survey in (await db.execute(survey_q)).scalars().all():
        items.append({
            "source_type": "survey",
            "id": str(survey.id),
            "timing": survey.timing,
            "consultation_date": None,
            "submitted_at": (
                survey.submitted_at.isoformat() if survey.submitted_at else None
            ),
            "senior_review_status": survey.senior_review_status,
            "senior_reviewed_at": (
                survey.senior_reviewed_at.isoformat()
                if survey.senior_reviewed_at else None
            ),
            "revoked_at": (
                survey.senior_sharing_revoked_at.isoformat()
                if survey.senior_sharing_revoked_at else None
            ),
            "effectively_visible": survey.senior_sharing_revoked_at is None,
            "sharing_settings": survey.senior_sharing_settings,
            "created_at": (
                survey.created_at.isoformat() if survey.created_at else None
            ),
            # 정렬 보조
            "_timing_sort": _timing_sort_key(survey.timing),
            "_date_sort": survey.submitted_at or survey.created_at or datetime.min,
        })

    # 상담사 노트 (reviewed)
    note_q = (
        select(ConsultationNote)
        .where(
            ConsultationNote.user_id == uid,
            ConsultationNote.senior_review_status == "reviewed",
        )
    )
    for note in (await db.execute(note_q)).scalars().all():
        note_dt = datetime.combine(note.consultation_date, datetime.min.time()) \
            if note.consultation_date else (note.created_at or datetime.min)
        items.append({
            "source_type": "note",
            "id": str(note.id),
            "timing": note.timing,
            "consultation_date": (
                note.consultation_date.isoformat() if note.consultation_date else None
            ),
            "submitted_at": None,
            "senior_review_status": note.senior_review_status,
            "senior_reviewed_at": (
                note.senior_reviewed_at.isoformat()
                if note.senior_reviewed_at else None
            ),
            "revoked_at": (
                note.senior_sharing_revoked_at.isoformat()
                if note.senior_sharing_revoked_at else None
            ),
            "effectively_visible": note.senior_sharing_revoked_at is None,
            "sharing_settings": note.senior_sharing_settings,
            "category": note.category,
            "created_at": (
                note.created_at.isoformat() if note.created_at else None
            ),
            "_timing_sort": _timing_sort_key(note.timing),
            "_date_sort": note_dt,
        })

    # 정렬: timing → 날짜(submitted_at / consultation_date) → created_at (오래된 순)
    items.sort(key=lambda it: (it["_timing_sort"], it["_date_sort"]))

    # 내부 정렬 키 제거
    for it in items:
        it.pop("_timing_sort", None)
        it.pop("_date_sort", None)

    # 감사 로그
    await log_consultation_data_access(
        db,
        viewer_admin_id=admin.id,
        viewer_role=admin.role,
        target_user_id=uid,
        access_type="senior_views_counselor_timeline",
        source_type=None,
        source_id=None,
        meta={"item_count": len(items)},
    )

    return {
        "user_id": user_id,
        "items": items,
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
