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
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

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
    extras: dict | None = None,
) -> bytes:
    """설문 리포트 PDF를 바이트로 생성하여 반환.

    기획서 §4-7/§4-9/§5-4-E4/§7-2: `extras` 에 아래 키를 전달하면 전용 섹션을 추가한다.
    - course_requirement_match: 권장 이수 과목 매칭 결과
    - suneung_minimum: 수능 최저학력기준 시뮬레이션 결과
    - delta_change: Delta 모드 이전 설문 대비 변경점
    로드맵은 computed["roadmap"]에서 자동으로 렌더링된다.
    """
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

    # ── 4. 기획서 전용 섹션 (고등학생) ──
    extras = extras or {}

    # 4-1. 로드맵 (computed 에서 자동 생성)
    roadmap = computed.get("roadmap") if isinstance(computed, dict) else None
    if roadmap and roadmap.get("matrix"):
        _render_roadmap(elements, styles, roadmap)

    # 4-2. 권장 이수 과목 매칭
    crm = extras.get("course_requirement_match")
    if crm:
        _render_course_requirement(elements, styles, crm)

    # 4-3. 수능 최저 시뮬레이션
    sun = extras.get("suneung_minimum")
    if sun and isinstance(sun, dict):
        _render_suneung_minimum(elements, styles, sun)

    # 4-4. Delta 모드 변경점
    delta = extras.get("delta_change")
    if delta and isinstance(delta, dict) and delta.get("has_previous"):
        _render_delta_change(elements, styles, delta)

    # ── 5. 상담사 메모 ──
    if survey.get("admin_memo"):
        _add_memo_section(elements, styles, survey["admin_memo"])

    # ── 6. 푸터 정보 ──
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


# ═══════════════════════════════════════
# 기획서 §4-9: 로드맵 (Phase × 4트랙)
# ═══════════════════════════════════════

def _render_roadmap(elements, styles, roadmap: dict):
    """로드맵 섹션: Phase 행 × 4트랙 열 매트릭스.

    roadmap = {
        "items": [{area, priority, title, description, period, ...}, ...],
        "matrix": {
            "phases": [{key, label, theme}, ...],
            "tracks": [{key, label, icon}, ...],
            "cells": {phase_key: {track_key: text}},
        },
        "summary": str,
    }
    """
    elements.append(PageBreak())
    elements.append(Paragraph("단계별 로드맵 (Phase × 4트랙)", styles["h2"]))

    summary_text = roadmap.get("summary")
    if summary_text:
        elements.append(Paragraph(summary_text, styles["body_bold"]))
        elements.append(Spacer(1, 3 * mm))

    matrix = roadmap.get("matrix") or {}
    phases = matrix.get("phases") or []
    tracks = matrix.get("tracks") or []
    cells = matrix.get("cells") or {}

    if phases and tracks:
        # 헤더: Phase / 트랙별 컬럼
        header = [Paragraph("Phase", styles["cell_bold"])]
        for tr in tracks:
            label = f'{tr.get("icon", "")} {tr.get("label", tr.get("key", ""))}'.strip()
            header.append(Paragraph(label, styles["cell_bold"]))

        table_rows = [header]
        for ph in phases:
            phase_key = ph.get("key")
            phase_label = ph.get("label", phase_key or "")
            phase_theme = ph.get("theme", "")
            phase_cell = Paragraph(
                f"<b>{phase_label}</b><br/><font size='7' color='#6B7280'>{phase_theme}</font>",
                styles["cell"],
            )
            row = [phase_cell]
            for tr in tracks:
                text = (cells.get(phase_key, {}) or {}).get(tr.get("key"), "-")
                if text and text != "-":
                    text = str(text).replace("\n", "<br/>")
                row.append(Paragraph(text, styles["cell"]))
            table_rows.append(row)

        # 전체 폭 약 180mm → Phase 30, 나머지 4등분
        phase_col = 30 * mm
        other_col = (180 * mm - phase_col) / max(1, len(tracks))
        col_widths = [phase_col] + [other_col] * len(tracks)

        t = Table(table_rows, colWidths=col_widths, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), HEADER_FG),
            ("FONTNAME", (0, 0), (-1, 0), FONT_B),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("BACKGROUND", (0, 1), (0, -1), SECTION_BG),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 4 * mm))

    # 우선순위 아이템 (보완 영역)
    items = roadmap.get("items") or []
    high_items = [it for it in items if it.get("priority") == "상"]
    if high_items:
        elements.append(Paragraph("우선 보강 영역", styles["h3"]))
        for it in high_items:
            title = it.get("title", "")
            area = it.get("area", "")
            desc = it.get("description", "")
            period = it.get("period", "")
            elements.append(Paragraph(
                f"<b>[{area}] {title}</b> — {period}",
                styles["body_bold"],
            ))
            if desc:
                elements.append(Paragraph(f"  {desc}", styles["body"]))
            elements.append(Spacer(1, 1 * mm))


# ═══════════════════════════════════════
# 기획서 §4-7: 권장 이수 과목 매칭
# ═══════════════════════════════════════

def _render_course_requirement(elements, styles, match: dict):
    """권장 이수 과목 매칭 섹션.

    match = {
        "available": bool,
        "reason": str | None,
        "results": [
            {target, 대학, 모집단위, found, 핵심_이수, 핵심_미이수,
             권장_이수, 권장_미이수, 비고, 학생_과목}, ...
        ]
    }
    """
    elements.append(PageBreak())
    elements.append(Paragraph("목표 대학별 권장 이수 과목 매칭", styles["h2"]))

    if not match.get("available", False):
        reason = match.get("reason") or "매칭을 수행할 수 없습니다."
        elements.append(Paragraph(reason, styles["body"]))
        return

    results = match.get("results") or []
    if not results:
        elements.append(Paragraph("매칭 결과가 없습니다.", styles["body"]))
        return

    for idx, r in enumerate(results):
        target = r.get("target") or f"{r.get('대학', '?')} {r.get('모집단위', '?')}"
        elements.append(Paragraph(f"{idx + 1}. {target}", styles["h3"]))

        if not r.get("found"):
            reason = r.get("reason") or "해당 대학/모집단위 정보를 찾을 수 없습니다."
            elements.append(Paragraph(reason, styles["body"]))
            elements.append(Spacer(1, 2 * mm))
            continue

        core_done = r.get("핵심_이수") or []
        core_miss = r.get("핵심_미이수") or []
        rec_done = r.get("권장_이수") or []
        rec_miss = r.get("권장_미이수") or []

        def _j(lst):
            return ", ".join(lst) if lst else "-"

        rows = [
            ["구분", "이수 완료", "미이수"],
            ["핵심과목", _j(core_done), _j(core_miss)],
            ["권장과목", _j(rec_done), _j(rec_miss)],
        ]
        wrapped = []
        for i, row in enumerate(rows):
            st = styles["cell_bold"] if i == 0 else styles["cell"]
            wrapped.append([Paragraph(str(c), st) for c in row])

        t = Table(wrapped, colWidths=[25 * mm, 75 * mm, 75 * mm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), HEADER_FG),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            # 이수 완료 컬럼은 초록, 미이수 컬럼은 주황 느낌
            ("TEXTCOLOR", (1, 1), (1, -1), colors.HexColor("#10B981")),
            ("TEXTCOLOR", (2, 1), (2, -1), colors.HexColor("#DC2626")),
        ]))
        elements.append(t)

        note = r.get("비고")
        if note:
            elements.append(Spacer(1, 1 * mm))
            elements.append(Paragraph(f"비고: {note}", styles["small"]))

        # 핵심 미이수가 있으면 경고
        if core_miss:
            elements.append(Spacer(1, 1 * mm))
            elements.append(Paragraph(
                f"⚠ 핵심과목 미이수: {_j(core_miss)} — 보완 계획 수립 필요",
                styles["body_bold"],
            ))
        elements.append(Spacer(1, 4 * mm))


# ═══════════════════════════════════════
# 기획서 §5-4-E4: 수능 최저학력기준 시뮬레이션
# ═══════════════════════════════════════

def _render_suneung_minimum(elements, styles, sim: dict):
    """수능 최저학력기준 시뮬레이션 섹션.

    sim = {
        "student_mock_grades": {korean, math, english, inquiry1, inquiry2, korean_history},
        "track": str,
        "target_level": str,
        "target_universities": [...],
        "target_year": int,
        "simulations": [{university, admission_category, admission_type,
                         requirement_label, requirement_text,
                         result, margin, detail, selected, failures}, ...],
        "summary": {total_checked, met, close, not_met, no_requirement},
        "error": str | None,
    }
    """
    elements.append(PageBreak())
    elements.append(Paragraph("수능 최저학력기준 충족 시뮬레이션", styles["h2"]))

    err = sim.get("error")
    if err:
        elements.append(Paragraph(err, styles["body"]))
        return

    # 학생 기본 정보
    grades = sim.get("student_mock_grades") or {}
    subj_labels = {
        "korean": "국어", "math": "수학", "english": "영어",
        "inquiry1": "탐구1", "inquiry2": "탐구2", "korean_history": "한국사",
    }
    grade_line_parts = []
    for key, lab in subj_labels.items():
        v = grades.get(key)
        if v is None:
            continue
        grade_line_parts.append(f"{lab} {v}등급")
    if grade_line_parts:
        elements.append(Paragraph(
            f"최신 모의고사 등급: {' / '.join(grade_line_parts)}  "
            f"(계열: {sim.get('track') or '-'})",
            styles["body"],
        ))

    # 요약 통계
    summary = sim.get("summary") or {}
    elements.append(Paragraph(
        f"검사 대상 {summary.get('total_checked', 0)}건 중 "
        f"충족 {summary.get('met', 0)}건 / "
        f"근접 미충족 {summary.get('close', 0)}건 / "
        f"미충족 {summary.get('not_met', 0)}건 / "
        f"최저 없음 {summary.get('no_requirement', 0)}건",
        styles["body_bold"],
    ))
    elements.append(Spacer(1, 3 * mm))

    # 결과별 그룹핑하여 테이블 출력 (충족 우선)
    simulations = sim.get("simulations") or []
    if not simulations:
        elements.append(Paragraph("시뮬레이션 가능한 전형이 없습니다.", styles["body"]))
        return

    result_color = {
        "충족": colors.HexColor("#10B981"),
        "근접": colors.HexColor("#F59E0B"),
        "미충족": colors.HexColor("#DC2626"),
        "해당없음": colors.HexColor("#6B7280"),
        "참조": colors.HexColor("#3B82F6"),
        "파싱불가": colors.HexColor("#9CA3AF"),
    }

    header = [
        Paragraph("대학", styles["cell_bold"]),
        Paragraph("전형", styles["cell_bold"]),
        Paragraph("최저 요구", styles["cell_bold"]),
        Paragraph("판정", styles["cell_bold"]),
        Paragraph("상세", styles["cell_bold"]),
    ]
    rows = [header]
    for s in simulations:
        result = s.get("result") or "파싱불가"
        # 근접 라벨 보정 (margin < 0, >= -2)
        display_result = result
        margin = s.get("margin") or 0
        if result == "미충족" and -2 <= margin < 0:
            display_result = f"근접({margin})"
        elif result == "미충족":
            display_result = f"미충족({margin})"

        univ = s.get("university", "?")
        admission = f'{s.get("admission_category", "")}<br/>{s.get("admission_type", "")}'
        req = (s.get("requirement_text") or "-").replace("\n", "<br/>")
        req_label = s.get("requirement_label")
        if req_label and req_label != "전체":
            req = f"<b>[{req_label}]</b> {req}"
        detail = s.get("detail") or "-"

        rows.append([
            Paragraph(univ, styles["cell"]),
            Paragraph(admission, styles["cell"]),
            Paragraph(req, styles["cell"]),
            Paragraph(display_result, styles["cell_bold"]),
            Paragraph(detail, styles["cell"]),
        ])

    t = Table(rows, colWidths=[28 * mm, 30 * mm, 55 * mm, 22 * mm, 45 * mm], repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), HEADER_FG),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    for i, s in enumerate(simulations, start=1):
        result = s.get("result") or "파싱불가"
        color = result_color.get(result, colors.HexColor("#9CA3AF"))
        style_cmds.append(("TEXTCOLOR", (3, i), (3, i), color))
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    t.setStyle(TableStyle(style_cmds))
    elements.append(t)


# ═══════════════════════════════════════
# 기획서 §7-2: Delta 모드 변경점
# ═══════════════════════════════════════

def _render_delta_change(elements, styles, delta: dict):
    """Delta 모드 이전 설문 대비 변경점 섹션.

    delta = {
        "has_previous": True,
        "previous_timing": str,
        "previous_submitted_at": str | None,
        "diff": {cat_id: {q_id: {prev, curr, change_type}}},
        "summary": str,
    }
    """
    elements.append(PageBreak())
    elements.append(Paragraph("이전 설문 대비 변경점 (Delta)", styles["h2"]))

    prev_timing = delta.get("previous_timing") or "-"
    prev_at = delta.get("previous_submitted_at")
    prev_date = prev_at[:10] if prev_at else "-"
    elements.append(Paragraph(
        f"이전 설문: {prev_timing}  (제출 {prev_date})",
        styles["body_bold"],
    ))

    summary_text = delta.get("summary") or "-"
    elements.append(Paragraph(summary_text, styles["body"]))
    elements.append(Spacer(1, 3 * mm))

    diff = delta.get("diff") or {}
    if not diff:
        elements.append(Paragraph("변경된 항목이 없습니다.", styles["body"]))
        return

    change_label = {
        "added": "신규",
        "removed": "삭제",
        "modified": "수정",
        "increased": "증가",
        "decreased": "감소",
    }
    change_color = {
        "added": colors.HexColor("#10B981"),
        "removed": colors.HexColor("#DC2626"),
        "modified": colors.HexColor("#3B82F6"),
        "increased": colors.HexColor("#059669"),
        "decreased": colors.HexColor("#DC2626"),
    }

    for cat_id in sorted(diff.keys()):
        cat_diff = diff[cat_id] or {}
        if not cat_diff:
            continue
        elements.append(Paragraph(f"카테고리 {cat_id}", styles["h3"]))

        header = [
            Paragraph("문항", styles["cell_bold"]),
            Paragraph("이전 값", styles["cell_bold"]),
            Paragraph("현재 값", styles["cell_bold"]),
            Paragraph("변경 유형", styles["cell_bold"]),
        ]
        rows = [header]
        type_list: list[str] = []
        for q_id in sorted(cat_diff.keys()):
            q_change = cat_diff[q_id] or {}
            prev_v = _format_answer_value(q_change.get("prev"))
            curr_v = _format_answer_value(q_change.get("curr"))
            ch_type = q_change.get("change_type") or "modified"
            type_list.append(ch_type)
            # 값이 길면 축약
            if len(prev_v) > 80:
                prev_v = prev_v[:80] + "..."
            if len(curr_v) > 80:
                curr_v = curr_v[:80] + "..."
            rows.append([
                Paragraph(q_id, styles["cell"]),
                Paragraph(prev_v, styles["cell"]),
                Paragraph(curr_v, styles["cell"]),
                Paragraph(change_label.get(ch_type, ch_type), styles["cell_bold"]),
            ])

        t = Table(
            rows, colWidths=[25 * mm, 65 * mm, 65 * mm, 25 * mm], repeatRows=1,
        )
        style_cmds = [
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), HEADER_FG),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, BORDER_COLOR),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ]
        for i, ch in enumerate(type_list, start=1):
            color = change_color.get(ch, colors.HexColor("#374151"))
            style_cmds.append(("TEXTCOLOR", (3, i), (3, i), color))
            if i % 2 == 0:
                style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
        t.setStyle(TableStyle(style_cmds))
        elements.append(t)
        elements.append(Spacer(1, 3 * mm))
