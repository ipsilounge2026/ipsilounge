import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.analysis_order import AnalysisOrder
from app.models.user import User
from app.schemas.analysis import AnalysisListResponse, AnalysisOrderResponse
from app.services.file_service import generate_download_url, upload_file
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/analysis", tags=["분석"])


@router.post("/upload", response_model=AnalysisOrderResponse)
async def upload_school_record(
    file: UploadFile = File(...),
    target_university: str | None = Form(None),
    target_major: str | None = Form(None),
    memo: str | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학생부 파일 업로드 + 분석 요청"""
    s3_key, filename = await upload_file(file, "school-records")

    order = AnalysisOrder(
        user_id=user.id,
        school_record_url=s3_key,
        school_record_filename=filename,
        target_university=target_university,
        target_major=target_major,
        memo=memo,
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
        from fastapi import HTTPException, status
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
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="리포트가 아직 준비되지 않았습니다")
    url = generate_download_url(order.report_pdf_url)
    return {"download_url": url}


async def _get_user_order(order_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> AnalysisOrder:
    result = await db.execute(
        select(AnalysisOrder).where(AnalysisOrder.id == order_id, AnalysisOrder.user_id == user_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 요청을 찾을 수 없습니다")
    return order


@router.get("/compare")
async def compare_analysis(
    ids: str,  # 쉼표 구분 UUID 목록 (최대 3건)
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """복수 분석 결과 비교 (최대 3건)"""
    from fastapi import HTTPException, status

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
        status=order.status,
        school_record_filename=order.school_record_filename,
        target_university=order.target_university,
        target_major=order.target_major,
        memo=order.memo,
        admin_memo=order.admin_memo,
        created_at=order.created_at,
        processing_at=order.processing_at,
        completed_at=order.completed_at,
        has_report=bool(order.report_excel_url or order.report_pdf_url),
    )
