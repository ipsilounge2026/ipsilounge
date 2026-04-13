"""
관리자용 사전 상담 설문 API

- 설문 목록 조회 (필터: survey_type, status, 검색)
- 설문 상세 조회 (답변 + 스키마 포함)
- 자동 계산 (내신 추이, 모의고사 추이, 학습시간 분석)
- Delta diff (이전 상담 대비 변경점)
- 상담사 메모 CRUD
- 상담사 초안 편집 (점수/코멘트 override)
- 상담사 체크리스트 CRUD
- 예비고1 → 고1 전환 (데이터 연계)
- PDF 리포트 다운로드
- 액션 플랜 CRUD
"""

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.consultation_survey import ConsultationSurvey
from app.models.user import User
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/surveys", tags=["관리자-사전설문"])


# ---- 설문 목록 ----

@router.get("")
async def list_surveys(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    survey_type: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None, description="학생 이름 또는 이메일 검색"),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설문 목록 조회 (관리자용)"""
    base = select(ConsultationSurvey).join(User, ConsultationSurvey.user_id == User.id)

    if survey_type:
        base = base.where(ConsultationSurvey.survey_type == survey_type)
    if status:
        base = base.where(ConsultationSurvey.status == status)
    if search:
        pattern = f"%{search}%"
        base = base.where((User.name.ilike(pattern)) | (User.email.ilike(pattern)))

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        base.order_by(ConsultationSurvey.updated_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(q)).scalars().all()

    user_ids = list({r.user_id for r in rows})
    users_map: dict[uuid.UUID, User] = {}
    if user_ids:
        uresult = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in uresult.scalars().all():
            users_map[u.id] = u

    items = []
    for s in rows:
        u = users_map.get(s.user_id)
        items.append({
            "id": str(s.id),
            "user_id": str(s.user_id),
            "user_name": u.name if u else "?",
            "user_email": u.email if u else "",
            "user_phone": u.phone if u else "",
            "survey_type": s.survey_type,
            "timing": s.timing,
            "mode": s.mode,
            "status": s.status,
            "has_admin_memo": bool(s.admin_memo),
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        })

    return {"items": items, "total": total}


# ---- 설문 상세 ----

@router.get("/{survey_id}")
async def get_survey_detail(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설문 상세 조회 (관리자용) - 답변 + 스키마 + 자동 계산 + 메모"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    uresult = await db.execute(select(User).where(User.id == survey.user_id))
    user = uresult.scalar_one_or_none()

    from app.surveys.schema_loader import load_schema
    try:
        schema = load_schema(survey.survey_type)
    except Exception:
        schema = None

    # 자동 계산 + 상담사 override 병합
    computed = _compute_stats(survey.survey_type, survey.answers, survey.timing)
    computed = _merge_overrides(computed, survey.counselor_overrides)

    return {
        "id": str(survey.id),
        "user_id": str(survey.user_id),
        "user_name": user.name if user else "?",
        "user_email": user.email if user else "",
        "user_phone": user.phone if user else "",
        "survey_type": survey.survey_type,
        "timing": survey.timing,
        "mode": survey.mode,
        "status": survey.status,
        "answers": survey.answers,
        "category_status": survey.category_status,
        "last_category": survey.last_category,
        "last_question": survey.last_question,
        "started_platform": survey.started_platform,
        "last_edited_platform": survey.last_edited_platform,
        "schema_version": survey.schema_version,
        "booking_id": str(survey.booking_id) if survey.booking_id else None,
        "note": survey.note,
        "admin_memo": survey.admin_memo,
        "counselor_overrides": survey.counselor_overrides,
        "counselor_checklist": survey.counselor_checklist,
        "source_survey_id": str(survey.source_survey_id) if survey.source_survey_id else None,
        "preserved_data": survey.preserved_data,
        "created_at": survey.created_at.isoformat(),
        "updated_at": survey.updated_at.isoformat(),
        "submitted_at": survey.submitted_at.isoformat() if survey.submitted_at else None,
        "schema": schema,
        "computed": computed,
    }


# ---- 자동 계산 (별도 엔드포인트) ----

@router.get("/{survey_id}/computed")
async def get_computed_stats(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설문 답변 기반 자동 계산 결과 (상담사 override 포함)"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    computed = _compute_stats(survey.survey_type, survey.answers, survey.timing)
    return _merge_overrides(computed, survey.counselor_overrides)


# ---- Delta Diff ----

@router.get("/{survey_id}/delta")
async def get_delta_diff(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """이전 설문 대비 변경점 (같은 user + survey_type, 시간순 비교)"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    current = result.scalar_one_or_none()
    if not current:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    # 같은 사용자의 같은 타입 이전 설문 찾기
    prev_q = (
        select(ConsultationSurvey)
        .where(
            ConsultationSurvey.user_id == current.user_id,
            ConsultationSurvey.survey_type == current.survey_type,
            ConsultationSurvey.id != current.id,
            ConsultationSurvey.created_at < current.created_at,
        )
        .order_by(ConsultationSurvey.created_at.desc())
        .limit(1)
    )
    prev_result = await db.execute(prev_q)
    previous = prev_result.scalar_one_or_none()

    if not previous:
        return {"has_previous": False, "diff": {}, "summary": "이전 설문이 없습니다."}

    diff = _compute_delta(previous.answers, current.answers)

    return {
        "has_previous": True,
        "previous_id": str(previous.id),
        "previous_timing": previous.timing,
        "previous_submitted_at": previous.submitted_at.isoformat() if previous.submitted_at else None,
        "diff": diff,
        "summary": _summarize_delta(diff),
    }


# ---- 상담사 메모 ----

class MemoRequest(BaseModel):
    admin_memo: str


@router.put("/{survey_id}/memo")
async def update_memo(
    survey_id: uuid.UUID,
    data: MemoRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담사 메모 저장/수정"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    survey.admin_memo = data.admin_memo
    await db.commit()
    return {"ok": True, "admin_memo": survey.admin_memo}


@router.delete("/{survey_id}/memo")
async def delete_memo(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담사 메모 삭제"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    survey.admin_memo = None
    await db.commit()
    return {"ok": True}


# ---- PDF 리포트 ----

@router.get("/{survey_id}/report")
async def download_report_pdf(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설문 리포트 PDF 다운로드"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    uresult = await db.execute(select(User).where(User.id == survey.user_id))
    user = uresult.scalar_one_or_none()

    from app.surveys.schema_loader import load_schema
    try:
        schema = load_schema(survey.survey_type)
    except Exception:
        schema = None

    computed = _compute_stats(survey.survey_type, survey.answers, survey.timing)
    computed = _merge_overrides(computed, survey.counselor_overrides)

    survey_dict = {
        "survey_type": survey.survey_type,
        "timing": survey.timing,
        "mode": survey.mode,
        "status": survey.status,
        "answers": survey.answers,
        "admin_memo": None,  # 상담사 메모는 리포트에 포함하지 않음
        "submitted_at": survey.submitted_at.isoformat() if survey.submitted_at else None,
    }
    user_info = {
        "name": user.name if user else "?",
        "email": user.email if user else "",
    }

    from app.services.survey_report_service import generate_survey_report_pdf
    try:
        pdf_bytes = generate_survey_report_pdf(survey_dict, user_info, schema, computed)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF 생성 실패: {str(e)}")

    student_name = user.name if user else "unknown"
    filename = f"{student_name}_survey_report.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---- 액션 플랜 ----

class ActionItem(BaseModel):
    id: str | None = None
    content: str
    deadline: str | None = None
    responsible: str | None = Field(None, description="담당자 (student/parent/counselor)")
    completed: bool = False


class ActionPlanRequest(BaseModel):
    items: list[ActionItem]
    note: str | None = None


@router.get("/{survey_id}/action-plan")
async def get_action_plan(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설문에 연결된 액션 플랜 조회"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    return survey.action_plan or {}


@router.put("/{survey_id}/action-plan")
async def update_action_plan(
    survey_id: uuid.UUID,
    data: ActionPlanRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """액션 플랜 저장/수정"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    # 각 아이템에 ID 부여
    items = []
    for i, item in enumerate(data.items):
        items.append({
            "id": item.id or f"ap_{i+1}",
            "content": item.content,
            "deadline": item.deadline,
            "responsible": item.responsible,
            "completed": item.completed,
        })

    plan = {
        "items": items,
        "note": data.note,
        "updated_at": datetime.utcnow().isoformat(),
        "updated_by": str(admin.id),
    }
    survey.action_plan = plan
    await db.commit()
    return plan


# ---- 상담사 초안 편집 (override) ----

class OverrideRequest(BaseModel):
    overrides: dict = Field(..., description="자동 분석 초안 대비 수정 값 (점수, 코멘트 등)")


@router.put("/{survey_id}/overrides")
async def update_overrides(
    survey_id: uuid.UUID,
    data: OverrideRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담사가 자동 분석 초안의 점수/코멘트를 수정 저장"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    # 기존 override가 있으면 병합, 없으면 새로 설정
    existing = survey.counselor_overrides or {}
    existing.update(data.overrides)
    existing["_updated_at"] = datetime.utcnow().isoformat()
    existing["_updated_by"] = str(admin.id)
    survey.counselor_overrides = existing
    await db.commit()
    return {"ok": True, "counselor_overrides": survey.counselor_overrides}


@router.delete("/{survey_id}/overrides")
async def delete_overrides(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담사 override 초기화 (자동 분석 원본으로 복원)"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    survey.counselor_overrides = None
    await db.commit()
    return {"ok": True}


# ---- 상담사 체크리스트 ----

class ChecklistItem(BaseModel):
    content: str
    checked: bool = False


class ChecklistRequest(BaseModel):
    items: list[ChecklistItem]


@router.put("/{survey_id}/checklist")
async def update_checklist(
    survey_id: uuid.UUID,
    data: ChecklistRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담사 체크리스트 저장 (상담 전 확인 사항, 리포트 미포함)"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    survey.counselor_checklist = {
        "items": [{"content": item.content, "checked": item.checked} for item in data.items],
        "updated_at": datetime.utcnow().isoformat(),
        "updated_by": str(admin.id),
    }
    await db.commit()
    return {"ok": True, "counselor_checklist": survey.counselor_checklist}


@router.delete("/{survey_id}/checklist")
async def delete_checklist(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담사 체크리스트 삭제"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    survey.counselor_checklist = None
    await db.commit()
    return {"ok": True}


# ---- 예비고1 → 고1 전환 ----

# 예비고1 → 고등학교 T1 카테고리 매핑
_PREHEIGH1_TO_HIGH_MAP = {
    # 예비고1 카테고리 → 고등학교 T1 카테고리
    "A": "A",   # 기본 정보 → 기본 정보
    "B": "E",   # 진로 & 대입 방향성 → 진로·전형 전략
    "D": "D",   # 학습 습관 → 학습 습관·전략
    "G": "F",   # 학부모 관점 → 학부모 설문
    # C (중학교 성적) → preserved_data (참고용 보존)
    # E (과목별 역량 진단) → preserved_data (비교 데이터로 보존)
    # F (비교과 & 역량) → preserved_data (참고용 보존)
}


@router.post("/{survey_id}/convert-to-high")
async def convert_preheigh1_to_high(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """예비고1 설문을 고등학교 T1 설문으로 전환 (Delta 방식)

    - 매핑 가능한 카테고리는 자동 pre-fill
    - 예비고1 E영역(과목별 역량 진단), C(성적), F(비교과)는 preserved_data로 보존
    - 고등학교 전용 영역(B 내신, C 모의고사)은 빈 상태로 생성
    """
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="원본 설문을 찾을 수 없습니다")

    if source.survey_type != "preheigh1":
        raise HTTPException(status_code=400, detail="예비고1 설문만 전환할 수 있습니다")

    if source.status != "submitted":
        raise HTTPException(status_code=400, detail="제출 완료된 설문만 전환할 수 있습니다")

    # 이미 전환된 설문이 있는지 확인
    existing = await db.execute(
        select(ConsultationSurvey).where(
            ConsultationSurvey.source_survey_id == source.id,
            ConsultationSurvey.survey_type == "high",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 전환된 고등학교 설문이 존재합니다")

    # 카테고리 매핑으로 answers 구성
    src_answers = source.answers or {}
    high_answers: dict[str, Any] = {}

    for src_cat, dst_cat in _PREHEIGH1_TO_HIGH_MAP.items():
        if src_cat in src_answers:
            high_answers[dst_cat] = src_answers[src_cat]

    # 보존 데이터 (비교 상담용)
    preserved = {
        "converted_at": datetime.utcnow().isoformat(),
        "converted_by": str(admin.id),
        "source_survey_type": "preheigh1",
    }
    # E영역 (과목별 역량 진단) — 중학교↔고등학교 비교 데이터
    if "E" in src_answers:
        preserved["preheigh1_E"] = src_answers["E"]
    # C영역 (중학교 성적) — 참고용 보존
    if "C" in src_answers:
        preserved["preheigh1_C"] = src_answers["C"]
    # F영역 (비교과 & 역량) — 참고용 보존
    if "F" in src_answers:
        preserved["preheigh1_F"] = src_answers["F"]

    # 카테고리 상태 설정 (매핑된 카테고리는 in_progress, 신규는 not_started)
    category_status: dict[str, str] = {}
    for dst_cat in _PREHEIGH1_TO_HIGH_MAP.values():
        if dst_cat in high_answers:
            category_status[dst_cat] = "in_progress"  # 사전 입력됨, 확인 필요
    # 고등학교 전용 영역은 not_started
    for cat in ["B", "C"]:  # B: 내신, C: 모의고사
        if cat not in category_status:
            category_status[cat] = "not_started"

    # 새 고등학교 T1 설문 생성
    new_survey = ConsultationSurvey(
        user_id=source.user_id,
        survey_type="high",
        timing="T1",
        mode="delta",  # 예비고1에서 전환된 Delta 모드
        answers=high_answers,
        category_status=category_status,
        status="draft",
        started_platform="web",
        last_edited_platform="web",
        source_survey_id=source.id,
        preserved_data=preserved,
    )

    db.add(new_survey)
    await db.commit()
    await db.refresh(new_survey)

    return {
        "ok": True,
        "new_survey_id": str(new_survey.id),
        "mapped_categories": list(_PREHEIGH1_TO_HIGH_MAP.values()),
        "preserved_categories": ["E", "C", "F"],
        "new_categories": ["B", "C"],
        "message": "예비고1 설문이 고등학교 T1 설문으로 전환되었습니다. 학생이 추가 입력을 진행해야 합니다.",
    }


# ============================================================
# 자동 계산 헬퍼
# ============================================================

def _merge_overrides(computed: dict, overrides: dict | None) -> dict:
    """자동 계산 결과에 상담사 override를 병합.

    override 키가 computed에 존재하면 해당 값을 덮어씀.
    override에 _updated_at, _updated_by 메타 키가 있으면 has_overrides 플래그 추가.
    """
    if not overrides:
        return computed

    result = dict(computed)
    has_changes = False

    for key, value in overrides.items():
        if key.startswith("_"):
            continue  # 메타 키 제외
        result[key] = value
        has_changes = True

    if has_changes:
        result["has_overrides"] = True
        result["override_updated_at"] = overrides.get("_updated_at")
        result["override_updated_by"] = overrides.get("_updated_by")

    return result


def _safe_float(v: Any) -> float | None:
    """값을 float로 변환. 실패 시 None."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _compute_stats(survey_type: str, answers: dict, timing: str | None = None) -> dict:
    """답변 데이터에서 자동 계산 통계 생성."""
    if survey_type == "high":
        result = _compute_high(answers)
        # 4영역 점수 산출 (기획서 V3 — 4각형 레이더)
        from app.services.survey_scoring_service import compute_radar_scores, generate_high_roadmap
        radar = compute_radar_scores(answers, timing)
        result["radar_scores"] = radar
        # 로드맵 자동 초안 생성 (timing별 Phase × 4트랙)
        result["roadmap"] = generate_high_roadmap(
            naesin=radar["naesin"], mock=radar["mock"],
            study=radar["study"], career=radar["career"],
            timing=timing,
        )
        return result
    elif survey_type == "preheigh1":
        result = _compute_preheigh1(answers)
        # 5영역 점수 산출 (기획서 V2 — 5각형 레이더)
        from app.services.survey_scoring_service import compute_preheigh1_radar_scores
        result["radar_scores"] = compute_preheigh1_radar_scores(answers)
        return result
    return {}


def _compute_high(answers: dict) -> dict:
    """고등학생 설문 자동 계산."""
    result: dict[str, Any] = {}

    # --- 내신 추이 (카테고리 B: B1~B4) ---
    cat_b = answers.get("B", {})
    semesters = ["B1", "B2", "B3", "B4"]
    semester_labels = ["고1-1", "고1-2", "고2-1", "고2-2"]
    subjects = ["ko", "en", "ma", "sc1", "sc2", "so"]
    subject_names = {"ko": "국어", "en": "영어", "ma": "수학", "sc1": "탐구1", "sc2": "탐구2", "so": "사회"}

    grade_trend: list[dict] = []
    subject_trends: dict[str, list] = {s: [] for s in subjects}
    grade_dist: list[dict] = []

    for i, sem_key in enumerate(semesters):
        sem_data = cat_b.get(sem_key)
        if not sem_data or not isinstance(sem_data, dict):
            continue

        sem_grades = []
        dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for subj in subjects:
            subj_data = sem_data.get(subj, {})
            if not isinstance(subj_data, dict):
                continue
            grade = _safe_float(subj_data.get("rank_grade"))
            if grade is not None:
                sem_grades.append(grade)
                g = min(5, max(1, round(grade)))
                dist[g] = dist.get(g, 0) + 1
                subject_trends[subj].append({"semester": semester_labels[i], "grade": grade})

        if sem_grades:
            avg = round(sum(sem_grades) / len(sem_grades), 2)
            grade_trend.append({"semester": semester_labels[i], "avg_grade": avg, "subject_count": len(sem_grades)})
            grade_dist.append({"semester": semester_labels[i], **dist})

    # 추이 판정
    trend_badge = _detect_trend([p["avg_grade"] for p in grade_trend], lower_is_better=True)

    result["grade_trend"] = {
        "data": grade_trend,
        "trend_badge": trend_badge,
        "subject_trends": {
            subject_names.get(k, k): v for k, v in subject_trends.items() if v
        },
        "grade_distribution": grade_dist,
    }

    # --- 모의고사 추이 (카테고리 C: C1) ---
    cat_c = answers.get("C", {})
    mock_data = cat_c.get("C1")
    if mock_data and isinstance(mock_data, dict):
        areas = ["korean", "math", "english", "inquiry1", "inquiry2"]
        area_names = {"korean": "국어", "math": "수학", "english": "영어", "inquiry1": "탐구1", "inquiry2": "탐구2"}
        mock_trends: dict[str, list] = {a: [] for a in areas}
        avg_trend: list[dict] = []

        for session_key, session in mock_data.items():
            if not isinstance(session, dict):
                continue
            session_grades = []
            for area in areas:
                area_data = session.get(area, {})
                if not isinstance(area_data, dict):
                    continue
                rank = _safe_float(area_data.get("rank"))
                if rank is not None:
                    mock_trends[area].append({"session": session_key, "rank": rank})
                    session_grades.append(rank)
            if session_grades:
                avg_trend.append({"session": session_key, "avg_rank": round(sum(session_grades) / len(session_grades), 2)})

        mock_badge = _detect_trend([p["avg_rank"] for p in avg_trend], lower_is_better=True)

        # 취약 영역 감지
        weak_areas = []
        if avg_trend:
            overall_avg = sum(p["avg_rank"] for p in avg_trend) / len(avg_trend)
            for area, data in mock_trends.items():
                if data:
                    area_avg = sum(d["rank"] for d in data) / len(data)
                    if area_avg > overall_avg + 1.5:
                        weak_areas.append({"area": area_names.get(area, area), "avg_rank": round(area_avg, 2), "gap": round(area_avg - overall_avg, 2)})

        result["mock_trend"] = {
            "avg_trend": avg_trend,
            "trend_badge": mock_badge,
            "area_trends": {area_names.get(k, k): v for k, v in mock_trends.items() if v},
            "weak_areas": weak_areas,
        }

    # --- 학습 시간 분석 (카테고리 D: D1) ---
    result["study_analysis"] = _compute_study_analysis(answers.get("D", {}))

    return result


def _compute_preheigh1(answers: dict) -> dict:
    """예비고1 설문 자동 계산."""
    result: dict[str, Any] = {}

    # --- 중학교 성적 추이 (카테고리 C: C1~C6) ---
    cat_c = answers.get("C", {})
    semesters = ["C1", "C2", "C3", "C4", "C5", "C6"]
    semester_labels = ["중1-1", "중1-2", "중2-1", "중2-2", "중3-1", "중3-2"]
    subjects = ["ko", "en", "ma", "so", "sc"]
    subject_names = {"ko": "국어", "en": "영어", "ma": "수학", "so": "사회", "sc": "과학"}

    score_trend: list[dict] = []
    subject_trends: dict[str, list] = {s: [] for s in subjects}

    for i, sem_key in enumerate(semesters):
        sem_data = cat_c.get(sem_key)
        if not sem_data or not isinstance(sem_data, dict):
            continue

        sem_scores = []
        for subj in subjects:
            subj_data = sem_data.get(subj, {})
            if not isinstance(subj_data, dict):
                continue
            raw = _safe_float(subj_data.get("raw_score"))
            if raw is not None:
                sem_scores.append(raw)
                avg = _safe_float(subj_data.get("subject_avg"))
                subject_trends[subj].append({
                    "semester": semester_labels[i],
                    "raw_score": raw,
                    "subject_avg": avg,
                    "diff": round(raw - avg, 1) if avg is not None else None,
                })

        if sem_scores:
            score_trend.append({
                "semester": semester_labels[i],
                "avg_score": round(sum(sem_scores) / len(sem_scores), 1),
                "subject_count": len(sem_scores),
            })

    trend_badge = _detect_trend([p["avg_score"] for p in score_trend], lower_is_better=False)

    result["grade_trend"] = {
        "data": score_trend,
        "trend_badge": trend_badge,
        "subject_trends": {subject_names.get(k, k): v for k, v in subject_trends.items() if v},
    }

    # --- 학습 시간 분석 (카테고리 D: D1) ---
    result["study_analysis"] = _compute_study_analysis(answers.get("D", {}))

    return result


def _compute_study_analysis(cat_d: dict) -> dict:
    """학습 스케줄 분석 (preheigh1/high 공통)."""
    d1 = cat_d.get("D1")
    if not d1:
        return {}

    # D1이 composite인 경우 schedule 필드에 있을 수 있음
    schedule = d1 if isinstance(d1, list) else d1.get("schedule") if isinstance(d1, dict) else None
    if not schedule or not isinstance(schedule, list):
        return {}

    total_hours = 0.0
    by_subject: dict[str, float] = {}
    by_type: dict[str, float] = {}  # 학원/과제/자기주도

    for entry in schedule:
        if not isinstance(entry, dict):
            continue
        hours = _safe_float(entry.get("hours"))
        if hours is None:
            continue
        total_hours += hours
        subj = entry.get("subject", "기타")
        by_subject[subj] = by_subject.get(subj, 0) + hours
        etype = entry.get("type", "자기주도")
        by_type[etype] = by_type.get(etype, 0) + hours

    if total_hours == 0:
        return {}

    self_study = by_type.get("자기주도", 0)
    return {
        "total_weekly_hours": round(total_hours, 1),
        "by_subject": {k: round(v, 1) for k, v in sorted(by_subject.items(), key=lambda x: -x[1])},
        "by_type": {k: round(v, 1) for k, v in by_type.items()},
        "self_study_ratio": round(self_study / total_hours * 100, 1) if total_hours else 0,
        "subject_balance": _calc_balance_index(list(by_subject.values())),
    }


def _calc_balance_index(values: list[float]) -> float:
    """과목 밸런스 지수 (0~100, 높을수록 균등)."""
    if not values or len(values) < 2:
        return 100.0
    avg = sum(values) / len(values)
    if avg == 0:
        return 100.0
    variance = sum((v - avg) ** 2 for v in values) / len(values)
    cv = (variance ** 0.5) / avg  # coefficient of variation
    return round(max(0, 100 - cv * 100), 1)


def _detect_trend(values: list[float], lower_is_better: bool = False) -> str:
    """추이 판정: 상승/하락/유지/등락/V자반등/역V자."""
    if len(values) < 2:
        return "데이터부족"

    diffs = [values[i + 1] - values[i] for i in range(len(values) - 1)]
    threshold = 0.3 if lower_is_better else 3.0  # 등급 0.3 / 점수 3점

    ups = sum(1 for d in diffs if d > threshold)
    downs = sum(1 for d in diffs if d < -threshold)
    total = len(diffs)

    if lower_is_better:
        ups, downs = downs, ups  # 등급은 낮을수록 좋음

    if len(values) >= 3:
        # V자 반등: 하락 후 상승
        mid = len(values) // 2
        first_half = values[:mid + 1]
        second_half = values[mid:]
        if lower_is_better:
            if max(first_half) > max(second_half) and first_half[-1] > first_half[0] and second_half[-1] < second_half[0]:
                return "V자반등"
            if min(first_half) < min(second_half) and first_half[-1] < first_half[0] and second_half[-1] > second_half[0]:
                return "역V자"
        else:
            if min(first_half) < min(second_half) and first_half[-1] < first_half[0] and second_half[-1] > second_half[0]:
                return "V자반등"
            if max(first_half) > max(second_half) and first_half[-1] > first_half[0] and second_half[-1] < second_half[0]:
                return "역V자"

    if ups > 0 and downs == 0:
        return "상승"
    elif downs > 0 and ups == 0:
        return "하락"
    elif ups == 0 and downs == 0:
        return "유지"
    else:
        return "등락"


# ============================================================
# Delta Diff 헬퍼
# ============================================================

def _compute_delta(prev_answers: dict, curr_answers: dict) -> dict:
    """카테고리별 변경점 계산."""
    diff: dict[str, dict] = {}

    all_cats = set(prev_answers.keys()) | set(curr_answers.keys())
    for cat_id in sorted(all_cats):
        prev_cat = prev_answers.get(cat_id, {})
        curr_cat = curr_answers.get(cat_id, {})
        if not isinstance(prev_cat, dict):
            prev_cat = {}
        if not isinstance(curr_cat, dict):
            curr_cat = {}

        cat_diff: dict[str, dict] = {}
        all_qs = set(prev_cat.keys()) | set(curr_cat.keys())
        for q_id in sorted(all_qs):
            prev_val = prev_cat.get(q_id)
            curr_val = curr_cat.get(q_id)
            if prev_val != curr_val:
                cat_diff[q_id] = {
                    "prev": prev_val,
                    "curr": curr_val,
                    "change_type": _classify_change(prev_val, curr_val),
                }

        if cat_diff:
            diff[cat_id] = cat_diff

    return diff


def _classify_change(prev: Any, curr: Any) -> str:
    """변경 유형 분류."""
    if prev is None:
        return "added"
    if curr is None:
        return "removed"
    if isinstance(prev, (int, float)) and isinstance(curr, (int, float)):
        if curr > prev:
            return "increased"
        elif curr < prev:
            return "decreased"
    return "modified"


def _summarize_delta(diff: dict) -> str:
    """Delta 변경 요약 텍스트 생성."""
    if not diff:
        return "변경 사항이 없습니다."

    total_changes = sum(len(questions) for questions in diff.values())
    cat_count = len(diff)
    added = sum(1 for cat in diff.values() for q in cat.values() if q.get("change_type") == "added")
    modified = sum(1 for cat in diff.values() for q in cat.values() if q.get("change_type") in ("modified", "increased", "decreased"))
    removed = sum(1 for cat in diff.values() for q in cat.values() if q.get("change_type") == "removed")

    parts = []
    parts.append(f"{cat_count}개 카테고리에서 총 {total_changes}개 항목 변경")
    if added:
        parts.append(f"신규 {added}개")
    if modified:
        parts.append(f"수정 {modified}개")
    if removed:
        parts.append(f"삭제 {removed}개")

    return " / ".join(parts)
