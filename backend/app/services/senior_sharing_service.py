"""
선배-상담사 데이터 공유 서비스

연계규칙 V1 §3-4 기반:
- 선배 → 상담사: 전체 공유 (관리자 리뷰 통과 후)
- 상담사 → 선배: 선택적 + 추상화 변환

추상화 규칙 (상담사 설문 → 선배용 요약):
- B (내신): 등급 → 등급 tier ("상위권"/"중위권"/"하위권") + 추이
- C (모의고사): 유형 ("내신형"/"균형형"/"������형") + tier
- D6: 과목별 어려움 요약
- D7: 학습방법 요약
- E1: 진로 방향 (대분류)
- E2/E3: 목표 수준 ("상위권 목표" — 대학명 제외)
- E5: 선택과목 목록
- 레이더: 시각화용 등급만 (점수 제외)
- D8, F, G: 비공유 (민감정보)
"""

from typing import Any


def abstract_consultation_for_senior(
    answers: dict,
    radar_scores: dict | None = None,
    timing: str | None = None,
) -> dict:
    """상담사 설문 데이��를 선배용 추상화 요약으로 변환."""
    summary: dict[str, Any] = {}

    # --- B: 내신 → tier + 추이 ---
    cat_b = answers.get("B", {})
    if cat_b:
        grades = _extract_grade_tiers(cat_b)
        if grades:
            summary["naesin"] = grades

    # --- C: 모의고사 → 유형 + tier ---
    cat_c = answers.get("C", {})
    if cat_c:
        mock_summary = _extract_mock_summary(cat_c)
        if mock_summary:
            summary["mock"] = mock_summary

    # --- D6: 과목별 어려움 ---
    cat_d = answers.get("D", {})
    d6 = cat_d.get("D6")
    if d6:
        summary["subject_difficulties"] = _extract_subject_difficulties(d6)

    # --- D7: 학습방법 요약 ---
    d7 = cat_d.get("D7")
    if d7 and isinstance(d7, dict):
        methods = {}
        for subj_key, subj_data in d7.items():
            if isinstance(subj_data, dict):
                m = subj_data.get("study_method", [])
                if m:
                    methods[subj_key] = m
        if methods:
            summary["study_methods"] = methods

    # --- E1: 진로 방향 ---
    cat_e = answers.get("E", {})
    e1 = cat_e.get("E1")
    if e1:
        summary["career_direction"] = _extract_career_direction(e1)

    # --- E2/E3: 목표 수준 (대학명 제외) ---
    e2 = cat_e.get("E2", {})
    e3 = cat_e.get("E3", {})
    target_level = _extract_target_level(e2, e3)
    if target_level:
        summary["target_level"] = target_level

    # --- E5: 선택과목 ---
    e5 = cat_e.get("E5")
    if e5:
        summary["subject_selection"] = e5

    # --- 레이더: 등급만 (점수 제외) ---
    if radar_scores and isinstance(radar_scores, dict):
        radar = radar_scores.get("radar", {})
        if radar:
            summary["radar_grades"] = {
                axis: data.get("grade", "?") for axis, data in radar.items()
                if isinstance(data, dict)
            }
        overall = radar_scores.get("overall_grade")
        if overall:
            summary["overall_grade"] = overall

    summary["timing"] = timing

    return summary


def _extract_grade_tiers(cat_b: dict) -> dict | None:
    """내신 등급을 tier로 변환."""
    semesters = ["B1", "B2", "B3", "B4"]
    semester_labels = ["고1-1", "고1-2", "고2-1", "고2-2"]
    subjects = ["ko", "en", "ma", "sc1", "sc2", "so"]

    tier_data = []
    for i, sem_key in enumerate(semesters):
        sem_data = cat_b.get(sem_key)
        if not sem_data or not isinstance(sem_data, dict):
            continue
        grades = []
        for subj in subjects:
            subj_data = sem_data.get(subj, {})
            if isinstance(subj_data, dict):
                g = subj_data.get("rank_grade")
                if g is not None:
                    try:
                        grades.append(float(g))
                    except (ValueError, TypeError):
                        pass
        if grades:
            avg = sum(grades) / len(grades)
            tier = _grade_to_tier(avg)
            tier_data.append({"semester": semester_labels[i], "tier": tier, "subject_count": len(grades)})

    if not tier_data:
        return None

    # 추이 판정
    if len(tier_data) >= 2:
        first_tier = tier_data[0]["tier"]
        last_tier = tier_data[-1]["tier"]
        tier_order = {"상위권": 1, "중상위권": 2, "중위권": 3, "중하위권": 4, "하위권": 5}
        diff = tier_order.get(first_tier, 3) - tier_order.get(last_tier, 3)
        if diff > 0:
            trend = "상승"
        elif diff < 0:
            trend = "하락"
        else:
            trend = "유지"
    else:
        trend = "데이터부족"

    return {
        "semesters": tier_data,
        "trend": trend,
        "latest_tier": tier_data[-1]["tier"],
    }


def _grade_to_tier(avg_grade: float) -> str:
    """평균 등급 → tier 라벨."""
    if avg_grade <= 1.5:
        return "상위권"
    elif avg_grade <= 2.5:
        return "중상위권"
    elif avg_grade <= 3.5:
        return "중위권"
    elif avg_grade <= 4.0:
        return "중하위권"
    else:
        return "하위권"


def _extract_mock_summary(cat_c: dict) -> dict | None:
    """모의고사 → 유형 + tier."""
    mock_data = cat_c.get("C1")
    if not mock_data or not isinstance(mock_data, dict):
        return None

    all_ranks = []
    for session_key, session in mock_data.items():
        if not isinstance(session, dict):
            continue
        for area in ["korean", "math", "english", "inquiry1", "inquiry2"]:
            area_data = session.get(area, {})
            if isinstance(area_data, dict):
                rank = area_data.get("rank")
                if rank is not None:
                    try:
                        all_ranks.append(float(rank))
                    except (ValueError, TypeError):
                        pass

    if not all_ranks:
        return None

    avg_rank = sum(all_ranks) / len(all_ranks)
    tier = _rank_to_tier(avg_rank)

    # 유형 판정 (C4가 있으면 사용)
    c4_type = cat_c.get("C4", "")

    return {
        "tier": tier,
        "type_hint": c4_type if c4_type else None,
    }


def _rank_to_tier(avg_rank: float) -> str:
    """모의 평균 등급 → tier."""
    if avg_rank <= 2:
        return "상위권"
    elif avg_rank <= 4:
        return "중상위권"
    elif avg_rank <= 6:
        return "중위권"
    else:
        return "하위권"


def _extract_subject_difficulties(d6: Any) -> list[str]:
    """D6에서 과목별 어려움 키워드 추출."""
    if isinstance(d6, list):
        return [str(item) for item in d6[:5]]
    if isinstance(d6, dict):
        difficulties = []
        for subj, detail in d6.items():
            if isinstance(detail, str) and detail:
                difficulties.append(f"{subj}: {detail}")
            elif isinstance(detail, dict):
                desc = detail.get("difficulty") or detail.get("description", "")
                if desc:
                    difficulties.append(f"{subj}: {desc}")
        return difficulties[:5]
    return []


def _extract_career_direction(e1: Any) -> str:
    """E1에서 진로 방향 대분류 추출."""
    if isinstance(e1, str):
        return e1
    if isinstance(e1, list):
        directions = []
        for item in e1:
            if isinstance(item, dict):
                cat = item.get("category") or item.get("major") or ""
                if cat:
                    directions.append(cat)
            elif isinstance(item, str):
                directions.append(item)
        return ", ".join(directions[:3]) if directions else "탐색 중"
    if isinstance(e1, dict):
        return e1.get("category", "") or e1.get("direction", "") or "미정"
    return "미정"


def _extract_target_level(e2: dict, e3: dict) -> str | None:
    """E2/E3에서 목표 수준 추출 (대학명 제외)."""
    if isinstance(e2, dict):
        level = e2.get("target_level", "")
        if level and level != "미정":
            return f"{level} 목표"

    if isinstance(e3, dict):
        understanding = e3.get("understanding")
        main_track = e3.get("main_track", "")
        parts = []
        if main_track and main_track != "미정":
            parts.append(f"{main_track} 중심")
        if understanding:
            try:
                u = float(understanding)
                if u >= 7:
                    parts.append("전형 이해도 높음")
                elif u >= 4:
                    parts.append("전형 이해도 보통")
                else:
                    parts.append("전형 이해도 낮음")
            except (ValueError, TypeError):
                pass
        if parts:
            return " / ".join(parts)

    return None
