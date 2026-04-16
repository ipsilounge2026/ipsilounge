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
- GET    /api/admin/satisfaction-surveys/trends    시점별 추이 (월별, 최고관리자 전용)
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
from app.models.consultation_slot import ConsultationSlot
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
    """관리자: 전체 만족도 설문 목록.

    무기명 정책(B 옵션): 개별 응답 raw 데이터는 super_admin / admin 만 조회 가능.
    counselor / senior 등 상담사 본인은 자신의 응답 데이터를 직접 볼 수 없음
    (집계 통계는 /stats, /trends 별도 권한 처리).
    """
    if admin.role not in ("super_admin", "admin"):
        raise HTTPException(status_code=403, detail="개별 응답 조회 권한이 없습니다.")

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
    # Booking → Slot join으로 admin_id와 date를 가져옴
    submitted_q = (
        select(
            ConsultationSlot.admin_id,
            SatisfactionSurvey.survey_type,
            func.count(SatisfactionSurvey.id).label("count"),
        )
        .join(ConsultationBooking, SatisfactionSurvey.booking_id == ConsultationBooking.id)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .where(SatisfactionSurvey.status == "submitted")
        .group_by(ConsultationSlot.admin_id, SatisfactionSurvey.survey_type)
    )
    rows = (await db.execute(submitted_q)).all()

    # 담당자별 평균 점수 계산을 위해 전체 제출 설문 조회
    all_submitted = (
        select(SatisfactionSurvey, ConsultationSlot.admin_id)
        .join(ConsultationBooking, SatisfactionSurvey.booking_id == ConsultationBooking.id)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .where(SatisfactionSurvey.status == "submitted")
    )
    survey_rows = (await db.execute(all_submitted)).all()

    # admin_id -> 통계 집계
    stats: dict[str, dict] = {}
    # 항목별 전체 평균 집계
    item_totals: dict[str, dict] = {}  # key -> {"sum": float, "count": int}
    # 세션 타이밍별 집계 (booking -> timing mapping needed)
    timing_totals: dict[str, dict] = {}  # timing -> {"sum": float, "count": int}

    # booking_id -> timing 매핑을 위해 booking 정보 조회
    booking_ids = [survey.booking_id for survey, _ in survey_rows]
    booking_timing_map: dict[str, str | None] = {}
    booking_date_map: dict[str, str | None] = {}
    if booking_ids:
        booking_q = (
            select(
                ConsultationBooking.id,
                ConsultationBooking.type,
                ConsultationSlot.date.label("slot_date"),
            )
            .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
            .where(ConsultationBooking.id.in_(booking_ids))
        )
        booking_rows = (await db.execute(booking_q)).all()
        for row in booking_rows:
            # type 필드에 session timing이 있을 수 있음 (S1, S2 등)
            booking_timing_map[str(row.id)] = row.type
            booking_date_map[str(row.id)] = row.slot_date.isoformat() if row.slot_date else None

    for survey, admin_id in survey_rows:
        aid = str(admin_id) if admin_id else "unassigned"
        if aid not in stats:
            stats[aid] = {
                "admin_id": aid, "count": 0,
                "total_score": 0.0, "scores_count": 0,
                "item_scores": {},  # key -> {"sum": float, "count": int}
                "last_date": None,
            }
        stats[aid]["count"] += 1
        scores = survey.scores or {}

        # 최근 상담일 추적
        bid = str(survey.booking_id) if survey.booking_id else None
        if bid and booking_date_map.get(bid):
            d = booking_date_map[bid]
            if not stats[aid]["last_date"] or d > stats[aid]["last_date"]:
                stats[aid]["last_date"] = d

        # 세션 타이밍별 집계
        timing = booking_timing_map.get(bid, None) if bid else None

        for key, val in scores.items():
            if isinstance(val, (int, float)):
                stats[aid]["total_score"] += val
                stats[aid]["scores_count"] += 1
                # per-admin per-item
                if key not in stats[aid]["item_scores"]:
                    stats[aid]["item_scores"][key] = {"sum": 0.0, "count": 0}
                stats[aid]["item_scores"][key]["sum"] += val
                stats[aid]["item_scores"][key]["count"] += 1
                # 전체 항목별 평균
                if key not in item_totals:
                    item_totals[key] = {"sum": 0.0, "count": 0}
                item_totals[key]["sum"] += val
                item_totals[key]["count"] += 1

        # 타이밍별 전체 평균 (전체 점수 평균)
        if timing:
            if timing not in timing_totals:
                timing_totals[timing] = {"sum": 0.0, "count": 0}
            score_vals = [v for v in scores.values() if isinstance(v, (int, float))]
            if score_vals:
                timing_totals[timing]["sum"] += sum(score_vals) / len(score_vals)
                timing_totals[timing]["count"] += 1

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
        item_avgs = {}
        for key, d in s["item_scores"].items():
            item_avgs[key] = round(d["sum"] / d["count"], 2) if d["count"] > 0 else 0
        result.append({
            "admin_id": s["admin_id"],
            "admin_name": admin_map.get(s["admin_id"], "미지정"),
            "survey_count": s["count"],
            "average_score": round(avg, 2),
            "item_averages": item_avgs,
            "last_date": s["last_date"],
        })

    result.sort(key=lambda x: x["average_score"], reverse=True)

    # 전체 항목별 평균
    overall_item_avgs = {}
    for key, d in item_totals.items():
        overall_item_avgs[key] = round(d["sum"] / d["count"], 2) if d["count"] > 0 else 0

    # 타이밍별 평균
    timing_avgs = {}
    for timing, d in timing_totals.items():
        timing_avgs[timing] = round(d["sum"] / d["count"], 2) if d["count"] > 0 else 0

    return {
        "stats": result,
        "overall_item_averages": overall_item_avgs,
        "timing_averages": timing_avgs,
    }


@router.get("/api/admin/satisfaction-surveys/trends")
async def admin_survey_trends(
    months: int = Query(6, ge=1, le=24),
    survey_type: str | None = Query(None, description="senior | counselor (None=둘 다)"),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """관리자(최고관리자 전용): 만족도 시점별(월별) 추이.

    응답:
      {
        "months": ["2025-11", "2025-12", ...],
        "senior": [
          {"month": "2025-11", "M1": 8.4, "M2": 8.6, "M3": 8.2, "overall": 8.4, "count": 12},
          ...
        ],
        "counselor": [
          {"month": "2025-11", "C1": 8.1, "C2": 8.3, "C3": 8.0, "overall": 8.1, "count": 9},
          ...
        ]
      }
    """
    if admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="최고관리자 전용 통계입니다")

    # 제출된 설문 + 상담일 조회 (Slot join으로 date 가져옴)
    q = (
        select(
            SatisfactionSurvey.survey_type,
            SatisfactionSurvey.scores,
            ConsultationSlot.date.label("slot_date"),
        )
        .join(ConsultationBooking, SatisfactionSurvey.booking_id == ConsultationBooking.id)
        .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
        .where(SatisfactionSurvey.status == "submitted")
    )
    if survey_type in ("senior", "counselor"):
        q = q.where(SatisfactionSurvey.survey_type == survey_type)

    rows = (await db.execute(q)).all()

    # 최근 N개월 라벨 (오래된 → 최신)
    today = datetime.now().date()
    month_labels: list[str] = []
    y, m = today.year, today.month
    for _ in range(months):
        month_labels.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    month_labels.reverse()
    month_set = set(month_labels)

    # 집계: type -> month -> {key -> {sum, count}, overall {sum, count}, count}
    buckets: dict[str, dict[str, dict]] = {"senior": {}, "counselor": {}}

    for stype, scores, slot_date in rows:
        if not slot_date or stype not in buckets:
            continue
        ym = f"{slot_date.year:04d}-{slot_date.month:02d}"
        if ym not in month_set:
            continue
        if not isinstance(scores, dict):
            continue

        bucket = buckets[stype].setdefault(ym, {"items": {}, "overall": {"sum": 0.0, "count": 0}, "count": 0})
        bucket["count"] += 1

        score_vals: list[float] = []
        for k, v in scores.items():
            if isinstance(v, (int, float)):
                bucket["items"].setdefault(k, {"sum": 0.0, "count": 0})
                bucket["items"][k]["sum"] += v
                bucket["items"][k]["count"] += 1
                score_vals.append(float(v))
        if score_vals:
            bucket["overall"]["sum"] += sum(score_vals) / len(score_vals)
            bucket["overall"]["count"] += 1

    def _series(stype: str, item_keys: list[str]) -> list[dict]:
        out = []
        for ym in month_labels:
            b = buckets[stype].get(ym)
            row: dict = {"month": ym, "count": b["count"] if b else 0}
            if b:
                for k in item_keys:
                    d = b["items"].get(k)
                    row[k] = round(d["sum"] / d["count"], 2) if d and d["count"] > 0 else None
                row["overall"] = (
                    round(b["overall"]["sum"] / b["overall"]["count"], 2)
                    if b["overall"]["count"] > 0
                    else None
                )
            else:
                for k in item_keys:
                    row[k] = None
                row["overall"] = None
            out.append(row)
        return out

    return {
        "months": month_labels,
        "senior": _series("senior", ["M1", "M2", "M3"]),
        "counselor": _series("counselor", ["C1", "C2", "C3"]),
    }


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
