"""
attendance_calculator.py
- G7 (2026-04-17): 출결 데이터 집계 + 감점 계산 + 봉사 시수 집계
- config.yaml attendance_scoring 기준으로 종합 경쟁력 공식의 "출결 5%" 에 반영

CLAUDE.md § 4 (봉사활동은 점수화하지 않음, 시수만 표기) + § 10 (출결 5%) + § 11 (성실성·규칙준수 = 출결+행특).

입력 스키마 (학생 데이터 모듈):
    attendance_data = {
        1: {  # 학년
            "결석": {"질병": 0, "미인정": 0, "기타": 0},
            "지각": {"질병": 0, "미인정": 0, "기타": 0},
            "조퇴": {"질병": 0, "미인정": 0, "기타": 0},
            "결과": {"질병": 0, "미인정": 0, "기타": 0},
            "특기사항": "",  # 선택
        },
        2: {...}, 3: {...},
    }

    volunteer_data = {
        1: {"hours": 15, "activities": ["학교 도서관 자원봉사", "환경정화"]},
        2: {"hours": 20, "activities": ["어르신 말벗", "학습 멘토링"]},
        3: {"hours": 10, "activities": ["..."]},
    }

출력:
    calculate_attendance_score(attendance_data, config) → AttendanceReport
    summarize_volunteer(volunteer_data) → VolunteerSummary
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

# ═══════════════════════════════════════════════════════
# 데이터 클래스
# ═══════════════════════════════════════════════════════

@dataclass
class AttendanceReport:
    """출결 점수 계산 결과."""
    score: float                               # 최종 점수 (0~100)
    base: float                                # 기본 점수 (100)
    deductions: dict[str, float]               # 감점 내역 {"미인정결석 2일": -10, ...}
    total_counts: dict[str, int]               # 4종×3사유 합계 카운트
    by_year: dict[int, dict]                   # 학년별 원본 데이터 유지
    has_data: bool                             # 유효 데이터 존재 여부


@dataclass
class VolunteerSummary:
    """봉사 활동 요약."""
    total_hours: int                           # 학년별 총합 시간
    by_year: dict[int, dict[str, object]]      # {학년: {"hours": N, "activities": [...]}}
    all_activities: list[str]                  # 모든 활동 평탄화 리스트
    has_data: bool


# ═══════════════════════════════════════════════════════
# 설정 로딩
# ═══════════════════════════════════════════════════════

def _load_attendance_config(config_path: Path | None = None) -> dict:
    """config.yaml 의 attendance_scoring 섹션 로드."""
    import yaml
    if config_path is None:
        config_path = Path(__file__).resolve().parent.parent / "config" / "config.yaml"
    with open(config_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("attendance_scoring", {}) or {}


# ═══════════════════════════════════════════════════════
# 출결 점수 계산
# ═══════════════════════════════════════════════════════

# 학생부 기재 4종
_ATTENDANCE_TYPES = ("결석", "지각", "조퇴", "결과")
# 사유 3종
_REASONS = ("질병", "미인정", "기타")


def _normalize_year_entry(entry: dict) -> dict:
    """단일 학년 entry 를 표준 구조로 정규화 (누락 필드는 0으로 채움)."""
    out = {}
    for t in _ATTENDANCE_TYPES:
        sub = entry.get(t, {}) if isinstance(entry, dict) else {}
        if not isinstance(sub, dict):
            sub = {}
        out[t] = {r: int(sub.get(r, 0) or 0) for r in _REASONS}
    out["특기사항"] = (entry or {}).get("특기사항", "") if isinstance(entry, dict) else ""
    return out


def _has_attendance_content(data: dict) -> bool:
    """attendance_data 가 비어있지 않고 어느 한 카운트라도 양수이거나 특기사항이 있으면 True.
    모든 카운트가 0이지만 학년 entry 는 있는 경우(결석·지각 등 전혀 없음)도 "개근" 으로 유의미
    하므로 dict 자체가 비어있지 않으면 True 로 본다.
    """
    if not isinstance(data, dict) or not data:
        return False
    return True


def calculate_attendance_score(
    attendance_data: dict,
    config_path: Path | None = None,
) -> AttendanceReport:
    """학년별 출결 데이터 → 감점 공식 적용 → 최종 점수.
    attendance_data 가 비어있으면 has_data=False, score=base (감점 없음).
    """
    cfg = _load_attendance_config(config_path)
    base = float(cfg.get("base", 100))
    min_score = float(cfg.get("min_score", 0))

    if not _has_attendance_content(attendance_data):
        return AttendanceReport(
            score=base,
            base=base,
            deductions={},
            total_counts={},
            by_year={},
            has_data=False,
        )

    # 학년별 정규화 + 총계 집계
    total = {f"{t}_{r}": 0 for t in _ATTENDANCE_TYPES for r in _REASONS}
    by_year: dict[int, dict] = {}
    for yr, entry in sorted(attendance_data.items()):
        norm = _normalize_year_entry(entry)
        by_year[int(yr)] = norm
        for t in _ATTENDANCE_TYPES:
            for r in _REASONS:
                total[f"{t}_{r}"] += norm[t][r]

    # 감점 공식 (미인정만 감점)
    deductions: dict[str, float] = {}
    score = base

    # 미인정결석
    n = total["결석_미인정"]
    w = float(cfg.get("미인정결석_per_day", 0))
    if n > 0 and w != 0:
        d = n * w
        deductions[f"미인정결석 {n}일"] = d
        score += d

    # 미인정지각
    n = total["지각_미인정"]
    w = float(cfg.get("미인정지각_per_count", 0))
    if n > 0 and w != 0:
        d = n * w
        deductions[f"미인정지각 {n}건"] = d
        score += d

    # 미인정조퇴
    n = total["조퇴_미인정"]
    w = float(cfg.get("미인정조퇴_per_count", 0))
    if n > 0 and w != 0:
        d = n * w
        deductions[f"미인정조퇴 {n}건"] = d
        score += d

    # 미인정결과
    n = total["결과_미인정"]
    w = float(cfg.get("미인정결과_per_count", 0))
    if n > 0 and w != 0:
        d = n * w
        deductions[f"미인정결과 {n}건"] = d
        score += d

    score = max(min_score, round(score, 1))

    return AttendanceReport(
        score=score,
        base=base,
        deductions=deductions,
        total_counts=total,
        by_year=by_year,
        has_data=True,
    )


# ═══════════════════════════════════════════════════════
# 봉사 요약
# ═══════════════════════════════════════════════════════

def summarize_volunteer(volunteer_data: dict) -> VolunteerSummary:
    """학년별 봉사 데이터 → 총합/평탄화. 데이터 없으면 has_data=False."""
    if not isinstance(volunteer_data, dict) or not volunteer_data:
        return VolunteerSummary(total_hours=0, by_year={}, all_activities=[], has_data=False)

    by_year: dict[int, dict[str, object]] = {}
    total = 0
    all_acts: list[str] = []
    for yr, entry in sorted(volunteer_data.items()):
        if not isinstance(entry, dict):
            continue
        hrs = int(entry.get("hours", 0) or 0)
        acts = entry.get("activities", []) or []
        if not isinstance(acts, list):
            acts = [str(acts)]
        by_year[int(yr)] = {"hours": hrs, "activities": acts}
        total += hrs
        all_acts.extend(acts)

    return VolunteerSummary(
        total_hours=total,
        by_year=by_year,
        all_activities=all_acts,
        has_data=total > 0 or bool(all_acts),
    )


# ═══════════════════════════════════════════════════════
# 편의 함수
# ═══════════════════════════════════════════════════════

def has_attendance_or_volunteer(sd) -> bool:
    """학생 데이터 모듈(sd) 에 attendance_data 또는 volunteer_data 가 비어있지 않은지."""
    a = getattr(sd, "attendance_data", None)
    v = getattr(sd, "volunteer_data", None)
    if isinstance(a, dict) and a:
        return True
    if isinstance(v, dict) and v:
        return True
    return False
