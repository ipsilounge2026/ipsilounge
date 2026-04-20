"""
사전 상담 설문 (Consultation Survey) — 시점(T1~T4) / 모드(Full/Delta) 자동 판정 서비스

핵심 규칙 (기획서 V3 §1-2, §1-4, §1-5):
- T1: 고1-1학기 종료 후 (7월)
- T2: 고1-2학기 종료 후 (2월)
- T3: 고2-1학기 종료 후 (7월)
- T4: 고2-2학기 종료 후 (2월)
- Full: 처음 상담받는 학생 (이전 high 설문 이력 없음) → 모든 항목 빈 칸
- Delta: 이전 high 설문 이력이 있는 학생 → 이전 응답 프리필, 변동분만 수정

기획서 §1-4의 시점 매트릭스:
- ●●●●  (T1·T2·T3·T4 모두 가능)
- ○●●●  (T2·T3·T4)
- ○○●●  (T3·T4)
- ○○○●  (T4만 — G 카테고리)

자동 판정 전략:
1. 사용자가 명시적으로 timing을 지정하면 그것을 그대로 사용 (수동 우선)
2. 자동 판정 시 → 학생의 학년/학기 정보(User.grade, grade_year)와 현재 날짜 기반으로 추정
3. mode는 동일 user/survey_type의 이전 설문 이력 유무로 판정
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consultation_survey import ConsultationSurvey
from app.models.user import User

Timing = Literal["T1", "T2", "T3", "T4"]
Mode = Literal["full", "delta"]


# ----- 시점 판정 -----

def estimate_current_grade_semester(
    user_grade: int | None,
    user_grade_year: int | None,
    today: date | None = None,
) -> tuple[int, int] | None:
    """
    학생의 grade(학년)와 grade_year(설정 연도)로부터 오늘 기준 (학년, 학기)를 추정.

    grade_year는 '학년이 설정된 시점의 연도'이며, 그 후 시간이 흐르면서 자동 진급한다고 본다.
    예) 2025년 3월에 grade=1로 설정 → 2025년 12월에는 여전히 고1, 2026년 3월에는 고2

    학기 기준:
    - 1학기: 3월 ~ 8월
    - 2학기: 9월 ~ 다음해 2월

    반환: (학년, 학기) 또는 추정 불가 시 None
    """
    if user_grade is None or user_grade_year is None:
        return None

    today = today or date.today()
    # 한국 학년도 기준: 3월에 새 학년 시작
    # grade_year = N → N년 3월 시작 학년이 user_grade
    years_passed = today.year - user_grade_year
    if today.month < 3:
        # 1~2월은 아직 직전 학년도
        years_passed -= 1

    current_grade = user_grade + years_passed
    if current_grade < 1:
        current_grade = 1
    if current_grade > 3:
        current_grade = 3

    # 학기: 3~8월=1학기, 9~다음해 2월=2학기
    if 3 <= today.month <= 8:
        current_semester = 1
    else:
        current_semester = 2

    return current_grade, current_semester


def estimate_timing_from_grade(
    user_grade: int | None,
    user_grade_year: int | None,
    today: date | None = None,
) -> Timing | None:
    """
    학생의 학년/학기로부터 어울리는 상담 시점(T1~T4)을 추정.

    매핑 (기획서 §1-2):
    - 고1-1학기 종료 ≈ 6~8월   → T1
    - 고1-2학기 종료 ≈ 12~다음해 2월 → T2
    - 고2-1학기 종료 ≈ 6~8월   → T3
    - 고2-2학기 종료 ≈ 12~다음해 2월 → T4

    학기 진행 중에도 직전 종료 시점의 설문을 사용 (7월=종료 직후, 9~11월=다음 시점 준비기)
    - 고1 1학기 중·종료 직후(3~8월): T1
    - 고1 2학기 중·종료 직후(9월~다음해 2월): T2
    - 고2 1학기 중·종료 직후(3~8월): T3
    - 고2 2학기 중·종료 직후(9월~다음해 2월): T4
    - 고3 진입 후: T4 (마지막 시점, 더 이상 신규 시점 없음)

    반환: 추정된 timing 또는 추정 불가 시 None
    """
    est = estimate_current_grade_semester(user_grade, user_grade_year, today)
    if est is None:
        return None

    grade, semester = est

    if grade == 1 and semester == 1:
        return "T1"
    if grade == 1 and semester == 2:
        return "T2"
    if grade == 2 and semester == 1:
        return "T3"
    if grade == 2 and semester == 2:
        return "T4"
    if grade >= 3:
        # 고3은 본 시스템 대상 아님 — 마지막 시점인 T4로 폴백
        return "T4"
    return None


# ----- 모드 판정 -----

async def determine_mode_for_user(
    user_id,
    survey_type: str,
    db: AsyncSession,
    *,
    new_timing: Timing | None = None,
) -> Mode:
    """
    사용자의 이전 설문 이력으로 mode를 자동 판정.

    규칙 (기획서 §1-3):
    - preheigh1 → 항상 "full"
    - high → 동일 user_id+survey_type=high 의 이전 'submitted' 설문이 1건이라도 있으면 "delta"
              없으면 "full" (첫 상담)
    - new_timing 파라미터가 주어진 경우, 동일 시점의 이전 설문이 있다면 그것을 재사용/이어쓰기로 보고 그 mode를 따라감

    Note: draft 상태인 미제출 설문은 카운트에 포함하지 않음 (실제 상담을 받지 않은 것이므로).
    """
    if survey_type == "preheigh1":
        return "full"

    if survey_type != "high":
        return "full"

    q = select(ConsultationSurvey).where(
        ConsultationSurvey.user_id == user_id,
        ConsultationSurvey.survey_type == "high",
        ConsultationSurvey.status == "submitted",
    )
    result = await db.execute(q)
    prior_submitted = result.scalars().first()
    return "delta" if prior_submitted is not None else "full"


# ----- 통합 자동 판정 -----

async def auto_determine_survey_params(
    user: User,
    survey_type: str,
    db: AsyncSession,
    *,
    today: date | None = None,
) -> tuple[Timing | None, Mode]:
    """
    설문 생성 시 timing과 mode를 한 번에 자동 판정.

    - preheigh1: timing은 항상 None, mode는 항상 "full"
    - high:
        - timing은 user.grade, user.grade_year, today 기반으로 추정 (None이면 사용자 입력 필요)
        - mode는 이전 'submitted' 설문 이력으로 결정
    """
    if survey_type == "preheigh1":
        return None, "full"

    timing = estimate_timing_from_grade(user.grade, user.grade_year, today)
    mode = await determine_mode_for_user(user.id, survey_type, db)
    return timing, mode


# ----- 카테고리 활성화 판정 -----

CATEGORY_TIMING_MATRIX: dict[str, set[Timing]] = {
    # 기획서 §1-4 시점 활성화 매트릭스
    # ●●●● — 모든 시점에서 노출되는 카테고리
    "A": {"T1", "T2", "T3", "T4"},
    "B": {"T1", "T2", "T3", "T4"},
    "C": {"T1", "T2", "T3", "T4"},
    "D": {"T1", "T2", "T3", "T4"},
    "E": {"T1", "T2", "T3", "T4"},
    "F": {"T1", "T2", "T3", "T4"},
    # ○○○● — T4 전용
    "G": {"T4"},
}


def is_category_active_for_timing(category: str, timing: Timing) -> bool:
    """카테고리가 해당 시점에서 노출되어야 하는지 판정."""
    allowed = CATEGORY_TIMING_MATRIX.get(category)
    if allowed is None:
        return True  # 미정의 카테고리는 기본 노출
    return timing in allowed


def active_categories_for_timing(timing: Timing) -> list[str]:
    """주어진 시점에서 노출되는 카테고리 코드 목록."""
    return [cat for cat, allowed in CATEGORY_TIMING_MATRIX.items() if timing in allowed]
