# -*- coding: utf-8 -*-
"""
mode_config.py
- CLAUDE.md § 13 "실행 모드별 처리" 구현 (2026-04-19)
- generate_report.py 의 --mode / --areas CLI 옵션을 ModeConfig 로 변환
- create_excel / create_pdf / run_full_qa 가 이 설정을 받아 시트·섹션·검증을 선택적으로 스킵

모드:
  - full     : 내신+세특+창체+행특+입결 전체 (현재 내신/입결 시트는 미구현 → NOOP)
  - no-grade : 내신/입결/전형적합도 제외 (현재 기본 운영 모드, NOOP 이나 의도 명시화)
  - partial  : --areas 로 지정된 영역 시트만 포함 (+ 종합요약 + 교차영역 시트)

Areas (partial 모드):
  - setuek   : 세특분석 / 세특코멘트 / 핵심평가문장
  - changche : 창체분석
  - haengtuk : 행특분석

교차영역 시트(연계성/대학평가요소/역량별보완법) 는 partial 모드에서도 항상 포함.
선택적 시트(키워드/출결·봉사/이전분석대비변화) 는 기존 데이터 유무 조건만 따름.
"""

from dataclasses import dataclass
from typing import Optional, Set


VALID_MODES = {"full", "no-grade", "partial"}
VALID_AREAS = {"setuek", "changche", "haengtuk"}


@dataclass
class ModeConfig:
    """리포트 생성·검증의 범위 설정."""
    mode: str = "full"
    include_grade: bool = True       # 내신/입결/전형적합도 (미구현 상태 → NOOP)
    include_setuek: bool = True
    include_changche: bool = True
    include_haengtuk: bool = True

    def area_included(self, area: str) -> bool:
        return {
            "setuek":   self.include_setuek,
            "changche": self.include_changche,
            "haengtuk": self.include_haengtuk,
        }.get(area, True)

    @property
    def excluded_areas(self) -> Set[str]:
        ex = set()
        if not self.include_setuek:   ex.add("setuek")
        if not self.include_changche: ex.add("changche")
        if not self.include_haengtuk: ex.add("haengtuk")
        return ex

    def label(self) -> str:
        if self.mode == "full":
            return "전체 분석"
        if self.mode == "no-grade":
            return "내신 제외 분석"
        if self.mode == "partial":
            selected = [a for a in ("setuek", "changche", "haengtuk") if self.area_included(a)]
            return f"특정 영역 분석 ({', '.join(selected) or '-'})"
        return self.mode


def build_mode_config(mode: str = "full", areas: Optional[str] = None) -> ModeConfig:
    """CLI 인자 → ModeConfig 변환.

    Args:
        mode: "full" | "no-grade" | "partial"
        areas: partial 모드일 때 콤마 구분 영역명 (예: "setuek,changche")

    Raises:
        ValueError: mode 가 유효하지 않거나, partial 인데 areas 누락/오류.
    """
    mode = (mode or "full").strip().lower()
    if mode not in VALID_MODES:
        raise ValueError(
            f"Invalid --mode '{mode}'. Must be one of: {sorted(VALID_MODES)}"
        )

    if mode == "full":
        return ModeConfig(mode="full")

    if mode == "no-grade":
        # 내신/입결 시트가 추가되는 시점에 자동으로 스킵되도록 플래그 선제 반영
        return ModeConfig(mode="no-grade", include_grade=False)

    # partial
    if not areas:
        raise ValueError(
            "--mode partial 은 --areas 옵션이 필수입니다. "
            "예: --areas setuek,changche (가능한 값: setuek, changche, haengtuk)"
        )
    area_set = {a.strip().lower() for a in areas.split(",") if a.strip()}
    invalid = area_set - VALID_AREAS
    if invalid:
        raise ValueError(
            f"Invalid --areas values: {sorted(invalid)}. "
            f"Valid: {sorted(VALID_AREAS)}"
        )
    if not area_set:
        raise ValueError("--areas 값이 비어있습니다.")

    return ModeConfig(
        mode="partial",
        include_grade=False,
        include_setuek="setuek" in area_set,
        include_changche="changche" in area_set,
        include_haengtuk="haengtuk" in area_set,
    )


def default_config() -> ModeConfig:
    """기본(full) 모드. 하위호환용."""
    return ModeConfig()
