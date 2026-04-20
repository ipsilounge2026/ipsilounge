"""
사전 상담 설문 (Consultation Survey) CRUD API

엔드포인트:
- POST   /api/consultation-surveys                       새 설문 생성
- GET    /api/consultation-surveys                       내 설문 목록
- GET    /api/consultation-surveys/{id}                  단건 조회 (전체 데이터)
- GET    /api/consultation-surveys/{id}/computed         분석 결과 (레이더 점수)
- PATCH  /api/consultation-surveys/{id}                  부분 저장 (이어쓰기)
- POST   /api/consultation-surveys/{id}/submit           제출 (status → submitted)
- DELETE /api/consultation-surveys/{id}                  삭제 (draft만 허용)
- GET    /api/consultation-surveys/schema/{type}         스키마 조회 (동적 폼 렌더용)
- GET    /api/consultation-surveys/suggest/{type}        timing/mode 자동 추천
- POST   /api/consultation-surveys/{id}/resume-token     이어쓰기 토큰 발급 + 이메일
- GET    /api/consultation-surveys/resume                토큰으로 설문 조회 (인증 불필요)
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.consultation_survey import ConsultationSurvey
from app.models.user import User
from app.schemas.consultation_survey import (
    ResumeTokenRequest,
    ResumeTokenResponse,
    SurveyCreateRequest,
    SurveyCreateResponse,
    SurveyListItem,
    SurveyListResponse,
    SurveyPatchRequest,
    SurveyResponse,
    SurveySubmitRequest,
    SurveySuggestResponse,
)
from app.services.email_service import send_survey_resume_email
from app.services.survey_resume_service import (
    build_resume_url,
    find_survey_by_token,
    issue_resume_token,
)
from app.services.survey_timing_service import (
    auto_determine_survey_params,
    determine_mode_for_user,
    estimate_timing_from_grade,
)
from app.surveys.schema_loader import (
    VALID_SURVEY_TYPES,
    get_parent_category_ids,
    get_schema_version,
    load_schema,
    validate_survey_params,
)
from app.utils.dependencies import get_current_user
from app.utils.family import get_visible_owner_ids, resolve_owner_id

router = APIRouter(prefix="/api/consultation-surveys", tags=["사전상담설문"])


# ----- 헬퍼 -----

def _deep_merge_answers(existing: dict, incoming: dict) -> dict:
    """
    answers 카테고리 단위 머지.
    카테고리 키는 dict 단위로 머지하고, 같은 질문 키는 incoming이 덮어씀.
    """
    if not existing:
        return dict(incoming)

    merged = dict(existing)
    for cat_key, cat_val in incoming.items():
        if cat_key in merged and isinstance(merged[cat_key], dict) and isinstance(cat_val, dict):
            merged[cat_key] = {**merged[cat_key], **cat_val}
        else:
            merged[cat_key] = cat_val
    return merged


async def _get_visible_survey(survey_id: uuid.UUID, user: User, db: AsyncSession) -> ConsultationSurvey:
    """가족 연결 가시성 기준 조회 (read-only).

    학부모는 연결된 자녀의 설문을 함께 조회할 수 있다.
    학생은 본인 설문만 조회할 수 있다.
    Phase B 단계에서는 read 전용 — 수정/제출/삭제는 _get_owned_survey 사용.
    """
    visible_ids = await get_visible_owner_ids(user, db)
    result = await db.execute(
        select(ConsultationSurvey).where(
            ConsultationSurvey.id == survey_id,
            ConsultationSurvey.user_id.in_(visible_ids),
        )
    )
    survey = result.scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="설문을 찾을 수 없습니다")
    return survey


async def _get_owned_survey(survey_id: uuid.UUID, user: User, db: AsyncSession) -> ConsultationSurvey:
    """본인 소유 설문만 조회 (mutation 용). 없으면 404.

    수정/제출/삭제 등 쓰기 작업은 본인 소유에 한해 허용한다.
    """
    result = await db.execute(
        select(ConsultationSurvey).where(
            ConsultationSurvey.id == survey_id,
            ConsultationSurvey.user_id == user.id,
        )
    )
    survey = result.scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="설문을 찾을 수 없습니다")
    return survey


async def _get_writable_survey(
    survey_id: uuid.UUID, user: User, db: AsyncSession
) -> tuple[ConsultationSurvey, bool]:
    """쓰기 가능한 설문 조회. (owner 본인 또는 연결된 학부모)

    Returns:
        (survey, is_parent_editing) — is_parent_editing이 True이면 학부모가 자녀 설문을 편집하는 상황.
        학부모는 respondent="parent" 카테고리만 수정할 수 있다.
    """
    # 1) 본인 소유면 바로 반환
    result = await db.execute(
        select(ConsultationSurvey).where(
            ConsultationSurvey.id == survey_id,
            ConsultationSurvey.user_id == user.id,
        )
    )
    survey = result.scalar_one_or_none()
    if survey is not None:
        return survey, False

    # 2) 학부모인 경우: 연결된 자녀의 설문인지 확인
    if user.member_type == "parent":
        from app.utils.family import get_linked_child_ids

        child_ids = await get_linked_child_ids(user, db)
        if child_ids:
            result = await db.execute(
                select(ConsultationSurvey).where(
                    ConsultationSurvey.id == survey_id,
                    ConsultationSurvey.user_id.in_(child_ids),
                )
            )
            survey = result.scalar_one_or_none()
            if survey is not None:
                return survey, True

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="설문을 찾을 수 없습니다")


# ----- 스키마 조회 -----

@router.get("/schema/{survey_type}")
async def get_survey_schema(survey_type: str):
    """
    설문 스키마 조회 (동적 폼 렌더링용).
    인증 불필요 (스키마는 공개).
    """
    if survey_type not in VALID_SURVEY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"survey_type은 {VALID_SURVEY_TYPES} 중 하나여야 합니다",
        )
    try:
        return load_schema(survey_type)
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ----- 생성 -----

@router.get("/suggest/{survey_type}", response_model=SurveySuggestResponse)
async def suggest_survey_params(
    survey_type: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    현재 사용자에게 추천되는 timing/mode를 조회 (UI에서 설문 시작 전 미리보기용).
    데이터를 변경하지 않으며, 클라이언트는 이 값을 그대로 POST에 사용해도 되고 사용자가 수정해도 됨.
    """
    if survey_type not in VALID_SURVEY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"survey_type은 {VALID_SURVEY_TYPES} 중 하나여야 합니다",
        )

    if survey_type == "preheigh1":
        return SurveySuggestResponse(
            survey_type="preheigh1",
            suggested_timing=None,
            suggested_mode="full",
            reason="preheigh1 타입은 단일 시점이며 항상 full 모드입니다.",
            has_prior_submission=False,
        )

    # high
    suggested_timing = estimate_timing_from_grade(user.grade, user.grade_year)
    suggested_mode = await determine_mode_for_user(user.id, "high", db)
    has_prior = suggested_mode == "delta"

    if suggested_timing is None:
        reason = "사용자 학년/학년설정연도 정보가 없어 시점을 자동 추정할 수 없습니다. 수동으로 선택해 주세요."
    else:
        reason_parts = [f"학년={user.grade}, grade_year={user.grade_year} 기준 추정 → {suggested_timing}"]
        if has_prior:
            reason_parts.append("이전 제출 이력 있음 → delta")
        else:
            reason_parts.append("이전 제출 이력 없음 → full (첫 상담)")
        reason = ". ".join(reason_parts)

    return SurveySuggestResponse(
        survey_type="high",
        suggested_timing=suggested_timing,
        suggested_mode=suggested_mode,
        reason=reason,
        has_prior_submission=has_prior,
    )


@router.post("", response_model=SurveyCreateResponse)
async def create_survey(
    data: SurveyCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    새 설문 생성. 동일 (user, survey_type, timing, booking) 조합으로 작성 중인 draft가 있으면 그것을 반환.

    timing/mode 자동 판정 규칙:
    - timing이 None 또는 "auto" → 학년/날짜 기반 추정
    - mode가 None 또는 "auto" → 이전 제출 이력 기반 판정
    """
    owner_id = await resolve_owner_id(user, db, data.owner_user_id)

    # timing/mode 자동 판정에서 owner 정보가 필요하면 owner user 조회
    if owner_id != user.id:
        owner_result = await db.execute(select(User).where(User.id == owner_id))
        owner_user = owner_result.scalar_one()
    else:
        owner_user = user

    raw_timing = data.timing if data.timing not in (None, "auto") else None
    raw_mode = data.mode if data.mode not in (None, "auto") else None

    # 자동 판정 (owner 기준)
    if raw_timing is None or raw_mode is None:
        auto_timing, auto_mode = await auto_determine_survey_params(owner_user, data.survey_type, db)
        if raw_timing is None:
            raw_timing = auto_timing
        if raw_mode is None:
            raw_mode = auto_mode

    # high인데 timing 추정도 실패한 경우
    if data.survey_type == "high" and raw_timing is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="high 타입은 timing이 필요합니다. 학년 정보가 없으면 명시적으로 T1~T4 중 하나를 지정해 주세요.",
        )

    try:
        validate_survey_params(data.survey_type, raw_timing, raw_mode)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # 동일 조건의 draft가 이미 있으면 그 draft 반환 (중복 생성 방지, owner 기준)
    existing_q = select(ConsultationSurvey).where(
        ConsultationSurvey.user_id == owner_id,
        ConsultationSurvey.survey_type == data.survey_type,
        ConsultationSurvey.status == "draft",
    )
    if raw_timing is not None:
        existing_q = existing_q.where(ConsultationSurvey.timing == raw_timing)
    else:
        existing_q = existing_q.where(ConsultationSurvey.timing.is_(None))
    if data.booking_id is not None:
        existing_q = existing_q.where(ConsultationSurvey.booking_id == data.booking_id)

    existing = (await db.execute(existing_q)).scalar_one_or_none()
    if existing is not None:
        return SurveyCreateResponse.model_validate(existing)

    # 예비고1 → 고1 자동 데이터 연계
    # high T1 설문 생성 시, 동일 사용자의 preheigh1 submitted 설문이 있으면 자동 매핑
    prefill_answers = {}
    prefill_category_status = {}
    source_survey_id = None
    preserved_data = None

    if data.survey_type == "high" and raw_timing == "T1":
        preheigh1_q = (
            select(ConsultationSurvey)
            .where(
                ConsultationSurvey.user_id == owner_id,
                ConsultationSurvey.survey_type == "preheigh1",
                ConsultationSurvey.status == "submitted",
            )
            .order_by(ConsultationSurvey.submitted_at.desc())
            .limit(1)
        )
        preheigh1_result = await db.execute(preheigh1_q)
        preheigh1_survey = preheigh1_result.scalar_one_or_none()

        if preheigh1_survey:
            # 카테고리 매핑 (예비고1 → 고등학교 T1)
            _MAP = {"A": "A", "B": "E", "D": "D", "G": "F"}
            src = preheigh1_survey.answers or {}
            for src_cat, dst_cat in _MAP.items():
                if src_cat in src:
                    prefill_answers[dst_cat] = src[src_cat]
                    prefill_category_status[dst_cat] = "in_progress"

            # 보존 데이터 (비교 상담용)
            preserved_data = {
                "converted_at": datetime.utcnow().isoformat(),
                "source_survey_type": "preheigh1",
                "auto_converted": True,
            }
            for keep_cat in ["E", "C", "F"]:
                if keep_cat in src:
                    preserved_data[f"preheigh1_{keep_cat}"] = src[keep_cat]

            source_survey_id = preheigh1_survey.id
            if raw_mode == "full":
                raw_mode = "delta"  # preheigh1 데이터가 사전 입력되므로 delta

    # T2/T3/T4 → 이전 타이밍 답변 자동 복사 (delta 자동채움)
    if data.survey_type == "high" and raw_timing in ("T2", "T3", "T4") and not prefill_answers:
        _PREV_TIMING = {"T2": "T1", "T3": "T2", "T4": "T3"}
        prev_timing = _PREV_TIMING[raw_timing]
        prev_q = (
            select(ConsultationSurvey)
            .where(
                ConsultationSurvey.user_id == owner_id,
                ConsultationSurvey.survey_type == "high",
                ConsultationSurvey.timing == prev_timing,
                ConsultationSurvey.status == "submitted",
            )
            .order_by(ConsultationSurvey.submitted_at.desc())
            .limit(1)
        )
        prev_result = await db.execute(prev_q)
        prev_survey = prev_result.scalar_one_or_none()

        if prev_survey and prev_survey.answers:
            prefill_answers = dict(prev_survey.answers)
            # 모든 카테고리를 in_progress로 설정 (학생이 검토/수정 필요)
            prefill_category_status = {
                cat_key: "in_progress" for cat_key in prefill_answers.keys()
            }
            source_survey_id = prev_survey.id
            preserved_data = {
                "converted_at": datetime.utcnow().isoformat(),
                "source_survey_type": "high",
                "source_timing": prev_timing,
                "auto_converted": True,
            }
            if raw_mode == "full":
                raw_mode = "delta"

    survey = ConsultationSurvey(
        user_id=owner_id,
        survey_type=data.survey_type,
        timing=raw_timing,
        mode=raw_mode,
        answers=prefill_answers,
        category_status=prefill_category_status,
        status="draft",
        started_platform=data.started_platform,
        last_edited_platform=data.started_platform,
        schema_version=get_schema_version(data.survey_type),
        booking_id=data.booking_id,
        source_survey_id=source_survey_id,
        preserved_data=preserved_data,
    )
    db.add(survey)
    await db.commit()
    await db.refresh(survey)
    return SurveyCreateResponse.model_validate(survey)


# ----- 목록 -----

@router.get("", response_model=SurveyListResponse)
async def list_my_surveys(
    survey_type: str | None = Query(None, description="필터: preheigh1 | high"),
    status_filter: str | None = Query(None, alias="status", description="필터: draft | submitted"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내 설문 목록 (요약).

    가시성 규칙:
    - 학생: 본인 설문만
    - 학부모: 본인 + 연결된 자녀들의 설문 (가족 연결 도입 전 학부모 직접 작성분 포함)
    """
    visible_ids = await get_visible_owner_ids(user, db)
    q = select(ConsultationSurvey).where(ConsultationSurvey.user_id.in_(visible_ids))
    if survey_type:
        q = q.where(ConsultationSurvey.survey_type == survey_type)
    if status_filter:
        q = q.where(ConsultationSurvey.status == status_filter)
    q = q.order_by(ConsultationSurvey.updated_at.desc())

    rows = (await db.execute(q)).scalars().all()
    items = [SurveyListItem.model_validate(r) for r in rows]
    return SurveyListResponse(items=items, total=len(items))


# ----- 이어쓰기 토큰으로 조회 (인증 불필요) -----
# 주의: /{survey_id} 보다 위에 정의해야 라우트 충돌 없음.

@router.get("/resume", response_model=SurveyResponse)
async def resume_by_token(
    token: str = Query(..., min_length=10, description="이어쓰기 토큰"),
    db: AsyncSession = Depends(get_db),
):
    """
    이어쓰기 토큰으로 설문 조회 (이메일/딥링크 진입점).
    인증 없이 접근 가능 — 토큰 자체가 인증이 됨.
    토큰이 없거나 만료됐으면 404.
    """
    survey = await find_survey_by_token(token, db)
    if survey is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="유효하지 않거나 만료된 이어쓰기 링크입니다",
        )
    return SurveyResponse.model_validate(survey)


# ----- 단건 조회 -----

@router.get("/{survey_id}", response_model=SurveyResponse)
async def get_survey(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """설문 단건 조회 (본인 + 연결된 자녀)"""
    survey = await _get_visible_survey(survey_id, user, db)
    return SurveyResponse.model_validate(survey)


# ----- 설문 분석 결과 (레이더 점수) -----

@router.get("/{survey_id}/computed")
async def get_computed_stats(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """제출된 설문의 자동 계산 결과 (레이더 점수 포함). 본인 + 연결된 자녀."""
    survey = await _get_visible_survey(survey_id, user, db)
    if survey.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출된 설문만 분석 결과를 조회할 수 있습니다",
        )

    from app.routers.admin_consultation_survey import _compute_stats
    computed = _compute_stats(survey.survey_type, survey.answers, survey.timing)
    return computed


# ----- 학생용 액션플랜 / 로드맵 -----

@router.get("/{survey_id}/action-plan")
async def get_action_plan_user(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학생용 액션 플랜 조회"""
    survey = await _get_visible_survey(survey_id, user, db)
    return survey.action_plan or {}

@router.get("/{survey_id}/roadmap")
async def get_roadmap_user(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학생용 로드맵 조회 (computed에서 roadmap 부분만)"""
    survey = await _get_visible_survey(survey_id, user, db)
    if survey.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출된 설문만 조회할 수 있습니다",
        )
    from app.routers.admin_consultation_survey import _compute_stats
    computed = _compute_stats(survey.survey_type, survey.answers, survey.timing)
    return {
        "roadmap": computed.get("roadmap", {}),
        "overrides": (survey.counselor_overrides or {}).get("roadmap"),
        "progress": survey.roadmap_progress or {},
    }


# ----- 학생용 변화 추적 (Delta) -----

def _analyze_study_method_changes(prev_answers: dict, curr_answers: dict) -> dict | None:
    """D7 학습법 변화 분석: 과목별 학습법 변경 + 성적 변화 상관관계"""
    prev_d7 = (prev_answers or {}).get("D", {}).get("D7")
    curr_d7 = (curr_answers or {}).get("D", {}).get("D7")

    if not prev_d7 or not curr_d7:
        return None

    if not isinstance(prev_d7, dict) or not isinstance(curr_d7, dict):
        return None

    changes = []
    all_subjects = set(prev_d7.keys()) | set(curr_d7.keys())

    for subject in sorted(all_subjects):
        prev_sub = prev_d7.get(subject, {})
        curr_sub = curr_d7.get(subject, {})
        if not isinstance(prev_sub, dict) or not isinstance(curr_sub, dict):
            continue

        subject_changes = {}

        # 학습법 변경 확인
        prev_methods = set(prev_sub.get("study_method", []) if isinstance(prev_sub.get("study_method"), list) else [])
        curr_methods = set(curr_sub.get("study_method", []) if isinstance(curr_sub.get("study_method"), list) else [])
        if prev_methods != curr_methods:
            subject_changes["study_method"] = {
                "prev": sorted(prev_methods),
                "curr": sorted(curr_methods),
                "added": sorted(curr_methods - prev_methods),
                "removed": sorted(prev_methods - curr_methods),
            }

        # 수업 참여도 변경
        prev_engage = prev_sub.get("class_engagement")
        curr_engage = curr_sub.get("class_engagement")
        if prev_engage != curr_engage:
            subject_changes["class_engagement"] = {"prev": prev_engage, "curr": curr_engage}

        # 만족도 변경
        prev_sat = prev_sub.get("satisfaction")
        curr_sat = curr_sub.get("satisfaction")
        if prev_sat != curr_sat:
            subject_changes["satisfaction"] = {"prev": prev_sat, "curr": curr_sat}

        # 교재 변경
        prev_text = prev_sub.get("main_textbook")
        curr_text = curr_sub.get("main_textbook")
        if prev_text != curr_text:
            subject_changes["main_textbook"] = {"prev": prev_text, "curr": curr_text}

        if subject_changes:
            changes.append({
                "subject": subject,
                "changes": subject_changes,
            })

    # 성적 변화 상관관계 (B카테고리 내신 데이터)
    prev_grades = (prev_answers or {}).get("B", {})
    curr_grades = (curr_answers or {}).get("B", {})
    grade_changes = {}
    if isinstance(prev_grades, dict) and isinstance(curr_grades, dict):
        for key in set(prev_grades.keys()) | set(curr_grades.keys()):
            if prev_grades.get(key) != curr_grades.get(key):
                grade_changes[key] = {"prev": prev_grades.get(key), "curr": curr_grades.get(key)}

    return {
        "subject_changes": changes,
        "total_subjects_changed": len(changes),
        "grade_changes": grade_changes if grade_changes else None,
    }


@router.get("/{survey_id}/delta")
async def get_delta_user(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학생용 변화 추적 (이전 설문 대비 변경점)"""
    survey = await _get_visible_survey(survey_id, user, db)
    if survey.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출된 설문만 변화 추적을 조회할 수 있습니다",
        )

    # 같은 사용자의 같은 타입 이전 설문 찾기
    prev_q = (
        select(ConsultationSurvey)
        .where(
            ConsultationSurvey.user_id == survey.user_id,
            ConsultationSurvey.survey_type == survey.survey_type,
            ConsultationSurvey.id != survey.id,
            ConsultationSurvey.status == "submitted",
            ConsultationSurvey.created_at < survey.created_at,
        )
        .order_by(ConsultationSurvey.created_at.desc())
        .limit(1)
    )
    prev_result = await db.execute(prev_q)
    previous = prev_result.scalar_one_or_none()

    if not previous:
        return {"has_previous": False, "diff": {}, "summary": "이전 설문이 없습니다.", "study_method_changes": None}

    from app.routers.admin_consultation_survey import _compute_delta, _summarize_delta
    diff = _compute_delta(previous.answers, survey.answers)

    # D7 학습법 변화 분석
    study_method_changes = _analyze_study_method_changes(previous.answers, survey.answers)

    return {
        "has_previous": True,
        "previous_timing": previous.timing,
        "previous_submitted_at": previous.submitted_at.isoformat() if previous.submitted_at else None,
        "diff": diff,
        "summary": _summarize_delta(diff),
        "study_method_changes": study_method_changes,
    }


# ----- 과목별 경쟁력 분석 (Subject Competitiveness) -----


def _safe_float_sc(val) -> float | None:
    """숫자 변환 헬퍼 (None-safe)."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _detect_subject_trend(grades: list[float]) -> str:
    """성적 추이 판정 (lower is better for rank)."""
    if len(grades) < 2:
        return "insufficient"
    first_half = sum(grades[: len(grades) // 2]) / max(1, len(grades) // 2)
    second_half = sum(grades[len(grades) // 2 :]) / max(1, len(grades) - len(grades) // 2)
    diff = second_half - first_half
    if diff < -0.3:
        return "improving"
    elif diff > 0.3:
        return "declining"
    return "stable"


def _compute_subject_competitiveness(answers: dict) -> dict:
    """과목별 경쟁력 분석 결과 생성."""
    cat_b = answers.get("B", {})
    cat_c = answers.get("C", {})
    cat_d = answers.get("D", {})
    cat_e = answers.get("E", {})

    semesters = ["B1", "B2", "B3", "B4"]
    semester_labels = ["고1-1", "고1-2", "고2-1", "고2-2"]
    subjects = ["ko", "en", "ma", "sc1", "sc2", "so"]
    subject_names = {
        "ko": "국어", "en": "영어", "ma": "수학",
        "sc1": "탐구1", "sc2": "탐구2", "so": "사회",
    }
    mock_area_to_naesin = {
        "korean": "ko", "math": "ma", "english": "en",
        "inquiry1": "sc1", "inquiry2": "sc2",
    }

    # --- 1. 과목별 내신 데이터 수집 ---
    subject_data: dict[str, dict] = {}
    for subj_key in subjects:
        grades_by_sem: list[dict] = []
        for i, sem_key in enumerate(semesters):
            sem_data = cat_b.get(sem_key)
            if not sem_data or not isinstance(sem_data, dict):
                continue
            subj_data = sem_data.get(subj_key, {})
            if not isinstance(subj_data, dict):
                continue
            grade = _safe_float_sc(subj_data.get("rank_grade"))
            if grade is not None:
                grades_by_sem.append({
                    "semester": semester_labels[i],
                    "grade": grade,
                })
        if grades_by_sem:
            grade_values = [g["grade"] for g in grades_by_sem]
            current_grade = grade_values[-1]
            avg_grade = round(sum(grade_values) / len(grade_values), 2)
            trend = _detect_subject_trend(grade_values)
            subject_data[subj_key] = {
                "name": subject_names[subj_key],
                "current_grade": current_grade,
                "avg_grade": avg_grade,
                "trend": trend,
                "history": grades_by_sem,
            }

    # --- 2. 모의고사 데이터 통합 ---
    mock_data = cat_c.get("C1")
    if mock_data and isinstance(mock_data, dict):
        area_names = {
            "korean": "국어", "math": "수학", "english": "영어",
            "inquiry1": "탐구1", "inquiry2": "탐구2",
        }
        for area_key, naesin_key in mock_area_to_naesin.items():
            mock_ranks = []
            for session_key, session in sorted(mock_data.items()):
                if not isinstance(session, dict):
                    continue
                area_data = session.get(area_key, {})
                if not isinstance(area_data, dict):
                    continue
                rank = _safe_float_sc(area_data.get("rank"))
                if rank is not None:
                    mock_ranks.append({"session": session_key, "rank": rank})

            if mock_ranks:
                if naesin_key not in subject_data:
                    subject_data[naesin_key] = {
                        "name": subject_names.get(naesin_key, area_names.get(area_key, area_key)),
                        "current_grade": None,
                        "avg_grade": None,
                        "trend": "insufficient",
                        "history": [],
                    }
                subject_data[naesin_key]["mock_ranks"] = mock_ranks
                subject_data[naesin_key]["mock_current"] = mock_ranks[-1]["rank"]
                mock_vals = [r["rank"] for r in mock_ranks]
                subject_data[naesin_key]["mock_avg"] = round(
                    sum(mock_vals) / len(mock_vals), 2
                )

    # --- 3. 목표 등급 및 gap 계산 ---
    # E2 목표 대학 수준에서 목표 등급 추정
    e2 = cat_e.get("E2")
    target_grade: float | None = None
    target_level_label: str | None = None
    if e2 and isinstance(e2, dict):
        target_level = e2.get("target_level")
        # 목표 대학 수준 -> 대략적 목표 등급 매핑
        target_map = {
            "최상위SKY": 1.5,
            "상위인서울주요": 2.5,
            "인서울": 3.0,
            "수도권": 3.5,
            "지방거점": 3.5,
        }
        if target_level and target_level in target_map:
            target_grade = target_map[target_level]
            target_level_label = target_level

    for subj_key, data in subject_data.items():
        if target_grade is not None and data.get("current_grade") is not None:
            gap = round(data["current_grade"] - target_grade, 2)
            data["target_grade"] = target_grade
            data["gap"] = gap  # positive = below target (worse)
            data["within_plus_minus_1"] = abs(gap) <= 1.0
        else:
            data["target_grade"] = target_grade
            data["gap"] = None
            data["within_plus_minus_1"] = False

    # --- 4. C2 취약 유형 통합 ---
    c2_data = cat_c.get("C2")
    weakness_types: dict[str, list[str]] = {}
    if c2_data and isinstance(c2_data, dict):
        c2_to_naesin = {
            "korean": "ko", "math": "ma", "english": "en", "inquiry": "sc1",
        }
        for c2_subj, naesin_key in c2_to_naesin.items():
            types = c2_data.get(c2_subj)
            if types and isinstance(types, list):
                weakness_types[naesin_key] = types
                if naesin_key in subject_data:
                    subject_data[naesin_key]["weakness_types"] = types

    # --- 5. D6 취약 과목 통합 ---
    d6_data = cat_d.get("D6")
    weakest_subjects: list[str] = []
    weakest_reasons: list[str] = []
    strongest_subjects: list[str] = []
    if d6_data and isinstance(d6_data, dict):
        ws = d6_data.get("weakest", [])
        if isinstance(ws, list):
            weakest_subjects = ws
        wr = d6_data.get("weakest_reason", [])
        if isinstance(wr, list):
            weakest_reasons = wr
        ss = d6_data.get("strongest", [])
        if isinstance(ss, list):
            strongest_subjects = ss

    # --- 6. 전략 과목 분류 ---
    strategy_focus: list[dict] = []   # 집중 공략
    strategy_maintain: list[dict] = []  # 유지 관리
    strategy_consider: list[dict] = []  # 전략적 포기 고려

    for subj_key, data in subject_data.items():
        entry = {
            "key": subj_key,
            "name": data["name"],
            "current_grade": data.get("current_grade"),
            "target_grade": data.get("target_grade"),
            "gap": data.get("gap"),
            "trend": data.get("trend"),
        }

        gap = data.get("gap")
        current = data.get("current_grade")

        if gap is None or current is None:
            continue

        name = data["name"]
        is_weakest = name in weakest_subjects
        is_strongest = name in strongest_subjects

        if gap <= 0:
            # 이미 목표 달성 또는 초과
            tip = f"{data['name']} 현재 {current}등급으로 목표 이내입니다. 현 수준 유지에 집중하세요."
            entry["tip"] = tip
            strategy_maintain.append(entry)
        elif gap <= 1.5 and not is_weakest:
            # 목표에 근접 + 가장 어려운 과목이 아님 -> 집중 공략
            tip = f"{data['name']} 목표까지 {gap}등급 차이. "
            if data.get("trend") == "improving":
                tip += "상승 추세이므로 유지하면 달성 가능합니다."
            else:
                tip += "집중 학습으로 등급 향상이 기대됩니다."
            if data.get("weakness_types"):
                tip += f" 취약 유형: {', '.join(data['weakness_types'][:3])}"
            entry["tip"] = tip
            strategy_focus.append(entry)
        elif gap > 2.0 and is_weakest:
            # 목표와 괴리 크고 본인도 어렵다고 느끼는 과목
            tip = f"{data['name']} 목표 대비 {gap}등급 차이가 크고, 학생 본인도 어려움을 느끼는 과목입니다. "
            if weakest_reasons:
                tip += f"어려운 이유: {', '.join(weakest_reasons[:2])}. "
            tip += "다른 과목의 등급 향상에 시간을 배분하는 것이 효율적일 수 있습니다."
            entry["tip"] = tip
            strategy_consider.append(entry)
        else:
            # 그 외: 갭은 있지만 투자 가치 있음 -> 집중 공략
            tip = f"{data['name']} 목표까지 {gap}등급 차이. "
            if data.get("weakness_types"):
                tip += f"취약 유형({', '.join(data['weakness_types'][:2])}) 집중 보완으로 등급 향상을 노려보세요."
            else:
                tip += "기본 개념 복습과 오답 분석을 병행해 보세요."
            entry["tip"] = tip
            strategy_focus.append(entry)

    # 정렬: 집중 공략은 gap 작은 순(=달성 가능성 높은 순)
    strategy_focus.sort(key=lambda x: x.get("gap") or 99)
    strategy_consider.sort(key=lambda x: -(x.get("gap") or 0))

    return {
        "subjects": subject_data,
        "target_grade": target_grade,
        "target_level": target_level_label,
        "weakness_types": weakness_types,
        "weakest_subjects": weakest_subjects,
        "weakest_reasons": weakest_reasons,
        "strongest_subjects": strongest_subjects,
        "strategy": {
            "focus": strategy_focus,
            "maintain": strategy_maintain,
            "consider": strategy_consider,
        },
    }


@router.get("/{survey_id}/subject-competitiveness")
async def get_subject_competitiveness(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """과목별 경쟁력 분석 (내신-모의 비교, +-1등급 하이라이트, 전략 과목 제안).

    설문 답변의 B(내신), C(모의/취약유형), D(학습고민), E(목표) 데이터를 종합 분석하여
    과목 단위 통합 차트 렌더링용 데이터를 반환한다.
    """
    survey = await _get_visible_survey(survey_id, user, db)
    if survey.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출된 설문만 경쟁력 분석을 조회할 수 있습니다",
        )
    return _compute_subject_competitiveness(survey.answers or {})


# ----- 학습 방법 진단 매트릭스 (Study Method Matrix) -----


def _assess_method_grade_match(num_methods: int, grade: float | None) -> str:
    """학습법 수 대비 성적 매칭 평가.

    Returns: '효율적' / '적정' / '비효율' / '-'
    """
    if grade is None or num_methods == 0:
        return "-"
    # grade 1 = best, 5 = worst (5-grade system)
    if num_methods >= 3 and grade >= 4:
        return "비효율"
    if num_methods <= 1 and grade <= 2:
        return "효율적"
    if num_methods >= 3 and grade <= 2:
        return "적정"
    if num_methods <= 1 and grade >= 4:
        return "비효율"
    return "적정"


def _compute_study_method_matrix(answers: dict) -> dict:
    """D7 과목별 학습 방법, D1 주간 스케줄, D8 심리 상태, B 내신 등급을 매트릭스로 구성."""
    cat_b = answers.get("B", {})
    cat_d = answers.get("D", {})

    d7_data = cat_d.get("D7", {})
    d1_data = cat_d.get("D1", {})
    d8_data = cat_d.get("D8", {})
    d6_data = cat_d.get("D6", {})

    # --- 과목별 최신 내신 등급 수집 ---
    semesters = ["B4", "B3", "B2", "B1"]  # newest first
    subject_keys = ["ko", "en", "ma", "sc1", "sc2", "so"]
    subject_names = {
        "ko": "국어", "en": "영어", "ma": "수학",
        "sc1": "탐구1", "sc2": "탐구2", "so": "사회",
    }
    # 과목명 → 내신 키 역매핑
    name_to_key = {v: k for k, v in subject_names.items()}

    latest_grades: dict[str, dict] = {}
    for subj_key in subject_keys:
        for sem_key in semesters:
            sem_data = cat_b.get(sem_key)
            if not sem_data or not isinstance(sem_data, dict):
                continue
            subj_data = sem_data.get(subj_key, {})
            if not isinstance(subj_data, dict):
                continue
            rank = _safe_float_sc(subj_data.get("rank_grade"))
            if rank is not None:
                latest_grades[subj_key] = {
                    "rank": rank,
                    "achievement": subj_data.get("achievement"),
                    "raw_score": _safe_float_sc(subj_data.get("raw_score")),
                }
                break  # found latest

    # --- 과목별 학습 방법 매트릭스 ---
    subjects = []
    if isinstance(d7_data, dict):
        # D7 keys are subject names like "국어", "수학", etc.
        for subj_name, subj_info in d7_data.items():
            if not isinstance(subj_info, dict):
                continue

            methods = subj_info.get("study_method", [])
            if isinstance(methods, str):
                methods = [methods]
            elif not isinstance(methods, list):
                methods = []

            engagement = subj_info.get("class_engagement", None)
            satisfaction = subj_info.get("satisfaction", None)
            textbook = subj_info.get("main_textbook", None)

            # 인강 정보
            lecture_info = subj_info.get("lecture", {})
            if not isinstance(lecture_info, dict):
                lecture_info = {}
            has_lecture = bool(lecture_info.get("instructor") or lecture_info.get("platform"))
            lecture = {
                "has": has_lecture,
                "instructor": lecture_info.get("instructor"),
                "platform": lecture_info.get("platform"),
            }

            # 내신 등급 매칭
            naesin_key = name_to_key.get(subj_name)
            grade_info = latest_grades.get(naesin_key, {}) if naesin_key else {}

            num_methods = len(methods)
            grade_rank = grade_info.get("rank")
            match_eval = _assess_method_grade_match(num_methods, grade_rank)

            subjects.append({
                "name": subj_name,
                "study_methods": methods,
                "class_engagement": engagement,
                "satisfaction": satisfaction,
                "textbook": textbook,
                "lecture": lecture,
                "grade": {
                    "rank": grade_info.get("rank"),
                    "achievement": grade_info.get("achievement"),
                    "raw_score": grade_info.get("raw_score"),
                } if grade_info else None,
                "method_grade_match": match_eval,
            })

    # D6 취약 과목이 D7에 없으면 추가
    if isinstance(d6_data, dict):
        existing_names = {s["name"] for s in subjects}
        weakest = d6_data.get("weakest", [])
        if isinstance(weakest, list):
            for w_subj in weakest:
                if isinstance(w_subj, str) and w_subj not in existing_names:
                    naesin_key = name_to_key.get(w_subj)
                    grade_info = latest_grades.get(naesin_key, {}) if naesin_key else {}
                    subjects.append({
                        "name": w_subj,
                        "study_methods": [],
                        "class_engagement": None,
                        "satisfaction": None,
                        "textbook": None,
                        "lecture": {"has": False, "instructor": None, "platform": None},
                        "grade": {
                            "rank": grade_info.get("rank"),
                            "achievement": grade_info.get("achievement"),
                            "raw_score": grade_info.get("raw_score"),
                        } if grade_info else None,
                        "method_grade_match": "-",
                    })

    # --- 주간 스케줄 요약 (D1) ---
    weekly_summary: dict = {}
    if isinstance(d1_data, dict):
        total_hours = _safe_float_sc(d1_data.get("total_hours")) or 0
        self_ratio = _safe_float_sc(d1_data.get("self_study_ratio")) or 0
        by_subject = d1_data.get("by_subject", {})
        if not isinstance(by_subject, dict):
            by_subject = {}
        weekly_summary = {
            "total_hours": total_hours,
            "self_study_ratio": self_ratio,
            "by_subject": {k: _safe_float_sc(v) or 0 for k, v in by_subject.items() if isinstance(k, str)},
        }

    # --- 학습 심리 상태 (D8) ---
    psychology: dict = {}
    if isinstance(d8_data, dict):
        psychology = {
            "test_anxiety": d8_data.get("test_anxiety"),
            "motivation": d8_data.get("motivation"),
            "study_load": d8_data.get("study_load"),
            "sleep_hours": d8_data.get("sleep_hours"),
            "subject_giveup": d8_data.get("subject_giveup"),
        }

    return {
        "subjects": subjects,
        "weekly_summary": weekly_summary,
        "psychology": psychology,
    }


@router.get("/{survey_id}/study-method-matrix")
async def get_study_method_matrix(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학습 방법 진단 매트릭스: D7 과목별 학습 방법, D1 주간 스케줄, D8 심리 상태, B 내신을 종합."""
    survey = await _get_visible_survey(survey_id, user, db)
    if survey.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출된 설문만 학습 방법 매트릭스를 조회할 수 있습니다",
        )
    return _compute_study_method_matrix(survey.answers or {})


# ----- 수능 최저학력기준 충족 시뮬레이션 -----

@router.get("/{survey_id}/suneung-minimum-simulation")
async def get_suneung_minimum_simulation(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """수능 최저학력기준 충족 시뮬레이션.

    학생의 모의고사 등급과 목표 대학 수준을 기반으로,
    각 대학·전형별 수능 최저학력기준 충족 여부를 시뮬레이션한다.
    """
    survey = await _get_visible_survey(survey_id, user, db)
    if survey.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출된 설문만 수능 최저 시뮬레이션을 조회할 수 있습니다",
        )
    # Only for high school surveys
    if survey.survey_type not in ("high",):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="고등학생 설문만 수능 최저 시뮬레이션을 지원합니다",
        )

    from app.services.suneung_minimum_service import simulate_suneung_minimum
    return simulate_suneung_minimum(survey.answers or {})


# ----- 액션 플랜 진행 체크 업데이트 -----

class ActionPlanProgressRequest(BaseModel):
    item_index: int
    completed: bool


@router.patch("/{survey_id}/action-plan-progress")
async def update_action_plan_progress(
    survey_id: uuid.UUID,
    data: ActionPlanProgressRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학생용 액션 플랜 항목 완료 체크 업데이트"""
    survey = await _get_owned_survey(survey_id, user, db)
    if survey.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출된 설문만 액션 플랜을 업데이트할 수 있습니다",
        )

    action_plan = dict(survey.action_plan or {})
    items = action_plan.get("items", [])

    if data.item_index < 0 or data.item_index >= len(items):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 항목 인덱스입니다 (0~{len(items) - 1})",
        )

    items = [dict(item) for item in items]
    items[data.item_index]["completed"] = data.completed
    action_plan["items"] = items
    survey.action_plan = action_plan

    await db.commit()
    await db.refresh(survey)
    return survey.action_plan or {}


# ----- 변화 추적 리포트 -----

# D8 필드 라벨 매핑
_D8_FIELD_LABELS = {
    "test_anxiety": "시험 불안",
    "motivation": "학습 의욕",
    "study_load": "학습량 체감",
    "sleep_hours": "수면 시간",
}

_D8_VALUE_LABELS = {
    "test_anxiety": {"없음": "없음", "가끔": "가끔", "자주": "자주"},
    "motivation": {"매우낮음": "매우 낮음", "낮음": "낮음", "보통": "보통", "높음": "높음", "매우높음": "매우 높음"},
    "study_load": {"너무적음": "너무 적음", "적절함": "적절함", "약간버거움": "약간 버거움", "많이버거움": "많이 버거움"},
    "sleep_hours": {"under5": "5시간 미만", "5_6": "5~6시간", "6_7": "6~7시간", "over7": "7시간 이상"},
}

# D8 direction: index order from worst to best
_D8_POSITIVE_DIRECTION = {
    "test_anxiety": ["자주", "가끔", "없음"],
    "motivation": ["매우낮음", "낮음", "보통", "높음", "매우높음"],
    "study_load": ["많이버거움", "약간버거움", "적절함", "너무적음"],
    "sleep_hours": ["under5", "5_6", "6_7", "over7"],
}

_CR_STUDY_METHOD_LABELS = {
    "수업전예습": "수업 전 예습", "당일복습": "당일 복습", "교과서정독": "교과서 정독",
    "필기요약정리": "필기·요약 정리", "인강수강": "인강 수강", "문제집반복": "문제집 반복",
    "기출분석": "기출 분석", "개념서회독": "개념서 회독", "요약노트": "요약 노트", "기타": "기타",
}

_CR_ENGAGEMENT_LABELS = {
    "거의안들음": "거의 안 들음", "듣기만함": "듣기만 함",
    "필기하며": "필기하며 수업", "적극참여": "적극 참여",
}
_CR_ENGAGEMENT_ORDER = ["거의안들음", "듣기만함", "필기하며", "적극참여"]

_CR_SATISFACTION_LABELS = {
    "불만족": "불만족", "보통": "보통", "만족": "만족",
}
_CR_SATISFACTION_ORDER = ["불만족", "보통", "만족"]


def _cr_direction_label(prev_val, curr_val, order_list: list) -> str:
    """Compare two values by position in an ordered list. Returns direction string."""
    try:
        pi = order_list.index(prev_val)
        ci = order_list.index(curr_val)
        if ci > pi:
            return "개선"
        elif ci < pi:
            return "하락"
        return "유지"
    except (ValueError, TypeError):
        if prev_val != curr_val:
            return "변경"
        return "유지"


def _cr_build_grade_section(prev_answers: dict, curr_answers: dict) -> dict:
    """B category grade change analysis for change-report."""
    prev_b = (prev_answers or {}).get("B", {})
    curr_b = (curr_answers or {}).get("B", {})
    if not isinstance(prev_b, dict) or not isinstance(curr_b, dict):
        return {"direction": "유지", "changes": [], "summary": "성적 데이터가 없습니다."}

    prev_grades = prev_b.get("B1_B4", {})
    curr_grades = curr_b.get("B1_B4", {})
    if not isinstance(prev_grades, dict) or not isinstance(curr_grades, dict):
        return {"direction": "유지", "changes": [], "summary": "성적 데이터가 없습니다."}

    changes = []
    improved = 0
    declined = 0

    all_semesters = set(prev_grades.keys()) | set(curr_grades.keys())
    for sem in sorted(all_semesters):
        prev_sem = prev_grades.get(sem, {})
        curr_sem = curr_grades.get(sem, {})
        if not isinstance(prev_sem, dict) or not isinstance(curr_sem, dict):
            continue

        prev_subjects = prev_sem.get("subjects", [])
        curr_subjects = curr_sem.get("subjects", [])
        if not isinstance(prev_subjects, list) or not isinstance(curr_subjects, list):
            continue

        prev_lookup = {}
        for s in prev_subjects:
            if isinstance(s, dict) and s.get("course_name"):
                prev_lookup[s["course_name"]] = s
        curr_lookup = {}
        for s in curr_subjects:
            if isinstance(s, dict) and s.get("course_name"):
                curr_lookup[s["course_name"]] = s

        for subj in sorted(set(prev_lookup.keys()) | set(curr_lookup.keys())):
            p = prev_lookup.get(subj, {})
            c = curr_lookup.get(subj, {})
            p_grade = p.get("grade")
            c_grade = c.get("grade")
            p_score = p.get("score")
            c_score = c.get("score")

            if p_grade != c_grade or p_score != c_score:
                direction = "유지"
                if isinstance(p_grade, (int, float)) and isinstance(c_grade, (int, float)):
                    if c_grade < p_grade:
                        direction = "개선"
                        improved += 1
                    elif c_grade > p_grade:
                        direction = "하락"
                        declined += 1
                elif p_grade != c_grade:
                    direction = "변경"

                changes.append({
                    "semester": sem,
                    "subject": subj,
                    "prev_grade": p_grade,
                    "curr_grade": c_grade,
                    "prev_score": p_score,
                    "curr_score": c_score,
                    "direction": direction,
                })

    overall = "유지"
    if improved > declined:
        overall = "개선"
    elif declined > improved:
        overall = "하락"

    parts = []
    if changes:
        parts.append(f"{len(changes)}개 과목 성적 변동")
        if improved:
            parts.append(f"등급 상승 {improved}개")
        if declined:
            parts.append(f"등급 하락 {declined}개")
    else:
        parts.append("성적 변동 없음")

    return {
        "direction": overall,
        "changes": changes,
        "improved_count": improved,
        "declined_count": declined,
        "summary": ", ".join(parts),
    }


def _cr_build_study_method_section(prev_answers: dict, curr_answers: dict) -> dict:
    """D7 study method change analysis for the change-report."""
    raw = _analyze_study_method_changes(prev_answers, curr_answers)
    if not raw or not raw.get("subject_changes"):
        return {"direction": "유지", "subjects": [], "summary": "학습법 변동 없음"}

    subjects = []
    improved = 0
    declined = 0

    for sc in raw["subject_changes"]:
        ch = sc.get("changes", {})

        if ch.get("class_engagement"):
            d = _cr_direction_label(
                ch["class_engagement"].get("prev"),
                ch["class_engagement"].get("curr"),
                _CR_ENGAGEMENT_ORDER,
            )
            if d == "개선":
                improved += 1
            elif d == "하락":
                declined += 1

        if ch.get("satisfaction"):
            d = _cr_direction_label(
                ch["satisfaction"].get("prev"),
                ch["satisfaction"].get("curr"),
                _CR_SATISFACTION_ORDER,
            )
            if d == "개선":
                improved += 1
            elif d == "하락":
                declined += 1

        subjects.append({
            "subject": sc["subject"],
            "method_added": [_CR_STUDY_METHOD_LABELS.get(m, m) for m in ch.get("study_method", {}).get("added", [])],
            "method_removed": [_CR_STUDY_METHOD_LABELS.get(m, m) for m in ch.get("study_method", {}).get("removed", [])],
            "engagement": {
                "prev": _CR_ENGAGEMENT_LABELS.get(ch["class_engagement"]["prev"], ch["class_engagement"]["prev"]) if ch.get("class_engagement") else None,
                "curr": _CR_ENGAGEMENT_LABELS.get(ch["class_engagement"]["curr"], ch["class_engagement"]["curr"]) if ch.get("class_engagement") else None,
                "direction": _cr_direction_label(ch["class_engagement"]["prev"], ch["class_engagement"]["curr"], _CR_ENGAGEMENT_ORDER) if ch.get("class_engagement") else None,
            } if ch.get("class_engagement") else None,
            "satisfaction": {
                "prev": _CR_SATISFACTION_LABELS.get(ch["satisfaction"]["prev"], ch["satisfaction"]["prev"]) if ch.get("satisfaction") else None,
                "curr": _CR_SATISFACTION_LABELS.get(ch["satisfaction"]["curr"], ch["satisfaction"]["curr"]) if ch.get("satisfaction") else None,
                "direction": _cr_direction_label(ch["satisfaction"]["prev"], ch["satisfaction"]["curr"], _CR_SATISFACTION_ORDER) if ch.get("satisfaction") else None,
            } if ch.get("satisfaction") else None,
            "textbook": {
                "prev": ch["main_textbook"]["prev"],
                "curr": ch["main_textbook"]["curr"],
            } if ch.get("main_textbook") else None,
        })

    overall = "유지"
    if improved > declined:
        overall = "개선"
    elif declined > improved:
        overall = "하락"
    elif improved > 0:
        overall = "혼재"

    return {
        "direction": overall,
        "subjects": subjects,
        "total_changed": raw["total_subjects_changed"],
        "summary": f"{raw['total_subjects_changed']}개 과목 학습법 변동",
    }


def _cr_build_psych_section(prev_answers: dict, curr_answers: dict) -> dict:
    """D8 psychological state change analysis for change-report."""
    prev_d8 = (prev_answers or {}).get("D", {}).get("D8", {})
    curr_d8 = (curr_answers or {}).get("D", {}).get("D8", {})
    if not isinstance(prev_d8, dict) or not isinstance(curr_d8, dict):
        return {"direction": "유지", "items": [], "summary": "심리 컨디션 데이터가 없습니다."}

    items = []
    improved = 0
    declined = 0

    for field_key, label in _D8_FIELD_LABELS.items():
        prev_val = prev_d8.get(field_key)
        curr_val = curr_d8.get(field_key)
        if prev_val == curr_val:
            continue

        order = _D8_POSITIVE_DIRECTION.get(field_key, [])
        direction = _cr_direction_label(prev_val, curr_val, order)

        val_labels = _D8_VALUE_LABELS.get(field_key, {})
        items.append({
            "field": field_key,
            "label": label,
            "prev": val_labels.get(prev_val, prev_val),
            "curr": val_labels.get(curr_val, curr_val),
            "direction": direction,
        })

        if direction == "개선":
            improved += 1
        elif direction == "하락":
            declined += 1

    # subject_giveup
    prev_giveup = prev_d8.get("subject_giveup", {})
    curr_giveup = curr_d8.get("subject_giveup", {})
    if isinstance(prev_giveup, dict) and isinstance(curr_giveup, dict):
        prev_has = prev_giveup.get("has_giveup")
        curr_has = curr_giveup.get("has_giveup")
        if prev_has != curr_has:
            direction = "개선" if curr_has == "없음" and prev_has == "고민중" else "하락" if curr_has == "고민중" else "변경"
            items.append({
                "field": "subject_giveup",
                "label": "과목 포기 고민",
                "prev": f"{prev_has}" + (f" ({prev_giveup.get('subject_name', '')})" if prev_has == "고민중" else ""),
                "curr": f"{curr_has}" + (f" ({curr_giveup.get('subject_name', '')})" if curr_has == "고민중" else ""),
                "direction": direction,
            })
            if direction == "개선":
                improved += 1
            elif direction == "하락":
                declined += 1

    overall = "유지"
    if not items:
        summary = "심리 컨디션 변동 없음"
    else:
        if improved > declined:
            overall = "개선"
        elif declined > improved:
            overall = "하락"
        summary = f"{len(items)}개 항목 변동 (개선 {improved}, 하락 {declined})"

    return {
        "direction": overall,
        "items": items,
        "summary": summary,
    }


def _cr_build_goal_section(prev_answers: dict, curr_answers: dict) -> dict:
    """E category goal/career change analysis for change-report."""
    prev_e = (prev_answers or {}).get("E", {})
    curr_e = (curr_answers or {}).get("E", {})
    if not isinstance(prev_e, dict) or not isinstance(curr_e, dict):
        return {"direction": "유지", "items": [], "summary": "목표 데이터가 없습니다."}

    items = []

    # E1: 희망 진로
    prev_e1 = prev_e.get("E1")
    curr_e1 = curr_e.get("E1")
    if prev_e1 != curr_e1:
        items.append({"field": "E1", "label": "희망 진로", "prev": prev_e1, "curr": curr_e1, "direction": "변경"})

    # E2: 목표 대학·학과
    prev_e2 = prev_e.get("E2", {})
    curr_e2 = curr_e.get("E2", {})
    if isinstance(prev_e2, dict) and isinstance(curr_e2, dict):
        for subfield, label in [("target_level", "목표 대학 수준"), ("target_university", "목표 대학"), ("target_major", "목표 학과")]:
            pv = prev_e2.get(subfield)
            cv = curr_e2.get(subfield)
            if pv != cv:
                items.append({"field": f"E2.{subfield}", "label": label, "prev": pv, "curr": cv, "direction": "변경"})

    # E3: 대입 전형 전략
    prev_e3 = prev_e.get("E3", {})
    curr_e3 = curr_e.get("E3", {})
    if isinstance(prev_e3, dict) and isinstance(curr_e3, dict):
        pv_under = prev_e3.get("understanding")
        cv_under = curr_e3.get("understanding")
        if pv_under != cv_under:
            direction = "유지"
            if isinstance(pv_under, (int, float)) and isinstance(cv_under, (int, float)):
                direction = "개선" if cv_under > pv_under else "하락" if cv_under < pv_under else "유지"
            items.append({"field": "E3.understanding", "label": "전형 이해도", "prev": pv_under, "curr": cv_under, "direction": direction})

        pv_type = prev_e3.get("preferred_type")
        cv_type = curr_e3.get("preferred_type")
        if pv_type != cv_type:
            items.append({"field": "E3.preferred_type", "label": "선호 전형", "prev": pv_type, "curr": cv_type, "direction": "변경"})

    # E6: 학습 우선순위
    prev_e6 = prev_e.get("E6")
    curr_e6 = curr_e.get("E6")
    if prev_e6 != curr_e6:
        items.append({"field": "E6", "label": "학습 우선순위", "prev": prev_e6, "curr": curr_e6, "direction": "변경"})

    has_changes = len(items) > 0
    return {
        "direction": "변경" if has_changes else "유지",
        "items": items,
        "summary": f"{len(items)}개 목표/진로 항목 변동" if has_changes else "목표/진로 변동 없음",
    }


def _cr_build_overall_summary(grades: dict, study: dict, psych: dict, goals: dict) -> dict:
    """Build overall summary from all sections."""
    sections = [
        ("성적", grades["direction"]),
        ("학습법", study["direction"]),
        ("심리컨디션", psych["direction"]),
        ("목표", goals["direction"]),
    ]

    improved = sum(1 for _, d in sections if d == "개선")
    declined = sum(1 for _, d in sections if d == "하락")
    changed = sum(1 for _, d in sections if d not in ("유지",))

    if improved > declined and improved >= 2:
        overall = "개선"
        icon = "up"
    elif declined > improved and declined >= 2:
        overall = "하락"
        icon = "down"
    elif changed == 0:
        overall = "유지"
        icon = "stable"
    else:
        overall = "혼재"
        icon = "mixed"

    parts = []
    improved_areas = [n for n, d in sections if d == "개선"]
    declined_areas = [n for n, d in sections if d == "하락"]
    if improved_areas:
        parts.append(f"{'·'.join(improved_areas)} 영역 개선")
    if declined_areas:
        parts.append(f"{'·'.join(declined_areas)} 영역 하락")
    if not parts:
        parts.append("전 영역 유지")

    return {
        "overall_direction": overall,
        "icon": icon,
        "summary": ", ".join(parts),
        "section_directions": {n: d for n, d in sections},
    }


@router.get("/{survey_id}/change-report")
async def get_change_report(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """변화 추적 종합 리포트: 성적·학습법·심리·목표 변화를 구조화된 리포트로 생성"""
    survey = await _get_visible_survey(survey_id, user, db)
    if survey.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출된 설문만 변화 추적 리포트를 조회할 수 있습니다",
        )

    prev_q = (
        select(ConsultationSurvey)
        .where(
            ConsultationSurvey.user_id == survey.user_id,
            ConsultationSurvey.survey_type == survey.survey_type,
            ConsultationSurvey.id != survey.id,
            ConsultationSurvey.status == "submitted",
            ConsultationSurvey.created_at < survey.created_at,
        )
        .order_by(ConsultationSurvey.created_at.desc())
        .limit(1)
    )
    prev_result = await db.execute(prev_q)
    previous = prev_result.scalar_one_or_none()

    if not previous:
        return {
            "has_previous": False,
            "summary": None,
            "grades": None,
            "study_methods": None,
            "psychology": None,
            "goals": None,
        }

    prev_answers = previous.answers or {}
    curr_answers = survey.answers or {}

    grades = _cr_build_grade_section(prev_answers, curr_answers)
    study = _cr_build_study_method_section(prev_answers, curr_answers)
    psych = _cr_build_psych_section(prev_answers, curr_answers)
    goals = _cr_build_goal_section(prev_answers, curr_answers)
    overall = _cr_build_overall_summary(grades, study, psych, goals)

    return {
        "has_previous": True,
        "previous_timing": previous.timing,
        "current_timing": survey.timing,
        "previous_submitted_at": previous.submitted_at.isoformat() if previous.submitted_at else None,
        "current_submitted_at": survey.submitted_at.isoformat() if survey.submitted_at else None,
        "summary": overall,
        "grades": grades,
        "study_methods": study,
        "psychology": psych,
        "goals": goals,
    }


# ----- 로드맵 진행 체크 업데이트 -----

class RoadmapProgressRequest(BaseModel):
    progress: dict  # { "p0": { "academic": true }, ... }


@router.patch("/{survey_id}/roadmap-progress")
async def update_roadmap_progress(
    survey_id: uuid.UUID,
    data: RoadmapProgressRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학생용 로드맵 진행 체크 업데이트"""
    survey = await _get_owned_survey(survey_id, user, db)
    if survey.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출된 설문만 로드맵 진행 체크를 업데이트할 수 있습니다",
        )

    existing = dict(survey.roadmap_progress or {})
    for phase_key, tracks in data.progress.items():
        if phase_key not in existing:
            existing[phase_key] = {}
        if isinstance(tracks, dict):
            existing[phase_key].update(tracks)

    survey.roadmap_progress = existing
    await db.commit()
    await db.refresh(survey)
    return {"roadmap_progress": survey.roadmap_progress}


# ----- 이어쓰기 토큰 발급 + 이메일 -----

@router.post("/{survey_id}/resume-token", response_model=ResumeTokenResponse)
async def create_resume_token(
    survey_id: uuid.UUID,
    data: ResumeTokenRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    이어쓰기 토큰 발급. 기존 토큰이 있으면 덮어씀.
    send_email=True면 사용자 이메일로 이어쓰기 링크 발송.
    """
    survey = await _get_owned_survey(survey_id, user, db)
    if survey.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출된 설문은 이어쓰기 토큰을 발급할 수 없습니다",
        )

    try:
        token, expires_at = await issue_resume_token(
            survey, db, expires_in_hours=data.expires_in_hours
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    resume_url = build_resume_url(token)
    email_sent = False

    if data.send_email and user.email:
        survey_label = "예비고1 사전 상담 설문" if survey.survey_type == "preheigh1" else "사전 상담 설문"
        if survey.timing:
            survey_label = f"{survey_label} ({survey.timing})"
        email_sent = await send_survey_resume_email(
            to=user.email,
            name=user.name,
            resume_url=resume_url,
            expires_at_str=expires_at.strftime("%Y-%m-%d %H:%M UTC"),
            survey_label=survey_label,
        )

    return ResumeTokenResponse(
        survey_id=survey.id,
        resume_token=token,
        expires_at=expires_at,
        resume_url=resume_url,
        email_sent=email_sent,
    )


# ----- 부분 저장 (이어쓰기) -----

@router.patch("/{survey_id}", response_model=SurveyResponse)
async def patch_survey(
    survey_id: uuid.UUID,
    data: SurveyPatchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    설문 부분 저장 (자동저장/이어쓰기용).
    - submitted 상태에서도 수정 허용 (상담사 확인 전이라면 자유롭게 수정)
    - answers는 카테고리 단위 머지
    - category_status는 키 단위 머지
    - last_known_updated_at 전송 시 낙관적 잠금 (충돌 시 409)
    - 학부모가 자녀 설문 편집 시 respondent="parent" 카테고리만 허용
    """
    survey, is_parent_editing = await _get_writable_survey(survey_id, user, db)

    # 낙관적 잠금: 클라이언트가 보낸 시점과 서버 시점 비교
    if data.last_known_updated_at is not None and survey.updated_at is not None:
        # 1초 이내 차이는 허용 (datetime 직렬화 정밀도 차이 보정)
        diff = abs((survey.updated_at - data.last_known_updated_at).total_seconds())
        if diff > 1.0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="다른 기기 또는 사용자가 이 설문을 수정했습니다. 새로고침 후 다시 시도해주세요.",
            )

    # 학부모가 자녀 설문 편집: respondent="parent" 카테고리만 수정 가능
    if is_parent_editing:
        parent_cats = get_parent_category_ids(survey.survey_type)
        if data.answers:
            blocked = set(data.answers.keys()) - parent_cats
            if blocked:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"학부모는 학부모 관점 카테고리만 수정할 수 있습니다. (허용: {sorted(parent_cats)})",
                )
        if data.category_status:
            blocked = set(data.category_status.keys()) - parent_cats
            if blocked:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="학부모는 학부모 관점 카테고리 상태만 변경할 수 있습니다.",
                )

    if data.answers is not None:
        survey.answers = _deep_merge_answers(survey.answers or {}, data.answers)

    if data.category_status is not None:
        merged_status = dict(survey.category_status or {})
        merged_status.update(data.category_status)
        survey.category_status = merged_status

    if data.last_category is not None:
        survey.last_category = data.last_category
    if data.last_question is not None:
        survey.last_question = data.last_question
    if data.last_edited_platform is not None:
        survey.last_edited_platform = data.last_edited_platform
    if data.note is not None:
        survey.note = data.note

    await db.commit()
    await db.refresh(survey)
    return SurveyResponse.model_validate(survey)


# ----- 제출 -----

@router.post("/{survey_id}/submit", response_model=SurveyResponse)
async def submit_survey(
    survey_id: uuid.UUID,
    data: SurveySubmitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    설문 제출. status를 submitted로 전환하고 submitted_at 기록.
    재제출 허용 (이미 submitted여도 다시 호출 가능 - 상담 직전 최종 갱신 케이스).
    """
    if not data.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출을 확정하려면 confirm=true 가 필요합니다",
        )

    survey = await _get_owned_survey(survey_id, user, db)
    survey.status = "submitted"
    survey.submitted_at = datetime.utcnow()
    # 제출 완료 시 이어쓰기 토큰 즉시 무효화 (재발급은 가능)
    survey.resume_token = None
    survey.resume_token_expires_at = None
    await db.commit()
    await db.refresh(survey)
    return SurveyResponse.model_validate(survey)


# ----- 삭제 -----

@router.delete("/{survey_id}")
async def delete_survey(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    설문 삭제 (draft 상태만 허용).
    submitted 설문은 상담 기록의 일부이므로 사용자 측에서 삭제 불가.
    """
    survey = await _get_owned_survey(survey_id, user, db)
    if survey.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제출된 설문은 삭제할 수 없습니다",
        )
    await db.delete(survey)
    await db.commit()
    return {"message": "설문이 삭제되었습니다"}
