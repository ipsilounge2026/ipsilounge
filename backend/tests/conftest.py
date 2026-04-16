"""pytest 공통 설정 — backend 루트를 sys.path 에 추가해 `app.*` import 를 가능하게 한다."""

import os
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

# SQLAlchemy 모델 import 시 DB URL 이 필요하지 않도록 DEV_MODE 로 강제
os.environ.setdefault("DEV_MODE", "true")
