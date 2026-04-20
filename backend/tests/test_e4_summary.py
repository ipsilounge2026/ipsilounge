"""
V3 §5-⑤ 수능 최저 대비도 E4 자가평가 요약 테스트.

_compute_high 의 결과에 e4_summary 필드가 포함되고 awareness/feasibility/
focus_areas 가 점수 매핑에 정확히 반영되는지 확인.

점수 기준 (spec V3 §5-⑤):
  awareness: 구체적파악=5 / 일부확인=3 / 모름=1
  feasibility: 여유있음=5 / 충족가능=4 / 1_2영역부족=2 / 불가=1
  focus_areas: 1개 이상 선택=5 / 미선택=1
  총 15점 (3영역 각 5점)
"""

from __future__ import annotations

from app.routers.admin_consultation_survey import _compute_high


def test_e4_summary_full_answered():
    """E4 세 필드 모두 응답 → e4_summary 정상 생성."""
    answers = {
        "E": {
            "E4": {
                "awareness": "구체적파악",
                "feasibility": "여유있음",
                "focus_areas": ["수학", "영어"],
            },
        },
    }
    result = _compute_high(answers)
    assert "e4_summary" in result
    e4 = result["e4_summary"]
    assert e4["is_answered"] is True
    assert e4["awareness"] == "구체적파악"
    assert e4["awareness_points"] == 5
    assert e4["feasibility"] == "여유있음"
    assert e4["feasibility_points"] == 5
    assert e4["focus_areas"] == ["수학", "영어"]
    assert e4["focus_points"] == 5
    assert e4["score"] == 15
    assert e4["max"] == 15


def test_e4_summary_partial_lowest():
    """'모름 / 불가 / 미선택' 최하점."""
    answers = {
        "E": {
            "E4": {
                "awareness": "모름",
                "feasibility": "불가",
                "focus_areas": [],
            },
        },
    }
    result = _compute_high(answers)
    e4 = result["e4_summary"]
    assert e4["awareness_points"] == 1
    assert e4["feasibility_points"] == 1
    assert e4["focus_points"] == 1
    assert e4["score"] == 3


def test_e4_summary_mid_score():
    """'일부확인 / 1_2영역부족 / 1개 선택' 중간값."""
    answers = {
        "E": {
            "E4": {
                "awareness": "일부확인",
                "feasibility": "1_2영역부족",
                "focus_areas": ["수학"],
            },
        },
    }
    result = _compute_high(answers)
    e4 = result["e4_summary"]
    assert e4["awareness_points"] == 3
    assert e4["feasibility_points"] == 2
    assert e4["focus_points"] == 5  # 1개 이상이면 만점
    assert e4["score"] == 10


def test_e4_summary_missing_e4_omitted():
    """E4 자체가 없으면 e4_summary 키 없음."""
    answers = {"E": {}}
    result = _compute_high(answers)
    assert "e4_summary" not in result


def test_e4_summary_e4_present_but_empty_strings():
    """awareness/feasibility 가 빈 문자열이고 focus 도 빈 배열이면 is_answered=False."""
    answers = {
        "E": {
            "E4": {
                "awareness": "",
                "feasibility": "",
                "focus_areas": [],
            },
        },
    }
    result = _compute_high(answers)
    # E4 dict 는 존재하므로 summary 가 만들어지지만 is_answered=False
    assert "e4_summary" in result
    assert result["e4_summary"]["is_answered"] is False
    # 점수는 모두 0 (매핑 dict 에 없는 "" 는 기본 0)
    assert result["e4_summary"]["awareness_points"] == 0
    assert result["e4_summary"]["feasibility_points"] == 0
    # focus 는 빈 배열이면 1점
    assert result["e4_summary"]["focus_points"] == 1


def test_e4_summary_unknown_focus_areas_type():
    """focus_areas 가 list 가 아니면 빈 배열로 처리."""
    answers = {
        "E": {
            "E4": {
                "awareness": "구체적파악",
                "feasibility": "충족가능",
                "focus_areas": "수학",  # string 오입력
            },
        },
    }
    result = _compute_high(answers)
    e4 = result["e4_summary"]
    assert e4["focus_areas"] == []
    assert e4["focus_points"] == 1  # 빈 배열이면 1점


def test_e4_summary_cat_e_absent():
    """카테고리 E 자체가 answers 에 없어도 에러 없이 없음."""
    answers = {"B": {}, "C": {}, "D": {}}
    result = _compute_high(answers)
    assert "e4_summary" not in result
