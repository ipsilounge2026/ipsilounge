# -*- coding: utf-8 -*-
"""
report_constants.py
- 학생별로 달라지지 않는 공통 상수/설정
- 모든 학생 리포트 생성 시 동일하게 사용되는 값들
"""

import os
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


# ═══════════════════════════════════════════════════════
# 세특 평가 상수
# ═══════════════════════════════════════════════════════
#
# 두 가지 모드:
#   - 미지정 모드 (6항목): TARGET_MAJOR 가 없을 때. 전공적합성 제외 후 재배분.
#   - 지정 모드   (7항목): TARGET_MAJOR 가 있을 때. CLAUDE.md § 세특 루브릭 원안 가중치.
#
# 동적 전환:
#   from .report_constants import resolve_setuek_items, resolve_setuek_weights
#   items   = resolve_setuek_items(sd)
#   weights = resolve_setuek_weights(sd)

# 미지정 모드 (6항목) — 전공적합성 제외 + 가중치 재배분 (합계 1.0)
SETUEK_ITEMS_NO_MAJOR   = ["교과연계성", "탐구동기", "탐구과정", "결과성찰", "차별성", "학업태도"]
SETUEK_WEIGHTS_NO_MAJOR = [0.19, 0.19, 0.19, 0.19, 0.08, 0.16]

# 지정 모드 (7항목) — CLAUDE.md § 세특 루브릭 원안 가중치 (합계 1.0)
SETUEK_ITEMS_WITH_MAJOR   = ["교과연계성", "탐구동기", "탐구과정", "결과성찰", "전공적합성", "차별성", "학업태도"]
SETUEK_WEIGHTS_WITH_MAJOR = [0.17, 0.17, 0.17, 0.17, 0.10, 0.07, 0.15]

# 레거시 호환 — 기존 코드가 SETUEK_ITEMS 를 import 하던 경로 유지 (미지정 모드 별칭)
SETUEK_ITEMS = SETUEK_ITEMS_NO_MAJOR


def is_major_mode(sd) -> bool:
    """학생 데이터 모듈(sd) 의 TARGET_MAJOR 값 유무로 지정/미지정 판별.

    판별 기준:
      - TARGET_MAJOR 미정의 또는 빈 문자열/공백 → 미지정 모드 (6항목)
      - TARGET_MAJOR 에 값 존재 → 지정 모드 (7항목, 전공적합성 포함)
    """
    target_major = getattr(sd, "TARGET_MAJOR", "")
    return bool(target_major and str(target_major).strip())


def resolve_setuek_items(sd):
    """학생 데이터 기반으로 세특 항목 리스트 반환."""
    return SETUEK_ITEMS_WITH_MAJOR if is_major_mode(sd) else SETUEK_ITEMS_NO_MAJOR


def resolve_setuek_weights(sd):
    """학생 데이터 기반으로 세특 가중치 리스트 반환."""
    return SETUEK_WEIGHTS_WITH_MAJOR if is_major_mode(sd) else SETUEK_WEIGHTS_NO_MAJOR


def setuek_score_slice_end(sd) -> int:
    """setuek_data 튜플에서 점수 슬라이싱 종료 인덱스.
    튜플 구조: (학년, 과목, 점수1..점수N, 가중합산, 등급)
      - 미지정: 6항목 → 점수 인덱스 2..7 (슬라이스 [2:8]), 종료=8
      - 지정:   7항목 → 점수 인덱스 2..8 (슬라이스 [2:9]), 종료=9
    """
    return 9 if is_major_mode(sd) else 8


# ═══════════════════════════════════════════════════════
# 창체/행특 공통 헤더 라벨 (학생 무관)
# ═══════════════════════════════════════════════════════

CHANGCHE_ITEMS = ["주도성/전문성/탐색구체성", "구체성/기여도/일관성", "동기-과정-결과", "성장변화/지속발전/자기주도성", "전공적합성"]
HAENGTUK_ITEMS = ["활동 구체성", "동기-과정-결과", "성장 변화", "인성/공동체", "분량/밀도"]


# ═══════════════════════════════════════════════════════
# 폰트 등록 (모듈 로드 시 1회 실행)
# ═══════════════════════════════════════════════════════

FONT_NAME    = "Malgun"
FONT_NAME_BD = "MalgunBd"

_FONTS_REGISTERED = False


def register_fonts():
    """한글 폰트 등록 (나눔스퀘어라운드). 중복 호출 안전."""
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    fonts_dir = os.path.join(os.path.dirname(__file__), "..", "fonts")
    pdfmetrics.registerFont(TTFont(FONT_NAME,    os.path.join(fonts_dir, "NanumSquareRoundR.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_NAME_BD, os.path.join(fonts_dir, "NanumSquareRoundB.ttf")))
    _FONTS_REGISTERED = True


# ═══════════════════════════════════════════════════════
# 필수 변수 목록 (학생 데이터 파일 검증용)
# ═══════════════════════════════════════════════════════

REQUIRED_STUDENT_VARS = [
    "STUDENT", "SCHOOL", "TODAY",
    "setuek_data", "setuek_comments", "comment_keys", "good_sentences",
    "changche_data", "changche_comments",
    "haengtuk_data", "haengtuk_comments",
    "linkage_data", "eval_data", "fix_data", "summary_data",
]
