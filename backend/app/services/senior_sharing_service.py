"""
선배-상담사 데이터 공유 서비스

연계규칙 V1 §3-4 / §6 / §6-1 기반:
- 선배 → 상담사: 전체 공유 (관리자 리뷰 통과 후)
- 상담사 → 선배: 선택적 + 추상화 변환 + **관리자 검토(V1 §6) 통과 후**만 노출

BLOCKED_CATEGORIES 정책 (V1 §6-1 시스템적 차단):
    D8 (가족/개인사), F (민감 심리/정서 이슈), G (기타 사적 기록)
    → 관리자 UI나 API 입력값으로도 절대 공유 토글을 조정할 수 없다.
    → 본 모듈의 `abstract_consultation_for_senior()` 는 답변 사본에서
      BLOCKED 카테고리 키를 명시적으로 제거한 뒤 요약을 생성하며,
      원본 answers 에 해당 키가 존재하면 warning 로그를 남긴다.

추상화 규칙 (상담사 설문 → 선배용 요약):
- B (내신): 등급 → 등급 tier ("상위권"/"중위권"/"하위권") + 추이
- C (모의고사): 유형 ("내신형"/"균형형"/"수능형") + tier
- D6: 과목별 어려움 요약
- D7: 학습방법 요약
- E1: 진로 방향 (대분류)
- E2/E3: 목표 수준 ("상위권 목표" — 대학명 제외)
- E5: 선택과목 목록
- 레이더: 시각화용 등급만 (점수 제외)
- D8, F, G: 비공유 (민감정보, BLOCKED_CATEGORIES)
"""

from __future__ import annotations

import copy
import logging
from typing import Any

logger = logging.getLogger(__name__)


# V1 §6-1: 관리자가 변경 불가능한 시스템적 차단 카테고리
BLOCKED_CATEGORIES: frozenset[str] = frozenset({"D8", "F", "G"})


# V1 §6 상담사 설문(ConsultationSurvey) 선배 공유 기본 토글 (True=공유, False=비공개)
DEFAULT_SURVEY_SENIOR_SHARING: dict[str, bool] = {
    "academic_tier_label": True,      # 학업 현황 요약 레이블 (B: naesin, C: mock)
    "career_direction": True,         # 진로·전형 방향 (E1)
    "target_school_name": False,      # 구체적 목표 학교명 (E2/E3) — 기본 비공개
    "subject_difficulties": True,     # D6 과목 고민 요약
    "study_methods": True,            # D7 학습법 요약
    "roadmap_top_summary": True,      # 맞춤 로드맵 최상위 요약
    "action_plan_detail": False,      # 상세 액션 플랜 — 기본 비공개
    "subject_selection": True,        # E5 선택과목 목록
    "radar_grades": True,             # 레이더 등급 (점수 제외)
}

# V1 §6 상담사 상담기록(ConsultationNote) 선배 공유 기본 토글
DEFAULT_NOTE_SENIOR_SHARING: dict[str, bool] = {
    "next_senior_context": True,      # 다음 선배에게 전달할 맥락
    "action_plan_detail": False,      # 상세 액션 플랜(next_steps/advice_given) — 기본 비공개
}


def _strip_blocked_categories(answers: dict) -> dict:
    """answers 사본에서 BLOCKED_CATEGORIES 키를 제거하고, 존재했다면 warning 로그."""
    if not isinstance(answers, dict):
        return {}
    working = copy.deepcopy(answers)
    present = [cat for cat in BLOCKED_CATEGORIES if cat in working]
    if present:
        logger.warning(
            "[senior_sharing] BLOCKED categories present in answers, stripped before abstraction: %s",
            sorted(present),
        )
        for cat in present:
            working.pop(cat, None)
    return working


def abstract_consultation_for_senior(
    answers: dict,
    radar_scores: dict | None = None,
    timing: str | None = None,
    sharing: dict | None = None,
) -> dict:
    """상담사 설문 데이터를 선배용 추상화 요약으로 변환.

    Parameters
    ----------
    answers : dict
        상담사 설문 원본 answers (카테고리별 dict).
    radar_scores : dict | None
        레이더 산출 결과. `radar_grades` / `overall_grade` 포함.
    timing : str | None
        설문 시점 (T1~T4 등). 반환값 `timing` 필드로 전달.
    sharing : dict | None
        V1 §6 상담사 설문 공유 토글. None 인 경우 DEFAULT_SURVEY_SENIOR_SHARING 사용.
        존재하지 않는 키는 기본값 대체.

    Returns
    -------
    dict
        선배에게 노출해도 되는 필드만 포함된 요약 dict.
    """
    # 1) 시스템적 차단 카테고리 제거 (관리자 설정과 무관한 하드 가드)
    answers = _strip_blocked_categories(answers or {})

    # 2) 공유 설정 병합 (None 또는 누락 키는 기본값 사용)
    effective_sharing: dict[str, bool] = dict(DEFAULT_SURVEY_SENIOR_SHARING)
    if sharing:
        for key, value in sharing.items():
            # BLOCKED 키가 sharing 에 섞여 들어와도 무시 (방어)
            if key in BLOCKED_CATEGORIES:
                logger.warning(
                    "[senior_sharing] sharing key '%s' matches a BLOCKED category; ignored.",
                    key,
                )
                continue
            effective_sharing[key] = bool(value)

    summary: dict[str, Any] = {}

    # --- B: 내신 → tier + 추이 (academic_tier_label) ---
    cat_b = answers.get("B", {})
    if cat_b and effective_sharing.get("academic_tier_label", True):
        grades = _extract_grade_tiers(cat_b)
        if grades:
            summary["naesin"] = grades

    # --- C: 모의고사 → 유형 + tier (academic_tier_label) ---
    cat_c = answers.get("C", {})
    if cat_c and effective_sharing.get("academic_tier_label", True):
        mock_summary = _extract_mock_summary(cat_c)
        if mock_summary:
            summary["mock"] = mock_summary

    # --- D6: 과목별 어려움 (subject_difficulties) ---
    cat_d = answers.get("D", {})
    if effective_sharing.get("subject_difficulties", True):
        d6 = cat_d.get("D6") if isinstance(cat_d, dict) else None
        if d6:
            summary["subject_difficulties"] = _extract_subject_difficulties(d6)

    # --- D7: 학습방법 요약 (study_methods) ---
    if effective_sharing.get("study_methods", True):
        d7 = cat_d.get("D7") if isinstance(cat_d, dict) else None
        if d7 and isinstance(d7, dict):
            methods = {}
            for subj_key, subj_data in d7.items():
                if isinstance(subj_data, dict):
                    m = subj_data.get("study_method", [])
                    if m:
                        methods[subj_key] = m
            if methods:
                summary["study_methods"] = methods

    # --- E1: 진로 방향 (career_direction) ---
    cat_e = answers.get("E", {})
    if effective_sharing.get("career_direction", True):
        e1 = cat_e.get("E1") if isinstance(cat_e, dict) else None
        if e1:
            summary["career_direction"] = _extract_career_direction(e1)

    # --- E2/E3: 목표 수준 (대학명 제외) (target_school_name) ---
    if effective_sharing.get("target_school_name", False):
        e2 = cat_e.get("E2", {}) if isinstance(cat_e, dict) else {}
        e3 = cat_e.get("E3", {}) if isinstance(cat_e, dict) else {}
        target_level = _extract_target_level(e2, e3)
        if target_level:
            summary["target_level"] = target_level

    # --- roadmap_top_summary: E2/E3 최상위 요약 한 줄 (roadmap_top_summary) ---
    if effective_sharing.get("roadmap_top_summary", True):
        e2 = cat_e.get("E2", {}) if isinstance(cat_e, dict) else {}
        e3 = cat_e.get("E3", {}) if isinstance(cat_e, dict) else {}
        roadmap_top = _extract_roadmap_top_summary(e2, e3)
        if roadmap_top:
            summary["roadmap_top_summary"] = roadmap_top

    # --- action_plan_detail: 상세 내용 제외, boolean 힌트만 ---
    if effective_sharing.get("action_plan_detail", False):
        # 선배 노출에는 원칙적으로 상세 액션 플랜을 포함하지 않는다.
        # 대신 "상세 플랜 존재" boolean 으로만 안내한다.
        summary["action_plan_detail_available"] = bool(
            (cat_e.get("E4") if isinstance(cat_e, dict) else None)
            or (cat_d.get("D9") if isinstance(cat_d, dict) else None)
        )
    # False 일 때는 키 자체를 생략

    # --- E5: 선택과목 (subject_selection) ---
    if effective_sharing.get("subject_selection", True):
        e5 = cat_e.get("E5") if isinstance(cat_e, dict) else None
        if e5:
            summary["subject_selection"] = e5

    # --- 레이더: 등급만 (점수 제외) (radar_grades) ---
    if effective_sharing.get("radar_grades", True):
        if radar_scores and isinstance(radar_scores, dict):
            radar = radar_scores.get("radar", {})
            if radar:
                summary["radar_grades"] = {
                    axis: data.get("grade", "?")
                    for axis, data in radar.items()
                    if isinstance(data, dict)
                }
            overall = radar_scores.get("overall_grade")
            if overall:
                summary["overall_grade"] = overall

    summary["timing"] = timing

    return summary


def filter_note_for_senior(
    note_payload: dict,
    sharing: dict | None = None,
) -> dict:
    """ConsultationNote dict 를 선배 공유 토글 기반으로 필터링한다.

    - next_senior_context : bool — True 일 때만 원문 유지
    - action_plan_detail : bool — False 일 때 next_steps / advice_given 제거

    P3-①: 공유 OFF 로 가려진 필드 목록을 `_redacted_fields` 메타에 기록.
    선배(또는 관리자 UI) 는 이를 이용해 "비공유" 배지를 표시할 수 있다.

    `note_payload` 는 수정하지 않고 얕은 사본을 반환.
    """
    effective_sharing: dict[str, bool] = dict(DEFAULT_NOTE_SENIOR_SHARING)
    if sharing:
        for key, value in sharing.items():
            if key in BLOCKED_CATEGORIES:
                continue
            effective_sharing[key] = bool(value)

    filtered = dict(note_payload or {})
    redacted_fields: list[str] = []

    def _redact_if_present(field: str) -> None:
        original = (note_payload or {}).get(field)
        if (
            original is not None
            and original != ""
            and original != []
            and original != {}
        ):
            redacted_fields.append(field)
        filtered[field] = None

    if not effective_sharing.get("next_senior_context", True):
        _redact_if_present("next_senior_context")
    if not effective_sharing.get("action_plan_detail", False):
        _redact_if_present("next_steps")
        _redact_if_present("advice_given")

    filtered["_redacted_fields"] = redacted_fields
    return filtered


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


def _extract_roadmap_top_summary(e2: dict, e3: dict) -> str | None:
    """E2/E3 최상위 요약 1줄 텍스트 (대학명 제외)."""
    parts: list[str] = []
    if isinstance(e2, dict):
        level = e2.get("target_level")
        if level and level != "미정":
            parts.append(str(level))
    if isinstance(e3, dict):
        track = e3.get("main_track")
        if track and track != "미정":
            parts.append(f"{track} 중심")
    if not parts:
        return None
    return " / ".join(parts)
