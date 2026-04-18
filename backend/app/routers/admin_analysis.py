import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models.admin import Admin, AdminStudentAssignment
from app.models.analysis_order import AnalysisOrder
from app.models.user import User
from app.schemas.analysis import AdminAnalysisResponse, AnalysisStatusUpdate
from app.models.interview_question import InterviewQuestion, QuestionCategory
from app.services.email_service import send_analysis_complete_email
from app.services.file_service import generate_download_url, is_text_pdf, upload_file
from app.services.notification_service import send_analysis_complete_notification
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/analysis", tags=["관리자-분석"])


async def _get_matched_user_ids(admin: Admin, db: AsyncSession) -> list | None:
    """담당자/상담자인 경우 매칭된 학생 user_id 목록 반환. 최고관리자는 None(전체)."""
    if admin.role == "super_admin":
        return None
    result = await db.execute(
        select(AdminStudentAssignment.user_id).where(AdminStudentAssignment.admin_id == admin.id)
    )
    return [row[0] for row in result.all()]


@router.get("/stats")
async def get_analysis_stats(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """신청/업로드/처리 건수 통계"""
    matched_user_ids = await _get_matched_user_ids(admin, db)

    stats = {}
    for s in ["applied", "uploaded", "processing", "completed", "cancelled"]:
        q = select(func.count()).select_from(AnalysisOrder).where(AnalysisOrder.status == s)
        if matched_user_ids is not None:
            q = q.where(AnalysisOrder.user_id.in_(matched_user_ids))
        r = await db.execute(q)
        stats[s] = r.scalar()
    total_q = select(func.count()).select_from(AnalysisOrder)
    if matched_user_ids is not None:
        total_q = total_q.where(AnalysisOrder.user_id.in_(matched_user_ids))
    total_r = await db.execute(total_q)
    stats["total"] = total_r.scalar()
    return stats


@router.get("/list")
async def list_all_analysis(
    status_filter: str | None = None,
    service_type_filter: str | None = None,
    page: int = 1,
    size: int = 20,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """전체 분석 접수 목록 (담당자/상담자는 매칭된 학생만)"""
    matched_user_ids = await _get_matched_user_ids(admin, db)

    query = select(AnalysisOrder, User).join(User, AnalysisOrder.user_id == User.id)
    count_query = select(func.count()).select_from(AnalysisOrder)

    if matched_user_ids is not None:
        query = query.where(AnalysisOrder.user_id.in_(matched_user_ids))
        count_query = count_query.where(AnalysisOrder.user_id.in_(matched_user_ids))

    if status_filter:
        query = query.where(AnalysisOrder.status == status_filter)
        count_query = count_query.where(AnalysisOrder.status == status_filter)

    if service_type_filter:
        query = query.where(AnalysisOrder.service_type == service_type_filter)
        count_query = count_query.where(AnalysisOrder.service_type == service_type_filter)

    query = query.order_by(AnalysisOrder.created_at.desc()).offset((page - 1) * size).limit(size)

    result = await db.execute(query)
    rows = result.all()

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    items = [
        AdminAnalysisResponse(
            id=order.id,
            user_id=user.id,
            user_name=user.name,
            user_email=user.email,
            user_phone=user.phone,
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
        for order, user in rows
    ]

    return {"items": items, "total": total, "page": page, "size": size}


@router.get("/{order_id}")
async def get_analysis_detail(
    order_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """접수 상세 (담당자/상담자는 매칭된 학생만)"""
    matched_user_ids = await _get_matched_user_ids(admin, db)

    query = (
        select(AnalysisOrder, User)
        .join(User, AnalysisOrder.user_id == User.id)
        .where(AnalysisOrder.id == order_id)
    )
    if matched_user_ids is not None:
        query = query.where(AnalysisOrder.user_id.in_(matched_user_ids))

    result = await db.execute(query)
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 요청을 찾을 수 없습니다")

    order, user = row

    # G6 Phase B: 학생부 PDF 텍스트 레이어 감지 (스캔 PDF 경고용)
    # school_record_url 이 없으면 None, 있으면 True/False 판별
    _is_text = None
    if order.school_record_url:
        try:
            _is_text = is_text_pdf(order.school_record_url)
        except Exception:
            _is_text = None  # 판별 실패 시 None

    return AdminAnalysisResponse(
        id=order.id,
        user_id=user.id,
        user_name=user.name,
        user_email=user.email,
        user_phone=user.phone,
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
        is_text_pdf=_is_text,
    )


@router.get("/{order_id}/download")
async def download_school_record(
    order_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """학생부 파일 다운로드 URL (담당자/상담자는 매칭된 학생만)"""
    matched_user_ids = await _get_matched_user_ids(admin, db)

    query = select(AnalysisOrder).where(AnalysisOrder.id == order_id)
    if matched_user_ids is not None:
        query = query.where(AnalysisOrder.user_id.in_(matched_user_ids))
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 요청을 찾을 수 없습니다")

    url = generate_download_url(order.school_record_url)
    return {"download_url": url, "filename": order.school_record_filename}


@router.post("/{order_id}/upload-report")
async def upload_report(
    order_id: uuid.UUID,
    excel_file: UploadFile | None = File(None),
    pdf_file: UploadFile | None = File(None),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """리포트 업로드 (Excel, PDF 중 하나 이상, 담당자/상담자는 매칭된 학생만)"""
    matched_user_ids = await _get_matched_user_ids(admin, db)

    query = select(AnalysisOrder).where(AnalysisOrder.id == order_id)
    if matched_user_ids is not None:
        query = query.where(AnalysisOrder.user_id.in_(matched_user_ids))
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 요청을 찾을 수 없습니다")

    if excel_file is None and pdf_file is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Excel 또는 PDF 파일을 하나 이상 업로드해주세요")

    if excel_file:
        s3_key, _ = await upload_file(excel_file, "reports")
        order.report_excel_url = s3_key

    if pdf_file:
        s3_key, _ = await upload_file(pdf_file, "reports")
        order.report_pdf_url = s3_key

    await db.commit()
    return {"message": "리포트가 업로드되었습니다"}


@router.put("/{order_id}/status")
async def update_analysis_status(
    order_id: uuid.UUID,
    data: AnalysisStatusUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """상태 변경 + 완료 시 알림 발송 (담당자/상담자는 매칭된 학생만)"""
    matched_user_ids = await _get_matched_user_ids(admin, db)

    query = select(AnalysisOrder).where(AnalysisOrder.id == order_id)
    if matched_user_ids is not None:
        query = query.where(AnalysisOrder.user_id.in_(matched_user_ids))
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 요청을 찾을 수 없습니다")

    order.status = data.status
    if data.admin_memo is not None:
        order.admin_memo = data.admin_memo

    if data.status == "uploaded":
        order.uploaded_at = datetime.utcnow()
    elif data.status == "processing":
        order.processing_at = datetime.utcnow()
    elif data.status == "completed":
        order.completed_at = datetime.utcnow()
        # 사용자에게 FCM 알림 + 이메일 발송
        user_result = await db.execute(select(User).where(User.id == order.user_id))
        user = user_result.scalar_one_or_none()
        if user:
            await send_analysis_complete_notification(user, db)
            await send_analysis_complete_email(user.email, user.name)

    await db.commit()
    return {"message": f"상태가 '{data.status}'로 변경되었습니다"}


# ─── 면접 예상 질문 ───────────────────────────────────────────────────────

class InterviewQuestionCreate(BaseModel):
    question: str
    category: QuestionCategory
    hint: str | None = None


@router.get("/{order_id}/interview-questions")
async def get_interview_questions_admin(
    order_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """면접 질문 목록 조회 (관리자, 담당자/상담자는 매칭된 학생만)"""
    matched_user_ids = await _get_matched_user_ids(admin, db)
    if matched_user_ids is not None:
        order_check = await db.execute(
            select(AnalysisOrder).where(AnalysisOrder.id == order_id, AnalysisOrder.user_id.in_(matched_user_ids))
        )
        if order_check.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 건을 찾을 수 없습니다.")

    result = await db.execute(
        select(InterviewQuestion)
        .where(InterviewQuestion.analysis_order_id == order_id)
        .order_by(InterviewQuestion.category, InterviewQuestion.created_at)
    )
    questions = result.scalars().all()
    return [{"id": str(q.id), "question": q.question, "category": q.category, "hint": q.hint} for q in questions]


@router.post("/{order_id}/interview-questions")
async def add_interview_question(
    order_id: uuid.UUID,
    data: InterviewQuestionCreate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """면접 질문 추가 (관리자가 수동 등록, 담당자/상담자는 매칭된 학생만)"""
    matched_user_ids = await _get_matched_user_ids(admin, db)

    query = select(AnalysisOrder).where(AnalysisOrder.id == order_id)
    if matched_user_ids is not None:
        query = query.where(AnalysisOrder.user_id.in_(matched_user_ids))
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="분석 건을 찾을 수 없습니다.")

    question = InterviewQuestion(
        analysis_order_id=order_id,
        question=data.question,
        category=data.category,
        hint=data.hint,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return {"id": str(question.id), "question": question.question, "category": question.category, "hint": question.hint}


@router.delete("/{order_id}/interview-questions/{question_id}")
async def delete_interview_question(
    order_id: uuid.UUID,
    question_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """면접 질문 삭제 (담당자/상담자는 매칭된 학생만)"""
    matched_user_ids = await _get_matched_user_ids(admin, db)
    if matched_user_ids is not None:
        order_check = await db.execute(
            select(AnalysisOrder).where(AnalysisOrder.id == order_id, AnalysisOrder.user_id.in_(matched_user_ids))
        )
        if order_check.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 건을 찾을 수 없습니다.")

    result = await db.execute(
        select(InterviewQuestion).where(
            InterviewQuestion.id == question_id,
            InterviewQuestion.analysis_order_id == order_id,
        )
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="면접 질문을 찾을 수 없습니다.")

    await db.delete(question)
    await db.commit()
    return {"message": "삭제 완료"}
