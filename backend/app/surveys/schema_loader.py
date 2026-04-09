"""
사전 상담 설문 스키마 로더

JSON 스키마 파일을 한 번만 읽어 메모리에 캐싱.
- preheigh1.json: 예비고1 단일 시점
- high.json: 고등학교 재학생 (T1~T4 + Full/Delta)
"""

import json
from functools import lru_cache
from pathlib import Path

SCHEMA_DIR = Path(__file__).parent / "schemas"

VALID_SURVEY_TYPES = ("preheigh1", "high")
VALID_TIMINGS = ("T1", "T2", "T3", "T4")
VALID_MODES = ("full", "delta")


@lru_cache(maxsize=8)
def load_schema(survey_type: str) -> dict:
    """
    설문 스키마를 로드하여 dict로 반환.
    - 한 번 로드한 스키마는 lru_cache로 캐싱.
    - 파일이 없으면 FileNotFoundError 발생.
    """
    if survey_type not in VALID_SURVEY_TYPES:
        raise ValueError(f"알 수 없는 survey_type: {survey_type}")

    path = SCHEMA_DIR / f"{survey_type}.json"
    if not path.exists():
        raise FileNotFoundError(f"설문 스키마 파일을 찾을 수 없음: {path}")

    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_schema_version(survey_type: str) -> str:
    """스키마의 현재 버전 반환 (version 또는 schema_version 키 지원)"""
    schema = load_schema(survey_type)
    return schema.get("version") or schema.get("schema_version") or "unknown"


def validate_survey_params(survey_type: str, timing: str | None, mode: str) -> None:
    """
    설문 생성 파라미터의 정합성 검증.
    - preheigh1: timing은 None, mode는 항상 "full"
    - high: timing은 T1~T4 중 하나, mode는 full/delta
    검증 실패 시 ValueError.
    """
    if survey_type not in VALID_SURVEY_TYPES:
        raise ValueError(f"survey_type은 {VALID_SURVEY_TYPES} 중 하나여야 합니다")

    if mode not in VALID_MODES:
        raise ValueError(f"mode는 {VALID_MODES} 중 하나여야 합니다")

    if survey_type == "preheigh1":
        if timing is not None:
            raise ValueError("preheigh1 타입은 timing을 사용하지 않습니다")
        if mode != "full":
            raise ValueError("preheigh1 타입은 mode가 항상 'full'이어야 합니다")
    elif survey_type == "high":
        if timing not in VALID_TIMINGS:
            raise ValueError(f"high 타입은 timing이 {VALID_TIMINGS} 중 하나여야 합니다")
