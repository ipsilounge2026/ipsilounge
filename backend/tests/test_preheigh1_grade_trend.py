"""
예비고1 C1~C6 학기 파싱 회귀 테스트 (V2_2 §3-2 + 2026-04-20 버그 수정).

배경 (2026-04-20 발견):
- SemesterGradeMatrix 프론트엔드는 C1~C6 을
  {"C1": {"exempt": false, "subjects": {"국어": {raw_score, ...}, ...}}}
  구조로 submit.
- 백엔드는 sem_data.get("ko") 등 직접 english 키로 접근 → 항상 빈 데이터.
- 결과: 예비고1 설문의 grade_trend / academic 점수 / school_type_compatibility
  모두 0점 혹은 빈 결과.

본 테스트는:
1. _extract_ph1_subjects 헬퍼가 신/구 양쪽 포맷 처리하는지
2. exempt=True 학기는 빈 dict 반환하는지
3. _compute_preheigh1 의 grade_trend 가 Korean-keyed 샘플에서 올바로 avg_score 계산하는지
4. grade_trend.semester_meta 에 6학기 exempt flag 모두 포함되는지
"""

from __future__ import annotations

import pytest

from app.services.survey_scoring_service import (
    PH1_SUBJECT_KO_TO_EN,
    _calc_ph1_academic_score,
    _extract_ph1_subjects,
    _get_latest_subject_scores,
)

# ============================================================
# _extract_ph1_subjects: 신/구 포맷 호환
# ============================================================

def test_extract_new_format_korean_subjects():
    """실제 SemesterGradeMatrix submit 포맷 — Korean keyed nested subjects."""
    sem = {
        "exempt": False,
        "subjects": {
            "국어": {"raw_score": 85, "subject_avg": 70},
            "영어": {"raw_score": 90, "subject_avg": 75},
            "수학": {"raw_score": 80, "subject_avg": 72},
        },
    }
    result = _extract_ph1_subjects(sem)
    assert "ko" in result and result["ko"]["raw_score"] == 85
    assert "en" in result and result["en"]["raw_score"] == 90
    assert "ma" in result and result["ma"]["raw_score"] == 80


def test_extract_exempt_returns_empty():
    """exempt=True 학기는 점수 계산 대상 제외."""
    sem = {"exempt": True, "exempt_reason": "free_semester"}
    assert _extract_ph1_subjects(sem) == {}


def test_extract_legacy_format_english_direct():
    """하위 호환: 구 포맷 직접 english 키."""
    sem = {
        "ko": {"raw_score": 85},
        "en": {"raw_score": 90},
    }
    result = _extract_ph1_subjects(sem)
    assert result == {"ko": {"raw_score": 85}, "en": {"raw_score": 90}}


def test_extract_malformed_non_dict_returns_empty():
    assert _extract_ph1_subjects(None) == {}  # type: ignore[arg-type]
    assert _extract_ph1_subjects("string") == {}  # type: ignore[arg-type]
    assert _extract_ph1_subjects({"subjects": "not a dict"}) == {}


def test_extract_unknown_korean_keys_filtered():
    """스키마 외 한글 키는 무시 (오타 방어)."""
    sem = {
        "exempt": False,
        "subjects": {
            "국어": {"raw_score": 85},
            "한국사": {"raw_score": 80},  # 스키마 외
        },
    }
    result = _extract_ph1_subjects(sem)
    assert "ko" in result
    assert len(result) == 1  # 국어만


def test_ph1_subject_ko_to_en_mapping():
    """한글→english 매핑 키/값 정확성."""
    assert PH1_SUBJECT_KO_TO_EN == {
        "국어": "ko", "영어": "en", "수학": "ma",
        "사회": "so", "과학": "sc",
    }


# ============================================================
# _calc_ph1_academic_score: 신 포맷으로 점수 산출
# ============================================================

def test_academic_score_from_new_format():
    """실제 프론트 포맷으로 제출된 답변이 0점이 아닌 의미있는 점수를 내야."""
    answers = {
        "C": {
            "C1": {"exempt": True, "exempt_reason": "free_semester"},
            "C2": {"exempt": True, "exempt_reason": "free_semester"},
            "C3": {
                "exempt": False,
                "subjects": {
                    "국어": {"raw_score": 85, "subject_avg": 70, "stdev": 10},
                    "영어": {"raw_score": 90, "subject_avg": 75, "stdev": 8},
                    "수학": {"raw_score": 80, "subject_avg": 72, "stdev": 12},
                    "사회": {"raw_score": 88, "subject_avg": 78, "stdev": 9},
                    "과학": {"raw_score": 82, "subject_avg": 70, "stdev": 11},
                },
            },
            "C4": {
                "exempt": False,
                "subjects": {
                    "국어": {"raw_score": 88},
                    "영어": {"raw_score": 92},
                    "수학": {"raw_score": 84},
                    "사회": {"raw_score": 90},
                    "과학": {"raw_score": 86},
                },
            },
            "C5": {"exempt": True, "exempt_reason": "not_graded"},
            "C6": {"exempt": True, "exempt_reason": "not_graded"},
        }
    }
    result = _calc_ph1_academic_score(answers)
    # 평균 85+ 수준이므로 의미있는 점수가 나와야 함
    assert result["total"] > 50, f"기대 > 50, 실제 {result['total']} — 파싱 실패 신호"
    assert result["grade"] in ("S", "A", "B", "C", "D")
    # details 에 latest_scores 기반 집계가 들어있어야
    assert result["details"]["전과목_평균원점수"]["value"] > 80


def test_academic_score_all_exempt_returns_zero():
    """전부 자유학기제면 데이터 없음 → 0점 (edge case)."""
    answers = {
        "C": {
            "C1": {"exempt": True, "exempt_reason": "free_semester"},
            "C2": {"exempt": True, "exempt_reason": "free_semester"},
            "C3": {"exempt": True, "exempt_reason": "free_semester"},
            "C4": {"exempt": True, "exempt_reason": "free_semester"},
            "C5": {"exempt": True, "exempt_reason": "not_graded"},
            "C6": {"exempt": True, "exempt_reason": "not_graded"},
        }
    }
    result = _calc_ph1_academic_score(answers)
    # latest_scores 가 비어있어 s1=0, s3=12(유지), s4=0, s2=10(중립)
    # total 은 일부 중립 점수 합 (22 점대)
    assert 0 <= result["total"] <= 30


# ============================================================
# _get_latest_subject_scores: 신 포맷 처리
# ============================================================

def test_get_latest_subject_scores_new_format():
    """최신 학기의 과목 점수가 올바로 추출되는지 (school_type_compatibility 가 사용)."""
    answers = {
        "C": {
            "C3": {
                "exempt": False,
                "subjects": {
                    "국어": {"raw_score": 80},
                    "수학": {"raw_score": 70},
                },
            },
            "C4": {
                "exempt": False,
                "subjects": {
                    "국어": {"raw_score": 90},
                    "영어": {"raw_score": 85},
                },
            },
        }
    }
    latest = _get_latest_subject_scores(answers)
    # C4 가 가장 마지막 — 국어 90 / 영어 85
    assert latest == {"ko": 90.0, "en": 85.0}


# ============================================================
# _compute_preheigh1: grade_trend + semester_meta 통합
# ============================================================

def test_compute_preheigh1_grade_trend_semester_meta():
    """grade_trend.semester_meta 에 6학기 전부 + exempt flag 포함."""
    from app.routers.admin_consultation_survey import _compute_preheigh1

    answers = {
        "C": {
            "C1": {"exempt": True, "exempt_reason": "free_semester"},
            "C2": {"exempt": True, "exempt_reason": "free_semester"},
            "C3": {
                "exempt": False,
                "subjects": {
                    "국어": {"raw_score": 85, "subject_avg": 70},
                    "영어": {"raw_score": 90, "subject_avg": 75},
                },
            },
            "C4": {
                "exempt": False,
                "subjects": {
                    "국어": {"raw_score": 88, "subject_avg": 72},
                },
            },
            "C5": {"exempt": True, "exempt_reason": "not_graded"},
            "C6": {"exempt": True, "exempt_reason": "not_graded"},
        }
    }
    result = _compute_preheigh1(answers)
    gt = result["grade_trend"]
    # 6학기 전부 meta 에 포함
    assert len(gt["semester_meta"]) == 6
    labels = [m["semester"] for m in gt["semester_meta"]]
    assert labels == ["중1-1", "중1-2", "중2-1", "중2-2", "중3-1", "중3-2"]
    # C1/C2 자유학기제, C5/C6 미진행 flag
    assert gt["semester_meta"][0]["exempt"] is True
    assert gt["semester_meta"][0]["exempt_reason"] == "free_semester"
    assert gt["semester_meta"][0]["exempt_label"] == "자유학기제"
    assert gt["semester_meta"][4]["exempt"] is True
    assert gt["semester_meta"][4]["exempt_reason"] == "not_graded"
    # C3/C4 정상 학기
    assert gt["semester_meta"][2]["exempt"] is False
    assert gt["semester_meta"][3]["exempt"] is False
    # data 는 scored 만 포함 (2건)
    assert len(gt["data"]) == 2
    assert gt["data"][0]["semester"] == "중2-1"
    assert gt["data"][1]["semester"] == "중2-2"
    # subject_trends 도 Korean 라벨로 정상 집계
    assert "국어" in gt["subject_trends"]
    assert len(gt["subject_trends"]["국어"]) == 2


def test_compute_preheigh1_subject_trends_ordering():
    """subject_trends 가 학기 순으로 수집되는지."""
    from app.routers.admin_consultation_survey import _compute_preheigh1

    answers = {
        "C": {
            "C3": {
                "exempt": False,
                "subjects": {"국어": {"raw_score": 70}},
            },
            "C4": {
                "exempt": False,
                "subjects": {"국어": {"raw_score": 85}},
            },
        }
    }
    result = _compute_preheigh1(answers)
    ko_trend = result["grade_trend"]["subject_trends"]["국어"]
    assert len(ko_trend) == 2
    assert ko_trend[0]["raw_score"] == 70
    assert ko_trend[1]["raw_score"] == 85
