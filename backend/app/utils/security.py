from datetime import datetime, timedelta

# passlib 1.7.4 + bcrypt 4.x 호환성 polyfill (2026-04-19)
# passlib 의 bcrypt backend 가 `bcrypt.__about__.__version__` 를 읽는데
# bcrypt 4.0.1 부터 `__about__` 속성이 제거되어 런타임 WARN 이 매번 발생함
# ("(trapped) error reading bcrypt version"). 기능엔 영향 없지만 로그 노이즈.
# passlib 2.x 가 아직 릴리즈되지 않았고 bcrypt 3.x 다운그레이드는 보안 패치 손실.
# → 가장 간단하고 안전한 workaround: `__about__` 을 되살리는 shim.
import bcrypt as _bcrypt  # noqa: E402

if not hasattr(_bcrypt, "__about__"):
    class _AboutShim:
        __version__ = getattr(_bcrypt, "__version__", "0.0.0")
    _bcrypt.__about__ = _AboutShim()  # type: ignore[attr-defined]

from jose import JWTError, jwt  # noqa: E402
from passlib.context import CryptContext  # noqa: E402

from app.config import settings  # noqa: E402

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None
