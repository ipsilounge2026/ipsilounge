"""
사전 상담 설문 (Consultation Survey) CRUD API

엔드포인트:
- POST   /api/consultation-surveys                       새 설문 생성
- GET    /api/consultation-surveys                       내 설문 목록
- GET    /api/consultation-surveys/{id}                  단건 조회 (전체 데이터)
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
    학부모-자녀 간 G 카테고리 분기는 Phase D 에서 별도 처리한다.
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

    survey = ConsultationSurvey(
        user_id=owner_id,
        survey_type=data.survey_type,
        timing=raw_timing,
        mode=raw_mode,
        answers={},
        category_status={},
        status="draft",
        started_platform=data.started_platform,
        last_edited_platform=data.started_platform,
        schema_version=get_schema_version(data.survey_type),
        booking_id=data.booking_id,
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
    """
    survey = await _get_owned_survey(survey_id, user, db)

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
