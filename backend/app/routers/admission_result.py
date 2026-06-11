"""사용자 입결 조회 API (비로그인 접근 가능).

핵심:
- display_year (예: 2027) = 사용자가 보는 학년도 페이지
- data_year (예: 2026) = 실제 입결이 발생한 연도 = display_year - 1
  → 즉 사용자 2027학년도 페이지의 "전년도 입시결과" = DB의 year=2026 자료

데이터 매칭:
- university_guides (대학어디가) 의 university_code → adiga_admission_results 의 university_code
- year 매칭 시 자동으로 -1 처리
"""

import re
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.adiga_admission_result import AdigaAdmissionResult
from app.models.university_guide import UniversityGuide

router = APIRouter(prefix="/api/university-guide/result", tags=["입결 조회"])

# ── 추이 매칭용 정규화 ──────────────────────────────────────────────
# 연도별 수집 파일의 표기 차이를 흡수: 공백/가운뎃점 변형/로마숫자/전형유형 wrapper
# 예: '학생부교과(지역균형전형)'(2026) ↔ '지역균형전형'(2024·2025)
#     '공간디자인・소비자학과' ↔ '공간디자인·소비자학과'
_DOT_MAP = dict.fromkeys(map(ord, "・•‧∙"), ord("·"))
_ROMAN_MAP = str.maketrans({"Ⅰ": "1", "Ⅱ": "2", "Ⅲ": "3", "Ⅳ": "4", "Ⅴ": "5"})
RE_NAME_WRAPPER = re.compile(
    r"^(학생부교과|학생부종합|학생부위주전형|수능위주전형|수능|교과|종합|논술|실기)\((.+)\)$"
)


def _norm_text(s: str | None) -> str:
    return re.sub(r"\s+", "", s or "").translate(_DOT_MAP)


def _norm_name(s: str | None) -> str:
    t = _norm_text(s).translate(_ROMAN_MAP)
    m = RE_NAME_WRAPPER.match(t)
    return m.group(2) if m else t


def _data_richness(it: AdigaAdmissionResult) -> int:
    """같은 해 후보가 여럿일 때 데이터가 많은 행 우선."""
    score = 0
    for v in (it.recruit_count, it.competition_rate, it.additional_count,
              it.gpa_grade_50, it.gpa_grade_70, it.conv_score_50, it.conv_score_70):
        if v is not None:
            score += 1
    if it.percentile_50 and any(v is not None for v in it.percentile_50.values()):
        score += 2
    return score


VALID_SOURCES = ("대교협", "자체발표")


def _to_response(item: AdigaAdmissionResult) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "university": item.university,
        "university_code": item.university_code,
        "year": item.year,
        "source": item.source,
        "admission_category": item.admission_category,
        "admission_name": item.admission_name,
        "recruitment_type": item.recruitment_type,
        "major": item.major,
        "recruit_count": item.recruit_count,
        "competition_rate": item.competition_rate,
        "additional_count": item.additional_count,
        "gpa_score_50": item.gpa_score_50,
        "gpa_score_70": item.gpa_score_70,
        "gpa_grade_50": item.gpa_grade_50,
        "gpa_grade_70": item.gpa_grade_70,
        "conv_score_50": item.conv_score_50,
        "conv_score_70": item.conv_score_70,
        "percentile_50": item.percentile_50,
        "percentile_70": item.percentile_70,
        "note": item.note,
    }


@router.get("/")
async def get_admission_result(
    university_code: str = Query(..., description="대학 코드 (7자리). university_guides.university_code"),
    display_year: int = Query(..., description="사용자가 보는 학년도 (예: 2027). 실제 입결 조회는 display_year - 1"),
    recruitment_type: str | None = Query(None, description="수시 / 정시"),
    admission_category: str | None = Query(None, description="전형유형: 종합/교과/논술/수능 등"),
    admission_name: str | None = Query(None, description="전형명 (예: 학생부교과(특성화고교)) 정확 매칭"),
    search: str | None = Query(None, description="학과명 부분 검색"),
    source: str = Query("대교협", description="자료 출처: 대교협 / 자체발표"),
    db: AsyncSession = Depends(get_db),
):
    """
    대학별 전년도 입결 데이터 조회.

    예: 2027학년도 페이지에서 서울대 입결 → display_year=2027, university_code=0000019
        → 내부적으로 year=2026 인 데이터를 조회.
    source 로 대교협(대학어디가 공시) / 자체발표(대학 입학처 발표) 자료를 구분 조회.
    """
    if source not in VALID_SOURCES:
        source = "대교협"
    data_year = display_year - 1

    # 1) 우리 university_guides 에서 해당 대학명 조회 (헤더 표시용)
    ug_res = await db.execute(
        select(UniversityGuide).where(
            and_(
                UniversityGuide.university_code == university_code,
                UniversityGuide.year == display_year,
            )
        )
    )
    guide = ug_res.scalar_one_or_none()
    university_name = guide.university if guide else None

    # 2) 입결 데이터 조회 (year = data_year, 출처 일치)
    conditions = [
        AdigaAdmissionResult.university_code == university_code,
        AdigaAdmissionResult.year == data_year,
        AdigaAdmissionResult.source == source,
    ]
    if recruitment_type:
        conditions.append(AdigaAdmissionResult.recruitment_type == recruitment_type)
    if admission_category:
        conditions.append(AdigaAdmissionResult.admission_category == admission_category)
    if admission_name:
        conditions.append(AdigaAdmissionResult.admission_name == admission_name)
    if search:
        conditions.append(AdigaAdmissionResult.major.ilike(f"%{search}%"))

    # 총 개수
    total = (
        await db.execute(
            select(func.count())
            .select_from(AdigaAdmissionResult)
            .where(and_(*conditions))
        )
    ).scalar() or 0

    # 데이터
    data_q = (
        select(AdigaAdmissionResult)
        .where(and_(*conditions))
        .order_by(
            AdigaAdmissionResult.recruitment_type.asc(),
            AdigaAdmissionResult.admission_category.asc(),
            AdigaAdmissionResult.major.asc(),
        )
    )
    data_res = await db.execute(data_q)
    items = data_res.scalars().all()

    # 필터용 메타: 이 대학·학년도에 있는 구분·전형유형·전형명 종류
    # admission_name 은 recruitment_type 별로 그룹화해서 반환 (탭별 dropdown 옵션용)
    meta_q = await db.execute(
        select(
            AdigaAdmissionResult.recruitment_type,
            AdigaAdmissionResult.admission_category,
            AdigaAdmissionResult.admission_name,
        )
        .where(
            and_(
                AdigaAdmissionResult.university_code == university_code,
                AdigaAdmissionResult.year == data_year,
                AdigaAdmissionResult.source == source,
            )
        )
        .distinct()
    )
    meta_rows = meta_q.all()
    available_recruitment_types = sorted({r[0] for r in meta_rows if r[0]})
    available_categories = sorted({r[1] for r in meta_rows if r[1]})

    # recruitment_type → 정렬된 admission_name 목록
    names_by_type: dict[str, list[str]] = {}
    for rt, _cat, name in meta_rows:
        if not rt or not name:
            continue
        names_by_type.setdefault(rt, [])
        if name not in names_by_type[rt]:
            names_by_type[rt].append(name)
    for rt in names_by_type:
        names_by_type[rt].sort()

    return {
        "university": university_name,
        "university_code": university_code,
        "display_year": display_year,
        "data_year": data_year,
        "source": source,
        "total": total,
        "items": [_to_response(it) for it in items],
        "available_recruitment_types": available_recruitment_types,
        "available_categories": available_categories,
        "available_admission_names_by_type": names_by_type,
    }


@router.get("/available-years")
async def get_available_data_years(
    university_code: str = Query(..., description="대학 코드"),
    source: str = Query("대교협", description="자료 출처: 대교협 / 자체발표"),
    db: AsyncSession = Depends(get_db),
):
    """대학별로 우리 DB 에 있는 입결 데이터의 연도 목록 (display_year 기준 반환)."""
    if source not in VALID_SOURCES:
        source = "대교협"
    res = await db.execute(
        select(AdigaAdmissionResult.year)
        .where(
            AdigaAdmissionResult.university_code == university_code,
            AdigaAdmissionResult.source == source,
        )
        .distinct()
        .order_by(AdigaAdmissionResult.year.desc())
    )
    data_years = [row[0] for row in res.all()]
    display_years = [y + 1 for y in data_years]
    return {
        "university_code": university_code,
        "data_years": data_years,
        "display_years": display_years,
    }


@router.get("/timeline")
async def get_admission_timeline(
    university_code: str = Query(..., description="대학 코드"),
    major: str = Query(..., description="학과/모집단위"),
    recruitment_type: str | None = Query(None, description="수시 / 정시"),
    admission_category: str | None = Query(None, description="전형유형"),
    admission_name: str | None = Query(None, description="전형명 (선택, 정확 매칭)"),
    source: str = Query("대교협", description="자료 출처: 대교협 / 자체발표"),
    db: AsyncSession = Depends(get_db),
):
    """
    같은 학과·전형의 여러 학년도 추이 (그래프용).

    매칭 키: university_code + major + source (+ recruitment_type + admission_category + admission_name).
    같은 출처(source)끼리만 비교 — 대교협/자체발표 값이 섞이지 않도록.

    연도별 수집 파일의 표기 차이를 흡수하기 위해 학과명·전형명은 정규화 비교:
    - 공백·가운뎃점 변형·로마숫자 통일, '학생부교과(...)' 식 wrapper 제거
    - 전형명이 정규화로도 안 맞는 해는, 그 해 후보(같은 학과·구분·유형)가
      정확히 1행일 때만 그 행을 사용 (구 데이터에 전형명이 비어 있는 케이스 대응)
    """
    if source not in VALID_SOURCES:
        source = "대교협"
    conditions = [
        AdigaAdmissionResult.university_code == university_code,
        AdigaAdmissionResult.source == source,
    ]
    if recruitment_type:
        conditions.append(AdigaAdmissionResult.recruitment_type == recruitment_type)
    if admission_category:
        conditions.append(AdigaAdmissionResult.admission_category == admission_category)

    res = await db.execute(
        select(AdigaAdmissionResult)
        .where(and_(*conditions))
        .order_by(AdigaAdmissionResult.year.asc())
    )
    all_items = res.scalars().all()

    # 학과명 정규화 일치 행만 + 연도별 그룹
    target_major = _norm_text(major)
    by_year: dict[int, list[AdigaAdmissionResult]] = {}
    for it in all_items:
        if _norm_text(it.major) == target_major:
            by_year.setdefault(it.year, []).append(it)

    # 연도별로 전형명 정규화 매칭 → 후보 1행 fallback
    target_name = _norm_name(admission_name)  # 빈 전형명('')도 매칭 대상
    items: list[AdigaAdmissionResult] = []
    for yr in sorted(by_year.keys()):
        rows = by_year[yr]
        exact = [r for r in rows if _norm_name(r.admission_name) == target_name]
        pool = exact if exact else (rows if len(rows) == 1 else [])
        if pool:
            items.append(max(pool, key=_data_richness))

    points = []
    for it in items:
        avg50 = (it.percentile_50 or {}).get("average_percentile") if it.percentile_50 else None
        avg70 = (it.percentile_70 or {}).get("average_percentile") if it.percentile_70 else None
        points.append({
            "data_year": it.year,
            "display_year": it.year + 1,
            "admission_name": it.admission_name,
            "recruit_count": it.recruit_count,
            "competition_rate": it.competition_rate,
            "additional_count": it.additional_count,
            "gpa_grade_50": it.gpa_grade_50,
            "gpa_grade_70": it.gpa_grade_70,
            "avg_percentile_50": avg50,
            "avg_percentile_70": avg70,
        })

    return {
        "university_code": university_code,
        "major": major,
        "recruitment_type": recruitment_type,
        "admission_category": admission_category,
        "total": len(points),
        "points": points,
    }
