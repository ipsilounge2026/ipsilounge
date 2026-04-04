from slowapi import Limiter
from slowapi.util import get_remote_address

# IP 기반 Rate Limiter
limiter = Limiter(key_func=get_remote_address)
