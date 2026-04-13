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
    revoke_resume_token,
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
                    detail=f"학부모는 학부모 관점 카테고리 상태만 변경할 수 있습니다.",
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
