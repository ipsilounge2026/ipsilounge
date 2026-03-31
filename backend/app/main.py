import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import Base, engine, async_session
from app.models.admin import Admin
from app.routers import (
    admin_analysis,
    admin_consultation,
    admin_dashboard,
    admin_payments,
    admin_users,
    admin_admins,
    admin_consultation_notes,
    admin_admission_cases,
    analysis,
    auth,
    consultation,
    consultation_notes,
    payment,
    users,
    admission_cases,
)
from app.services.scheduler_service import start_scheduler, stop_scheduler
from app.utils.security import hash_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="입시라운지 API",
    description="학생부 분석 + 상담 예약 서비스 API",
    version="1.0.0",
)

# CORS 설정 (프론트엔드 도메인 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",      # 개발 환경 (사용자 웹)
        "http://localhost:3001",      # 개발 환경 (관리자 웹)
        "https://ipsilounge.com",     # 프로덕션 (사용자 웹)
        "https://admin.ipsilounge.com",  # 프로덕션 (관리자 웹)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(analysis.router)
app.include_router(consultation.router)
app.include_router(payment.router)
app.include_router(admin_analysis.router)
app.include_router(admin_consultation.router)
app.include_router(admin_users.router)
app.include_router(admin_payments.router)
app.include_router(admin_dashboard.router)
app.include_router(admin_admins.router)
app.include_router(admin_consultation_notes.router)
app.include_router(admin_admission_cases.router)
app.include_router(consultation_notes.router)
app.include_router(admission_cases.router)


@app.on_event("startup")
async def startup():
    """서버 시작 시 DB 테이블 생성 + 관리자 초기 계정 생성"""
    # 모든 모델 import (테이블 생성을 위해)
    from app.models import (  # noqa: F401
        analysis_order,
        consultation_booking,
        consultation_slot,
        notification,
        payment as payment_model,
        user,
        password_reset_token,
        consultation_note,
        admission_case,
        interview_question,
        analysis_share,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("DB 테이블 초기화 완료")

    # 관리자 초기 계정 생성 (없는 경우)
    async with async_session() as db:
        result = await db.execute(select(Admin).where(Admin.email == settings.ADMIN_EMAIL))
        if result.scalar_one_or_none() is None:
            admin = Admin(
                email=settings.ADMIN_EMAIL,
                password_hash=hash_password(settings.ADMIN_PASSWORD),
                name="관리자",
                role="super_admin",
            )
            db.add(admin)
            await db.commit()
            logger.info(f"관리자 초기 계정 생성: {settings.ADMIN_EMAIL}")

    # 스케줄러 시작 (매일 9시 상담 리마인더)
    start_scheduler()


@app.on_event("shutdown")
async def shutdown():
    stop_scheduler()


@app.get("/")
async def root():
    return {"service": "입시라운지 API", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}
