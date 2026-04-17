"""
P3-① 테스트: 공유 OFF 로 가려진 필드에 대한 _redacted_fields 메타데이터.

- 상담사 UI 가 "선배 판단으로 비공유" 인지 "원래 빈 값" 인지 구분할 수 있어야 한다.
- _apply_sharing_filter (선배 노트 → 상담사 열람) 와
  filter_note_for_senior (상담사 노트 → 선배 열람) 양쪽 모두 동일 패턴으로 동작한다.
"""

from __future__ import annotations


# ─────────────────────────────────────────────────────────────
# 1. _apply_sharing_filter (admin_senior_consultation 내부 헬퍼)
# ─────────────────────────────────────────────────────────────

def test_apply_sharing_filter_records_redacted_present_fields() -> None:
    """원본에 값이 있었고 공유 OFF 면 _redacted_fields 에 들어가야 한다."""
    from app.routers.admin_senior_consultation import _apply_sharing_filter

    note_dict = {
        "id": "abc",
        "core_topics": [{"topic": "학업 계획"}],
        "optional_topics": [{"topic": "진로 탐색"}],
        "student_questions": "공부 어떻게?",
        "senior_answers": "플래너 써보자",
        "student_mood": "차분함",
        "study_attitude": "성실",
        "special_observations": "집중도 양호",
        "action_items": [{"action": "문제집 풀기"}],
        "next_checkpoints": [{"checkpoint": "모의고사 결과"}],
        "context_for_next": "다음 상담에서 진로 구체화",
        "operator_notes": "내부 운영 메모",
    }
    # 몇 개만 OFF
    sharing = {
        "core_topics": True,
        "optional_topics": False,          # → 가려짐
        "student_questions": False,        # → 2필드 가려짐
        "student_observation": True,
        "action_items": True,
        "next_checkpoints": False,         # → 가려짐
        "context_for_next": True,
        "operator_notes": False,           # 기본값 False — 원본 있으므로 가려짐
    }

    out = _apply_sharing_filter(note_dict, sharing)

    assert "_redacted_fields" in out
    redacted = set(out["_redacted_fields"])
    assert "optional_topics" in redacted
    assert "student_questions" in redacted
    assert "senior_answers" in redacted
    assert "next_checkpoints" in redacted
    assert "operator_notes" in redacted
    # 켜져 있는 필드는 redacted 에 없어야 함
    assert "core_topics" not in redacted
    assert "action_items" not in redacted
    assert "context_for_next" not in redacted

    # 실제 값은 None 또는 [] 로 치환
    assert out["optional_topics"] == []
    assert out["student_questions"] is None
    assert out["senior_answers"] is None
    assert out["next_checkpoints"] == []
    assert out["operator_notes"] is None


def test_apply_sharing_filter_empty_original_not_in_redacted() -> None:
    """원본이 비어있던 필드는 공유 OFF 여도 _redacted_fields 에 포함되지 않아야 한다.

    (사용자에게 '선배가 비공유로 설정' 배지를 달 이유가 없음 — 원래 값이 없었음)
    """
    from app.routers.admin_senior_consultation import _apply_sharing_filter

    note_dict = {
        "id": "abc",
        "core_topics": [],
        "optional_topics": [],
        "student_questions": None,
        "senior_answers": None,
        "student_mood": "",
        "study_attitude": None,
        "special_observations": None,
        "action_items": [],
        "next_checkpoints": [],
        "context_for_next": None,
        "operator_notes": None,
    }
    sharing = {k: False for k in [
        "core_topics", "optional_topics", "student_questions",
        "student_observation", "action_items", "next_checkpoints",
        "context_for_next", "operator_notes",
    ]}

    out = _apply_sharing_filter(note_dict, sharing)

    # 원본이 전부 빈 값이었으므로 redacted 는 빈 리스트
    assert out["_redacted_fields"] == []


def test_apply_sharing_filter_strips_internal_metadata() -> None:
    """review_notes, content_checklist 는 상담사 응답에서 제외된다."""
    from app.routers.admin_senior_consultation import _apply_sharing_filter

    note_dict = {
        "id": "abc",
        "review_notes": "내부 코멘트",
        "content_checklist": [{"key": "민감정보 없음", "checked": True}],
        "core_topics": [{"topic": "X"}],
    }
    out = _apply_sharing_filter(note_dict, {"core_topics": True})

    assert "review_notes" not in out
    assert "content_checklist" not in out


# ─────────────────────────────────────────────────────────────
# 2. filter_note_for_senior (상담사 노트 → 선배 열람)
# ─────────────────────────────────────────────────────────────

def test_filter_note_for_senior_records_redacted() -> None:
    """공유 OFF 인 필드(원본 값 있음)가 _redacted_fields 에 기록된다."""
    from app.services.senior_sharing_service import filter_note_for_senior

    note_payload = {
        "id": "n1",
        "next_senior_context": "다음 선배에게 전달할 내용",
        "next_steps": "상세 액션 1",
        "advice_given": "상세 액션 2",
        "main_content": "주요 내용 (비필터 대상)",
    }
    # next_senior_context ON, action_plan_detail OFF (기본값)
    out = filter_note_for_senior(note_payload, sharing={
        "next_senior_context": True,
        "action_plan_detail": False,
    })

    assert "_redacted_fields" in out
    redacted = set(out["_redacted_fields"])
    assert "next_steps" in redacted
    assert "advice_given" in redacted
    assert "next_senior_context" not in redacted

    # 실제 값 검증
    assert out["next_senior_context"] == "다음 선배에게 전달할 내용"
    assert out["next_steps"] is None
    assert out["advice_given"] is None
    # 필터 대상 외 필드는 변함 없음
    assert out["main_content"] == "주요 내용 (비필터 대상)"


def test_filter_note_for_senior_empty_original_not_redacted() -> None:
    """원본에 값이 없었던 경우 _redacted_fields 에 포함되지 않아야 한다."""
    from app.services.senior_sharing_service import filter_note_for_senior

    note_payload = {
        "id": "n2",
        "next_senior_context": None,
        "next_steps": "",
        "advice_given": None,
    }
    out = filter_note_for_senior(note_payload, sharing={
        "next_senior_context": False,
        "action_plan_detail": False,
    })

    assert out["_redacted_fields"] == []
    assert out["next_senior_context"] is None
    assert out["next_steps"] is None
    assert out["advice_given"] is None


def test_filter_note_for_senior_all_on_has_empty_redacted() -> None:
    """모든 토글이 ON 이면 redacted 는 비어있다."""
    from app.services.senior_sharing_service import filter_note_for_senior

    note_payload = {
        "next_senior_context": "전달 맥락",
        "next_steps": "단계 1",
        "advice_given": "조언 1",
    }
    out = filter_note_for_senior(note_payload, sharing={
        "next_senior_context": True,
        "action_plan_detail": True,
    })

    assert out["_redacted_fields"] == []
    assert out["next_senior_context"] == "전달 맥락"
    assert out["next_steps"] == "단계 1"
    assert out["advice_given"] == "조언 1"
