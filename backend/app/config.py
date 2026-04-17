from pathlib import Path

from pydantic_settings import BaseSettings


# 공용 데이터 루트 (xlsx DB 파일 위치)
# - 기본값: ipsilounge/analyzer/data/ (통합 이식 후 단일 소스)
# - 운영(EC2) 등에서는 SHARED_DATA_ROOT 환경변수로 재지정
# 경로 계산: config.py → app → backend → ipsilounge → analyzer/data
_DEFAULT_DATA_ROOT = (
    Path(__file__).resolve().parents[2] / "analyzer" / "data"
)


class Settings(BaseSettings):
    # 검증 환경 (L3 검증 인프라용)
    # DEV_MODE=true 일 때:
    #   - PostgreSQL 대신 SQLite 사용 (./dev.db)
    #   - JSONB/UUID 를 SQLite 호환 타입으로 자동 분기 (database.py 의 @compiles)
    #   - /api/dev/* 라우터 마운트 (인증 우회 등)
    # DEV_MODE 미설정/false 시: 운영 코드와 100% 동일 동작
    # spec: ipsilounge/docs/test-environment-spec.md §2
    DEV_MODE: bool = False
    DEV_SQLITE_PATH: str = "./dev.db"

    # 데이터베이스
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/ipsilounge"

    # JWT 인증
    SECRET_KEY: str = "your-secret-key-here-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24시간
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # AWS S3
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-northeast-2"
    S3_BUCKET_NAME: str = "ipsilounge-files"

    # Firebase
    FIREBASE_CREDENTIALS_PATH: str = "firebase-credentials.json"

    # 토스페이먼츠
    TOSS_SECRET_KEY: str = ""
    TOSS_CLIENT_KEY: str = ""

    # Google Play 인앱결제 검증
    GOOGLE_PLAY_PACKAGE_NAME: str = "com.ipsilounge.app"
    GOOGLE_SERVICE_ACCOUNT_JSON: str = ""  # 서비스 계정 JSON 파일 경로 또는 JSON 문자열

    # Google Calendar 연동
    GOOGLE_CALENDAR_CREDENTIALS_PATH: str = ""  # 서비스 계정 JSON 키 파일 경로
    GOOGLE_CALENDAR_ID: str = ""  # 관리자 캘린더 ID
    GOOGLE_CALENDAR_EXTRA_IDS: str = ""  # 추가 캘린더 ID (쉼표 구분)

    # 관리자 초기 계정
    ADMIN_EMAIL: str = "admin@ipsilounge.com"
    ADMIN_PASSWORD: str = "change-this-password"

    # 이메일 (SMTP)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""         # Gmail 앱 비밀번호
    EMAIL_FROM: str = "입시라운지 <noreply@ipsilounge.com>"

    # 프론트엔드 URL (비밀번호 재설정 링크용)
    FRONTEND_URL: str = "https://ipsilounge.com"

    # 비밀번호 재설정 토큰 유효 시간 (분)
    RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # 학교 검색 (NEIS 교육정보 개방포털 API)
    NEIS_API_KEY: str = ""

    # 공용 데이터 루트 (수능최저_db.xlsx, admission_db.xlsx, course_requirements.xlsx 위치)
    SHARED_DATA_ROOT: str = str(_DEFAULT_DATA_ROOT)

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def DATA_ROOT(self) -> Path:
        return Path(self.SHARED_DATA_ROOT)

    @property
    def effective_database_url(self) -> str:
        """DEV_MODE 활성 시 SQLite, 아니면 운영 DATABASE_URL.

        spec: ipsilounge/docs/test-environment-spec.md §2-1 (1)
        """
        if self.DEV_MODE:
            return f"sqlite+aiosqlite:///{self.DEV_SQLITE_PATH}"
        return self.DATABASE_URL


settings = Settings()
