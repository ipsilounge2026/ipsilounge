import logging

from fastapi import FastAPI  # Deploy Backend CI/CD test
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from app.config import settings
from app.database import Base, engine, async_session
from app.models.admin import Admin
from app.utils.rate_limiter import limiter
from app.routers import (
    admin_analysis,
    admin_consultation,
    admin_dashboard,
    admin_payments,
    admin_users,
    admin_admins,
    admin_consultation_notes,
    admin_consultation_survey,
    admin_admission_cases,
    analysis,
    auth,
    consultation,
    consultation_notes,
    consultation_survey,
    family,
    payment,
    users,
    admission_cases,
    schools,
    seminar,
    admin_seminar,
    admin_notice,
    admin_senior_consultation,
    notice,
    senior_pre_survey,
    universities,
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

# Rate Limiter 등록
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS 설정 (프론트엔드 도메인 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",               # 개발 환경 (사용자 웹)
        "http://localhost:3001",               # 개발 환경 (관리자 웹)
        "https://ipsilounge.com",              # 프로덕션 (.com)
        "https://admin.ipsilounge.com",        # 관리자 (.com)
        "https://ipsilounge.co.kr",            # 프로덕션 (.co.kr)
        "https://www.ipsilounge.co.kr",        # www (.co.kr)
        "https://admin.ipsilounge.co.kr",      # 관리자 (.co.kr)
        "https://ipsilounge20260331-user.vercel.app",   # Vercel 사용자
        "https://ipsilounge-admin.vercel.app",          # Vercel 관리자
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
app.include_router(admin_consultation_survey.router)
app.include_router(admin_admission_cases.router)
app.include_router(consultation_notes.router)
app.include_router(consultation_survey.router)
app.include_router(family.router)
app.include_router(admission_cases.router)
app.include_router(schools.router)
app.include_router(seminar.router)
app.include_router(admin_seminar.router)
app.include_router(admin_notice.router)
app.include_router(admin_senior_consultation.router)
app.include_router(notice.router)
app.include_router(senior_pre_survey.router)
app.include_router(universities.router)


@app.on_event("startup")
async def startup():
    """서버 시작 시 DB 테이블 생성 + 관리자 초기 계정 생성"""
    # 모든 모델 import (테이블 생성을 위해)
    from app.models import (  # noqa: F401
        analysis_order,
        consultation_booking,
        consultation_slot,
        consultation_survey,
        notification,
        payment as payment_model,
        user,
        password_reset_token,
        consultation_note,
        admission_case,
        admission_data,
        interview_question,
        analysis_share,
        seminar_schedule,
        seminar_reservation,
        seminar_mail_log,
        notice as notice_model,
        counselor_change_request,
        family_link,
        family_invite,
        senior_change_request,
        senior_consultation_note,
        senior_pre_survey as senior_pre_survey_model,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # 마이그레이션: admins 테이블에 user_id 컬럼 추가 (없는 경우)
        from sqlalchemy import text, inspect as sa_inspect

        def _check_and_migrate(connection):
            inspector = sa_inspect(connection)
            # admins 테이블에 user_id 컬럼 추가
            columns = [c["name"] for c in inspector.get_columns("admins")]
            if "user_id" not in columns:
                connection.execute(text("ALTER TABLE admins ADD COLUMN user_id VARCHAR(36)"))
                logger.info("admins 테이블에 user_id 컬럼 추가 완료")
            # consultation_slots 테이블 마이그레이션
            slot_columns = [c["name"] for c in inspector.get_columns("consultation_slots")]
            if "admin_id" not in slot_columns:
                connection.execute(text("ALTER TABLE consultation_slots ADD COLUMN admin_id VARCHAR(36)"))
                logger.info("consultation_slots 테이블에 admin_id 컬럼 추가 완료")
            if "repeat_group_id" not in slot_columns:
                connection.execute(text("ALTER TABLE consultation_slots ADD COLUMN repeat_group_id VARCHAR(36)"))
                logger.info("consultation_slots 테이블에 repeat_group_id 컬럼 추가 완료")

            # users 테이블 마이그레이션: 신규 필드 추가
            user_columns = [c["name"] for c in inspector.get_columns("users")]
            if "birth_date" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN birth_date DATE"))
                logger.info("users 테이블에 birth_date 컬럼 추가 완료")
            if "school_name" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN school_name VARCHAR(100)"))
                logger.info("users 테이블에 school_name 컬럼 추가 완료")
            if "grade" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN grade INTEGER"))
                logger.info("users 테이블에 grade 컬럼 추가 완료")
            if "branch_name" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN branch_name VARCHAR(100)"))
                logger.info("users 테이블에 branch_name 컬럼 추가 완료")
            if "is_academy_student" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN is_academy_student BOOLEAN DEFAULT FALSE NOT NULL"))
                logger.info("users 테이블에 is_academy_student 컬럼 추가 완료")
            if "grade_year" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN grade_year INTEGER"))
                logger.info("users 테이블에 grade_year 컬럼 추가 완료")
                # 기존 데이터: grade가 있는 사용자에게 현재 연도 설정
                connection.execute(text("UPDATE users SET grade_year = EXTRACT(YEAR FROM CURRENT_DATE) WHERE grade IS NOT NULL AND grade_year IS NULL"))
                logger.info("기존 사용자 grade_year 초기값 설정 완료")

            # consultation_surveys 테이블에 admin_memo 컬럼 추가
            if inspector.has_table("consultation_surveys"):
                survey_columns = [c["name"] for c in inspector.get_columns("consultation_surveys")]
                if "admin_memo" not in survey_columns:
                    connection.execute(text("ALTER TABLE consultation_surveys ADD COLUMN admin_memo TEXT"))
                    logger.info("consultation_surveys 테이블에 admin_memo 컬럼 추가 완료")
                if "action_plan" not in survey_columns:
                    connection.execute(text("ALTER TABLE consultation_surveys ADD COLUMN action_plan JSONB"))
                    logger.info("consultation_surveys 테이블에 action_plan 컬럼 추가 완료")

            # consultation_bookings 테이블에 cancel_reason 컬럼 추가
            if inspector.has_table("consultation_bookings"):
                booking_columns = [c["name"] for c in inspector.get_columns("consultation_bookings")]
                if "cancel_reason" not in booking_columns:
                    connection.execute(text("ALTER TABLE consultation_bookings ADD COLUMN cancel_reason TEXT"))
                    logger.info("consultation_bookings 테이블에 cancel_reason 컬럼 추가 완료")

        await conn.run_sync(_check_and_migrate)

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


@app.get("/api/files/{folder}/{filename}")
async def serve_local_file(folder: str, filename: str):
    """로컬 저장 파일 다운로드 (S3 미사용 시)"""
    from fastapi.responses import FileResponse
    from app.services.file_service import get_local_file_path, USE_S3
    if USE_S3:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="S3 모드에서는 이 엔드포인트를 사용하지 않습니다")
    file_path = get_local_file_path(f"{folder}/{filename}")
    return FileResponse(file_path, filename=filename)


@app.get("/")
async def root():
    return {"service": "입시라운지 API", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}
