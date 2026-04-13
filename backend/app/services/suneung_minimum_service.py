"""
수능 최저학력기준 충족 시뮬레이션 서비스

- 수능최저 DB (Excel) 로딩 및 캐싱
- 학생 모의고사 등급 기반 최저 충족 여부 시뮬레이션
"""

import os
import re
from itertools import combinations
from pathlib import Path
from typing import Any

import openpyxl

# ── DB 캐시 ──

_DB_CACHE: list[dict] | None = None
_DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "수능최저_db.xlsx"


def _load_db() -> list[dict]:
    """수능최저 DB를 Excel에서 파싱하여 리스트로 반환 (캐싱)."""
    global _DB_CACHE
    if _DB_CACHE is not None:
        return _DB_CACHE

    if not _DB_PATH.exists():
        raise FileNotFoundError(f"수능최저 DB 파일을 찾을 수 없습니다: {_DB_PATH}")

    wb = openpyxl.load_workbook(str(_DB_PATH), data_only=True, read_only=True)
    ws = wb.active
    rows: list[dict] = []
    # Column indices (0-based): A=0, E=4, F=5, H=7, I=8, J=9, K=10, L=11, M=12, N=13, O=14, P=15, R=17
    row_num = 0
    for row_cells in ws.iter_rows(min_row=4, max_col=19, values_only=True):
        row_num += 1
        # row_cells is a tuple of values, 0-indexed
        req_text = row_cells[13] if len(row_cells) > 13 else None  # column N (14th, 0-index=13)
        if not req_text or str(req_text).strip() == "-":
            continue

        row_data = {
            "구분": _cellv(row_cells, 0),
            "수준": _cellv(row_cells, 4),
            "일반_지역": _cellv(row_cells, 5),
            "대학": _cellv(row_cells, 7),
            "학년도": _safe_int(row_cells[8] if len(row_cells) > 8 else None),
            "전형구분": _cellv(row_cells, 9),
            "전형명": _cellv(row_cells, 10),
            "계열": _cellv(row_cells, 11),
            "모집구분": _cellv(row_cells, 12),
            "수능최저": str(req_text).strip(),
            "수학": _cellv(row_cells, 14),
            "탐구": _cellv(row_cells, 15),
            "비고": _cellv(row_cells, 17),
        }
        rows.append(row_data)

    wb.close()
    _DB_CACHE = rows
    return _DB_CACHE


def _cellv(row_tuple: tuple, idx: int) -> str:
    """Extract string value from a row tuple by index."""
    if idx >= len(row_tuple):
        return ""
    v = row_tuple[idx]
    return str(v).strip() if v is not None else ""


def _safe_int(v: Any) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


# ── 수준 매핑 ──

_LEVEL_MAP: dict[str, list[str]] = {
    "최상위SKY": ["SKY"],
    "상위인서울주요": ["SKY", "상위6"],
    "인서울": ["SKY", "상위6", "상위15"],
    "수도권": ["SKY", "상위6", "상위15", "수도권\n주요대"],
    "지방거점": ["지거국"],
}


def _resolve_target_levels(target_level: str) -> list[str]:
    """E2 target_level -> DB 수준 값 리스트."""
    return _LEVEL_MAP.get(target_level, list(_LEVEL_MAP.get("인서울", [])))


def _resolve_target_universities(target_universities: list[str]) -> list[str]:
    """구체적 목표 대학명 추출 (학과 부분 제거)."""
    result = []
    for t in target_universities:
        if not t:
            continue
        # "서울대 경제학부" -> "서울대"
        parts = t.strip().split()
        if parts:
            result.append(parts[0])
    return result


# ── 최저 기준 파싱 ──


def _parse_requirement_text(raw: str) -> list[dict]:
    """하나의 수능최저 텍스트를 여러 조건 블록으로 파싱.

    복합 조건(예: (의예)\n...\n\n(약학)\n...)은 블록별로 분리.
    블록 없으면 전체를 하나의 블록으로 처리.

    각 블록 = {
        "label": str,  # "(의예)" 등 or "전체"
        "conditions": list[dict]  # OR 조건 리스트
    }

    condition = {
        "subjects": list[str],  # ["korean","math","english","inquiry"]
        "pick_count": int,       # N합 중 N
        "sum_max": int | None,   # 합 기준
        "each_max": int | None,  # 각 기준 (각 N등급)
        "english_max": int | None,
        "korean_history_max": int | None,
        "must_include": list[str],  # 반드시 포함 과목
        "inquiry_count": int,       # 탐구 반영 수 (1) or (2) or (각)
        "notes": list[str],
    }
    """
    if not raw or raw.strip() == "-":
        return []

    raw = raw.strip()

    # 특수 케이스: "인문 or 자연 최저 만족"
    if "인문 or 자연" in raw:
        return [{"label": "통합", "conditions": [], "raw": raw, "is_reference": True}]

    # 블록 분리: "\n\n" 구분자로 나눠진 복합 조건
    blocks = re.split(r"\n\n+", raw)

    result = []
    current_label = "전체"
    for block in blocks:
        block = block.strip()
        if not block:
            continue

        lines = block.split("\n")
        label = current_label
        cond_lines = []

        for line in lines:
            line = line.strip()
            if not line:
                continue
            # Label line: (의예), (약학), (그 외), etc.
            if re.match(r"^\(.*\)$", line):
                label = line
            elif line.startswith("(") and ")" in line and not any(kw in line for kw in ["합", "등급", "국", "수", "영"]):
                label = line
            elif line.startswith("※"):
                # Note line
                cond_lines.append(line)
            else:
                cond_lines.append(line)

        cond_text = "\n".join(cond_lines).strip()
        if not cond_text or cond_text == "-":
            if label != current_label:
                result.append({"label": label, "conditions": [], "raw": block, "no_requirement": True})
            continue

        conditions = _parse_condition_text(cond_text)
        if conditions:
            result.append({"label": label, "conditions": conditions, "raw": block})
        current_label = "전체"

    return result


def _parse_condition_text(text: str) -> list[dict]:
    """단일 조건 텍스트를 파싱. OR 조건은 리스트로."""
    text = text.strip()
    if not text or text == "-":
        return []

    # OR 분리: "3합6(2) or 국영수과 3합6(1)"
    or_parts = re.split(r"\s+or\s+", text, flags=re.IGNORECASE)

    conditions = []
    for part in or_parts:
        cond = _parse_single_condition(part.strip())
        if cond:
            conditions.append(cond)

    return conditions


def _parse_single_condition(text: str) -> dict | None:
    """단일 조건 하나를 파싱."""
    if not text or text == "-":
        return None

    lines = text.split("\n")
    notes = []
    main_parts = []
    for line in lines:
        line = line.strip()
        if line.startswith("※"):
            notes.append(line)
        elif line:
            main_parts.append(line)

    main_text = " ".join(main_parts)
    if not main_text:
        return None

    # Subject area parsing
    subjects = _parse_subjects(main_text)
    must_include = _parse_must_include(main_text)

    # Pick count and sum: "3합7", "2합5", "4합8"
    pick_count = None
    sum_max = None
    each_max = None

    # Pattern: N합M
    m = re.search(r"(\d+)합(\d+)", main_text)
    if m:
        pick_count = int(m.group(1))
        sum_max = int(m.group(2))

    # Pattern: "3개 3등급" -> each_max
    m_each = re.search(r"(\d+)개\s*(\d+)등급", main_text)
    if m_each:
        pick_count = int(m_each.group(1))
        each_max = int(m_each.group(2))
        sum_max = None  # override

    # Pattern: "1등급 2개" -> e.g., 국 or 수 포함 1등급 2개
    m_grade_count = re.search(r"(\d+)등급\s*(\d+)개", main_text)
    if m_grade_count:
        each_max = int(m_grade_count.group(1))
        pick_count = int(m_grade_count.group(2))
        sum_max = None

    # Pattern: "3개 1등급" -> each_max
    m_count_grade = re.search(r"(\d+)개\s*(\d+)등급", main_text)
    if m_count_grade:
        pick_count = int(m_count_grade.group(1))
        each_max = int(m_count_grade.group(2))

    # (각) vs (1) vs (2) - inquiry count
    inquiry_count = 1
    if "(각)" in main_text:
        inquiry_count = -1  # special: each inquiry separately
    elif "(2)" in main_text:
        inquiry_count = 2
    elif "(1)" in main_text:
        inquiry_count = 1

    # Absolute grade constraints: 영N, 한N
    english_max = None
    korean_history_max = None

    m_eng = re.search(r"[,\s]영(\d)", main_text)
    if m_eng:
        english_max = int(m_eng.group(1))

    m_han = re.search(r"[,\s]한(\d)", main_text)
    if m_han:
        korean_history_max = int(m_han.group(1))

    if pick_count is None and sum_max is None and each_max is None:
        return None  # could not parse

    return {
        "subjects": subjects,
        "pick_count": pick_count or 0,
        "sum_max": sum_max,
        "each_max": each_max,
        "english_max": english_max,
        "korean_history_max": korean_history_max,
        "must_include": must_include,
        "inquiry_count": inquiry_count,
        "notes": notes,
        "raw": main_text,
    }


def _parse_subjects(text: str) -> list[str]:
    """과목 영역 문자열에서 과목 리스트 추출."""
    subjects = []

    # "국수영탐" / "국수영과" / "국수(미/기)영과" / "국수(미/기)영탐"
    # 국 = korean, 수 = math, 영 = english, 탐 = inquiry (사탐+과탐), 과 = science_inquiry
    area_str = ""
    m = re.match(r"(국수?\(?[미기/]*\)?영?[과탐]?)", text)
    if m:
        area_str = m.group(1)
    else:
        # Try broader match
        m2 = re.match(r"([국수영과탐\(\)/미기]+)", text)
        if m2:
            area_str = m2.group(1)

    if "국" in area_str:
        subjects.append("korean")
    if "수" in area_str:
        subjects.append("math")
    if "영" in area_str:
        subjects.append("english")
    if "탐" in area_str:
        subjects.append("inquiry")
    elif "과" in area_str:
        subjects.append("inquiry")  # 과탐 also maps to inquiry

    # Fallback: if no subjects parsed but text has "합"
    if not subjects and "합" in text:
        subjects = ["korean", "math", "english", "inquiry"]

    return subjects


def _parse_must_include(text: str) -> list[str]:
    """'수 포함', '국 or 수 포함', '수&과 포함' 파싱."""
    must = []

    # "수 포함" / "수&과 포함" / "국 or 수 포함" / "과 포함"
    m = re.search(r"(국|수|영|과)\s*(?:&\s*(국|수|영|과))?\s*포함", text)
    if m:
        _subj_map = {"국": "korean", "수": "math", "영": "english", "과": "inquiry"}
        must.append(_subj_map.get(m.group(1), m.group(1)))
        if m.group(2):
            must.append(_subj_map.get(m.group(2), m.group(2)))

    m_or = re.search(r"(국|수|영)\s*or\s*(국|수|영)\s*포함", text)
    if m_or:
        _subj_map = {"국": "korean", "수": "math", "영": "english"}
        # OR means either one, store as tuple
        must = [(_subj_map.get(m_or.group(1), ""), _subj_map.get(m_or.group(2), ""))]

    return must


# ── 시뮬레이션 ──


def _get_available_grades(
    mock_grades: dict[str, int | None],
    subjects: list[str],
    inquiry_count: int,
) -> list[tuple[str, int]]:
    """사용 가능한 (과목키, 등급) 리스트. inquiry는 inquiry_count에 따라 최대 2개."""
    result = []
    for subj in subjects:
        if subj == "inquiry":
            # inquiry1, inquiry2
            inq_grades = []
            for ik in ("inquiry1", "inquiry2"):
                g = mock_grades.get(ik)
                if g is not None:
                    inq_grades.append((ik, g))
            inq_grades.sort(key=lambda x: x[1])

            if inquiry_count == -1:  # (각) = each separately
                result.extend(inq_grades)
            elif inquiry_count == 2:
                result.extend(inq_grades[:2])
            else:  # (1) = best 1
                if inq_grades:
                    result.append(inq_grades[0])
        else:
            g = mock_grades.get(subj)
            if g is not None:
                result.append((subj, g))
    return result


def _check_condition(
    mock_grades: dict[str, int | None],
    condition: dict,
) -> dict:
    """하나의 조건에 대해 충족 여부 체크."""
    subjects = condition["subjects"]
    pick_count = condition["pick_count"]
    sum_max = condition.get("sum_max")
    each_max = condition.get("each_max")
    english_max = condition.get("english_max")
    korean_history_max = condition.get("korean_history_max")
    must_include = condition.get("must_include", [])
    inquiry_count = condition.get("inquiry_count", 1)

    result: dict[str, Any] = {"raw": condition.get("raw", "")}

    # 1. Check absolute constraints first
    absolute_failures = []
    if english_max is not None:
        eng_grade = mock_grades.get("english")
        if eng_grade is not None and eng_grade > english_max:
            absolute_failures.append(f"영어 {eng_grade}등급 (기준: {english_max}등급 이내)")
        elif eng_grade is None:
            absolute_failures.append("영어 성적 없음")

    if korean_history_max is not None:
        # 한국사는 보통 쉬워서 거의 충족 - 시뮬레이션 시 미입력이면 pass
        kh_grade = mock_grades.get("korean_history")
        if kh_grade is not None and kh_grade > korean_history_max:
            absolute_failures.append(f"한국사 {kh_grade}등급 (기준: {korean_history_max}등급 이내)")

    # 2. Build available grades
    available = _get_available_grades(mock_grades, subjects, inquiry_count)

    if pick_count == 0:
        result["result"] = "파싱불가"
        result["detail"] = "조건 파싱 실패"
        return result

    # 3. Check sum-based or each-based condition
    if each_max is not None:
        # "N개 M등급" = pick_count개가 모두 each_max 이하
        # Find best combination where must_include is satisfied
        best = _find_best_combination_each(available, pick_count, each_max, must_include)
        if best is not None:
            selected, all_met = best
            met_count = sum(1 for _, g in selected if g <= each_max)
            if all_met and not absolute_failures:
                result["result"] = "충족"
                margin = sum(each_max - g for _, g in selected if g <= each_max)
                result["margin"] = margin
            elif absolute_failures:
                result["result"] = "미충족"
                result["margin"] = 0
                result["failures"] = absolute_failures
            else:
                not_met = [(s, g) for s, g in selected if g > each_max]
                result["result"] = "미충족"
                result["margin"] = -sum(g - each_max for _, g in not_met)
                result["failures"] = [f"{_subj_label(s)} {g}등급 > {each_max}등급" for s, g in not_met]
            result["selected"] = [{"subject": s, "grade": g} for s, g in selected]
            detail_parts = [f"{_subj_label(s)}{g}" for s, g in selected]
            result["detail"] = f"{'+'.join(detail_parts)} (각 {each_max}등급 이내)"
        else:
            result["result"] = "미충족"
            result["margin"] = -99
            result["detail"] = f"가용 과목 부족 ({len(available)}개 < {pick_count}개 필요)"
    elif sum_max is not None:
        # "N합M" = pick_count개 합이 sum_max 이하
        best = _find_best_combination_sum(available, pick_count, sum_max, must_include)
        if best is not None:
            selected, total = best
            if total <= sum_max and not absolute_failures:
                margin = sum_max - total
                result["result"] = "충족" if margin >= 0 else "미충족"
                if margin == 0:
                    result["result"] = "충족"
                elif margin >= 1:
                    result["result"] = "충족"
                result["margin"] = margin
            elif absolute_failures:
                result["result"] = "미충족"
                result["margin"] = -(total - sum_max) if total > sum_max else 0
                result["failures"] = absolute_failures
            else:
                result["result"] = "미충족"
                result["margin"] = -(total - sum_max)
            result["selected"] = [{"subject": s, "grade": g} for s, g in selected]
            detail_parts = [f"{_subj_label(s)}{g}" for s, g in selected]
            result["detail"] = f"{'+'.join(detail_parts)}={total} (기준 {sum_max} 이내, {'여유' if total <= sum_max else '부족'} {abs(sum_max - total)})"
        else:
            result["result"] = "미충족"
            result["margin"] = -99
            result["detail"] = f"가용 과목 부족 ({len(available)}개 < {pick_count}개 필요)"
    else:
        result["result"] = "파싱불가"
        result["detail"] = "조건 유형 미지원"

    if absolute_failures and result.get("result") != "미충족":
        result["result"] = "미충족"
        result["failures"] = absolute_failures

    return result


def _find_best_combination_sum(
    available: list[tuple[str, int]],
    pick_count: int,
    sum_max: int,
    must_include: list,
) -> tuple[list[tuple[str, int]], int] | None:
    """합산 기준 최적 조합 탐색."""
    if len(available) < pick_count:
        return None

    best_combo = None
    best_total = 999

    for combo in combinations(available, pick_count):
        # Check must_include
        combo_subjects = [s for s, g in combo]
        if not _check_must_include(combo_subjects, must_include):
            continue
        total = sum(g for _, g in combo)
        if total < best_total:
            best_total = total
            best_combo = list(combo)

    if best_combo is None:
        # must_include failed for all combos, try without
        for combo in combinations(available, pick_count):
            total = sum(g for _, g in combo)
            if total < best_total:
                best_total = total
                best_combo = list(combo)

    return (best_combo, best_total) if best_combo else None


def _find_best_combination_each(
    available: list[tuple[str, int]],
    pick_count: int,
    each_max: int,
    must_include: list,
) -> tuple[list[tuple[str, int]], bool] | None:
    """각 등급 기준 최적 조합 탐색."""
    if len(available) < pick_count:
        return None

    best_combo = None
    best_met_count = -1

    for combo in combinations(available, pick_count):
        combo_subjects = [s for s, g in combo]
        if not _check_must_include(combo_subjects, must_include):
            continue
        met = sum(1 for _, g in combo if g <= each_max)
        if met > best_met_count:
            best_met_count = met
            best_combo = list(combo)

    if best_combo is None:
        for combo in combinations(available, pick_count):
            met = sum(1 for _, g in combo if g <= each_max)
            if met > best_met_count:
                best_met_count = met
                best_combo = list(combo)

    if best_combo:
        all_met = all(g <= each_max for _, g in best_combo)
        return (best_combo, all_met)
    return None


def _check_must_include(subjects: list[str], must_include: list) -> bool:
    """필수 포함 과목 체크."""
    for m in must_include:
        if isinstance(m, tuple):
            # OR: either one
            if not any(s in subjects or s.startswith(s) for s in m if s):
                # Check if any of the OR options is in subjects
                found = False
                for opt in m:
                    if opt and any(subj == opt or subj.startswith(opt) for subj in subjects):
                        found = True
                        break
                if not found:
                    return False
        elif isinstance(m, str) and m:
            if not any(subj == m or subj.startswith(m) for subj in subjects):
                return False
    return True


_SUBJ_LABELS = {
    "korean": "국어",
    "math": "수학",
    "english": "영어",
    "inquiry1": "탐구1",
    "inquiry2": "탐구2",
    "inquiry": "탐구",
    "korean_history": "한국사",
}


def _subj_label(key: str) -> str:
    return _SUBJ_LABELS.get(key, key)


# ── 메인 시뮬레이션 함수 ──


def simulate_suneung_minimum(
    answers: dict,
    target_year: int = 2027,
) -> dict:
    """설문 답변으로부터 수능 최저학력기준 충족 시뮬레이션 실행.

    Args:
        answers: 설문 answers dict (A, B, C, E 카테고리 포함)
        target_year: 비교 대상 학년도 (기본 2027)

    Returns:
        시뮬레이션 결과 dict
    """
    db = _load_db()

    # 1. 학생 정보 추출
    cat_a = answers.get("A", {})
    cat_c = answers.get("C", {})
    cat_e = answers.get("E", {})

    track = cat_a.get("A5", "")  # 인문/자연
    e2 = cat_e.get("E2", {})
    target_level = e2.get("target_level", "") if isinstance(e2, dict) else ""
    target_universities = e2.get("target_universities", []) if isinstance(e2, dict) else []
    if not isinstance(target_universities, list):
        target_universities = []

    # 2. 최신 모의고사 등급 추출
    mock_grades = _extract_latest_mock_grades(cat_c.get("C1"))

    if not any(v is not None for v in mock_grades.values()):
        return {
            "student_mock_grades": mock_grades,
            "track": track,
            "error": "모의고사 등급 데이터가 없습니다.",
            "simulations": [],
            "summary": {"total_checked": 0, "met": 0, "close": 0, "not_met": 0},
        }

    # 3. DB 필터링
    target_db_levels = _resolve_target_levels(target_level)
    target_univ_names = _resolve_target_universities(target_universities)

    filtered = []
    for row in db:
        if row["학년도"] != target_year:
            continue

        # Filter by level or specific university
        level_match = row["수준"] in target_db_levels
        univ_match = any(
            row["대학"].startswith(name) or name in row["대학"]
            for name in target_univ_names
        ) if target_univ_names else False

        if not level_match and not univ_match:
            continue

        # Filter by track
        row_track = row["계열"]
        if row_track and row_track not in ("통합", ""):
            if track == "인문" and row_track == "자연":
                continue
            if track == "자연" and row_track == "인문":
                continue

        filtered.append(row)

    # 4. 시뮬레이션 실행
    simulations = []
    for row in filtered:
        blocks = _parse_requirement_text(row["수능최저"])
        for block in blocks:
            if block.get("is_reference"):
                simulations.append({
                    "university": row["대학"],
                    "admission_category": row["전형구분"],
                    "admission_type": row["전형명"],
                    "track": row["계열"],
                    "requirement_label": block["label"],
                    "requirement_text": row["수능최저"],
                    "result": "참조",
                    "margin": 0,
                    "detail": "인문 또는 자연 최저 기준 참조 필요",
                    "selected": [],
                })
                continue

            if block.get("no_requirement"):
                simulations.append({
                    "university": row["대학"],
                    "admission_category": row["전형구분"],
                    "admission_type": row["전형명"],
                    "track": row["계열"],
                    "requirement_label": block["label"],
                    "requirement_text": "수능최저 없음" if block["label"] == "전체" else f"{block['label']} 수능최저 없음",
                    "result": "해당없음",
                    "margin": 0,
                    "detail": "수능 최저학력기준 미적용",
                    "selected": [],
                })
                continue

            if not block["conditions"]:
                continue

            # Try each OR condition, take the best result
            best_result = None
            for cond in block["conditions"]:
                check = _check_condition(mock_grades, cond)
                if best_result is None:
                    best_result = check
                elif check.get("result") == "충족" and best_result.get("result") != "충족":
                    best_result = check
                elif (
                    check.get("result") == best_result.get("result")
                    and (check.get("margin") or 0) > (best_result.get("margin") or 0)
                ):
                    best_result = check

            if best_result:
                req_display = row["수능최저"]
                if block["label"] != "전체":
                    req_display = f"{block['label']}\n{block.get('raw', '')}"

                simulations.append({
                    "university": row["대학"],
                    "admission_category": row["전형구분"],
                    "admission_type": row["전형명"],
                    "track": row["계열"],
                    "requirement_label": block["label"],
                    "requirement_text": req_display,
                    "result": best_result.get("result", "파싱불가"),
                    "margin": best_result.get("margin", 0),
                    "detail": best_result.get("detail", ""),
                    "selected": best_result.get("selected", []),
                    "failures": best_result.get("failures", []),
                })

    # 5. 요약 통계
    met = sum(1 for s in simulations if s["result"] == "충족")
    close = sum(1 for s in simulations if s["result"] == "미충족" and -2 <= (s.get("margin") or -99) < 0)
    not_met = sum(1 for s in simulations if s["result"] == "미충족" and (s.get("margin") or -99) < -2)
    no_req = sum(1 for s in simulations if s["result"] == "해당없음")

    # Sort: 충족 first, then by margin descending
    result_order = {"충족": 0, "해당없음": 1, "미충족": 2, "참조": 3, "파싱불가": 4}
    simulations.sort(key=lambda x: (result_order.get(x["result"], 9), -(x.get("margin") or -999)))

    return {
        "student_mock_grades": mock_grades,
        "track": track,
        "target_level": target_level,
        "target_universities": target_universities,
        "target_year": target_year,
        "simulations": simulations,
        "summary": {
            "total_checked": len(simulations),
            "met": met,
            "close": close,
            "not_met": not_met + sum(1 for s in simulations if s["result"] == "파싱불가"),
            "no_requirement": no_req,
        },
    }


def _extract_latest_mock_grades(c1_data: Any) -> dict[str, int | None]:
    """C1 모의고사 데이터에서 최신 등급 추출.

    C1 is a mock_exam_session_grid:
    {
      "session_key": {
        "absent": false,
        "korean": {"rank": "3", ...},
        "math": {"rank": "2", ...},
        ...
      }
    }
    """
    grades: dict[str, int | None] = {
        "korean": None,
        "math": None,
        "english": None,
        "inquiry1": None,
        "inquiry2": None,
        "korean_history": None,
    }

    if not c1_data or not isinstance(c1_data, dict):
        return grades

    # Find latest non-absent session
    latest_session = None
    latest_key = ""

    for session_key, session_data in c1_data.items():
        if not isinstance(session_data, dict):
            continue
        if session_data.get("absent"):
            continue
        # Session keys are ordered, pick latest (highest key)
        if session_key > latest_key:
            latest_key = session_key
            latest_session = session_data

    if not latest_session:
        # Fallback: try any non-absent session
        for session_key in sorted(c1_data.keys(), reverse=True):
            session_data = c1_data[session_key]
            if isinstance(session_data, dict) and not session_data.get("absent"):
                latest_session = session_data
                break

    if not latest_session:
        return grades

    for area_key in ("korean", "math", "english", "inquiry1", "inquiry2", "korean_history"):
        area_data = latest_session.get(area_key)
        if isinstance(area_data, dict):
            rank = area_data.get("rank")
            if rank is not None:
                try:
                    grades[area_key] = int(rank)
                except (ValueError, TypeError):
                    pass

    return grades
