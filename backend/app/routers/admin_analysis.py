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
    elif data.status == "review":
        # Phase C (2026-04-17): 검수 대기 진입
        order.reviewed_at = datetime.utcnow()
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


# ═══════════════════════════════════════════════════════════════
#  Phase C (2026-04-17): analyzer 배치 반자동 연동 + 검수 흐름
#  - analyzer 가 admin JWT 로 인증하여 대기 큐 조회 / 파일 다운로드 / 리포트 업로드
#  - 관리자 admin-web 에서 "확인 완료" / "재분석 요청" 버튼으로 검수 흐름 제어
# ═══════════════════════════════════════════════════════════════

from fastapi.responses import StreamingResponse
from io import BytesIO


class PendingAnalysisItem(BaseModel):
    """analyzer analysis_fetcher 가 일괄 조회하는 대기 큐 항목."""
    analysis_id: uuid.UUID
    user_name: str
    service_type: str
    status: str
    school_record_filename: str | None
    target_university: str | None
    target_major: str | None
    memo: str | None
    review_feedback: str | None  # 재분석 요청 시 관리자 피드백 (processing 재진입 시 참고)
    is_text_pdf: bool | None
    uploaded_at: datetime | None
    processing_at: datetime | None


@router.get("/_internal/pending-list", response_model=list[PendingAnalysisItem])
async def list_pending_analyses(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Phase C: analyzer 가 배치 처리를 위해 조회하는 대기 목록.
    상태 'processing' (관리자 "분석 시작" 또는 "재분석 요청" 후) 만 반환.
    """
    matched_user_ids = await _get_matched_user_ids(admin, db)

    query = (
        select(AnalysisOrder, User)
        .join(User, AnalysisOrder.user_id == User.id)
        .where(AnalysisOrder.status == "processing")
    )
    if matched_user_ids is not None:
        query = query.where(AnalysisOrder.user_id.in_(matched_user_ids))
    query = query.order_by(AnalysisOrder.processing_at.asc().nulls_last())

    rows = (await db.execute(query)).all()
    out: list[PendingAnalysisItem] = []
    for order, user in rows:
        _is_text = None
        if order.school_record_url:
            try:
                _is_text = is_text_pdf(order.school_record_url)
            except Exception:
                _is_text = None
        out.append(PendingAnalysisItem(
            analysis_id=order.id,
            user_name=user.name,
            service_type=order.service_type,
            status=order.status,
            school_record_filename=order.school_record_filename,
            target_university=order.target_university,
            target_major=order.target_major,
            memo=order.memo,
            review_feedback=order.review_feedback,
            is_text_pdf=_is_text,
            uploaded_at=order.uploaded_at,
            processing_at=order.processing_at,
        ))
    return out


@router.get("/_internal/{order_id}/school-record-file")
async def download_school_record_file(
    order_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Phase C: analyzer 가 학생부 원본 PDF 를 raw bytes 로 받기 위한 엔드포인트.
    (기존 /download 는 S3 presigned URL 반환. 이건 직접 스트리밍)
    """
    from app.services.file_service import _load_pdf_bytes_for_storage

    matched_user_ids = await _get_matched_user_ids(admin, db)
    query = select(AnalysisOrder).where(AnalysisOrder.id == order_id)
    if matched_user_ids is not None:
        query = query.where(AnalysisOrder.user_id.in_(matched_user_ids))
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 요청을 찾을 수 없습니다")
    if not order.school_record_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="학생부 파일이 아직 업로드되지 않았습니다")

    try:
        data = _load_pdf_bytes_for_storage(order.school_record_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 로드 실패: {e}")

    filename = order.school_record_filename or f"{order.id}.pdf"
    return StreamingResponse(
        BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/_internal/{order_id}/upload-report-auto")
async def upload_report_auto(
    order_id: uuid.UUID,
    excel_file: UploadFile = File(...),
    pdf_file: UploadFile = File(...),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Phase C: analyzer 가 리포트 생성 후 자동 업로드.
    상태 변경: processing → review (관리자 검수 대기)
    """
    matched_user_ids = await _get_matched_user_ids(admin, db)
    query = select(AnalysisOrder).where(AnalysisOrder.id == order_id)
    if matched_user_ids is not None:
        query = query.where(AnalysisOrder.user_id.in_(matched_user_ids))
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 요청을 찾을 수 없습니다")

    if order.status not in ("processing", "review"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"업로드 불가한 상태입니다: {order.status} (processing/review 에서만 허용)",
        )

    # Excel 업로드
    s3_key_xlsx, _ = await upload_file(excel_file, "reports")
    order.report_excel_url = s3_key_xlsx
    # PDF 업로드
    s3_key_pdf, _ = await upload_file(pdf_file, "reports")
    order.report_pdf_url = s3_key_pdf

    # 상태 전이
    now = datetime.utcnow()
    order.status = "review"
    order.reviewed_at = now
    # 재분석 루프에서 review_feedback 은 유지할 필요 없음 (새 리포트가 업로드됐으므로)
    order.review_feedback = None

    await db.commit()
    return {"message": "리포트가 업로드되었으며 검수 대기 상태로 전환되었습니다", "status": order.status}


class RejectRequest(BaseModel):
    feedback: str | None = None  # 선택 입력 (Q1 B안)


@router.post("/{order_id}/approve")
async def approve_analysis(
    order_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Phase C: 관리자 "확인 완료" → status=completed + 사용자 알림.
    review 상태에서만 허용.
    """
    matched_user_ids = await _get_matched_user_ids(admin, db)
    query = select(AnalysisOrder).where(AnalysisOrder.id == order_id)
    if matched_user_ids is not None:
        query = query.where(AnalysisOrder.user_id.in_(matched_user_ids))
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 요청을 찾을 수 없습니다")
    if order.status != "review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"검수 대기 상태가 아닙니다: {order.status}",
        )

    order.status = "completed"
    order.completed_at = datetime.utcnow()
    order.review_feedback = None

    # 사용자 알림
    user_result = await db.execute(select(User).where(User.id == order.user_id))
    user = user_result.scalar_one_or_none()

    await db.commit()

    if user:
        try:
            await send_analysis_complete_notification(user, db)
            await send_analysis_complete_email(user.email, user.name)
        except Exception as e:
            # 알림 실패가 DB 커밋 취소 사유는 아님
            print(f"[WARN] 완료 알림 발송 실패 (order {order_id}): {e}")

    return {"message": "리포트가 사용자에게 공개되었습니다", "status": "completed"}


@router.post("/{order_id}/reject")
async def reject_analysis(
    order_id: uuid.UUID,
    data: RejectRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Phase C: 관리자 "재분석 요청" → status=processing (재분석 루프).
    피드백은 선택 입력 (Q1 B안). review_feedback 에 저장되어 analyzer 가 참고.
    """
    matched_user_ids = await _get_matched_user_ids(admin, db)
    query = select(AnalysisOrder).where(AnalysisOrder.id == order_id)
    if matched_user_ids is not None:
        query = query.where(AnalysisOrder.user_id.in_(matched_user_ids))
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="분석 요청을 찾을 수 없습니다")
    if order.status != "review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"검수 대기 상태가 아닙니다: {order.status}",
        )

    # processing 으로 복귀, 피드백 저장
    order.status = "processing"
    order.processing_at = datetime.utcnow()
    order.review_feedback = (data.feedback or "").strip() or None

    await db.commit()
    return {
        "message": "재분석 요청되었습니다. analyzer 에서 다시 처리됩니다.",
        "status": "processing",
        "feedback_saved": bool(order.review_feedback),
    }
