"""
상담 후 만족도 설문 — 학생용 + 관리자용 API

학생 엔드포인트:
- GET    /api/satisfaction-surveys/schema         설문 문항 스키마 조회 (인증 불필요)
- GET    /api/satisfaction-surveys                내 설문 목록
- GET    /api/satisfaction-surveys/{id}           단건 조회
- PATCH  /api/satisfaction-surveys/{id}           부분 저장 (scores/free_text)
- POST   /api/satisfaction-surveys/{id}/submit    제출

관리자 엔드포인트:
- GET    /api/admin/satisfaction-surveys           전체 설문 목록
- GET    /api/admin/satisfaction-surveys/stats     통계 (상담사/선배별)
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.consultation_booking import ConsultationBooking
from app.models.satisfaction_survey import SatisfactionSurvey
from app.models.user import User
from app.utils.dependencies import get_current_admin, get_current_user

router = APIRouter(tags=["만족도 설문"])

# ============================================================
# 설문 문항 정의 (하드코딩)
# ============================================================

COMMON_ITEMS = [
    {"key": "S1", "label": "전반 만족도", "question": "오늘 상담에 대한 전반적인 만족도는?"},
    {"key": "S2", "label": "이해도", "question": "상담 내용이 이해하기 쉬웠나요?"},
    {"key": "S3", "label": "분위기", "question": "상담 분위기가 편안했나요?"},
    {"key": "S4", "label": "실행 가능성", "question": "상담 후 앞으로 무엇을 해야 할지 방향이 잡혔나요?"},
    {"key": "S5", "label": "재이용 의향", "question": "다음에도 이 상담을 받고 싶나요?"},
]

COUNSELOR_ITEMS = [
    {"key": "C1", "label": "데이터 분석", "question": "성적/데이터 분석 결과가 도움이 되었나요?"},
    {"key": "C2", "label": "전략 구체성", "question": "과목별 학습 전략이 구체적이었나요?"},
    {"key": "C3", "label": "진로 조언", "question": "진로/전형 방향에 대한 조언이 도움이 되었나요?"},
]

SENIOR_ITEMS = [
    {"key": "M1", "label": "경험 공유", "question": "선배의 실제 경험담이 도움이 되었나요?"},
    {"key": "M2", "label": "경청/공감", "question": "선배가 내 이야기를 잘 들어주었나요?"},
    {"key": "M3", "label": "실전 정보", "question": "선배가 알려준 정보(학교, 시험, 동아리 등)가 유용했나요?"},
]

FREE_TEXT_ITEMS = [
    {"key": "F1", "label": "도움이 된 부분", "question": "상담에서 가장 도움이 된 부분은?", "required": False},
    {"key": "F2", "label": "개선 의견", "question": "아쉬웠거나 개선했으면 하는 점이 있다면?", "required": False},
]

# 점수 항목 키 모음 (검증용)
COMMON_KEYS = {item["key"] for item in COMMON_ITEMS}
COUNSELOR_KEYS = {item["key"] for item in COUNSELOR_ITEMS}
SENIOR_KEYS = {item["key"] for item in SENIOR_ITEMS}


def _required_score_keys(survey_type: str) -> set[str]:
    """제출 시 반드시 필요한 점수 항목 키 반환"""
    keys = COMMON_KEYS.copy()
    if survey_type == "counselor":
        keys |= COUNSELOR_KEYS
    elif survey_type == "senior":
        keys |= SENIOR_KEYS
    return keys


# ============================================================
# Pydantic 요청 스키마
# ============================================================

class SurveyPatchRequest(BaseModel):
    scores: dict | None = None
    free_text: dict | None = None


# ============================================================
# 학생 엔드포인트
# ============================================================

@router.get("/api/satisfaction-surveys/schema")
async def get_schema(survey_type: str = Query("counselor", regex="^(counselor|senior)$")):
    """만족도 설문 문항 스키마 조회 (인증 불필요)"""
    type_items = COUNSELOR_ITEMS if survey_type == "counselor" else SENIOR_ITEMS
    return {
        "survey_type": survey_type,
        "scale": {"min": 1, "max": 10},
        "common_items": COMMON_ITEMS,
        "type_items": type_items,
        "free_text_items": FREE_TEXT_ITEMS,
    }


@router.get("/api/satisfaction-surveys")
async def list_my_surveys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내 만족도 설문 목록"""
    result = await db.execute(
        select(SatisfactionSurvey)
        .where(SatisfactionSurvey.user_id == user.id)
        .order_by(SatisfactionSurvey.created_at.desc())
    )
    surveys = result.scalars().all()
    return {"surveys": [_to_dict(s) for s in surveys]}


@router.get("/api/satisfaction-surveys/{survey_id}")
async def get_survey(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """단건 조회"""
    survey = await _get_owned(survey_id, user, db)
    return _to_dict(survey)


@router.patch("/api/satisfaction-surveys/{survey_id}")
async def patch_survey(
    survey_id: uuid.UUID,
    data: SurveyPatchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """부분 저장 (scores/free_text)"""
    survey = await _get_owned(survey_id, user, db)
    if survey.status != "pending":
        raise HTTPException(status_code=400, detail="제출된 설문은 수정할 수 없습니다")

    if data.scores:
        merged_scores = dict(survey.scores or {})
        merged_scores.update(data.scores)
        survey.scores = merged_scores

    if data.free_text:
        merged_text = dict(survey.free_text or {})
        merged_text.update(data.free_text)
        survey.free_text = merged_text

    await db.commit()
    await db.refresh(survey)
    return _to_dict(survey)


@router.post("/api/satisfaction-surveys/{survey_id}/submit")
async def submit_survey(
    survey_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """제출 (모든 점수 항목 1-10 검증)"""
    survey = await _get_owned(survey_id, user, db)
    if survey.status == "submitted":
        raise HTTPException(status_code=400, detail="이미 제출된 설문입니다")

    # 만료 확인
    if survey.expires_at and datetime.utcnow() > survey.expires_at:
        raise HTTPException(status_code=400, detail="설문 응답 기한이 만료되었습니다")

    # 필수 점수 항목 검증
    required_keys = _required_score_keys(survey.survey_type)
    scores = survey.scores or {}
    missing = required_keys - set(scores.keys())
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"미응답 항목이 있습니다: {', '.join(sorted(missing))}",
        )

    # 점수 범위 검증 (1-10)
    for key in required_keys:
        val = scores.get(key)
        if not isinstance(val, (int, float)) or not (1 <= val <= 10):
            raise HTTPException(
                status_code=400,
                detail=f"항목 {key}의 점수는 1~10 사이여야 합니다",
            )

    survey.status = "submitted"
    survey.submitted_at = datetime.utcnow()
    await db.commit()
    await db.refresh(survey)
    return _to_dict(survey)


# ============================================================
# 관리자 엔드포인트
# ============================================================

@router.get("/api/admin/satisfaction-surveys")
async def admin_list_surveys(
    survey_type: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """관리자: 전체 만족도 설문 목록"""
    q = select(SatisfactionSurvey)
    if survey_type:
        q = q.where(SatisfactionSurvey.survey_type == survey_type)
    if status:
        q = q.where(SatisfactionSurvey.status == status)
    q = q.order_by(SatisfactionSurvey.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(q)
    surveys = result.scalars().all()

    # 총 건수
    count_q = select(func.count(SatisfactionSurvey.id))
    if survey_type:
        count_q = count_q.where(SatisfactionSurvey.survey_type == survey_type)
    if status:
        count_q = count_q.where(SatisfactionSurvey.status == status)
    total = (await db.execute(count_q)).scalar() or 0

    return {
        "total": total,
        "surveys": [_to_dict(s) for s in surveys],
    }


@router.get("/api/admin/satisfaction-surveys/stats")
async def admin_survey_stats(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """관리자: 상담사/선배별 만족도 통계"""
    # 제출된 설문만 대상
    submitted_q = (
        select(
            ConsultationBooking.admin_id,
            SatisfactionSurvey.survey_type,
            func.count(SatisfactionSurvey.id).label("count"),
        )
        .join(ConsultationBooking, SatisfactionSurvey.booking_id == ConsultationBooking.id)
        .where(SatisfactionSurvey.status == "submitted")
        .group_by(ConsultationBooking.admin_id, SatisfactionSurvey.survey_type)
    )
    rows = (await db.execute(submitted_q)).all()

    # 담당자별 평균 점수 계산을 위해 전체 제출 설문 조회
    all_submitted = (
        select(SatisfactionSurvey, ConsultationBooking.admin_id)
        .join(ConsultationBooking, SatisfactionSurvey.booking_id == ConsultationBooking.id)
        .where(SatisfactionSurvey.status == "submitted")
    )
    survey_rows = (await db.execute(all_submitted)).all()

    # admin_id -> 통계 집계
    stats: dict[str, dict] = {}
    for survey, admin_id in survey_rows:
        aid = str(admin_id) if admin_id else "unassigned"
        if aid not in stats:
            stats[aid] = {"admin_id": aid, "count": 0, "total_score": 0.0, "scores_count": 0}
        stats[aid]["count"] += 1
        scores = survey.scores or {}
        for val in scores.values():
            if isinstance(val, (int, float)):
                stats[aid]["total_score"] += val
                stats[aid]["scores_count"] += 1

    # 평균 계산 + Admin 이름 조회
    admin_ids = [s["admin_id"] for s in stats.values() if s["admin_id"] != "unassigned"]
    admin_map: dict[str, str] = {}
    if admin_ids:
        admin_result = await db.execute(
            select(Admin.id, Admin.name).where(Admin.id.in_([uuid.UUID(a) for a in admin_ids]))
        )
        for row in admin_result.all():
            admin_map[str(row.id)] = row.name

    result = []
    for s in stats.values():
        avg = s["total_score"] / s["scores_count"] if s["scores_count"] > 0 else 0.0
        result.append({
            "admin_id": s["admin_id"],
            "admin_name": admin_map.get(s["admin_id"], "미지정"),
            "survey_count": s["count"],
            "average_score": round(avg, 2),
        })

    result.sort(key=lambda x: x["average_score"], reverse=True)
    return {"stats": result}


# ============================================================
# 헬퍼
# ============================================================

async def _get_owned(survey_id: uuid.UUID, user: User, db: AsyncSession) -> SatisfactionSurvey:
    result = await db.execute(
        select(SatisfactionSurvey).where(
            SatisfactionSurvey.id == survey_id,
            SatisfactionSurvey.user_id == user.id,
        )
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")
    return survey


def _to_dict(survey: SatisfactionSurvey) -> dict:
    return {
        "id": str(survey.id),
        "user_id": str(survey.user_id),
        "booking_id": str(survey.booking_id),
        "survey_type": survey.survey_type,
        "status": survey.status,
        "scores": survey.scores or {},
        "free_text": survey.free_text or {},
        "submitted_at": survey.submitted_at.isoformat() if survey.submitted_at else None,
        "expires_at": survey.expires_at.isoformat() if survey.expires_at else None,
        "created_at": survey.created_at.isoformat() if survey.created_at else None,
    }
