import uuid
from datetime import datetime

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.analysis_order import AnalysisOrder
from app.models.user import User
from app.schemas.analysis import AnalysisApplyRequest, AnalysisListResponse, AnalysisOrderResponse
from app.services.file_service import generate_download_url, upload_file
from app.utils.dependencies import get_current_user
from app.utils.family import get_visible_owner_ids, resolve_owner_id
from app.utils.rate_limiter import limiter

router = APIRouter(prefix="/api/analysis", tags=["분석"])


@router.post("/apply", response_model=AnalysisOrderResponse)
async def apply_analysis(
    data: AnalysisApplyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """분석 신청 (파일 업로드 없이 신청만)"""
    if data.service_type not in ("학생부라운지", "학종라운지"):
        raise HTTPException(status_code=400, detail="service_type은 '학생부라운지' 또는 '학종라운지'여야 합니다")

    owner_id = await resolve_owner_id(user, db, data.owner_user_id)

    # 3개월 쿨다운 확인 (owner 기준)
    last_order_result = await db.execute(
        select(AnalysisOrder).where(
            AnalysisOrder.user_id == owner_id,
            AnalysisOrder.status != "cancelled",
        ).order_by(AnalysisOrder.created_at.desc())
    )
    last = last_order_result.scalar_one_or_none()
    if last:
        cooldown_end = last.created_at + relativedelta(months=3)
        if datetime.utcnow() < cooldown_end:
            raise HTTPException(
                status_code=400,
                detail=f"이전 신청일({last.created_at.strftime('%Y.%m.%d')}) 기준 3개월 이후({cooldown_end.strftime('%Y.%m.%d')})부터 재신청이 가능합니다."
            )

    order = AnalysisOrder(
        user_id=owner_id,
        service_type=data.service_type,
        status="applied",
        target_university=data.target_university,
        target_major=data.target_major,
        memo=data.memo,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    return _to_response(order)


@router.post("/{order_id}/upload", response_model=AnalysisOrderResponse)
@limiter.limit("10/hour")
async def upload_school_record(
    request: Request,
    order_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """신청 건에 학생부 파일 업로드"""
    order = await _get_visible_order(order_id, user, db)

    if order.status not in ("applied",):
        raise HTTPException(status_code=400, detail="파일 업로드는 '신청완료' 상태에서만 가능합니다")

    s3_key, filename = await upload_file(file, "school-records")

    order.school_record_url = s3_key
    order.school_record_filename = filename
    order.status = "uploaded"
    order.uploaded_at = datetime.utcnow()

    await db.commit()
    await db.refresh(order)

    return _to_response(order)


@router.post("/upload", response_model=AnalysisOrderResponse)
@limiter.limit("10/hour")
async def upload_and_apply(
    request: Request,
    file: UploadFile = File(...),
    service_type: str = Form("학생부라운지"),
    target_university: str | None = Form(None),
    target_major: str | None = Form(None),
    memo: str | None = Form(None),
    owner_user_id: str | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학생부 파일 업로드 + 분석 요청 (기존 호환용 - 신청과 업로드 동시)"""
    owner_id = await resolve_owner_id(user, db, owner_user_id)
    s3_key, filename = await upload_file(file, "school-records")

    order = AnalysisOrder(
        user_id=owner_id,
        service_type=service_type,
        status="uploaded",
        school_record_url=s3_key,
        school_record_filename=filename,
        target_university=target_university,
        target_major=target_major,
        memo=memo,
        uploaded_at=datetime.utcnow(),
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    return _to_response(order)


@router.get("/list", response_model=AnalysisListResponse)
async def list_my_analysis(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내 분석 목록 조회.

    가시성 규칙:
    - 학생: 본인 신청 건만
    - 학부모: 본인 + 연결된 자녀들의 신청 건 (가족 연결 도입 전 학부모 직접 신청분 포함)
    """
    visible_ids = await get_visible_owner_ids(user, db)
    result = await db.execute(
        select(AnalysisOrder)
        .where(AnalysisOrder.user_id.in_(visible_ids))
        .order_by(AnalysisOrder.created_at.desc())
    )
    orders = result.scalars().all()

    count_result = await db.execute(
        select(func.count()).where(AnalysisOrder.user_id.in_(visible_ids))
    )
    total = count_result.scalar()

    return AnalysisListResponse(
        items=[_to_response(o) for o in orders],
        total=total,
    )


@router.get("/check-apply-cooldown")
async def check_apply_cooldown(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """분석 신청 쿨다운 확인"""
    last_order_result = await db.execute(
        select(AnalysisOrder).where(
            AnalysisOrder.user_id == user.id,
            AnalysisOrder.status != "cancelled",
        ).order_by(AnalysisOrder.created_at.desc())
    )
    last = last_order_result.scalar_one_or_none()
    if not last:
        return {"can_apply": True, "cooldown_until": None, "last_applied": None}

    cooldown_end = last.created_at + relativedelta(months=3)
    can_apply = datetime.utcnow() >= cooldown_end
    return {
        "can_apply": can_apply,
        "cooldown_until": cooldown_end.strftime("%Y-%m-%d") if not can_apply else None,
        "last_applied": last.created_at.strftime("%Y-%m-%d"),
    }


@router.get("/check-consultation-eligible")
async def check_consultation_eligible(
    consultation_type: str = Query(default="학생부분석"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """상담 예약 가능 여부 확인 (유형별 분기)

    기획서 §4-8-2: 학습상담도 학생부/학종 라운지와 동일한 7일 리드타임 적용.
    - 학생부/학종: 학생부 업로드 + 7일
    - 학습상담:   사전질문(submitted) + 7일
    - 심리상담/기타: 즉시 가능
    """
    from datetime import timedelta

    # 학습상담 — 사전질문 제출 기준 7일 리드타임
    if consultation_type == "학습상담":
        from app.models.consultation_survey import ConsultationSurvey
        # 사용자의 가장 최근 submitted 설문 조회 (high + preheigh1)
        survey_result = await db.execute(
            select(ConsultationSurvey)
            .where(
                ConsultationSurvey.user_id == user.id,
                ConsultationSurvey.status == "submitted",
                ConsultationSurvey.survey_type.in_(["high", "preheigh1"]),
            )
            .order_by(ConsultationSurvey.submitted_at.desc())
        )
        survey = survey_result.scalar_one_or_none()

        if not survey or not survey.submitted_at:
            return {
                "eligible": False,
                "reason": "학습상담 예약을 위해 먼저 사전 설문을 제출해주세요.",
                "earliest_date": None,
                "needs_survey": True,
                "required_service": "학습상담_설문",
            }

        # 차단(blocked) 상태 설문 — 예약은 허용하나 상담 진행은 잠김 (§4-8-1)
        analysis_blocked = (survey.analysis_status == "blocked")

        eligible_date = (survey.submitted_at + timedelta(days=7)).date()
        return {
            "eligible": True,
            "reason": None,
            "earliest_date": eligible_date.isoformat(),
            "needs_survey": False,
            "required_service": "학습상담",
            "analysis_status": survey.analysis_status,
            "analysis_blocked": analysis_blocked,
            "analysis_block_reason": (
                "자동 분석 결과 검증에 실패하여 슈퍼관리자 점검 중입니다. "
                "상담 예약은 가능하나 상담 진행은 점검 완료 후 가능합니다."
                if analysis_blocked else None
            ),
        }

    # 심리상담/기타 — 리드타임 없음
    if consultation_type in ("심리상담", "기타"):
        return {
            "eligible": True,
            "reason": None,
            "earliest_date": None,
            "needs_survey": True,
        }

    # 선배상담 — 리드타임 없음, 단 선배-학생 매칭 필수
    if consultation_type == "선배상담":
        from app.models.admin import SeniorStudentAssignment
        assignment_result = await db.execute(
            select(SeniorStudentAssignment).where(
                SeniorStudentAssignment.user_id == user.id
            )
        )
        assignment = assignment_result.scalar_one_or_none()
        if not assignment:
            return {
                "eligible": False,
                "reason": "선배와 매칭이 필요합니다. 학원에 문의해주세요.",
                "earliest_date": None,
                "needs_survey": False,
                "required_service": "선배매칭",
            }
        return {
            "eligible": True,
            "reason": None,
            "earliest_date": None,
            "needs_survey": False,
        }

    # 학생부분석 → 학생부라운지 / 학종전략 → 학종라운지로 매핑
    consultation_to_service = {
        "학생부분석": "학생부라운지",
        "학종전략": "학종라운지",
    }
    required_service = consultation_to_service.get(consultation_type)
    if not required_service:
        return {
            "eligible": False,
            "reason": "알 수 없는 상담 유형입니다.",
            "earliest_date": None,
            "needs_survey": False,
        }

    service_label = "학생부 라운지" if required_service == "학생부라운지" else "학종 라운지"

    # 해당 service_type의 업로드 완료된 주문만 확인
    result = await db.execute(
        select(AnalysisOrder).where(
            AnalysisOrder.user_id == user.id,
            AnalysisOrder.service_type == required_service,
            AnalysisOrder.status.in_(["uploaded", "processing", "completed"]),
            AnalysisOrder.uploaded_at.isnot(None),
        ).order_by(AnalysisOrder.uploaded_at.asc())
    )
    orders = result.scalars().all()

    if not orders:
        # 동일 서비스 타입에서 신청만 하고 파일 미업로드인지 확인
        applied_result = await db.execute(
            select(AnalysisOrder).where(
                AnalysisOrder.user_id == user.id,
                AnalysisOrder.service_type == required_service,
                AnalysisOrder.status == "applied",
            )
        )
        applied_orders = applied_result.scalars().all()

        if applied_orders:
            return {
                "eligible": False,
                "reason": f"{service_label} 학생부 파일 업로드를 완료해주세요. 신청은 완료되었으나 학생부 파일이 아직 업로드되지 않았습니다.",
                "earliest_date": None,
                "needs_survey": False,
                "required_service": required_service,
            }

        return {
            "eligible": False,
            "reason": f"{service_label}를 먼저 신청하고 학생부를 업로드해주세요.",
            "earliest_date": None,
            "needs_survey": False,
            "required_service": required_service,
        }

    # 업로드 완료 → 즉시 상담 예약 가능, 단 예약 날짜는 가장 최근 업로드일+7일 이후만
    from datetime import timedelta
    latest_upload = orders[-1].uploaded_at  # asc 정렬이므로 마지막이 가장 최근
    eligible_date = (latest_upload + timedelta(days=7)).date()

    return {
        "eligible": True,
        "reason": None,
        "earliest_date": eligible_date.isoformat(),
        "needs_survey": False,
        "required_service": required_service,
    }


@router.get("/{order_id}", response_model=AnalysisOrderResponse)
async def get_analysis_detail(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """분석 상세 조회 (본인 + 연결된 자녀)"""
    order = await _get_visible_order(order_id, user, db)
    return _to_response(order)


@router.get("/{order_id}/report/excel")
async def download_report_excel(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """리포트 Excel 다운로드 URL (본인 + 연결된 자녀).
    Phase C (2026-04-17): status=completed 인 경우에만 공개.
    review 상태(관리자 검수 대기) 에서는 파일이 있더라도 사용자에게 노출 안 됨.
    """
    order = await _get_visible_order(order_id, user, db)
    if order.status != "completed" or not order.report_excel_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="리포트가 아직 준비되지 않았습니다")
    url = generate_download_url(order.report_excel_url)
    return {"download_url": url}


@router.get("/{order_id}/report/pdf")
async def download_report_pdf(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """리포트 PDF 다운로드 URL (본인 + 연결된 자녀).
    Phase C (2026-04-17): status=completed 인 경우에만 공개.
    """
    order = await _get_visible_order(order_id, user, db)
    if order.status != "completed" or not order.report_pdf_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="리포트가 아직 준비되지 않았습니다")
    url = generate_download_url(order.report_pdf_url)
    return {"download_url": url}


async def _get_user_order(order_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> AnalysisOrder:
    """본인 소유 신청 건만 조회 (mutation 용 - upload 등)."""
    result = await db.execute(
        select(AnalysisOrder).where(AnalysisOrder.id == order_id, AnalysisOrder.user_id == user_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 요청을 찾을 수 없습니다")
    return order


async def _get_visible_order(order_id: uuid.UUID, user: User, db: AsyncSession) -> AnalysisOrder:
    """가족 연결 가시성 기준 조회 (read-only).

    학부모는 연결된 자녀의 신청 건을 함께 조회할 수 있다.
    """
    visible_ids = await get_visible_owner_ids(user, db)
    result = await db.execute(
        select(AnalysisOrder).where(
            AnalysisOrder.id == order_id,
            AnalysisOrder.user_id.in_(visible_ids),
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 요청을 찾을 수 없습니다")
    return order


@router.get("/compare")
async def compare_analysis(
    ids: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """복수 분석 결과 비교 (최대 3건, 본인 + 연결된 자녀)"""
    id_list = [uid.strip() for uid in ids.split(",") if uid.strip()]
    if len(id_list) < 2:
        raise HTTPException(status_code=400, detail="비교하려면 2건 이상 선택하세요.")
    if len(id_list) > 3:
        raise HTTPException(status_code=400, detail="최대 3건까지 비교 가능합니다.")

    visible_ids = await get_visible_owner_ids(user, db)
    result = await db.execute(
        select(AnalysisOrder).where(
            AnalysisOrder.id.in_(id_list),
            AnalysisOrder.user_id.in_(visible_ids),
        )
    )
    orders = result.scalars().all()

    if len(orders) != len(id_list):
        raise HTTPException(status_code=404, detail="일부 분석 건을 찾을 수 없습니다.")

    return [_to_response(o) for o in orders]


def _to_response(order: AnalysisOrder) -> AnalysisOrderResponse:
    # Phase C (2026-04-17): has_report 는 사용자 관점이므로 status=completed 일 때만 True.
    # review 상태(관리자 검수 대기) 에서는 리포트 파일이 있어도 사용자에게 숨김.
    _report_visible = (order.status == "completed") and bool(
        order.report_excel_url or order.report_pdf_url
    )
    return AnalysisOrderResponse(
        id=order.id,
        service_type=order.service_type,
        status=order.status,
        school_record_filename=order.school_record_filename,
        target_university=order.target_university,
        target_major=order.target_major,
        memo=order.memo,
        admin_memo=order.admin_memo,
        created_at=order.created_at,
        uploaded_at=order.uploaded_at,
        processing_at=order.processing_at,
        completed_at=order.completed_at,
        has_report=_report_visible,
    )
