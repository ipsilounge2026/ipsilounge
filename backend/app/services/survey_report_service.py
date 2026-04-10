"""
설문 리포트 PDF 생성 서비스

설문 답변 + 자동 계산 결과를 PDF로 출력.
- 학생 기본 정보
- 카테고리별 답변 요약
- 내신/모의고사 추이 테이블
- 학습 시간 분석
- 상담사 메모
"""

import io
from pathlib import Path
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── 한글 폰트 등록 ──
FONT_DIR = Path(__file__).parent.parent.parent / "fonts"

_font_registered = False


def _ensure_fonts():
    global _font_registered
    if _font_registered:
        return
    r_path = FONT_DIR / "NanumSquareRoundR.ttf"
    b_path = FONT_DIR / "NanumSquareRoundB.ttf"
    if r_path.exists():
        pdfmetrics.registerFont(TTFont("NanumR", str(r_path)))
    else:
        import logging
        logging.getLogger(__name__).warning(f"한글 폰트 없음: {r_path}")
    if b_path.exists():
        pdfmetrics.registerFont(TTFont("NanumB", str(b_path)))
    else:
        import logging
        logging.getLogger(__name__).warning(f"한글 볼드 폰트 없음: {b_path}")
    _font_registered = True


FONT_R = "NanumR"
FONT_B = "NanumB"

# ── 색상 ──
HEADER_BG = colors.HexColor("#4472C4")
HEADER_FG = colors.white
ROW_ALT = colors.HexColor("#F2F6FC")
BORDER_COLOR = colors.HexColor("#D1D5DB")
SECTION_BG = colors.HexColor("#EFF6FF")

TREND_COLORS = {
    "상승": colors.HexColor("#10B981"),
    "하락": colors.HexColor("#EF4444"),
    "유지": colors.HexColor("#6B7280"),
    "등락": colors.HexColor("#F59E0B"),
    "V자반등": colors.HexColor("#3B82F6"),
    "역V자": colors.HexColor("#F97316"),
    "데이터부족": colors.HexColor("#9CA3AF"),
}


def generate_survey_report_pdf(
    survey: dict,
    user_info: dict,
    schema: dict | None,
    computed: dict,
) -> bytes:
    """설문 리포트 PDF를 바이트로 생성하여 반환."""
    _ensure_fonts()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=15 * mm,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
    )

    styles = _build_styles()
    elements: list = []

    # ── 1. 표지 ──
    _add_cover(elements, styles, survey, user_info)

    # ── 2. 답변 요약 ──
    _add_answers_section(elements, styles, survey, schema)

    # ── 3. 자동 분석 (내신/모의/학습) ──
    _add_computed_section(elements, styles, survey, computed)

    # ── 4. 상담사 메모 ──
    if survey.get("admin_memo"):
        _add_memo_section(elements, styles, survey["admin_memo"])

    # ── 5. 푸터 정보 ──
    elements.append(Spacer(1, 10 * mm))
    elements.append(HRFlowable(width="100%", color=BORDER_COLOR))
    elements.append(Spacer(1, 3 * mm))
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    elements.append(Paragraph(f"생성일시: {now}  |  입시라운지 자동 리포트", styles["footer"]))

    doc.build(elements)
    return buf.getvalue()


# ═══════════════════════════════════════
# 스타일 정의
# ═══════════════════════════════════════

def _build_styles():
    base = getSampleStyleSheet()
    s = {}

    s["title"] = ParagraphStyle(
        "title", parent=base["Title"],
        fontName=FONT_B, fontSize=22, leading=28, spaceAfter=4 * mm,
        textColor=colors.HexColor("#1E3A5F"),
    )
    s["subtitle"] = ParagraphStyle(
        "subtitle", parent=base["Normal"],
        fontName=FONT_R, fontSize=11, leading=16, spaceAfter=8 * mm,
        textColor=colors.HexColor("#6B7280"),
    )
    s["h2"] = ParagraphStyle(
        "h2", parent=base["Heading2"],
        fontName=FONT_B, fontSize=14, leading=20, spaceBefore=6 * mm, spaceAfter=3 * mm,
        textColor=colors.HexColor("#1E3A5F"),
    )
    s["h3"] = ParagraphStyle(
        "h3", parent=base["Heading3"],
        fontName=FONT_B, fontSize=11, leading=16, spaceBefore=4 * mm, spaceAfter=2 * mm,
        textColor=colors.HexColor("#374151"),
    )
    s["body"] = ParagraphStyle(
        "body", parent=base["Normal"],
        fontName=FONT_R, fontSize=9, leading=14,
        textColor=colors.HexColor("#374151"),
    )
    s["body_bold"] = ParagraphStyle(
        "body_bold", parent=s["body"],
        fontName=FONT_B,
    )
    s["small"] = ParagraphStyle(
        "small", parent=base["Normal"],
        fontName=FONT_R, fontSize=8, leading=11,
        textColor=colors.HexColor("#6B7280"),
    )
    s["footer"] = ParagraphStyle(
        "footer", parent=base["Normal"],
        fontName=FONT_R, fontSize=7, leading=10,
        textColor=colors.HexColor("#9CA3AF"), alignment=1,
    )
    s["cell"] = ParagraphStyle(
        "cell", parent=base["Normal"],
        fontName=FONT_R, fontSize=8, leading=11,
    )
    s["cell_bold"] = ParagraphStyle(
        "cell_bold", parent=s["cell"],
        fontName=FONT_B,
    )
    s["memo"] = ParagraphStyle(
        "memo", parent=base["Normal"],
        fontName=FONT_R, fontSize=9, leading=14,
        textColor=colors.HexColor("#374151"),
        backColor=colors.HexColor("#FFFBEB"),
        borderPadding=8,
    )
    return s


# ═══════════════════════════════════════
# 표지
# ═══════════════════════════════════════

def _add_cover(elements, styles, survey, user_info):
    elements.append(Spacer(1, 15 * mm))
    elements.append(Paragraph("사전 상담 설문 리포트", styles["title"]))

    type_label = "예비고1 상담" if survey.get("survey_type") == "preheigh1" else "고등학교 상담"
    timing = survey.get("timing") or ""
    mode_label = "전체" if survey.get("mode") == "full" else "변경분"

    info_lines = [
        f"설문 유형: {type_label}  {timing}  ({mode_label})",
        f"학생: {user_info.get('name', '-')}  ({user_info.get('email', '-')})",
        f"상태: {survey.get('status', '-')}",
    ]
    if survey.get("submitted_at"):
        info_lines.append(f"제출일: {survey['submitted_at'][:10]}")

    elements.append(Paragraph("<br/>".join(info_lines), styles["subtitle"]))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=HEADER_BG))
    elements.append(Spacer(1, 6 * mm))


# ═══════════════════════════════════════
# 답변 요약
# ═══════════════════════════════════════

def _add_answers_section(elements, styles, survey, schema):
    elements.append(Paragraph("답변 요약", styles["h2"]))

    answers = survey.get("answers", {})
    if not answers:
        elements.append(Paragraph("작성된 답변이 없습니다.", styles["body"]))
        return

    categories = schema.get("categories", []) if schema else []
    cat_map = {c["id"]: c for c in categories}

    for cat_id in sorted(answers.keys()):
        cat_answers = answers[cat_id]
        if not isinstance(cat_answers, dict) or not cat_answers:
            continue

        cat_info = cat_map.get(cat_id, {})
        cat_title = cat_info.get("title", cat_id)
        elements.append(Paragraph(f"{cat_id}. {cat_title}", styles["h3"]))

        # 질문 맵 구축
        q_map = {}
        for q in cat_info.get("questions", []):
            q_map[q["id"]] = q.get("label", q["id"])
            # 하위 질문
            for sq in q.get("sub_questions", []):
                q_map[sq["id"]] = sq.get("label", sq["id"])

        # 답변 테이블
        table_data = [
            [Paragraph("질문", styles["cell_bold"]), Paragraph("답변", styles["cell_bold"])]
        ]

        for q_id, val in cat_answers.items():
            label = q_map.get(q_id, q_id)
            val_str = _format_answer_value(val)
            if len(val_str) > 200:
                val_str = val_str[:200] + "..."
            table_data.append([
                Paragraph(label, styles["cell"]),
                Paragraph(val_str, styles["cell"]),
            ])

        if len(table_data) > 1:
            col_w = [55 * mm, 120 * mm]
            t = Table(table_data, colWidths=col_w, repeatRows=1)
            t.setStyle(_answer_table_style(len(table_data)))
            elements.append(t)
            elements.append(Spacer(1, 3 * mm))


def _format_answer_value(val) -> str:
    """답변 값을 문자열로 변환."""
    if val is None:
        return "-"
    if isinstance(val, bool):
        return "예" if val else "아니오"
    if isinstance(val, list):
        return ", ".join(str(v) for v in val)
    if isinstance(val, dict):
        # 중첩 dict는 간단히 key: value 나열
        parts = []
        for k, v in val.items():
            if isinstance(v, dict):
                inner = ", ".join(f"{ik}: {iv}" for ik, iv in v.items() if iv)
                if inner:
                    parts.append(f"{k}: ({inner})")
            elif v is not None and v != "":
                parts.append(f"{k}: {v}")
        return " | ".join(parts) if parts else "-"
    return str(val)


def _answer_table_style(n_rows):
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), HEADER_FG),
        ("FONTNAME", (0, 0), (-1, 0), FONT_B),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    # 줄무늬
    for i in range(1, n_rows):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    return TableStyle(style)


# ═══════════════════════════════════════
# 자동 분석
# ═══════════════════════════════════════

def _add_computed_section(elements, styles, survey, computed):
    if not computed:
        return

    elements.append(PageBreak())
    elements.append(Paragraph("자동 분석 결과", styles["h2"]))

    survey_type = survey.get("survey_type", "")
    is_high = survey_type == "high"

    # ── 종합 진단 (4각형 레이더) — 고등학생만 ──
    radar = computed.get("radar_scores")
    if radar and is_high:
        elements.append(Paragraph(
            f"종합 진단: {radar['overall_grade']}등급 ({radar['overall_score']}점/100)",
            styles["h3"],
        ))

        grade_labels = {"S": "최상위", "A": "상위", "B": "평균", "C": "보완필요", "D": "미흡"}
        area_labels = {
            "내신_경쟁력": "내신 경쟁력", "모의고사_역량": "모의고사 역량",
            "학습습관_전략": "학습 습관·전략", "진로전형_전략": "진로·전형 전략",
        }

        # 영역별 점수 테이블
        header = ["영역", "점수", "등급"]
        rows = [header]
        for key, val in radar.get("radar", {}).items():
            label = area_labels.get(key, key)
            g = val.get("grade", "?")
            rows.append([label, f'{val["score"]}/100', f'{g} ({grade_labels.get(g, "")})'])
        elements.append(_simple_table(rows, col_widths=[180, 80, 120]))
        elements.append(Spacer(1, 4 * mm))

        # 영역별 상세 항목
        section_keys = [
            ("naesin", "내신 경쟁력 상세"),
            ("mock", "모의고사 역량 상세"),
            ("study", "학습 습관·전략 상세"),
            ("career", "진로·전형 전략 상세"),
        ]
        for sec_key, sec_label in section_keys:
            sec = radar.get(sec_key)
            if not sec or not sec.get("details"):
                continue
            elements.append(Paragraph(f"{sec_label} ({sec['grade']}등급, {sec['total']}점)", styles["h3"]))
            d_header = ["항목", "점수", "배점"]
            d_rows = [d_header]
            for item_key, info in sec["details"].items():
                item_label = item_key.replace("_", " ")
                d_rows.append([item_label, str(info.get("score", "")), str(info.get("max", ""))])
            elements.append(_simple_table(d_rows, col_widths=[200, 60, 60]))
            elements.append(Spacer(1, 3 * mm))

        elements.append(Spacer(1, 5 * mm))

    # ── 내신/성적 추이 ──
    gt = computed.get("grade_trend")
    if gt and gt.get("data"):
        label = "내신 등급 추이" if is_high else "성적 추이"
        badge = gt.get("trend_badge", "")
        elements.append(Paragraph(f"{label}  [{badge}]", styles["h3"]))

        # 평균 추이 테이블
        value_key = "avg_grade" if is_high else "avg_score"
        value_label = "평균 등급" if is_high else "평균 점수"

        header = ["학기", value_label, "과목수"]
        rows = [header]
        for d in gt["data"]:
            rows.append([
                d["semester"],
                str(d.get(value_key, "-")),
                str(d.get("subject_count", "-")),
            ])

        t = _simple_table(rows, [40 * mm, 35 * mm, 30 * mm], styles)
        elements.append(t)
        elements.append(Spacer(1, 3 * mm))

        # 과목별 추이
        subj_trends = gt.get("subject_trends", {})
        if subj_trends:
            elements.append(Paragraph("과목별 추이", styles["h3"]))
            for subj_name, data_list in subj_trends.items():
                if not data_list:
                    continue
                vals = []
                for d in data_list:
                    sem = d.get("semester", "")
                    if is_high:
                        v = d.get("grade", "-")
                    else:
                        v = d.get("raw_score", "-")
                    vals.append(f"{sem}: {v}")
                elements.append(Paragraph(f"  {subj_name}: {' → '.join(vals)}", styles["body"]))
            elements.append(Spacer(1, 3 * mm))

    # ── 모의고사 추이 ──
    mt = computed.get("mock_trend")
    if mt and mt.get("avg_trend"):
        badge = mt.get("trend_badge", "")
        elements.append(Paragraph(f"모의고사 추이  [{badge}]", styles["h3"]))

        header = ["회차", "평균 등급"]
        rows = [header]
        for d in mt["avg_trend"]:
            rows.append([d["session"], str(d["avg_rank"])])

        t = _simple_table(rows, [50 * mm, 40 * mm], styles)
        elements.append(t)
        elements.append(Spacer(1, 2 * mm))

        # 취약 영역
        weak = mt.get("weak_areas", [])
        if weak:
            elements.append(Paragraph("취약 영역:", styles["body_bold"]))
            for w in weak:
                elements.append(Paragraph(
                    f"  • {w['area']}: 평균 {w['avg_rank']}등급 (전체 대비 +{w['gap']})",
                    styles["body"],
                ))
            elements.append(Spacer(1, 3 * mm))

    # ── 학습 시간 분석 ──
    sa = computed.get("study_analysis")
    if sa and sa.get("total_weekly_hours"):
        elements.append(Paragraph("학습 시간 분석", styles["h3"]))

        summary_data = [
            ["주간 총 학습시간", f"{sa['total_weekly_hours']}시간"],
            ["자기주도 비율", f"{sa.get('self_study_ratio', 0)}%"],
            ["과목 밸런스", f"{sa.get('subject_balance', '-')}"],
        ]
        t = _simple_table(summary_data, [50 * mm, 40 * mm], styles)
        elements.append(t)
        elements.append(Spacer(1, 2 * mm))

        # 과목별
        by_subj = sa.get("by_subject", {})
        if by_subj:
            elements.append(Paragraph("과목별 학습 시간:", styles["body_bold"]))
            for subj, hours in by_subj.items():
                elements.append(Paragraph(f"  • {subj}: {hours}시간", styles["body"]))

        # 유형별
        by_type = sa.get("by_type", {})
        if by_type:
            elements.append(Paragraph("학습 유형별:", styles["body_bold"]))
            for tp, hours in by_type.items():
                elements.append(Paragraph(f"  • {tp}: {hours}시간", styles["body"]))


def _simple_table(data, col_widths, styles):
    """간단한 테이블 생성."""
    wrapped = []
    for i, row in enumerate(data):
        st = styles["cell_bold"] if i == 0 else styles["cell"]
        wrapped.append([Paragraph(str(c), st) for c in row])

    t = Table(wrapped, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), HEADER_FG),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    t.setStyle(TableStyle(style_cmds))
    return t


# ═══════════════════════════════════════
# 상담사 메모
# ═══════════════════════════════════════

def _add_memo_section(elements, styles, memo_text):
    elements.append(Spacer(1, 6 * mm))
    elements.append(Paragraph("상담사 메모", styles["h2"]))
    # 줄바꿈 처리
    memo_html = memo_text.replace("\n", "<br/>")
    elements.append(Paragraph(memo_html, styles["memo"]))
