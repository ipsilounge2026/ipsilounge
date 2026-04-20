"""
survey_qa_validator.py 단위 테스트 (V3 §4-8-1).

회귀 가드 핵심:
- preheigh1 설문은 auto_comments 를 생성하지 않으므로
  _validate_comment_length 가 빈 auto_comments 를 보고 5건의
  COMMENT_EMPTY P2 이슈를 잘못 뿜어대는 버그가 있었다.
- 이후 _repair_comments → generate_all_comments 가 preheigh1 의 radar 키
  (학업기초력/학습습관_자기주도력/...)를 naesin/mock/study/career 로 찾다가
  빈 데이터 기반 garbage 코멘트를 만들고 상태를 repaired/warn 으로
  강등시키는 부작용이 있었다.
- 본 테스트는 survey_type 가드가 유지되도록 고정한다.
"""

from __future__ import annotations

from app.services.survey_qa_validator import (
    validate_computed_analysis,
    validate_with_repair,
)

# ============================================================
# preheigh1: auto_comments 없는 정상 케이스 → pass
# ============================================================

def _ph1_clean_computed() -> dict:
    """유효한 preheigh1 자동 분석 결과 샘플.

    - 예비고1 은 auto_comments/roadmap/c4_type 을 _compute_stats 단계에서
      생성하지 않는다 (scoring service 가 radar_scores 안에 별도 roadmap
      을 포함시킬 뿐).
    - radar_scores 는 5개 영역 키를 쓴다.
    """
    return {
        "grade_trend": {"data": [], "trend_badge": "데이터부족", "subject_trends": {}},
        "study_analysis": {
            "total_weekly_hours": 20.0,
            "by_subject": {},
            "by_type": {},
            "self_study_ratio": 60.0,
            "subject_balance": 80.0,
        },
        "radar_scores": {
            "학업기초력": {"score": 70, "grade": "B"},
            "학습습관_자기주도력": {"score": 65, "grade": "B"},
            "교과선행도": {"score": 55, "grade": "B"},
            "진로방향성": {"score": 60, "grade": "B"},
            "비교과역량": {"score": 50, "grade": "B"},
        },
    }


def test_preheigh1_clean_no_spurious_comment_empty_p2():
    """preheigh1 설문에서 auto_comments 부재가 COMMENT_EMPTY 를 유발하지 않아야 한다."""
    computed = _ph1_clean_computed()
    qa = validate_with_repair(computed, survey_type="preheigh1")

    # 상태: repaired/warn 으로 강등되지 않고 pass 여야 함
    assert qa["status"] == "pass", (
        f"preheigh1 깨끗한 설문이 {qa['status']} 로 분류됨. "
        f"P2 이슈={qa['p2_issues']}"
    )
    # P2 에 COMMENT_EMPTY / COMMENT_TOO_SHORT 가 하나도 없어야 함
    codes = {i["code"] for i in qa["p2_issues"]}
    assert "COMMENT_EMPTY" not in codes
    assert "COMMENT_TOO_SHORT" not in codes


def test_preheigh1_legacy_validate_also_skips_comment_length():
    """legacy validate_computed_analysis 도 동일 가드를 적용받아야 한다."""
    computed = _ph1_clean_computed()
    result = validate_computed_analysis(computed, survey_type="preheigh1")
    codes = {i["code"] for i in result.get("p2_issues", [])}
    assert "COMMENT_EMPTY" not in codes
    assert "COMMENT_TOO_SHORT" not in codes


# ============================================================
# high: auto_comments 필수 — 빈 값이면 COMMENT_EMPTY 발생해야
# ============================================================

def _high_computed_without_comments() -> dict:
    """high 설문이지만 auto_comments 가 비어 있는 케이스."""
    return {
        "grade_trend": {"data": [], "trend_badge": "유지", "subject_trends": {}},
        "radar_scores": {
            "naesin": {"total": 70, "grade": "B"},
            "mock": {"total": 65, "grade": "B"},
            "study": {"total": 60, "grade": "B"},
            "career": {"total": 55, "grade": "B"},
            "overall_score": 62.5,
            "overall_grade": "B",
        },
        "auto_comments": {},  # 비어 있음
        "roadmap": {"matrix": [{"phase": "P1", "naesin": "x" * 15}]},
        "c4_type": {"reasoning": "균형형"},
    }


def test_high_empty_auto_comments_triggers_p2():
    """고등학교 설문에서는 기존대로 P2 가 터져야 한다 (가드가 너무 광범위해지면 안 됨)."""
    computed = _high_computed_without_comments()
    # validate_with_repair 는 _repair_comments 로 재생성을 시도하므로
    # 순수 체크 흐름을 보려면 legacy validator 사용
    result = validate_computed_analysis(computed, survey_type="high")
    codes = [i["code"] for i in result.get("p2_issues", [])]
    assert "COMMENT_EMPTY" in codes, (
        f"high 설문에서 빈 auto_comments 가 P2 를 유발하지 않음. p2={result['p2_issues']}"
    )


# ============================================================
# high: 정상 comments → COMMENT_TOO_SHORT 트리거 경계
# ============================================================

def test_high_short_comment_triggers_too_short():
    """50자 미만 코멘트는 COMMENT_TOO_SHORT 로 분류되어야 한다."""
    # 50자 이상 한글 샘플 (공백 포함하여 50자 이상 확실히 만족)
    long_ok = (
        "모의고사 평균 3등급 수준으로 전반적으로 중상위권을 유지 중이며 "
        "최근 추이는 안정적이고 과목별 편차는 1등급 이내로 양호한 편입니다."
    )
    assert len(long_ok) >= 50  # 전제 확인

    computed = _high_computed_without_comments()
    computed["auto_comments"] = {
        "grade_trend_comment": "짧은 코멘트",  # < 50자
        "mock_trend_comment": long_ok,  # >= 50자 (유일한 통과 대상)
        "comparison_comment": "비교 평균",  # < 50자
        "subject_competitiveness_comment": "과목별",  # < 50자
        "study_method_comment": "학습 방법",  # < 50자
    }
    result = validate_computed_analysis(computed, survey_type="high")
    # 4개는 TOO_SHORT, 1개(mock_trend)는 통과
    too_short = [i for i in result["p2_issues"] if i["code"] == "COMMENT_TOO_SHORT"]
    assert len(too_short) == 4, f"4개 기대, 실제 {len(too_short)}: {too_short}"
