from pydantic_settings import BaseSettings


class Settings(BaseSettings):
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

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
