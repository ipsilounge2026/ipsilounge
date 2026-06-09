"""대학어디가 자동 수집 입결 Excel → DB import 서비스.

운영 정책:
- 같은 학년도 재업로드 시 → 해당 학년도 row 전부 삭제 후 새로 INSERT
- 다른 학년도는 영향 없음
- 트랜잭션 처리 (중간 실패 시 롤백)

용도:
- CLI 스크립트(import_adiga_results.py) 에서 호출
- 관리자 업로드 API (admin_adiga_import.py) 에서 호출
"""

import logging
import re
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.adiga_admission_result import AdigaAdmissionResult

logger = logging.getLogger(__name__)

# Excel 시트명
SHEET_NAME = "전년도입결"

# Excel 컬럼 인덱스 (0-based)
COL_UNIVERSITY = 0
COL_UNIVERSITY_CODE = 1
COL_ADMISSION_CATEGORY = 2
COL_ADMISSION_NAME = 3
COL_RECRUITMENT_TYPE = 4
COL_MAJOR = 5
COL_RECRUIT_COUNT = 6
COL_COMPETITION_RATE = 7
COL_ADDITIONAL_COUNT = 8
COL_GPA_SCORE_50 = 9
COL_GPA_SCORE_70 = 10
COL_GPA_GRADE_50 = 11
COL_GPA_GRADE_70 = 12
COL_CONV_SCORE_50 = 13
COL_CONV_SCORE_70 = 14
# 백분위 50%: 15~25 (11개)
# 백분위 70%: 26~36 (11개)
PERCENTILE_50_RANGE = range(15, 26)
PERCENTILE_70_RANGE = range(26, 37)

# 백분위 컬럼 키 (헤더 텍스트 → JSON 키 매핑용)
# Excel 헤더 예: "백분위 50% 국어", "백분위 70% 평균백분위" 등
PERCENTILE_KEY_MAP = {
    "국어": "korean",
    "수학": "math",
    "탐구1 사탐": "investigation1_social",
    "탐구1 과탐": "investigation1_science",
    "탐구1 직탐": "investigation1_vocational",
    "탐구2 사탐": "investigation2_social",
    "탐구2 과탐": "investigation2_science",
    "탐구2 직탐": "investigation2_vocational",
    "평균백분위": "average_percentile",
    "한국사(등급)": "korean_history_grade",
    "영어등급": "english_grade",
}


# 파일명에서 학년도 추출: "adiga_입결_2027.xlsx" → 2027
RE_YEAR_FROM_FILENAME = re.compile(r"(\d{4})\.xlsx?$", re.IGNORECASE)


def extract_year_from_filename(filename: str) -> int | None:
    """파일명에서 학년도 추출."""
    m = RE_YEAR_FROM_FILENAME.search(filename)
    return int(m.group(1)) if m else None


def _to_float(v: Any) -> float | None:
    """셀 값을 float으로 변환. 텍스트("0.0", "미제출 사유 : 3명이하") 처리."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        try:
            return float(s)
        except ValueError:
            return None
    return None


def _to_int(v: Any) -> int | None:
    """셀 값을 int 로 변환."""
    if v is None or v == "":
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    if isinstance(v, str):
        s = v.strip()
        try:
            return int(float(s))
        except ValueError:
            return None
    return None


def _to_str(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _build_percentile_dict(
    headers: list[str], row: tuple, col_range: range, prefix: str
) -> dict:
    """백분위 영역 컬럼을 JSON 객체로 변환.

    headers: Excel 첫 행 (헤더)
    row: 데이터 행
    col_range: 백분위 컬럼 인덱스 범위
    prefix: "백분위 50%" 또는 "백분위 70%"
    """
    result = {}
    for idx in col_range:
        if idx >= len(headers):
            break
        header = headers[idx]
        if not isinstance(header, str):
            continue
        # 헤더에서 prefix 제거 → 키 정규화
        key_raw = header.replace(prefix, "").strip()
        key = PERCENTILE_KEY_MAP.get(key_raw)
        if key is None:
            continue
        value = row[idx] if idx < len(row) else None
        # 등급 컬럼은 정수, 백분위는 실수
        if "grade" in key:
            result[key] = _to_int(value)
        else:
            result[key] = _to_float(value)
    return result


def parse_excel(file_path: str | Path) -> dict:
    """
    Excel 파일을 읽어 (year, rows) 반환.

    Returns:
        {
            "year": int | None,
            "filename": str,
            "headers": list[str],
            "rows": [{...}],  # AdigaAdmissionResult kwargs
            "total_rows": int,
        }
    """
    file_path = Path(file_path)
    filename = file_path.name

    # 파일명에서 학년도 추출 (default)
    year = extract_year_from_filename(filename)

    wb = load_workbook(file_path, read_only=True, data_only=True)
    if SHEET_NAME not in wb.sheetnames:
        # 첫 시트 사용
        sheet = wb[wb.sheetnames[0]]
    else:
        sheet = wb[SHEET_NAME]

    rows_iter = sheet.iter_rows(values_only=True)
    headers = list(next(rows_iter, ()))

    parsed: list[dict] = []
    for row in rows_iter:
        if row is None:
            continue
        # university 가 비어 있으면 무효 행
        univ = _to_str(row[COL_UNIVERSITY] if COL_UNIVERSITY < len(row) else None)
        if not univ:
            continue

        # 학생부 환산점수/등급 셀에 "0.0" 같이 0 인 케이스, 또는 텍스트(미제출 사유) 케이스 처리.
        # 텍스트가 들어가 있으면 note 로 보존.
        gpa_score_50_raw = row[COL_GPA_SCORE_50] if COL_GPA_SCORE_50 < len(row) else None
        gpa_score_70_raw = row[COL_GPA_SCORE_70] if COL_GPA_SCORE_70 < len(row) else None
        note_parts = []
        for v in (gpa_score_50_raw, gpa_score_70_raw):
            if isinstance(v, str) and _to_float(v) is None and v.strip():
                note_parts.append(v.strip())

        item = {
            "university": univ,
            "university_code": _to_str(row[COL_UNIVERSITY_CODE]) or "",
            "year": year or 0,  # 0 이면 import 시점에 덮어쓰기
            "admission_category": _to_str(row[COL_ADMISSION_CATEGORY]),
            "admission_name": _to_str(row[COL_ADMISSION_NAME]),
            "recruitment_type": _to_str(row[COL_RECRUITMENT_TYPE]),
            "major": _to_str(row[COL_MAJOR]) or "",
            "recruit_count": _to_int(row[COL_RECRUIT_COUNT]),
            "competition_rate": _to_float(row[COL_COMPETITION_RATE]),
            "additional_count": _to_int(row[COL_ADDITIONAL_COUNT]),
            "gpa_score_50": _to_float(gpa_score_50_raw),
            "gpa_score_70": _to_float(gpa_score_70_raw),
            "gpa_grade_50": _to_float(row[COL_GPA_GRADE_50] if COL_GPA_GRADE_50 < len(row) else None),
            "gpa_grade_70": _to_float(row[COL_GPA_GRADE_70] if COL_GPA_GRADE_70 < len(row) else None),
            "conv_score_50": _to_float(row[COL_CONV_SCORE_50] if COL_CONV_SCORE_50 < len(row) else None),
            "conv_score_70": _to_float(row[COL_CONV_SCORE_70] if COL_CONV_SCORE_70 < len(row) else None),
            "percentile_50": _build_percentile_dict(headers, row, PERCENTILE_50_RANGE, "백분위 50%"),
            "percentile_70": _build_percentile_dict(headers, row, PERCENTILE_70_RANGE, "백분위 70%"),
            "note": " | ".join(note_parts) if note_parts else None,
            "source_file": filename,
        }
        parsed.append(item)

    wb.close()

    return {
        "year": year,
        "filename": filename,
        "headers": headers,
        "rows": parsed,
        "total_rows": len(parsed),
    }


async def import_to_db(
    db: AsyncSession,
    parsed: dict,
    *,
    override_year: int | None = None,
    chunk_size: int = 500,
) -> dict:
    """
    parse_excel 결과를 DB에 import.

    - override_year 가 주어지면 모든 row 의 year 를 그 값으로 강제 설정 (파일명 학년도 불일치 대응)
    - 기존 학년도 데이터 모두 삭제 후 새로 INSERT
    - chunk_size 단위로 batch insert (대용량 24,000행 대응)

    Returns: {"year": int, "deleted": int, "inserted": int, "total": int}
    """
    rows = parsed["rows"]
    if not rows:
        raise ValueError("Excel 에 유효한 행이 없습니다")

    # 학년도 확정
    year = override_year or parsed.get("year")
    if not year:
        raise ValueError("학년도를 결정할 수 없습니다 (파일명 또는 override_year 필요)")

    # 기존 row 삭제
    del_result = await db.execute(
        delete(AdigaAdmissionResult).where(AdigaAdmissionResult.year == year)
    )
    deleted = del_result.rowcount or 0

    # 새 row INSERT (chunk 단위)
    inserted = 0
    chunk: list[AdigaAdmissionResult] = []
    for item in rows:
        item["year"] = year  # override
        # university_code 가 비어 있으면 무효
        if not item["university_code"]:
            continue
        chunk.append(AdigaAdmissionResult(**item))
        if len(chunk) >= chunk_size:
            db.add_all(chunk)
            await db.flush()
            inserted += len(chunk)
            chunk = []
    if chunk:
        db.add_all(chunk)
        await db.flush()
        inserted += len(chunk)

    await db.commit()

    logger.info(
        f"adiga import(year={year}): deleted={deleted}, inserted={inserted}"
    )
    return {
        "year": year,
        "display_year": year + 1,  # 사용자 페이지의 어느 학년도에 표시되는지 (입결 연도 + 1)
        "deleted": deleted,
        "inserted": inserted,
        "total": inserted,
        "filename": parsed.get("filename"),
    }


async def get_year_summary(db: AsyncSession) -> list[dict]:
    """현재 DB 에 들어있는 학년도별 요약 (학년도별 행 수 + 가장 최근 import 파일)."""
    from sqlalchemy import func

    result = await db.execute(
        select(
            AdigaAdmissionResult.year,
            func.count(AdigaAdmissionResult.id).label("count"),
            func.max(AdigaAdmissionResult.created_at).label("last_imported"),
            func.max(AdigaAdmissionResult.source_file).label("source_file"),
        )
        .group_by(AdigaAdmissionResult.year)
        .order_by(AdigaAdmissionResult.year.desc())
    )
    return [
        {
            "year": row[0],
            "count": row[1],
            "last_imported": row[2].isoformat() if row[2] else None,
            "source_file": row[3],
        }
        for row in result.all()
    ]
