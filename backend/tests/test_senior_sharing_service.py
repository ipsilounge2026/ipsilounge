"""
senior_sharing_service.py 단위 테스트 (V1 §6 / §6-1).

- BLOCKED_CATEGORIES (D8/F/G) 가 추상화 결과에서 절대 노출되지 않는지
- sharing 토글 False 항목이 summary 에 포함되지 않는지
- BLOCKED 키가 answers 에 있을 때 warning 로그가 기록되는지
"""

from __future__ import annotations

import logging

from app.services.senior_sharing_service import (
    BLOCKED_CATEGORIES,
    DEFAULT_SURVEY_SENIOR_SHARING,
    abstract_consultation_for_senior,
)


def _sample_answers_with_blocked() -> dict:
    """BLOCKED 카테고리(D8/F/G)와 정상 카테고리가 혼재된 샘플."""
    return {
        "B": {
            "B1": {
                "ko": {"rank_grade": 2.0},
                "en": {"rank_grade": 2.0},
                "ma": {"rank_grade": 2.0},
            }
        },
        "D": {
            "D6": {"수학": "이차함수 어려움"},
            "D7": {"수학": {"study_method": ["문제 풀이"]}},
            "D8": {"family_issue": "부모님 이혼 예정", "secret": "공유 금지"},
        },
        "E": {
            "E1": "공학계열",
            "E2": {"target_level": "상위권"},
            "E5": ["미적분", "물리학Ⅰ"],
        },
        "F": {"mental_health": "극심한 불안", "counselor_private_memo": "민감"},
        "G": {"misc_private": "기타 사적 정보"},
    }


def test_blocked_categories_are_stripped() -> None:
    """D8/F/G 에 포함된 내용이 어떤 경로로도 summary 에 노출되지 않아야 한다."""
    answers = _sample_answers_with_blocked()

    # 모든 토글 ON — 그래도 BLOCKED 는 시스템적으로 제거되어야 함
    all_on = {k: True for k in DEFAULT_SURVEY_SENIOR_SHARING}
    summary = abstract_consultation_for_senior(
        answers=answers,
        radar_scores=None,
        timing="T1",
        sharing=all_on,
    )

    # 1) summary 상위 키에 D8/F/G 가 없어야 함
    for blocked in BLOCKED_CATEGORIES:
        assert blocked not in summary, f"{blocked} 가 summary 에 포함됨"

    # 2) summary 전체를 직렬화했을 때 BLOCKED 내용 문자열이 전혀 등장하지 않아야 함
    dumped = repr(summary)
    sensitive_strings = [
        "부모님 이혼 예정",
        "공유 금지",
        "극심한 불안",
        "counselor_private_memo",
        "민감",
        "기타 사적 정보",
        "family_issue",
        "mental_health",
        "misc_private",
    ]
    for s in sensitive_strings:
        assert s not in dumped, f"민감 문자열 '{s}' 가 summary 에 노출됨"

    # 3) 정상 카테고리는 정상 동작
    assert "subject_difficulties" in summary
    assert any("수학" in item for item in summary["subject_difficulties"])


def test_blocked_logged_when_present(caplog) -> None:
    """BLOCKED 키가 존재할 때 warning 로그가 기록되어야 한다."""
    answers = _sample_answers_with_blocked()

    with caplog.at_level(
        logging.WARNING, logger="app.services.senior_sharing_service"
    ):
        abstract_consultation_for_senior(answers=answers, radar_scores=None)

    messages = [rec.message for rec in caplog.records if rec.levelno >= logging.WARNING]
    assert any("BLOCKED" in m for m in messages), (
        f"BLOCKED 카테고리 warning 로그가 기록되지 않음. 로그: {messages}"
    )
    # 제거된 키가 로그에 열거되어야 함 (D8/F/G 중 최소 하나)
    joined = "\n".join(messages)
    assert any(cat in joined for cat in BLOCKED_CATEGORIES)


def test_blocked_not_logged_when_absent(caplog) -> None:
    """BLOCKED 키가 없을 때는 관련 warning 이 발생하지 않는다."""
    clean_answers = {
        "B": {"B1": {"ko": {"rank_grade": 3.0}}},
        "E": {"E1": "인문계열"},
    }

    with caplog.at_level(
        logging.WARNING, logger="app.services.senior_sharing_service"
    ):
        abstract_consultation_for_senior(answers=clean_answers)

    messages = [rec.message for rec in caplog.records]
    assert not any("BLOCKED" in m for m in messages)


def test_sharing_settings_respected() -> None:
    """sharing 에서 False 로 설정한 항목은 summary 에 포함되지 않아야 한다."""
    answers = {
        "B": {
            "B1": {
                "ko": {"rank_grade": 2.0},
                "en": {"rank_grade": 2.0},
            }
        },
        "D": {
            "D6": {"수학": "이차함수"},
            "D7": {"수학": {"study_method": ["문제 풀이"]}},
        },
        "E": {
            "E1": "공학계열",
            "E2": {"target_level": "상위권"},
            "E5": ["미적분", "물리학Ⅰ"],
        },
    }

    radar = {
        "radar": {"academic": {"grade": "A", "score": 85}},
        "overall_grade": "B",
    }

    sharing = {
        "academic_tier_label": False,     # naesin/mock/overall_grade 제거
        "career_direction": False,        # E1 제거
        "target_school_name": False,      # target_level 제거 (기본값 False 와 동일)
        "subject_difficulties": False,    # D6 제거
        "study_methods": True,            # D7 포함
        "roadmap_top_summary": False,
        "action_plan_detail": False,
        "subject_selection": True,        # E5 포함
        "radar_grades": False,            # radar 제거
    }

    summary = abstract_consultation_for_senior(
        answers=answers,
        radar_scores=radar,
        timing="T2",
        sharing=sharing,
    )

    # False 로 끈 항목들은 summary 에 없어야 함
    assert "naesin" not in summary
    assert "mock" not in summary
    assert "career_direction" not in summary
    assert "target_level" not in summary
    assert "subject_difficulties" not in summary
    assert "radar_grades" not in summary
    assert "overall_grade" not in summary
    assert "roadmap_top_summary" not in summary
    assert "action_plan_detail_available" not in summary

    # True 로 켠 항목은 포함
    assert summary.get("study_methods") == {"수학": ["문제 풀이"]}
    assert summary.get("subject_selection") == ["미적분", "물리학Ⅰ"]

    # timing 은 항상 반환
    assert summary.get("timing") == "T2"


def test_default_sharing_applied_when_none() -> None:
    """sharing=None 이면 DEFAULT_SURVEY_SENIOR_SHARING 이 적용된다 (target_school_name 기본 False)."""
    answers = {
        "E": {
            "E1": "공학계열",
            "E2": {"target_level": "상위권"},
        }
    }
    summary = abstract_consultation_for_senior(answers=answers)

    # career_direction 은 기본 True → 포함
    assert summary.get("career_direction") == "공학계열"
    # target_school_name 은 기본 False → 포함되지 않음
    assert "target_level" not in summary


# ============================================================
# V1 §4-1: E3 전형 방향 독립 토글 (exam_track_label)
# ============================================================

def test_exam_track_label_default_shared() -> None:
    """기본 토글(None) 적용 시 E3.main_track 이 exam_track 으로 노출된다."""
    answers = {
        "E": {
            "E2": {"target_level": "상위권"},
            "E3": {"main_track": "수시", "understanding": 8},
        }
    }
    summary = abstract_consultation_for_senior(answers=answers)

    # 기본 True → 레이블만 노출 (상세 수능 최저·이해도 점수는 제외)
    assert summary.get("exam_track") == "수시"
    # roadmap_top_summary 는 E2 목표 수준만 (E3 main_track 제외됨)
    assert summary.get("roadmap_top_summary") == "상위권"


def test_exam_track_label_off_hidden() -> None:
    """exam_track_label=False 일 때 exam_track 키 자체가 포함되지 않음."""
    answers = {
        "E": {
            "E3": {"main_track": "정시"},
        }
    }
    sharing = {"exam_track_label": False}
    summary = abstract_consultation_for_senior(answers=answers, sharing=sharing)

    assert "exam_track" not in summary


def test_exam_track_label_undecided_not_shared() -> None:
    """main_track='미정' 이면 노출하지 않는다 (의미 없는 레이블)."""
    answers = {"E": {"E3": {"main_track": "미정"}}}
    summary = abstract_consultation_for_senior(answers=answers)
    assert "exam_track" not in summary


def test_exam_track_label_ignores_unknown_values() -> None:
    """수시/정시/혼합 외의 값은 안전하게 무시."""
    answers = {"E": {"E3": {"main_track": "기타"}}}
    summary = abstract_consultation_for_senior(answers=answers)
    assert "exam_track" not in summary


def test_roadmap_top_summary_no_longer_includes_e3() -> None:
    """회귀 테스트: roadmap_top_summary 는 E2 목표 수준만 담아야 하고 E3 전형 방향은
    exam_track_label 로 분리되었으므로 'X 중심' 같은 문구가 들어가지 않는다."""
    answers = {
        "E": {
            "E2": {"target_level": "상위권"},
            "E3": {"main_track": "수시"},
        }
    }
    summary = abstract_consultation_for_senior(answers=answers)

    roadmap = summary.get("roadmap_top_summary") or ""
    # 분리 이전에는 "상위권 / 수시 중심" 이었으나, 분리 후 E2 만 있어야 한다
    assert "중심" not in roadmap
    assert "수시" not in roadmap
    assert roadmap == "상위권"
