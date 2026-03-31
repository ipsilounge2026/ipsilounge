import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.admission_case import AdmissionCase
from app.models.analysis_order import AnalysisOrder
from app.models.analysis_share import AnalysisShare
from app.models.interview_question import InterviewQuestion
from app.models.user import User
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api", tags=["합격 사례 / 면접 질문"])


# ─── 합격 사례 (사용자 공개) ───────────────────────────────────────────────

@router.get("/admission-cases")
async def list_public_cases(
    university: str | None = None,
    major: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """공개된 합격 사례 목록 조회"""
    query = (
        select(AdmissionCase)
        .where(AdmissionCase.is_public == True)  # noqa: E712
        .order_by(AdmissionCase.admission_year.desc())
    )
    if university:
        query = query.where(AdmissionCase.university.ilike(f"%{university}%"))
    if major:
        query = query.where(AdmissionCase.major.ilike(f"%{major}%"))

    result = await db.execute(query)
    cases = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "university": c.university,
            "major": c.major,
            "admission_year": c.admission_year,
            "admission_type": c.admission_type,
            "grade_average": c.grade_average,
            "setuek_grade": c.setuek_grade,
            "changche_grade": c.changche_grade,
            "haengtuk_grade": c.haengtuk_grade,
            "strengths": c.strengths,
            "key_activities": c.key_activities,
        }
        for c in cases
    ]


# ─── 면접 질문 ────────────────────────────────────────────────────────────

@router.get("/analysis/{order_id}/interview-questions")
async def get_interview_questions(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """분석 건의 면접 예상 질문 조회"""
    order_result = await db.execute(
        select(AnalysisOrder).where(
            AnalysisOrder.id == order_id,
            AnalysisOrder.user_id == current_user.id,
        )
    )
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="분석 건을 찾을 수 없습니다.")

    questions_result = await db.execute(
        select(InterviewQuestion)
        .where(InterviewQuestion.analysis_order_id == order_id)
        .order_by(InterviewQuestion.category, InterviewQuestion.created_at)
    )
    questions = questions_result.scalars().all()
    return [
        {
            "id": str(q.id),
            "question": q.question,
            "category": q.category,
            "hint": q.hint,
        }
        for q in questions
    ]


# ─── 분석 결과 공유 ──────────────────────────────────────────────────────

@router.post("/analysis/{order_id}/share")
async def create_share_link(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """분석 결과 공유 링크 생성 (7일 유효)"""
    order_result = await db.execute(
        select(AnalysisOrder).where(
            AnalysisOrder.id == order_id,
            AnalysisOrder.user_id == current_user.id,
            AnalysisOrder.status == "completed",
        )
    )
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="완료된 분석 건을 찾을 수 없습니다.")

    token = secrets.token_urlsafe(32)
    share = AnalysisShare(
        analysis_order_id=order_id,
        token=token,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(share)
    await db.commit()

    return {"share_token": token, "expires_days": 7}


@router.get("/shared/{token}")
async def get_shared_analysis(token: str, db: AsyncSession = Depends(get_db)):
    """공유 링크로 분석 결과 조회 (로그인 불필요)"""
    result = await db.execute(
        select(AnalysisShare)
        .where(
            AnalysisShare.token == token,
            AnalysisShare.expires_at > datetime.utcnow(),
        )
        .options(selectinload(AnalysisShare.analysis_order))
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="유효하지 않거나 만료된 공유 링크입니다.")

    order = share.analysis_order
    return {
        "university": order.target_university,
        "major": order.target_major,
        "status": order.status,
        "report_excel_url": order.report_excel_url,
        "report_pdf_url": order.report_pdf_url,
        "completed_at": order.completed_at.isoformat() if order.completed_at else None,
    }
