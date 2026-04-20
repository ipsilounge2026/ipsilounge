"""
상담 사전질문 자동 분석 결과 자체 검증 (QA Validator)

기획서 §4-8-1 기준. 상담사에게 초안을 전달하기 전에 프로그램이 자기 출력을
자동으로 검증하여 정확성·정합성·완결성을 확인한다.

검증 심각도:
- P1 (FAIL): 데이터 무결성 위반. 반드시 수정 필요.
- P2 (WARN): 품질 저하 위험. 검토 권장.
- P3 (INFO): 참고용 개선 제안.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

# ============================================================
# 심각도 및 이슈 구조
# ============================================================

SEVERITY_P1 = "p1"
SEVERITY_P2 = "p2"
SEVERITY_P3 = "p3"


def _issue(code: str, field: str, message: str) -> dict:
    return {"code": code, "field": field, "message": message}


# ============================================================
# P1 — 필수 검증
# ============================================================

def _validate_score_range(computed: dict, issues: list[dict]) -> None:
    """4영역 점수가 0~100 범위인지 확인."""
    radar_scores = computed.get("radar_scores") or {}
    for area_key in ("naesin", "mock", "study", "career"):
        area = radar_scores.get(area_key) or {}
        if not isinstance(area, dict):
            continue
        total = area.get("total")
        if total is None:
            continue
        try:
            val = float(total)
        except (TypeError, ValueError):
            issues.append(_issue(
                "SCORE_NOT_NUMERIC",
                f"radar_scores.{area_key}.total",
                f"{area_key} 점수가 숫자가 아닙니다: {total!r}",
            ))
            continue
        if val < 0 or val > 100:
            issues.append(_issue(
                "SCORE_OUT_OF_RANGE",
                f"radar_scores.{area_key}.total",
                f"{area_key} 점수 {val}는 0~100 범위를 벗어났습니다.",
            ))


def _expected_grade(score: float) -> str:
    if score >= 90: return "S"
    if score >= 75: return "A"
    if score >= 55: return "B"
    if score >= 35: return "C"
    return "D"


def _validate_grade_consistency(computed: dict, issues: list[dict]) -> None:
    """점수 ↔ 등급 변환이 기준과 일치하는지 확인."""
    radar_scores = computed.get("radar_scores") or {}
    for area_key in ("naesin", "mock", "study", "career"):
        area = radar_scores.get(area_key) or {}
        if not isinstance(area, dict):
            continue
        total = area.get("total")
        grade = area.get("grade")
        if total is None or grade is None:
            continue
        try:
            expected = _expected_grade(float(total))
        except (TypeError, ValueError):
            continue
        if str(grade).upper() != expected:
            issues.append(_issue(
                "GRADE_MISMATCH",
                f"radar_scores.{area_key}.grade",
                f"{area_key} 점수 {total} → 등급 {expected}이어야 하지만 {grade}로 기록됨.",
            ))


def _validate_overall_score(computed: dict, issues: list[dict]) -> None:
    """종합 점수가 4영역 평균과 일치하는지."""
    radar_scores = computed.get("radar_scores") or {}
    overall = radar_scores.get("overall_score")
    if overall is None:
        return
    area_scores = []
    for area_key in ("naesin", "mock", "study", "career"):
        area = radar_scores.get(area_key) or {}
        total = area.get("total")
        if total is None:
            continue
        try:
            area_scores.append(float(total))
        except (TypeError, ValueError):
            pass
    if len(area_scores) != 4:
        return
    expected_avg = sum(area_scores) / 4
    try:
        actual = float(overall)
    except (TypeError, ValueError):
        return
    if abs(actual - expected_avg) > 0.1:
        issues.append(_issue(
            "OVERALL_SCORE_MISMATCH",
            "radar_scores.overall_score",
            f"종합 점수 {actual}가 4영역 평균 {round(expected_avg, 1)}과 일치하지 않습니다.",
        ))


def _validate_required_fields(computed: dict, survey_type: str, issues: list[dict]) -> None:
    """필수 키 존재 확인."""
    required = ["radar_scores"]
    if survey_type == "high":
        required += ["auto_comments", "roadmap"]
    for key in required:
        if key not in computed or computed.get(key) in (None, {}, []):
            issues.append(_issue(
                "REQUIRED_FIELD_MISSING",
                key,
                f"필수 필드 '{key}'가 비어 있습니다.",
            ))


def _validate_roadmap_structure(computed: dict, survey_type: str, issues: list[dict]) -> None:
    """로드맵 Phase × 4트랙 셀이 생성되었는지."""
    if survey_type != "high":
        return
    roadmap = computed.get("roadmap") or {}
    if not roadmap:
        return
    matrix = roadmap.get("matrix") or roadmap.get("items") or []
    if not matrix:
        issues.append(_issue(
            "ROADMAP_EMPTY",
            "roadmap.matrix",
            "로드맵 셀이 생성되지 않았습니다.",
        ))


# ============================================================
# P2 — 중요 검증
# ============================================================

def _validate_trend_consistency(computed: dict, issues: list[dict]) -> None:
    """추이 코멘트와 실제 데이터 추세가 일치하는지."""
    auto_comments = computed.get("auto_comments") or {}
    grade_trend = computed.get("grade_trend") or {}
    mock_trend = computed.get("mock_trend") or {}

    # 내신
    comment = auto_comments.get("grade_trend_comment") or ""
    data = grade_trend.get("data") or []
    if comment and len(data) >= 2:
        first = data[0].get("avg_grade")
        last = data[-1].get("avg_grade")
        if first is not None and last is not None:
            try:
                first_v, last_v = float(first), float(last)
                # 등급은 낮을수록 좋음. last < first 이면 상승.
                actual_rising = last_v < first_v - 0.1
                actual_falling = last_v > first_v + 0.1
                mentions_rising = "상승" in comment or "개선" in comment or "향상" in comment
                mentions_falling = "하락" in comment or "악화" in comment or "떨어" in comment
                if mentions_rising and actual_falling:
                    issues.append(_issue(
                        "TREND_COMMENT_MISMATCH",
                        "auto_comments.grade_trend_comment",
                        f"내신 추이 코멘트는 '상승'을 언급하지만 실제 데이터는 하락 추세({first_v}→{last_v})입니다.",
                    ))
                elif mentions_falling and actual_rising:
                    issues.append(_issue(
                        "TREND_COMMENT_MISMATCH",
                        "auto_comments.grade_trend_comment",
                        f"내신 추이 코멘트는 '하락'을 언급하지만 실제 데이터는 상승 추세({first_v}→{last_v})입니다.",
                    ))
            except (TypeError, ValueError):
                pass

    # 모의고사
    comment = auto_comments.get("mock_trend_comment") or ""
    avg_trend = mock_trend.get("avg_trend") or []
    if comment and len(avg_trend) >= 2:
        first = avg_trend[0].get("avg_rank")
        last = avg_trend[-1].get("avg_rank")
        if first is not None and last is not None:
            try:
                first_v, last_v = float(first), float(last)
                actual_rising = last_v < first_v - 0.1
                actual_falling = last_v > first_v + 0.1
                mentions_rising = "상승" in comment or "개선" in comment or "향상" in comment
                mentions_falling = "하락" in comment or "악화" in comment or "떨어" in comment
                if mentions_rising and actual_falling:
                    issues.append(_issue(
                        "TREND_COMMENT_MISMATCH",
                        "auto_comments.mock_trend_comment",
                        f"모의고사 추이 코멘트는 '상승'을 언급하지만 실제는 하락 추세({first_v}→{last_v})입니다.",
                    ))
                elif mentions_falling and actual_rising:
                    issues.append(_issue(
                        "TREND_COMMENT_MISMATCH",
                        "auto_comments.mock_trend_comment",
                        f"모의고사 추이 코멘트는 '하락'을 언급하지만 실제는 상승 추세({first_v}→{last_v})입니다.",
                    ))
            except (TypeError, ValueError):
                pass


def _validate_comment_length(computed: dict, issues: list[dict]) -> None:
    """6개 영역 코멘트 최소 글자수(50자) 확인."""
    auto_comments = computed.get("auto_comments") or {}
    comment_keys = [
        ("grade_trend_comment", "내신 추이"),
        ("mock_trend_comment", "모의고사 추이"),
        ("comparison_comment", "내신 vs 모의고사"),
        ("subject_competitiveness_comment", "과목별 경쟁력"),
        ("study_method_comment", "학습 방법 진단"),
    ]
    MIN_LEN = 50
    for key, label in comment_keys:
        text = (auto_comments.get(key) or "").strip()
        if not text:
            issues.append(_issue(
                "COMMENT_EMPTY",
                f"auto_comments.{key}",
                f"{label} 코멘트가 비어 있습니다.",
            ))
        elif len(text) < MIN_LEN:
            issues.append(_issue(
                "COMMENT_TOO_SHORT",
                f"auto_comments.{key}",
                f"{label} 코멘트가 {len(text)}자로 최소 기준({MIN_LEN}자) 미달입니다.",
            ))


def _validate_roadmap_content(computed: dict, survey_type: str, issues: list[dict]) -> None:
    """로드맵 셀 중 의미 없는 내용(10자 미만) 비율 검사."""
    if survey_type != "high":
        return
    roadmap = computed.get("roadmap") or {}
    matrix = roadmap.get("matrix") or roadmap.get("items") or []
    if not matrix:
        return
    total = 0
    thin = 0
    for row in matrix:
        if not isinstance(row, dict):
            continue
        for key, val in row.items():
            if key in ("phase", "label", "timing"):
                continue
            if isinstance(val, str):
                total += 1
                if len(val.strip()) < 10:
                    thin += 1
    if total > 0 and thin / total > 0.3:
        issues.append(_issue(
            "ROADMAP_CONTENT_THIN",
            "roadmap.matrix",
            f"로드맵 셀 중 {thin}/{total}개({round(thin/total*100)}%)가 10자 미만으로 내용이 부족합니다.",
        ))


def _validate_c4_type(computed: dict, survey_type: str, issues: list[dict]) -> None:
    """C4 유형 판정 존재 여부 (고등학교 설문만)."""
    if survey_type != "high":
        return
    c4 = computed.get("c4_type")
    if c4 is None or c4 == {}:
        issues.append(_issue(
            "C4_TYPE_MISSING",
            "c4_type",
            "C4 유형(대학 전형 지원 유형) 판정이 생성되지 않았습니다.",
        ))


# ============================================================
# P3 — 참고 검증
# ============================================================

def _validate_comment_repetition(computed: dict, issues: list[dict]) -> None:
    """여러 영역 코멘트에서 30자 이상 동일 구절 반복."""
    auto_comments = computed.get("auto_comments") or {}
    comment_keys = [
        "grade_trend_comment",
        "mock_trend_comment",
        "comparison_comment",
        "subject_competitiveness_comment",
        "study_method_comment",
    ]
    texts = [(k, (auto_comments.get(k) or "").strip()) for k in comment_keys]
    texts = [(k, t) for k, t in texts if t]
    WINDOW = 30
    for i in range(len(texts)):
        key_i, text_i = texts[i]
        if len(text_i) < WINDOW:
            continue
        for j in range(i + 1, len(texts)):
            key_j, text_j = texts[j]
            if len(text_j) < WINDOW:
                continue
            # text_i에서 길이 WINDOW 슬라이스를 text_j에서 찾는다
            found = None
            for start in range(len(text_i) - WINDOW + 1):
                chunk = text_i[start:start + WINDOW]
                if chunk in text_j:
                    found = chunk
                    break
            if found:
                issues.append(_issue(
                    "COMMENT_REPETITION",
                    f"auto_comments.{key_i},{key_j}",
                    f"{key_i}와 {key_j}에서 '{found[:20]}...' 구절이 반복됩니다.",
                ))
                break  # 같은 i에 대해 한 번만 보고


def _validate_score_grade_distribution(computed: dict, issues: list[dict]) -> None:
    """종합 점수는 A인데 4영역 중 2개 이상이 C 이하 등의 괴리."""
    radar_scores = computed.get("radar_scores") or {}
    overall_grade = radar_scores.get("overall_grade")
    if not overall_grade:
        return
    low_count = 0
    for area_key in ("naesin", "mock", "study", "career"):
        area = radar_scores.get(area_key) or {}
        grade = (area.get("grade") or "").upper()
        if grade in ("C", "D"):
            low_count += 1
    if overall_grade in ("S", "A") and low_count >= 2:
        issues.append(_issue(
            "GRADE_DISTRIBUTION_OUTLIER",
            "radar_scores.overall_grade",
            f"종합 등급은 {overall_grade}이지만 4영역 중 {low_count}개가 C 이하입니다. 상담사 주의 필요.",
        ))


def _validate_comment_stddev(computed: dict, issues: list[dict]) -> None:
    """6개 영역 코멘트 글자수 표준편차 과도."""
    auto_comments = computed.get("auto_comments") or {}
    lengths = []
    for k in (
        "grade_trend_comment",
        "mock_trend_comment",
        "comparison_comment",
        "subject_competitiveness_comment",
        "study_method_comment",
    ):
        t = (auto_comments.get(k) or "").strip()
        if t:
            lengths.append(len(t))
    if len(lengths) < 3:
        return
    mean = sum(lengths) / len(lengths)
    var = sum((x - mean) ** 2 for x in lengths) / len(lengths)
    stddev = var ** 0.5
    if mean > 0 and stddev / mean > 0.8:
        issues.append(_issue(
            "COMMENT_LENGTH_UNEVEN",
            "auto_comments",
            f"영역별 코멘트 글자수 편차가 큽니다 (평균 {int(mean)}자, 표준편차 {int(stddev)}자).",
        ))


# ============================================================
# 자동 보정 (Auto-repair)
# ============================================================
# 기획서 §4-8-1: 상담사는 점수 체계를 모르므로 검증 실패를 직접 수정할 수 없다.
# 대신 프로그램이 자동 보정 가능한 항목은 재계산하고,
# 보정 불가 항목은 상담 자체를 차단하여 슈퍼관리자 점검을 요청한다.

# 자동 보정 가능 여부 매핑
_AUTO_REPAIRABLE_CODES = {
    # P1
    "SCORE_OUT_OF_RANGE": True,        # 0~100 범위로 clamp
    "GRADE_MISMATCH": True,            # 점수로부터 등급 재계산
    "OVERALL_SCORE_MISMATCH": True,    # 4영역 평균 재계산
    "SCORE_NOT_NUMERIC": False,        # 근본 오류 → BLOCKED
    "REQUIRED_FIELD_MISSING": False,   # 입력/로직 결함 → BLOCKED
    "ROADMAP_EMPTY": False,            # 입력/로직 결함 → BLOCKED
    # P2 (best-effort)
    "TREND_COMMENT_MISMATCH": True,    # 코멘트 재생성
    "COMMENT_EMPTY": True,             # 코멘트 재생성
    "COMMENT_TOO_SHORT": True,         # 코멘트 재생성
    "ROADMAP_CONTENT_THIN": False,     # 재생성 콜백 필요, 여기선 보정 불가
    "C4_TYPE_MISSING": False,
}


def _clamp_score(v: Any) -> float | None:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if x < 0:
        return 0.0
    if x > 100:
        return 100.0
    return x


def _repair_score_range(computed: dict, log: list[dict]) -> bool:
    """P1: SCORE_OUT_OF_RANGE — 0~100으로 clamp."""
    radar = computed.get("radar_scores")
    if not isinstance(radar, dict):
        return False
    changed = False
    for area_key in ("naesin", "mock", "study", "career"):
        area = radar.get(area_key)
        if not isinstance(area, dict):
            continue
        total = area.get("total")
        if total is None:
            continue
        try:
            val = float(total)
        except (TypeError, ValueError):
            continue
        if val < 0 or val > 100:
            clamped = _clamp_score(total)
            if clamped is not None and clamped != val:
                area["total"] = clamped
                log.append({
                    "code": "SCORE_OUT_OF_RANGE",
                    "field": f"radar_scores.{area_key}.total",
                    "action": f"{val} → {clamped} (0~100 clamp)",
                })
                changed = True
    return changed


def _repair_grade_consistency(computed: dict, log: list[dict]) -> bool:
    """P1: GRADE_MISMATCH — 점수로부터 등급 재계산."""
    radar = computed.get("radar_scores")
    if not isinstance(radar, dict):
        return False
    changed = False
    for area_key in ("naesin", "mock", "study", "career"):
        area = radar.get(area_key)
        if not isinstance(area, dict):
            continue
        total = area.get("total")
        grade = area.get("grade")
        if total is None:
            continue
        try:
            expected = _expected_grade(float(total))
        except (TypeError, ValueError):
            continue
        if str(grade or "").upper() != expected:
            area["grade"] = expected
            log.append({
                "code": "GRADE_MISMATCH",
                "field": f"radar_scores.{area_key}.grade",
                "action": f"{grade} → {expected} (점수 {total} 기준 재계산)",
            })
            changed = True
    return changed


def _repair_overall_score(computed: dict, log: list[dict]) -> bool:
    """P1: OVERALL_SCORE_MISMATCH — 4영역 평균 재계산."""
    radar = computed.get("radar_scores")
    if not isinstance(radar, dict):
        return False
    scores: list[float] = []
    for area_key in ("naesin", "mock", "study", "career"):
        area = radar.get(area_key) or {}
        total = area.get("total")
        if total is None:
            continue
        try:
            scores.append(float(total))
        except (TypeError, ValueError):
            pass
    if len(scores) != 4:
        return False
    expected_avg = round(sum(scores) / 4, 1)
    current = radar.get("overall_score")
    try:
        current_v = float(current) if current is not None else None
    except (TypeError, ValueError):
        current_v = None
    if current_v is None or abs(current_v - expected_avg) > 0.1:
        radar["overall_score"] = expected_avg
        radar["overall_grade"] = _expected_grade(expected_avg)
        log.append({
            "code": "OVERALL_SCORE_MISMATCH",
            "field": "radar_scores.overall_score",
            "action": f"{current} → {expected_avg} (4영역 평균 재계산)",
        })
        return True
    return False


def _repair_comments(
    computed: dict,
    answers: dict | None,
    timing: str | None,
    log: list[dict],
) -> bool:
    """P2: 코멘트 재생성 — comment_generation_service 재호출."""
    if answers is None:
        return False
    try:
        from app.services.comment_generation_service import generate_all_comments
    except Exception:
        return False
    radar = computed.get("radar_scores") or {}
    try:
        new_comments = generate_all_comments(
            answers=answers,
            radar_scores=radar,
            computed_stats=computed,
            c4_result=computed.get("c4_type"),
        )
    except Exception as e:
        log.append({
            "code": "COMMENT_REGEN_FAILED",
            "field": "auto_comments",
            "action": f"재생성 실패: {type(e).__name__}",
        })
        return False
    if not isinstance(new_comments, dict) or not new_comments:
        return False
    old_comments = computed.get("auto_comments") or {}
    # 병합 대신 교체 (재생성 결과가 완전체라고 간주)
    computed["auto_comments"] = new_comments
    changed_keys = [k for k, v in new_comments.items() if v and old_comments.get(k) != v]
    if changed_keys:
        log.append({
            "code": "COMMENT_REGENERATED",
            "field": "auto_comments",
            "action": f"재생성: {', '.join(changed_keys)}",
        })
        return True
    return False


def try_auto_repair(
    computed: dict,
    issues: list[dict],
    answers: dict | None = None,
    timing: str | None = None,
) -> tuple[dict, list[dict], list[dict]]:
    """자동 보정 시도.

    Returns:
        (repaired_computed, repair_log, unrepaired_issues)
    """
    repaired = computed  # in-place 수정
    log: list[dict] = []
    unrepaired: list[dict] = []

    need_range_repair = any(i["code"] == "SCORE_OUT_OF_RANGE" for i in issues)
    need_grade_repair = any(i["code"] == "GRADE_MISMATCH" for i in issues)
    need_overall_repair = any(i["code"] == "OVERALL_SCORE_MISMATCH" for i in issues)
    need_comment_repair = any(
        i["code"] in ("TREND_COMMENT_MISMATCH", "COMMENT_EMPTY", "COMMENT_TOO_SHORT")
        for i in issues
    )

    # 보정 불가 항목은 바로 unrepaired로
    for issue in issues:
        code = issue["code"]
        if not _AUTO_REPAIRABLE_CODES.get(code, False):
            unrepaired.append(issue)

    # 순서 중요: 범위 → 등급 → 종합 점수
    if need_range_repair:
        _repair_score_range(repaired, log)
    if need_grade_repair:
        _repair_grade_consistency(repaired, log)
    # 범위/등급 보정 후 종합 점수 재계산
    if need_overall_repair or need_range_repair:
        _repair_overall_score(repaired, log)
    if need_comment_repair and answers is not None:
        _repair_comments(repaired, answers, timing, log)

    return repaired, log, unrepaired


# ============================================================
# 메인 엔트리
# ============================================================

def _run_all_checks(computed: dict, survey_type: str) -> tuple[list[dict], list[dict], list[dict]]:
    p1: list[dict] = []
    p2: list[dict] = []
    p3: list[dict] = []

    _validate_score_range(computed, p1)
    _validate_grade_consistency(computed, p1)
    _validate_overall_score(computed, p1)
    _validate_required_fields(computed, survey_type, p1)
    _validate_roadmap_structure(computed, survey_type, p1)

    _validate_trend_consistency(computed, p2)
    _validate_comment_length(computed, p2)
    _validate_roadmap_content(computed, survey_type, p2)
    _validate_c4_type(computed, survey_type, p2)

    _validate_comment_repetition(computed, p3)
    _validate_score_grade_distribution(computed, p3)
    _validate_comment_stddev(computed, p3)

    return p1, p2, p3


def validate_computed_analysis(
    computed: dict,
    survey_type: str,
) -> dict:
    """(Legacy) 자동 분석 결과에 대해 P1/P2/P3 검증만 수행.

    자동 보정을 수행하지 않는 순수 검증 함수.
    신규 코드는 `validate_with_repair()` 사용을 권장.
    """
    p1, p2, p3 = _run_all_checks(computed, survey_type)

    if p1:
        status = "fail"
    elif p2:
        status = "warn"
    else:
        status = "pass"

    return {
        "status": status,
        "p1_issues": p1,
        "p2_issues": p2,
        "p3_issues": p3,
        "validated_at": datetime.now(UTC).isoformat(),
    }


def validate_with_repair(
    computed: dict,
    survey_type: str,
    answers: dict | None = None,
    timing: str | None = None,
) -> dict:
    """자동 분석 결과를 검증하고, 보정 가능 항목은 자동 재계산한 뒤 재검증.

    기획서 §4-8-1 핵심 플로우:
        1차 검증 → 보정 시도 → 2차 검증 → 최종 상태 판정

    상태 정의:
        - "pass":     P1 없음, P2 없음 (최상)
        - "repaired": 보정 수행 후 P1 없음 (보정 내역 있음)
        - "warn":     P1 없음, P2 잔존 (상담사 참고)
        - "blocked":  P1 잔존 (상담 진행 차단 — 슈퍼관리자 점검 필요)

    Args:
        computed: 자동 분석 결과 (in-place 수정 가능)
        survey_type: "high" | "preheigh1"
        answers: 설문 응답 (코멘트 재생성용, 선택)
        timing: 상담 시점 (high 전용)

    Returns:
        {
            "status": "pass" | "repaired" | "warn" | "blocked",
            "auto_repaired": bool,
            "repair_log": [...],
            "p1_issues": [...],
            "p2_issues": [...],
            "p3_issues": [...],
            "validated_at": ISO8601 str,
        }
    """
    # 1차 검증
    p1_first, p2_first, p3_first = _run_all_checks(computed, survey_type)

    auto_repaired = False
    repair_log: list[dict] = []

    # 보정 시도 (P1 + P2)
    if p1_first or p2_first:
        all_issues = p1_first + p2_first
        _, repair_log, _ = try_auto_repair(
            computed, all_issues, answers=answers, timing=timing,
        )
        if repair_log:
            auto_repaired = True

    # 2차 검증
    p1, p2, p3 = _run_all_checks(computed, survey_type)

    # 상태 판정
    if p1:
        status = "blocked"  # P1 잔존 → 상담 차단
    elif auto_repaired and (p1_first or p2_first):
        # P1/P2 있었으나 보정됨 → repaired (P2가 완전히 해소되었으면 여기)
        if p2:
            status = "warn"
        else:
            status = "repaired"
    elif p2:
        status = "warn"
    else:
        status = "pass"

    return {
        "status": status,
        "auto_repaired": auto_repaired,
        "repair_log": repair_log,
        "p1_issues": p1,
        "p2_issues": p2,
        "p3_issues": p3,
        "validated_at": datetime.now(UTC).isoformat(),
    }
