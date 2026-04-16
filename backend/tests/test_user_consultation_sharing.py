"""
학생 사후 철회 API 및 타임라인/프리뷰 신규 기능 단위 테스트 (V1 §10-1, §10-2, §6 UX).

- 모델에 revoke 필드가 추가되어 정상 import 되는지
- _effectively_shared 판정 로직 (review=reviewed AND revoked_at IS NULL)
- 타임라인 정렬 키 (timing T1~T4 / S1~S4 및 날짜)
- 앱 전체 import 시 신규 라우터 3종(status/revoke/restore + timeline + preview) 등록 여부
- senior_sharing_service._strip_blocked_categories 경로 보강 (BLOCKED 방어 재확인)
"""

from __future__ import annotations

from datetime import datetime

from app.services.senior_sharing_service import (
    BLOCKED_CATEGORIES,
    _strip_blocked_categories,
)


def test_model_revoke_fields_importable() -> None:
    """ConsultationSurvey / ConsultationNote 에 revoke 필드가 선언되어 있어야 한다."""
    from app.models.consultation_note import ConsultationNote
    from app.models.consultation_survey import ConsultationSurvey

    # __table__.c 에서 컬럼 존재 확인
    survey_cols = set(ConsultationSurvey.__table__.c.keys())
    note_cols = set(ConsultationNote.__table__.c.keys())

    for col in ("senior_sharing_revoked_at", "senior_sharing_revoke_reason"):
        assert col in survey_cols, f"ConsultationSurvey.{col} 누락"
        assert col in note_cols, f"ConsultationNote.{col} 누락"


def test_effectively_shared_logic() -> None:
    """_effectively_shared 는 reviewed + revoked_at IS NULL 일 때만 True."""
    from app.routers.user_consultation_sharing import _effectively_shared

    now = datetime.utcnow()

    # reviewed + 미철회 → True
    assert _effectively_shared("reviewed", None) is True

    # reviewed + 철회됨 → False (V1 §10-1)
    assert _effectively_shared("reviewed", now) is False

    # pending + 미철회 → False (관리자 검토 전)
    assert _effectively_shared("pending", None) is False

    # revision_requested + 미철회 → False
    assert _effectively_shared("revision_requested", None) is False

    # None + None → False (방어)
    assert _effectively_shared(None, None) is False


def test_timing_sort_key_order() -> None:
    """timing 정렬 키는 T1~T4 / S1~S4 모두 1~4 로, unknown 은 99 로 매핑."""
    from app.routers.admin_senior_consultation import _timing_sort_key

    assert _timing_sort_key("T1") == 1
    assert _timing_sort_key("T4") == 4
    assert _timing_sort_key("S1") == 1
    assert _timing_sort_key("S2") == 2

    # 알 수 없는 값과 None 은 뒤로 (99)
    assert _timing_sort_key(None) == 99
    assert _timing_sort_key("") == 99
    assert _timing_sort_key("XYZ") == 99

    # 정렬 결과: T1 < T2 < T3 < T4 < None
    timings = ["T3", None, "T1", "T4", "T2", "unknown"]
    sorted_timings = sorted(timings, key=_timing_sort_key)
    assert sorted_timings[:4] == ["T1", "T2", "T3", "T4"]


def test_new_routes_registered_in_app() -> None:
    """FastAPI app 에 신규 5개 라우트가 등록되어 있어야 한다."""
    from app.main import app

    paths = {getattr(r, "path", "") for r in app.routes}

    expected = {
        "/api/user/consultation-sharing/status",
        "/api/user/consultation-sharing/revoke",
        "/api/user/consultation-sharing/restore",
        "/api/admin/senior-consultation/student/{user_id}/counselor-timeline",
        "/api/admin/counselor-sharing/{source_type}/{item_id}/preview",
    }
    missing = expected - paths
    assert not missing, f"누락된 라우트: {missing}"


def test_strip_blocked_categories_defense_in_depth() -> None:
    """_strip_blocked_categories 는 BLOCKED 카테고리를 항상 제거한다.

    preview/timeline 경로에서도 이 방어선이 유지됨을 다시 확인.
    """
    answers = {
        "B": {"B1": {"ko": {"rank_grade": 2.0}}},
        "D8": {"family": "민감정보"},
        "F": {"mental": "민감정보"},
        "G": {"misc": "민감정보"},
        "E": {"E1": "공학계열"},
    }
    stripped = _strip_blocked_categories(answers)

    # BLOCKED 는 모두 제거
    for cat in BLOCKED_CATEGORIES:
        assert cat not in stripped, f"{cat} 가 제거되지 않음"

    # 정상 카테고리는 유지
    assert "B" in stripped
    assert "E" in stripped

    # 원본은 변경되지 않음 (deepcopy 확인)
    assert "D8" in answers
    assert "F" in answers
    assert "G" in answers


def test_strip_blocked_empty_input_safe() -> None:
    """입력이 dict 가 아니거나 비어도 빈 dict 를 반환."""
    assert _strip_blocked_categories(None) == {}  # type: ignore[arg-type]
    assert _strip_blocked_categories({}) == {}
    assert _strip_blocked_categories("not a dict") == {}  # type: ignore[arg-type]
