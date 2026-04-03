import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.analysis_order import AnalysisOrder
from app.models.user import User
from app.schemas.analysis import AnalysisApplyRequest, AnalysisListResponse, AnalysisOrderResponse
from app.services.file_service import generate_download_url, upload_file
from app.utils.dependencies import get_current_user

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

    order = AnalysisOrder(
        user_id=user.id,
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
async def upload_school_record(
    order_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """신청 건에 학생부 파일 업로드"""
    order = await _get_user_order(order_id, user.id, db)

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
async def upload_and_apply(
    file: UploadFile = File(...),
    service_type: str = Form("학생부라운지"),
    target_university: str | None = Form(None),
    target_major: str | None = Form(None),
    memo: str | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학생부 파일 업로드 + 분석 요청 (기존 호환용 - 신청과 업로드 동시)"""
    s3_key, filename = await upload_file(file, "school-records")

    order = AnalysisOrder(
        user_id=user.id,
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
    """내 분석 목록 조회"""
    result = await db.execute(
        select(AnalysisOrder)
        .where(AnalysisOrder.user_id == user.id)
        .order_by(AnalysisOrder.created_at.desc())
    )
    orders = result.scalars().all()

    count_result = await db.execute(
        select(func.count()).where(AnalysisOrder.user_id == user.id)
    )
    total = count_result.scalar()

    return AnalysisListResponse(
        items=[_to_response(o) for o in orders],
        total=total,
    )


@router.get("/check-consultation-eligible")
async def check_consultation_eligible(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """상담 예약 가능 여부 확인 (업로드 완료 시 즉시 가능, earliest_date는 예약 가능 최소 날짜)"""
    # 업로드 완료된 주문 확인
    result = await db.execute(
        select(AnalysisOrder).where(
            AnalysisOrder.user_id == user.id,
            AnalysisOrder.status.in_(["uploaded", "processing", "completed"]),
            AnalysisOrder.uploaded_at.isnot(None),
        ).order_by(AnalysisOrder.uploaded_at.asc())
    )
    orders = result.scalars().all()

    if not orders:
        # 신청만 하고 파일 미업로드인지 확인
        applied_result = await db.execute(
            select(AnalysisOrder).where(
                AnalysisOrder.user_id == user.id,
                AnalysisOrder.status == "applied",
            )
        )
        applied_orders = applied_result.scalars().all()

        if applied_orders:
            return {
                "eligible": False,
                "reason": "학생부 파일 업로드를 완료해주세요. 신청은 완료되었으나 학생부 파일이 아직 업로드되지 않았습니다.",
                "earliest_date": None,
            }

        return {
            "eligible": False,
            "reason": "학생부 라운지 또는 학종 라운지를 먼저 신청하고 학생부를 업로드해주세요.",
            "earliest_date": None,
        }

    # 업로드 완료 → 즉시 상담 예약 가능, 단 예약 날짜는 업로드일+7일 이후만
    from datetime import timedelta
    earliest_upload = orders[0].uploaded_at
    eligible_date = (earliest_upload + timedelta(days=7)).date()

    return {
        "eligible": True,
        "reason": None,
        "earliest_date": eligible_date.isoformat(),
    }


@router.get("/{order_id}", response_model=AnalysisOrderResponse)
async def get_analysis_detail(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """분석 상세 조회"""
    order = await _get_user_order(order_id, user.id, db)
    return _to_response(order)


@router.get("/{order_id}/report/excel")
async def download_report_excel(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """리포트 Excel 다운로드 URL"""
    order = await _get_user_order(order_id, user.id, db)
    if not order.report_excel_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="리포트가 아직 준비되지 않았습니다")
    url = generate_download_url(order.report_excel_url)
    return {"download_url": url}


@router.get("/{order_id}/report/pdf")
async def download_report_pdf(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """리포트 PDF 다운로드 URL"""
    order = await _get_user_order(order_id, user.id, db)
    if not order.report_pdf_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="리포트가 아직 준비되지 않았습니다")
    url = generate_download_url(order.report_pdf_url)
    return {"download_url": url}


async def _get_user_order(order_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> AnalysisOrder:
    result = await db.execute(
        select(AnalysisOrder).where(AnalysisOrder.id == order_id, AnalysisOrder.user_id == user_id)
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
    """복수 분석 결과 비교 (최대 3건)"""
    id_list = [uid.strip() for uid in ids.split(",") if uid.strip()]
    if len(id_list) < 2:
        raise HTTPException(status_code=400, detail="비교하려면 2건 이상 선택하세요.")
    if len(id_list) > 3:
        raise HTTPException(status_code=400, detail="최대 3건까지 비교 가능합니다.")

    result = await db.execute(
        select(AnalysisOrder).where(
            AnalysisOrder.id.in_(id_list),
            AnalysisOrder.user_id == user.id,
        )
    )
    orders = result.scalars().all()

    if len(orders) != len(id_list):
        raise HTTPException(status_code=404, detail="일부 분석 건을 찾을 수 없습니다.")

    return [_to_response(o) for o in orders]


def _to_response(order: AnalysisOrder) -> AnalysisOrderResponse:
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
        has_report=bool(order.report_excel_url or order.report_pdf_url),
    )
