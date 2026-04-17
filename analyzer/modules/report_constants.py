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

SETUEK_ITEMS = ["교과연계성", "탐구동기", "탐구과정", "결과성찰", "차별성", "학업태도"]
SETUEK_WEIGHTS_NO_MAJOR = [0.19, 0.19, 0.19, 0.19, 0.08, 0.16]


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
