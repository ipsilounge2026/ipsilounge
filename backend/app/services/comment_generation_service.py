"""
상담사 분석 코멘트 자동 생성 서비스

기획서 §4-8 기준 6개 영역 코멘트 + C4 유형 판정을 자동 초안 생성.
상담사가 검토 후 편집 가능.
"""
from __future__ import annotations

from typing import Any


def generate_all_comments(
    answers: dict,
    radar_scores: dict,
    computed_stats: dict,
    c4_result: dict | None = None,
) -> dict:
    """
    6개 영역 분석 코멘트 + C4 판정 코멘트를 자동 생성.

    Returns:
        {
            "grade_trend_comment": str,
            "mock_trend_comment": str,
            "comparison_comment": str,
            "subject_competitiveness_comment": str,
            "study_method_comment": str,
            "c4_type_comment": str,
        }
    """
    naesin = radar_scores.get("naesin", {})
    mock = radar_scores.get("mock", {})
    study = radar_scores.get("study", {})
    career = radar_scores.get("career", {})

    grade_trend = computed_stats.get("grade_trend", {})
    mock_trend = computed_stats.get("mock_trend", {})
    study_analysis = computed_stats.get("study_analysis", {})

    return {
        "grade_trend_comment": _gen_grade_trend_comment(naesin, grade_trend),
        "mock_trend_comment": _gen_mock_trend_comment(mock, mock_trend),
        "comparison_comment": _gen_comparison_comment(naesin, mock, c4_result),
        "subject_competitiveness_comment": _gen_subject_comment(answers, naesin, mock),
        "study_method_comment": _gen_study_method_comment(study, study_analysis, answers),
        "c4_type_comment": c4_result.get("reasoning", "") if c4_result else "",
    }


# ============================================================
# 1. 내신 등급 추이 코멘트
# ============================================================

def _gen_grade_trend_comment(naesin: dict, grade_trend: dict) -> str:
    """내신 추이에 대한 분석 코멘트 생성."""
    data = grade_trend.get("data", [])
    trend_badge = grade_trend.get("trend_badge", "")
    score = naesin.get("total", 0)
    grade = naesin.get("grade", "")
    details = naesin.get("details", {})

    parts = []

    # 현재 수준
    if data:
        latest = data[-1]
        parts.append(
            f"현재 전과목 평균등급은 {latest.get('avg_grade', '?')}등급이며, "
            f"내신 경쟁력 점수는 {score}점({grade}등급)입니다."
        )
    else:
        parts.append("내신 데이터가 아직 충분하지 않습니다.")
        return " ".join(parts)

    # 추이 분석
    if len(data) >= 2:
        first_avg = data[0].get("avg_grade", 0)
        last_avg = data[-1].get("avg_grade", 0)
        diff = round(last_avg - first_avg, 2)

        if trend_badge == "상승":
            parts.append(
                f"학기별 추이가 상승세({first_avg}→{last_avg}, {abs(diff):.1f}등급 향상)를 "
                f"보이고 있어 긍정적입니다. 이 흐름을 유지하는 것이 중요합니다."
            )
        elif trend_badge == "하락":
            parts.append(
                f"학기별 추이가 하락세({first_avg}→{last_avg}, {abs(diff):.1f}등급 하락)를 "
                f"보이고 있어 주의가 필요합니다. 성적 하락 원인을 분석하고 대비 전략을 수립해야 합니다."
            )
        elif trend_badge == "V자반등":
            parts.append(
                "중간에 하락 후 다시 반등하는 V자형 추이를 보이고 있습니다. "
                "반등의 모멘텀을 유지하는 것이 중요합니다."
            )
        else:
            parts.append(
                f"학기별 등급 변동이 크지 않아 안정적인 성적을 유지하고 있습니다."
            )

    # 과목 균형도
    balance_score = details.get("balance_score", 0)
    if balance_score is not None:
        if balance_score >= 8:
            parts.append("과목 간 등급 편차가 적어 균형 잡힌 학습이 이루어지고 있습니다.")
        elif balance_score <= 4:
            parts.append("과목 간 등급 편차가 크므로 취약 과목에 대한 집중 보완이 필요합니다.")

    # 수행평가
    perf_score = details.get("perf_score")
    if perf_score is not None and perf_score <= 5:
        parts.append("수행평가 비중이 높은 과목에서 성적이 저조한 경향이 있어 수행평가 대비 전략 보완이 필요합니다.")

    return " ".join(parts)


# ============================================================
# 2. 모의고사 추이 코멘트
# ============================================================

def _gen_mock_trend_comment(mock: dict, mock_trend: dict) -> str:
    """모의고사 추이에 대한 분석 코멘트."""
    score = mock.get("total", 0)
    grade = mock.get("grade", "")
    details = mock.get("details", {})
    avg_trend = mock_trend.get("avg_trend", [])
    trend_badge = mock_trend.get("trend_badge", "")
    weak_areas = mock_trend.get("weak_areas", [])

    if mock.get("no_data"):
        return "모의고사 데이터가 입력되지 않았습니다. 모의고사 성적 입력 후 분석이 가능합니다."

    parts = []

    # 현재 수준
    latest_pctile = details.get("latest_pctile_avg")
    if latest_pctile is not None:
        parts.append(
            f"최근 모의고사 국수탐 백분위 평균은 {latest_pctile:.0f}%이며, "
            f"모의고사 역량 점수는 {score}점({grade}등급)입니다."
        )
    else:
        parts.append(f"모의고사 역량 점수는 {score}점({grade}등급)입니다.")

    # 추이 분석
    if len(avg_trend) >= 2:
        if trend_badge == "상승":
            parts.append("회차별 백분위가 상승세를 보이고 있어 학습 효과가 나타나고 있습니다.")
        elif trend_badge == "하락":
            parts.append("회차별 백분위가 하락하고 있어 학습 방법 점검이 필요합니다.")
        elif trend_badge == "변동큼":
            parts.append("회차별 백분위 변동이 커서 안정적 실력 발휘를 위한 컨디션 관리와 실전 연습이 필요합니다.")
        else:
            parts.append("회차별 백분위가 안정적으로 유지되고 있습니다.")

    # 영어 원점수
    eng_score = details.get("eng_raw")
    if eng_score is not None:
        if eng_score >= 90:
            parts.append(f"영어 원점수 {eng_score:.0f}점으로 1등급을 안정적으로 확보하고 있습니다.")
        elif eng_score >= 80:
            parts.append(f"영어 원점수 {eng_score:.0f}점으로 2등급 수준입니다. 90점 돌파를 위한 추가 학습이 필요합니다.")
        else:
            parts.append(f"영어 원점수 {eng_score:.0f}점으로 보완이 시급합니다. 영어 학습 비중을 높여야 합니다.")

    # 취약 영역
    if weak_areas:
        weak_names = ", ".join(weak_areas[:3])
        parts.append(f"취약 영역({weak_names})에 대한 집중 보완이 필요합니다.")

    return " ".join(parts)


# ============================================================
# 3. 내신 vs 모의고사 비교 코멘트
# ============================================================

def _gen_comparison_comment(
    naesin: dict, mock: dict, c4_result: dict | None
) -> str:
    """내신/모의 비교 분석 코멘트."""
    n_score = naesin.get("total", 0)
    n_grade = naesin.get("grade", "")
    m_score = mock.get("total", 0)
    m_grade = mock.get("grade", "")

    if mock.get("no_data"):
        return "모의고사 데이터가 없어 내신-모의 비교 분석이 불가합니다."

    parts = []

    # 점수 비교
    diff = n_score - m_score
    parts.append(
        f"내신 경쟁력 {n_score}점({n_grade}), "
        f"모의고사 역량 {m_score}점({m_grade})입니다."
    )

    if abs(diff) < 10:
        parts.append("내신과 모의고사 수준이 유사하여 수시·정시 병행 전략이 가능합니다.")
    elif diff > 0:
        parts.append(
            f"내신이 모의보다 {diff:.0f}점 높아 수시 전형에서 상대적 경쟁력이 있습니다."
        )
    else:
        parts.append(
            f"모의가 내신보다 {abs(diff):.0f}점 높아 정시 전형에서 상대적 경쟁력이 있습니다."
        )

    # C4 결과 연계
    if c4_result:
        susi_label = c4_result.get("susi_reachable_label", "")
        jeongsi_label = c4_result.get("jeongsi_reachable_label", "")
        c4_type = c4_result.get("type", "")

        parts.append(
            f"입결 기준으로 수시 가능 라인은 {susi_label}, "
            f"정시 가능 라인은 {jeongsi_label}이며, "
            f"'{c4_type}'으로 판정되었습니다."
        )

    return " ".join(parts)


# ============================================================
# 4. 과목별 경쟁력 코멘트
# ============================================================

def _gen_subject_comment(answers: dict, naesin: dict, mock: dict) -> str:
    """과목별 경쟁력 분석 코멘트."""
    cat_b = answers.get("B", {})
    cat_c = answers.get("C", {})
    mock_data = cat_c.get("C1", {})

    # 최근 학기 과목별 성적 수집
    subject_grades = {}
    for sem_key in ["B4", "B3", "B2", "B1"]:
        sem_data = cat_b.get(sem_key)
        if not sem_data or not isinstance(sem_data, dict):
            continue
        for subj_key, subj_data in sem_data.items():
            if not isinstance(subj_data, dict):
                continue
            g = _parse_num(subj_data.get("rank_grade"))
            cat = subj_data.get("category", subj_key)
            if g is not None and subj_key not in subject_grades:
                subject_grades[subj_key] = {"grade": g, "name": cat}
        if subject_grades:
            break

    if not subject_grades:
        return "과목별 성적 데이터가 부족하여 경쟁력 분석이 제한적입니다."

    grades = [v["grade"] for v in subject_grades.values()]
    avg = sum(grades) / len(grades)

    # 강점/약점 과목 분류 (평균 대비 ±0.5등급)
    strong = [(v["name"], v["grade"]) for v in subject_grades.values() if v["grade"] <= avg - 0.5]
    weak = [(v["name"], v["grade"]) for v in subject_grades.values() if v["grade"] >= avg + 0.5]

    parts = []
    parts.append(f"최근 학기 전과목 평균등급은 {avg:.1f}등급입니다.")

    if strong:
        names = ", ".join(f"{n}({g}등급)" for n, g in strong[:3])
        parts.append(f"강점 과목: {names}. 이 과목들의 성취를 유지하면서 입시에 활용할 수 있습니다.")
    else:
        parts.append("뚜렷한 강점 과목이 없으므로 전 과목 고른 향상이 필요합니다.")

    if weak:
        names = ", ".join(f"{n}({g}등급)" for n, g in weak[:3])
        parts.append(f"보완 필요 과목: {names}. 이 과목들의 등급 향상이 전체 평균 개선에 큰 영향을 줍니다.")
    else:
        parts.append("모든 과목이 평균 수준 이상으로 균형 잡힌 성적을 보이고 있습니다.")

    return " ".join(parts)


# ============================================================
# 5. 학습 방법 진단 코멘트
# ============================================================

def _gen_study_method_comment(
    study: dict, study_analysis: dict, answers: dict
) -> str:
    """학습 방법 진단 분석 코멘트."""
    score = study.get("total", 0)
    grade = study.get("grade", "")
    details = study.get("details", {})

    parts = []
    parts.append(f"학습 습관·전략 점수는 {score}점({grade}등급)입니다.")

    # 자기주도 비율
    self_ratio = study_analysis.get("self_study_ratio")
    if self_ratio is not None:
        pct = self_ratio * 100 if self_ratio <= 1 else self_ratio
        if pct >= 70:
            parts.append(f"자기주도학습 비율이 {pct:.0f}%로 높은 수준입니다.")
        elif pct >= 40:
            parts.append(f"자기주도학습 비율이 {pct:.0f}%로 보통 수준입니다. 자기주도 시간 확대를 권장합니다.")
        else:
            parts.append(f"자기주도학습 비율이 {pct:.0f}%로 낮습니다. 학원/과외 의존도를 줄이고 자기주도 학습 시간을 확보해야 합니다.")

    # 주간 학습 시간
    total_hours = study_analysis.get("total_weekly_hours")
    if total_hours is not None:
        if total_hours >= 35:
            parts.append(f"주간 총 학습시간 {total_hours:.0f}시간으로 충분한 학습량을 확보하고 있습니다.")
        elif total_hours >= 20:
            parts.append(f"주간 총 학습시간 {total_hours:.0f}시간으로 보통 수준입니다.")
        else:
            parts.append(f"주간 총 학습시간 {total_hours:.0f}시간으로 학습량 확대가 시급합니다.")

    # 과목 밸런스
    balance = study_analysis.get("subject_balance")
    if balance is not None:
        if balance >= 0.7:
            parts.append("과목별 학습 시간 배분이 균형적입니다.")
        else:
            parts.append("과목별 학습 시간 편차가 크므로 취약 과목에 시간을 재배분할 필요가 있습니다.")

    # 오답 관리
    odam_score = details.get("odam_score")
    if odam_score is not None and odam_score <= 8:
        parts.append("오답 관리 습관이 부족합니다. 체계적인 오답 노트 작성과 반복 학습을 도입하세요.")

    # 학습 심리
    psych_score = details.get("psych_score")
    if psych_score is not None and psych_score <= 2:
        parts.append("학습 심리·컨디션 관리에 어려움을 겪고 있으므로 스트레스 관리 방안을 함께 논의해야 합니다.")

    return " ".join(parts)


# ============================================================
# 유틸리티
# ============================================================

def _parse_num(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None
