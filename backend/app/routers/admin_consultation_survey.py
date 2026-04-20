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
    analysis_status: str | None = Query(
        None,
        description=(
            "자동 분석 검증 상태 필터. 쉼표 구분 다중 값 허용. "
            "예: 'blocked,repaired,warn' — 슈퍼관리자 QA 이슈 큐 전용."
        ),
    ),
    search: str | None = Query(None, description="학생 이름 또는 이메일 검색"),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설문 목록 조회 (관리자용).

    기획서 §4-8-1: analysis_status 필터로 슈퍼관리자 QA 이슈 큐 화면 구성 가능.
    """
    base = select(ConsultationSurvey).join(User, ConsultationSurvey.user_id == User.id)

    if survey_type:
        base = base.where(ConsultationSurvey.survey_type == survey_type)
    if status:
        base = base.where(ConsultationSurvey.status == status)
    if analysis_status:
        statuses = [s.strip() for s in analysis_status.split(",") if s.strip()]
        if statuses:
            base = base.where(ConsultationSurvey.analysis_status.in_(statuses))
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
            "analysis_status": s.analysis_status,
            "has_admin_memo": bool(s.admin_memo),
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        })

    return {"items": items, "total": total}


# ---- QA 이슈 큐 (슈퍼관리자 전용) ----

@router.get("/qa-issues")
async def list_qa_issues(
    statuses: str = Query(
        "blocked,repaired,warn",
        description="조회할 analysis_status 목록 (쉼표 구분). 기본: blocked,repaired,warn",
    ),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """슈퍼관리자 QA 이슈 큐 전용 엔드포인트 (기획서 §4-8-1).

    목록 + 영향 받는 상담 예약(학생·일시·담당 상담사) + 이슈 분류(P1/P2/P3) 요약 반환.
    super_admin 권한이 아니면 403.
    """
    if admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="슈퍼관리자 권한이 필요합니다.")

    status_list = [s.strip() for s in statuses.split(",") if s.strip()]
    if not status_list:
        status_list = ["blocked", "repaired", "warn"]

    # lazy import to avoid circular imports
    from app.models.consultation_booking import ConsultationBooking
    from app.models.consultation_slot import ConsultationSlot

    result = await db.execute(
        select(ConsultationSurvey, User)
        .join(User, ConsultationSurvey.user_id == User.id)
        .where(ConsultationSurvey.analysis_status.in_(status_list))
        .order_by(
            # blocked 우선, 그 다음 repaired → warn
            ConsultationSurvey.analysis_status.asc(),
            ConsultationSurvey.updated_at.desc(),
        )
    )
    rows = result.all()

    items: list[dict[str, Any]] = []
    for survey, user in rows:
        # 영향 받는 예약 조회 (상담일이 오늘 이후인 건만)
        bookings_q = await db.execute(
            select(ConsultationBooking, ConsultationSlot)
            .join(ConsultationSlot, ConsultationBooking.slot_id == ConsultationSlot.id)
            .where(
                ConsultationBooking.user_id == user.id,
                ConsultationBooking.status.in_(["requested", "confirmed"]),
            )
            .order_by(ConsultationSlot.date.asc(), ConsultationSlot.start_time.asc())
        )
        affected = []
        for b, slot in bookings_q.all():
            counselor_name: str | None = None
            if slot.admin_id:
                try:
                    counselor_uuid = uuid.UUID(slot.admin_id)
                    counselor = (
                        await db.execute(select(Admin).where(Admin.id == counselor_uuid))
                    ).scalar_one_or_none()
                    counselor_name = counselor.name if counselor else None
                except ValueError:
                    counselor_name = None
            affected.append({
                "booking_id": str(b.id),
                "type": b.type,
                "status": b.status,
                "slot_date": slot.date.isoformat(),
                "slot_start_time": slot.start_time.strftime("%H:%M"),
                "slot_end_time": slot.end_time.strftime("%H:%M"),
                "counselor_name": counselor_name,
            })

        validation = survey.analysis_validation or {}
        items.append({
            "survey_id": str(survey.id),
            "user_id": str(user.id),
            "user_name": user.name,
            "user_email": user.email,
            "user_phone": user.phone,
            "survey_type": survey.survey_type,
            "timing": survey.timing,
            "mode": survey.mode,
            "analysis_status": survey.analysis_status,
            "submitted_at": survey.submitted_at.isoformat() if survey.submitted_at else None,
            "updated_at": survey.updated_at.isoformat(),
            "p1_issues": validation.get("p1_issues", []),
            "p2_issues": validation.get("p2_issues", []),
            "p3_issues": validation.get("p3_issues", []),
            "auto_repaired": bool(validation.get("auto_repaired", False)),
            "repair_log": validation.get("repair_log", []),
            "validated_at": validation.get("validated_at"),
            "affected_bookings": affected,
        })

    summary = {
        "total": len(items),
        "blocked": sum(1 for i in items if i["analysis_status"] == "blocked"),
        "repaired": sum(1 for i in items if i["analysis_status"] == "repaired"),
        "warn": sum(1 for i in items if i["analysis_status"] == "warn"),
    }
    return {"summary": summary, "items": items}


@router.post("/{survey_id}/revalidate")
async def revalidate_survey(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """설문 자동 분석 결과 재검증 (슈퍼관리자 QA 큐에서 수동 트리거).

    기획서 §4-8-1: '수정 후 재배포 → 다음 조회 시 자동 재검증 → 통과 시 잠금 자동 해제'.
    - 일반적으로는 computed 조회 시 자동 재검증되지만, 슈퍼관리자가
      데이터 수정 후 즉시 잠금 해제 판정을 보고 싶을 때 사용.
    """
    if admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="슈퍼관리자 권한이 필요합니다.")

    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    computed = _compute_stats(survey.survey_type, survey.answers, survey.timing)
    merged = _merge_overrides(computed, survey.counselor_overrides)

    from app.services.survey_qa_validator import validate_with_repair
    qa = validate_with_repair(
        merged,
        survey.survey_type,
        answers=survey.answers,
        timing=survey.timing,
    )

    prev_status = survey.analysis_status
    survey.analysis_status = qa["status"]
    survey.analysis_validation = qa
    await db.commit()

    # blocked → pass/repaired 자동 전환 시 리포트 준비 완료 푸시 (첫 전환 시에만)
    if (
        prev_status in ("blocked", "pending", None)
        and qa["status"] in ("pass", "repaired")
        and survey.user_id is not None
    ):
        try:
            from app.services.notification_service import send_report_ready_notification
            student = (
                await db.execute(select(User).where(User.id == survey.user_id))
            ).scalar_one_or_none()
            if student:
                await send_report_ready_notification(user=student, db=db)
        except Exception:
            pass

    # V3 §4-8-1: blocked → pass/repaired 자동 해제 시 담당 상담사에게도 이메일
    if (
        prev_status == "blocked"
        and qa["status"] in ("pass", "repaired")
        and survey.user_id is not None
    ):
        try:
            from app.services.review_notification_service import notify_analysis_unblocked
            await notify_analysis_unblocked(db, survey.user_id)
        except Exception:
            pass

    return {
        "survey_id": str(survey.id),
        "prev_status": prev_status,
        "new_status": qa["status"],
        "auto_repaired": bool(qa.get("auto_repaired", False)),
        "validation": qa,
    }


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
        "analysis_status": survey.analysis_status,
        "analysis_validation": survey.analysis_validation,
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
    """설문 답변 기반 자동 계산 결과 (상담사 override 포함) + 자체 검증 결과"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    computed = _compute_stats(survey.survey_type, survey.answers, survey.timing)
    merged = _merge_overrides(computed, survey.counselor_overrides)

    # 기획서 §4-8-1: 상담사 전달 전 자동 분석 결과 자체 검증 + 자동 보정
    from app.services.survey_qa_validator import validate_with_repair
    qa = validate_with_repair(
        merged,
        survey.survey_type,
        answers=survey.answers,
        timing=survey.timing,
    )
    merged["qa_validation"] = qa

    # 검증 상태를 설문 레코드에 영속화 (상담 진행 차단 판정에 사용)
    prev_status = survey.analysis_status
    if survey.analysis_status != qa["status"]:
        survey.analysis_status = qa["status"]
    survey.analysis_validation = qa
    await db.commit()

    # 기획서 §7-1: 상담사가 리포트 검토(=본 엔드포인트 호출) 후 QA 통과(pass/repaired) 전환 시
    # 학생에게 "리포트 준비 완료" 푸시. pending→pass/repaired 최초 전환 1회만 발송.
    if (
        prev_status in (None, "pending")
        and qa["status"] in ("pass", "repaired")
        and survey.user_id is not None
    ):
        try:
            from app.models.user import User as _User
            from app.services.notification_service import send_report_ready_notification
            student = (
                await db.execute(select(_User).where(_User.id == survey.user_id))
            ).scalar_one_or_none()
            if student:
                await send_report_ready_notification(user=student, db=db)
        except Exception:
            # 푸시 실패는 분석 결과 반환에 영향 없도록 graceful degrade
            pass

    # V3 §4-8-1 blocked → pass/repaired 자동 해제: 담당 상담사에게도 이메일
    if (
        prev_status == "blocked"
        and qa["status"] in ("pass", "repaired")
        and survey.user_id is not None
    ):
        try:
            from app.services.review_notification_service import notify_analysis_unblocked
            await notify_analysis_unblocked(db, survey.user_id)
        except Exception:
            pass  # graceful — 분석 결과 반환에 영향 없음

    # V3 §4-8-1 "P1 잔존 시 즉시 슈퍼관리자 알림 큐에 등록":
    # blocked 최초 전환 시점에 모든 super_admin 에게 이메일
    if (
        prev_status != "blocked"
        and qa["status"] == "blocked"
        and survey.user_id is not None
    ):
        try:
            from app.services.review_notification_service import (
                notify_analysis_blocked_to_super_admin,
            )
            await notify_analysis_blocked_to_super_admin(
                db,
                user_id=survey.user_id,
                survey_type=survey.survey_type,
                timing=survey.timing,
                p1_issue_count=len(qa.get("p1_issues", [])),
            )
        except Exception:
            pass  # graceful

    return merged


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


# ---- 수능 최저학력기준 충족 시뮬레이션 ----

@router.get("/{survey_id}/suneung-minimum-simulation")
async def get_suneung_minimum_simulation_admin(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """수능 최저학력기준 충족 시뮬레이션 (관리자용)"""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    if survey.survey_type not in ("high",):
        raise HTTPException(
            status_code=400,
            detail="고등학생 설문만 수능 최저 시뮬레이션을 지원합니다",
        )

    from app.services.suneung_minimum_service import simulate_suneung_minimum
    return simulate_suneung_minimum(survey.answers or {})


@router.get("/{survey_id}/course-requirement-match")
async def get_course_requirement_match(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """권장 이수 과목 매칭 결과 (관리자용).

    학생의 E2 목표 대학/학과 + B1_B4 이수 과목 + E5 수강 예정 과목을 기반으로
    권장과목 DB와 매칭하여 이수 완료/미이수 과목을 반환한다.
    """
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    from app.services.course_requirement_service import build_matching

    return build_matching(survey.answers or {})


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

    # 기획서 §4-8-1: 검증 차단 상태에서는 학생에게 전달되는 리포트 생성 불가
    if admin.role != "super_admin" and survey.analysis_status == "blocked":
        raise HTTPException(
            status_code=423,
            detail=(
                "자동 분석 결과 검증 실패로 리포트 생성이 잠겨 있습니다. "
                "슈퍼관리자의 점검 완료 후 생성 가능합니다."
            ),
        )

    uresult = await db.execute(select(User).where(User.id == survey.user_id))
    user = uresult.scalar_one_or_none()

    from app.surveys.schema_loader import load_schema
    try:
        schema = load_schema(survey.survey_type)
    except Exception:
        schema = None

    computed = _compute_stats(survey.survey_type, survey.answers, survey.timing)
    computed = _merge_overrides(computed, survey.counselor_overrides)

    # 기획서 §4-7/§4-9/§5-4-E4/§7-2: PDF에 로드맵·권장과목·수능최저·Delta 섹션 포함
    extras: dict[str, Any] = {}
    if survey.survey_type == "high":
        # 권장과목 매칭
        try:
            from app.services.course_requirement_service import build_matching
            extras["course_requirement_match"] = build_matching(survey.answers or {})
        except Exception:
            extras["course_requirement_match"] = None

        # 수능 최저 시뮬레이션
        try:
            from app.services.suneung_minimum_service import simulate_suneung_minimum
            extras["suneung_minimum"] = simulate_suneung_minimum(survey.answers or {})
        except Exception:
            extras["suneung_minimum"] = None

        # Delta 모드: 이전 설문 대비 변화
        if (survey.mode or "").lower() == "delta":
            try:
                prev_q = (
                    select(ConsultationSurvey)
                    .where(
                        ConsultationSurvey.user_id == survey.user_id,
                        ConsultationSurvey.survey_type == survey.survey_type,
                        ConsultationSurvey.id != survey.id,
                        ConsultationSurvey.created_at < survey.created_at,
                    )
                    .order_by(ConsultationSurvey.created_at.desc())
                    .limit(1)
                )
                prev_res = await db.execute(prev_q)
                previous = prev_res.scalar_one_or_none()
                if previous:
                    diff = _compute_delta(previous.answers or {}, survey.answers or {})
                    extras["delta_change"] = {
                        "has_previous": True,
                        "previous_timing": previous.timing,
                        "previous_submitted_at": (
                            previous.submitted_at.isoformat() if previous.submitted_at else None
                        ),
                        "diff": diff,
                        "summary": _summarize_delta(diff),
                    }
                else:
                    extras["delta_change"] = {"has_previous": False}
            except Exception:
                extras["delta_change"] = None

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
        pdf_bytes = generate_survey_report_pdf(
            survey_dict, user_info, schema, computed, extras=extras
        )
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

    # 기획서 §4-8-1: 자동 분석 검증 차단 상태에서는 상담 진행(액션 플랜 작성) 불가
    if admin.role != "super_admin" and survey.analysis_status == "blocked":
        raise HTTPException(
            status_code=423,  # Locked
            detail=(
                "자동 분석 결과 검증 실패로 상담 진행이 잠겨 있습니다. "
                "슈퍼관리자의 점검 완료 후 진행 가능합니다."
            ),
        )

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


# ---- 상담사 4영역 점수 직접 수정 (기획서 §4-7 P2) ----

class ScoreOverrideRequest(BaseModel):
    """고등학생 4영역 점수 수동 재산출 요청.

    각 영역은 0~100 사이 정수. null 또는 누락 시 해당 영역은 오버라이드 해제.
    """
    naesin: int | None = Field(None, ge=0, le=100, description="내신 경쟁력 (0~100)")
    mock: int | None = Field(None, ge=0, le=100, description="모의고사 역량 (0~100)")
    study: int | None = Field(None, ge=0, le=100, description="학습 습관·전략 (0~100)")
    career: int | None = Field(None, ge=0, le=100, description="진로·전형 전략 (0~100)")
    reason: str | None = Field(None, max_length=500, description="수정 사유 (감사 로그)")


@router.patch("/{survey_id}/scores")
async def update_score_overrides(
    survey_id: uuid.UUID,
    data: ScoreOverrideRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상담사가 자동 산출된 4영역 점수(내신·모의·학습·진로)를 직접 수정.

    기획서 §4-7 P2 (HSGAP-P2-counselor-score-override):
    - 4영역 점수 입력 → _grade_label()로 등급 자동 재산출
    - overall_score/overall_grade 재계산 후 counselor_overrides.radar_scores에 저장
    - validate_with_repair() 재실행 → analysis_status/analysis_validation 업데이트
    - before/after 감사 로그를 counselor_overrides.score_override_log에 append
    """
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    if survey.survey_type != "high":
        raise HTTPException(
            status_code=400,
            detail="4영역 점수 직접 수정은 고등학생 설문에만 지원됩니다.",
        )

    # 자동 산출 radar 가져오기 (override 병합 전 원본)
    base_computed = _compute_stats(survey.survey_type, survey.answers, survey.timing)
    base_radar = base_computed.get("radar_scores") or {}
    if not base_radar:
        raise HTTPException(
            status_code=400,
            detail="radar_scores 자동 산출 결과가 없어 점수 수정이 불가합니다.",
        )

    # 이전 override 저장된 값 (감사용 before 값은 실제 반영 중인 값 = 자동 또는 이전 수동)
    existing_overrides = dict(survey.counselor_overrides or {})
    prev_radar = existing_overrides.get("radar_scores") or base_radar

    def _axis_prev(key: str) -> dict:
        axis = prev_radar.get("radar", {}).get(key) or {}
        return {"score": axis.get("score"), "grade": axis.get("grade")}

    before_snapshot = {
        "내신_경쟁력": _axis_prev("내신_경쟁력"),
        "모의고사_역량": _axis_prev("모의고사_역량"),
        "학습습관_전략": _axis_prev("학습습관_전략"),
        "진로전형_전략": _axis_prev("진로전형_전략"),
        "overall_score": prev_radar.get("overall_score"),
        "overall_grade": prev_radar.get("overall_grade"),
    }

    # 새 점수 계산: 입력이 None이면 base_radar의 자동 산출값을 사용
    from app.services.survey_scoring_service import _grade_label as _score_to_grade

    def _pick(override_val: int | None, axis_key: str) -> float:
        if override_val is not None:
            return float(override_val)
        axis = base_radar.get("radar", {}).get(axis_key) or {}
        return float(axis.get("score") or 0)

    naesin_s = _pick(data.naesin, "내신_경쟁력")
    mock_s = _pick(data.mock, "모의고사_역량")
    study_s = _pick(data.study, "학습습관_전략")
    career_s = _pick(data.career, "진로전형_전략")

    new_radar = {
        "radar": {
            "내신_경쟁력": {"score": naesin_s, "grade": _score_to_grade(naesin_s)},
            "모의고사_역량": {"score": mock_s, "grade": _score_to_grade(mock_s)},
            "학습습관_전략": {"score": study_s, "grade": _score_to_grade(study_s)},
            "진로전형_전략": {"score": career_s, "grade": _score_to_grade(career_s)},
        },
        "overall_score": round((naesin_s + mock_s + study_s + career_s) / 4, 1),
        "overall_grade": _score_to_grade((naesin_s + mock_s + study_s + career_s) / 4),
        # 하위 구조는 감사·리포트 호환성을 위해 자동 산출값을 그대로 유지
        "naesin": base_radar.get("naesin"),
        "mock": base_radar.get("mock"),
        "study": base_radar.get("study"),
        "career": base_radar.get("career"),
        # 수동 재산출 표식
        "manual_override": True,
    }

    # 감사 로그 엔트리
    now_iso = datetime.utcnow().isoformat()
    audit_entry = {
        "at": now_iso,
        "by": str(admin.id),
        "by_role": admin.role,
        "reason": data.reason,
        "input": {
            "naesin": data.naesin,
            "mock": data.mock,
            "study": data.study,
            "career": data.career,
        },
        "before": before_snapshot,
        "after": {
            "내신_경쟁력": {"score": naesin_s, "grade": _score_to_grade(naesin_s)},
            "모의고사_역량": {"score": mock_s, "grade": _score_to_grade(mock_s)},
            "학습습관_전략": {"score": study_s, "grade": _score_to_grade(study_s)},
            "진로전형_전략": {"score": career_s, "grade": _score_to_grade(career_s)},
            "overall_score": new_radar["overall_score"],
            "overall_grade": new_radar["overall_grade"],
        },
    }

    # counselor_overrides 갱신
    existing_overrides["radar_scores"] = new_radar
    existing_overrides["score_overrides"] = {
        "naesin": data.naesin,
        "mock": data.mock,
        "study": data.study,
        "career": data.career,
        "_updated_at": now_iso,
        "_updated_by": str(admin.id),
    }
    log = list(existing_overrides.get("score_override_log") or [])
    log.append(audit_entry)
    existing_overrides["score_override_log"] = log[-20:]  # 최근 20건만 보관
    existing_overrides["_updated_at"] = now_iso
    existing_overrides["_updated_by"] = str(admin.id)
    survey.counselor_overrides = existing_overrides

    # QA 재검증 (validate_with_repair)
    merged = _merge_overrides(base_computed, existing_overrides)
    from app.services.survey_qa_validator import validate_with_repair
    qa = validate_with_repair(
        merged,
        survey.survey_type,
        answers=survey.answers,
        timing=survey.timing,
    )
    survey.analysis_status = qa["status"]
    survey.analysis_validation = qa

    await db.commit()

    return {
        "ok": True,
        "radar_scores": new_radar,
        "score_overrides": existing_overrides["score_overrides"],
        "audit_entry": audit_entry,
        "qa_validation": qa,
        "analysis_status": qa["status"],
    }


@router.delete("/{survey_id}/scores")
async def clear_score_overrides(
    survey_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """4영역 점수 오버라이드 해제 (자동 산출값으로 복원). 다른 override는 유지."""
    result = await db.execute(
        select(ConsultationSurvey).where(ConsultationSurvey.id == survey_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=404, detail="설문을 찾을 수 없습니다")

    existing_overrides = dict(survey.counselor_overrides or {})
    removed_keys = []
    for k in ("radar_scores", "score_overrides"):
        if k in existing_overrides:
            existing_overrides.pop(k)
            removed_keys.append(k)

    # 감사 로그
    if removed_keys:
        now_iso = datetime.utcnow().isoformat()
        log = list(existing_overrides.get("score_override_log") or [])
        log.append({
            "at": now_iso,
            "by": str(admin.id),
            "by_role": admin.role,
            "action": "clear",
            "removed_keys": removed_keys,
        })
        existing_overrides["score_override_log"] = log[-20:]
        existing_overrides["_updated_at"] = now_iso
        existing_overrides["_updated_by"] = str(admin.id)

    survey.counselor_overrides = existing_overrides or None

    # QA 재검증
    base_computed = _compute_stats(survey.survey_type, survey.answers, survey.timing)
    merged = _merge_overrides(base_computed, survey.counselor_overrides)
    from app.services.survey_qa_validator import validate_with_repair
    qa = validate_with_repair(
        merged,
        survey.survey_type,
        answers=survey.answers,
        timing=survey.timing,
    )
    survey.analysis_status = qa["status"]
    survey.analysis_validation = qa

    await db.commit()
    return {
        "ok": True,
        "removed": removed_keys,
        "qa_validation": qa,
        "analysis_status": qa["status"],
    }


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
        # C4 유형 판정 자동 생성 (입결 DB 기반)
        try:
            from app.services.counselor_type_service import determine_counselor_type
            result["c4_type"] = determine_counselor_type(answers)
        except Exception:
            result["c4_type"] = None
        # 6개 영역 분석 코멘트 자동 초안 생성
        try:
            from app.services.comment_generation_service import generate_all_comments
            result["auto_comments"] = generate_all_comments(
                answers=answers,
                radar_scores=radar,
                computed_stats=result,
                c4_result=result.get("c4_type"),
            )
        except Exception:
            result["auto_comments"] = {}
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
    from app.services.survey_scoring_service import _extract_ph1_subjects

    result: dict[str, Any] = {}

    # --- 중학교 성적 추이 (카테고리 C: C1~C6) ---
    cat_c = answers.get("C", {})
    semesters = ["C1", "C2", "C3", "C4", "C5", "C6"]
    semester_labels = ["중1-1", "중1-2", "중2-1", "중2-2", "중3-1", "중3-2"]
    # 스키마: 중1 전체(C1/C2) = 자유학기제, 중3(C5/C6) = 미진행 가능
    _exempt_label_by_reason = {
        "free_semester": "자유학기제",
        "not_graded": "미진행 (성적 미산출)",
    }
    subjects = ["ko", "en", "ma", "so", "sc"]
    subject_names = {"ko": "국어", "en": "영어", "ma": "수학", "so": "사회", "sc": "과학"}

    score_trend: list[dict] = []
    subject_trends: dict[str, list] = {s: [] for s in subjects}
    # V2_2 §3-2 "자유학기제 구간 점선 표시" — 차트가 exempt 범위를 그릴 수 있도록
    # 6개 학기 전부 메타 반환. data 는 raw_score 가 있는 학기만 포함 (기존 로직 유지).
    semester_meta: list[dict] = []

    for i, sem_key in enumerate(semesters):
        sem_data = cat_c.get(sem_key)
        is_exempt = bool(isinstance(sem_data, dict) and sem_data.get("exempt"))
        exempt_reason = (
            sem_data.get("exempt_reason") if isinstance(sem_data, dict) else None
        )
        semester_meta.append({
            "key": sem_key,
            "semester": semester_labels[i],
            "exempt": is_exempt,
            "exempt_reason": exempt_reason if is_exempt else None,
            "exempt_label": (
                _exempt_label_by_reason.get(exempt_reason or "", "해당 없음")
                if is_exempt else None
            ),
        })

        if not sem_data or not isinstance(sem_data, dict) or is_exempt:
            continue

        # 실제 과목 점수는 SemesterGradeMatrix 구조의 subjects 하위에 있음
        subj_dict = _extract_ph1_subjects(sem_data)
        sem_scores = []
        for subj in subjects:
            subj_data = subj_dict.get(subj, {})
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
        # V2_2 §3-2 자유학기제 구간 점선 표시용 메타
        "semester_meta": semester_meta,
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
