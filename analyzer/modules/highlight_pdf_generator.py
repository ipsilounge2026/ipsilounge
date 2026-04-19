# -*- coding: utf-8 -*-
"""
highlight_pdf_generator.py
- G6 v1 (2026-04-19): 노란색 하이라이트 (핵심평가문장)
- G6 v2 (2026-04-19): 초록·주황 하이라이트 (강점·보완점 근거) 추가
- CLAUDE.md §Step 9-4 전체 범위 구현:
    * 노란색 형광: `good_sentences` (2-3 핵심평가문장)
    * 초록색 형광: 강점 코멘트 근거 (2-2 세부내용 강점에서 인용한 원문)
    * 주황색 형광: 보완점 코멘트 근거 (2-2 세부내용 보완점에서 인용한 원문)
- 원본 학생부 PDF 파일은 수정하지 않음. 별도 결과 PDF 로 출력.

의존성:
    pymupdf==1.27.2.2  (import fitz)

입력:
    sd.source_pdf_path : 원본 학생부 PDF 경로 (analyzer 기준 상대 또는 절대 경로)
    sd.good_sentences  : [(과목라벨, 핵심문장, 이유, 표현역량), ...]
                         "해당 없음" 항목은 스킵.
    sd.highlight_quotes (v2 추가, 선택): 강점·보완점 코멘트에서 인용한 원문 조각.
        구조:
            {
              "setuek": {
                 "국어(1)": {
                    "green":  ["강점 코멘트에 인용된 원문1", "원문2"],
                    "orange": ["보완점 코멘트에 인용된 원문1"],
                 },
              },
              # 향후 "changche", "haengtuk" 키 확장 가능
            }
        비어있거나 미정의 → 초록/주황 하이라이트 생성 스킵 (노란색만 처리).

출력:
    output/{STUDENT}_학생부_하이라이트_{TODAY}{_v{N}}.pdf

동작:
    1. 원본 PDF 로드
    2. 각 엔트리(노랑/초록/주황)마다 `page.search_for()` 로 모든 페이지에서 텍스트 위치 탐색
       - 정확 매치 → 앞 40/25/15자 부분 매치 → 쉼표·마침표 세그먼트 순차 폴백
       - 전부 실패 시 해당 엔트리는 미탐지로 기록하고 스킵
    3. 매치된 rect 에 색상별 하이라이트 주석 추가 + 툴팁에 "[N] {활용처}" 기록
    4. 마지막 페이지에 하이라이트 범례 추가 (번호·문장·활용처·색상)
    5. 저장

에러 처리:
    - source_pdf_path 빈 값 또는 파일 없음 → 생성 스킵 (WARN 로그)
    - good_sentences + highlight_quotes 전부 빈 경우 → 생성 스킵 (INFO 로그)
    - 일부 문장 미탐지 → 해당 문장만 스킵, 나머지 계속 진행
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

import fitz  # PyMuPDF


# ── 색상 상수 (RGB 0~1 스케일, PyMuPDF 관례) ──
HIGHLIGHT_YELLOW = (1.0, 0.97, 0.35)   # 핵심평가문장
HIGHLIGHT_GREEN  = (0.60, 0.95, 0.55)  # 강점 근거 (v2)
HIGHLIGHT_ORANGE = (1.0,  0.80, 0.45)  # 보완점 근거 (v2)

# 색상별 메타 — 활용처 라벨·범례 표기명·주석 타이틀 접두어
COLOR_META = {
    "yellow": {
        "rgb":    HIGHLIGHT_YELLOW,
        "label":  "2-3 핵심평가문장",
        "name":   "노랑",
    },
    "green": {
        "rgb":    HIGHLIGHT_GREEN,
        "label":  "2-2 세부내용 강점",
        "name":   "초록",
    },
    "orange": {
        "rgb":    HIGHLIGHT_ORANGE,
        "label":  "2-2 세부내용 보완점",
        "name":   "주황",
    },
}

# 범례 원형 배지 컬러 (매치 O/X 별도)
LEGEND_BADGE_MATCHED   = (0.15, 0.45, 0.2)
LEGEND_BADGE_UNMATCHED = (0.7, 0.25, 0.1)

# ── 매칭 설정 ──
# 정확 매치 실패 시 여러 길이로 단계적 부분 매치 시도
FALLBACK_PREFIX_LENS = [40, 25, 15]  # 긴 것부터 시도
MIN_SEARCH_LEN = 10       # 너무 짧은 문장(공통 문구 오탐 위험) 은 검색 안 함
# 쉼표/마침표 기준 세그먼트 중 이 길이 이상인 것만 최후 폴백으로 검색
MIN_SEGMENT_LEN = 12


@dataclass
class HighlightEntry:
    """하이라이트 1건의 메타 정보."""
    number: int
    subject_label: str      # e.g. "국어(1)"
    sentence: str           # 원문
    color: str = "yellow"   # "yellow" | "green" | "orange" (COLOR_META 키)
    reason: str = ""        # 선정 이유 (노란색 good_sentences 에만 있음)
    competency: str = ""    # 표현 역량 (노란색 good_sentences 에만 있음)
    matched: bool = False   # PDF 에서 실제 매치 여부
    match_count: int = 0    # 몇 페이지에서 매치되었나

    @property
    def rgb(self):
        return COLOR_META.get(self.color, COLOR_META["yellow"])["rgb"]

    @property
    def source_label(self) -> str:
        return COLOR_META.get(self.color, COLOR_META["yellow"])["label"]

    @property
    def color_name(self) -> str:
        return COLOR_META.get(self.color, COLOR_META["yellow"])["name"]


@dataclass
class HighlightReport:
    output_path: Path
    entries: List[HighlightEntry] = field(default_factory=list)
    source_pdf: Optional[Path] = None
    total_pages: int = 0
    skipped_reason: str = ""   # 생성 스킵 시 사유

    @property
    def generated(self) -> bool:
        return not self.skipped_reason and self.output_path.exists()

    @property
    def matched_count(self) -> int:
        return sum(1 for e in self.entries if e.matched)

    @property
    def unmatched_count(self) -> int:
        return sum(1 for e in self.entries if not e.matched)


def _resolve_source_pdf(sd, project_root: Path) -> Optional[Path]:
    """sd.source_pdf_path 를 실제 경로로 해석.

    - 빈 문자열/미정의 → None
    - 절대 경로 → 그대로
    - 상대 경로 → project_root 기준으로 해석
    - 존재하지 않으면 None
    """
    raw = getattr(sd, "source_pdf_path", "") or ""
    raw = str(raw).strip()
    if not raw:
        return None

    p = Path(raw)
    if not p.is_absolute():
        p = project_root / p
    if not p.exists() or not p.is_file():
        return None
    return p


def _collect_entries(good_sentences, highlight_quotes=None) -> List[HighlightEntry]:
    """good_sentences + highlight_quotes → HighlightEntry 통합 리스트.

    번호 부여 순서: 노랑(good_sentences) → 초록(강점 인용) → 주황(보완점 인용).
    동일 색상 내에서는 subject_label 사전순, 인용 리스트 순서 유지.

    Args:
        good_sentences: [(과목라벨, 핵심문장, 이유, 역량), ...] - v1 노란색.
        highlight_quotes: v2 구조 - {"setuek": {"과목라벨": {"green":[...], "orange":[...]}}}.
                          None / 빈 dict 허용.
    """
    entries: List[HighlightEntry] = []
    number = 0

    # ── 노란색: good_sentences ──
    for tpl in good_sentences or []:
        if not tpl or len(tpl) < 4:
            continue
        subj, sent, reason, comp = tpl[0], tpl[1], tpl[2], tpl[3]
        sent_str = str(sent or "").strip()
        if not sent_str or sent_str == "해당 없음":
            continue
        number += 1
        entries.append(HighlightEntry(
            number=number,
            subject_label=str(subj or "").strip(),
            sentence=sent_str,
            color="yellow",
            reason=str(reason or "").strip(),
            competency=str(comp or "").strip(),
        ))

    # ── 초록·주황: highlight_quotes ──
    hq = highlight_quotes or {}
    # v2: 현재 "setuek" 만 지원. 향후 "changche", "haengtuk" 키 확장 시 loop 로 순회.
    setuek_quotes = (hq.get("setuek") or {}) if isinstance(hq, dict) else {}

    # 초록 (강점 인용) 전체 먼저
    for color in ("green", "orange"):
        # subject_label 정렬 → 결정론적 번호 부여
        for subj_label in sorted(setuek_quotes.keys()):
            quotes_for_subj = setuek_quotes.get(subj_label) or {}
            if not isinstance(quotes_for_subj, dict):
                continue
            quote_list = quotes_for_subj.get(color) or []
            if isinstance(quote_list, str):
                quote_list = [quote_list]  # 단일 문자열 입력 허용
            for quote in quote_list:
                quote_str = str(quote or "").strip()
                if not quote_str or quote_str == "해당 없음":
                    continue
                number += 1
                entries.append(HighlightEntry(
                    number=number,
                    subject_label=str(subj_label).strip(),
                    sentence=quote_str,
                    color=color,
                ))

    return entries


def _search_rects(page: fitz.Page, sentence: str) -> List[fitz.Rect]:
    """페이지에서 문장 위치 탐색. 여러 단계의 매칭 폴백 적용.

    단계:
      1. 정확 매치 (문장 전체)
      2. 앞에서 40/25/15 자 부분 매치 (줄바꿈·요약 대응)
      3. 쉼표·마침표 기준 최장 세그먼트 매치 (긴 세그먼트부터)

    반환: 매치된 Rect 리스트 (없으면 빈 리스트).
    """
    if len(sentence) < MIN_SEARCH_LEN:
        return []

    # 1차: 정확 매치
    rects = page.search_for(sentence, quads=False) or []
    if rects:
        return rects

    # 2차: 앞에서 N자 부분 매치 (긴 것부터)
    for n in FALLBACK_PREFIX_LENS:
        if len(sentence) > n:
            prefix = sentence[:n]
            rects = page.search_for(prefix, quads=False) or []
            if rects:
                return rects

    # 3차: 쉼표·마침표·세미콜론 기준 세그먼트 매치 (긴 세그먼트부터)
    # 여러 세그먼트 매치되면 합쳐서 반환 (문장 위치를 대략 특정할 수 있음)
    segments = []
    buf = ""
    for ch in sentence:
        if ch in (",", "，", ".", ";", "·", "•"):
            if len(buf.strip()) >= MIN_SEGMENT_LEN:
                segments.append(buf.strip())
            buf = ""
        else:
            buf += ch
    if len(buf.strip()) >= MIN_SEGMENT_LEN:
        segments.append(buf.strip())

    # 긴 세그먼트부터 매치 시도 — 가장 특이한 문구일수록 오탐 적음
    segments.sort(key=len, reverse=True)
    segment_rects: List[fitz.Rect] = []
    for seg in segments[:3]:  # 상위 3개 세그먼트까지만
        seg_rects = page.search_for(seg, quads=False) or []
        segment_rects.extend(seg_rects)

    return segment_rects


def _annotate_entry(page: fitz.Page, rects: List[fitz.Rect], entry: HighlightEntry):
    """매치된 rect 에 색상별 하이라이트 주석 + 툴팁 정보 삽입."""
    if not rects:
        return
    annot = page.add_highlight_annot(rects)
    annot.set_colors(stroke=entry.rgb)
    # 주석 툴팁 정보: 번호·활용처·과목·역량
    content_parts = [f"과목: {entry.subject_label}"]
    if entry.competency:
        content_parts.append(f"역량: {entry.competency}")
    annot.set_info(
        title=f"[{entry.number}] {entry.source_label}",
        content="\n".join(content_parts),
    )
    annot.update()


def _append_legend_page(doc: fitz.Document, entries: List[HighlightEntry],
                        student: str, today: str):
    """마지막에 범례 페이지 추가. 번호·원문·활용처·역량 정리표."""
    # A4 사이즈 (PyMuPDF 단위: 1 point = 1/72 inch)
    page = doc.new_page(width=595, height=842)  # A4 portrait

    # 한글 폰트 등록: NanumSquareRound (프로젝트 fonts/ 에서 로드)
    fonts_dir = Path(__file__).resolve().parent.parent / "fonts"
    regular_font = fonts_dir / "NanumSquareRoundR.ttf"
    bold_font = fonts_dir / "NanumSquareRoundB.ttf"

    # 폰트 파일 없을 수도 있으니 fallback 처리
    font_regular = "nanum_r"
    font_bold = "nanum_b"
    if regular_font.exists():
        page.insert_font(fontname=font_regular, fontfile=str(regular_font))
    else:
        font_regular = "helv"
    if bold_font.exists():
        page.insert_font(fontname=font_bold, fontfile=str(bold_font))
    else:
        font_bold = "hebo"

    # 제목
    page.insert_text(
        (40, 50),
        f"학생부 하이라이트 범례 - {student}",
        fontname=font_bold, fontsize=16, color=(0.05, 0.15, 0.35),
    )
    # 색상 범례 (v2: 노랑/초록/주황)
    counts = {"yellow": 0, "green": 0, "orange": 0}
    for e in entries:
        counts[e.color] = counts.get(e.color, 0) + 1
    color_legend_parts = []
    for c in ("yellow", "green", "orange"):
        if counts.get(c, 0) > 0:
            meta = COLOR_META[c]
            color_legend_parts.append(f"{meta['name']}={meta['label']}({counts[c]}건)")
    color_legend_line = "생성일: {}  /  {}".format(today, " · ".join(color_legend_parts) or "데이터 없음")
    page.insert_text(
        (40, 70),
        color_legend_line,
        fontname=font_regular, fontsize=9, color=(0.4, 0.4, 0.4),
    )

    # 매치 통계
    matched = sum(1 for e in entries if e.matched)
    unmatched = len(entries) - matched
    stat_line = f"총 {len(entries)}개 / PDF 매치 {matched}개 / 미매치 {unmatched}개"
    if unmatched > 0:
        stat_line += "  (※ 미매치는 OCR·줄바꿈·원본 차이로 인한 검색 실패, 하이라이트 누락)"
    page.insert_text(
        (40, 86),
        stat_line,
        fontname=font_regular, fontsize=9,
        color=(0.65, 0.3, 0.1) if unmatched > 0 else (0.15, 0.45, 0.2),
    )

    # 본문 테이블 (번호 | 원문(최대 60자) | 활용처 | 과목 | 역량 / 매치 표시)
    y = 110
    line_h = 14
    col_x = {
        "no": 40,
        "sentence": 70,
        "right": 555,  # right margin
    }
    # 헤더
    page.draw_line(p1=(40, y - 2), p2=(555, y - 2), color=(0.4, 0.4, 0.4), width=0.5)
    y += 4
    page.insert_text((col_x["no"], y), "번호", fontname=font_bold, fontsize=9)
    page.insert_text((col_x["sentence"], y), "핵심문장 (원문 요약)", fontname=font_bold, fontsize=9)
    y += line_h
    page.draw_line(p1=(40, y - 4), p2=(555, y - 4), color=(0.4, 0.4, 0.4), width=0.5)

    for e in entries:
        # 번호 원 — 하이라이트 색상으로 배경, 미매치는 회색 줄
        badge_color = e.rgb
        page.draw_circle(center=(col_x["no"] + 6, y + 3), radius=6,
                          color=(0.3, 0.3, 0.3), fill=badge_color, width=0.5)
        # 미매치 표시: 번호 앞에 X
        page.insert_text(
            (col_x["no"] + 3, y + 6), str(e.number),
            fontname=font_bold, fontsize=8, color=(0, 0, 0),
        )

        # 원문 요약 (최대 100자) + 줄바꿈 시 블록 삽입
        sent_short = e.sentence[:100].replace("\n", " ")
        if len(e.sentence) > 100:
            sent_short += "..."
        # insert_textbox 로 자동 줄바꿈
        text_rect = fitz.Rect(col_x["sentence"], y - 2, col_x["right"], y + 30)
        page.insert_textbox(
            text_rect, sent_short,
            fontname=font_regular, fontsize=8, color=(0, 0, 0),
            align=0,
        )
        y += 20

        # 서브 라인: 색상 / 과목 / 활용처 / 역량 / 매치 상태
        meta_parts = [
            f"색상: {e.color_name}",
            f"과목: {e.subject_label}",
            f"활용처: {e.source_label}",
        ]
        if e.competency:
            meta_parts.append(f"역량: {e.competency[:40]}")
        match_mark = "매치O" if e.matched else "매치X (미탐지)"
        meta_parts.append(match_mark)
        meta_line = "  ·  ".join(meta_parts)
        meta_color = (0.35, 0.35, 0.35) if e.matched else (0.6, 0.25, 0.1)
        page.insert_text(
            (col_x["sentence"], y),
            meta_line,
            fontname=font_regular, fontsize=7, color=meta_color,
        )
        y += line_h + 2
        # 구분선
        page.draw_line(p1=(40, y - 4), p2=(555, y - 4),
                        color=(0.85, 0.85, 0.85), width=0.3)

        # 페이지 넘김
        if y > 800:
            page = doc.new_page(width=595, height=842)
            if regular_font.exists():
                page.insert_font(fontname=font_regular, fontfile=str(regular_font))
            if bold_font.exists():
                page.insert_font(fontname=font_bold, fontfile=str(bold_font))
            y = 50


def has_source_pdf(sd) -> bool:
    """source_pdf_path 가 실재 파일인지 체크 (보조 헬퍼)."""
    raw = getattr(sd, "source_pdf_path", "") or ""
    return bool(str(raw).strip())


def generate_highlight_pdf(sd, project_root: Path, output_dir: Path,
                            suffix: str = "") -> HighlightReport:
    """G6 v1 하이라이트 PDF 생성 진입점.

    Args:
        sd: 학생 데이터 모듈 (STUDENT, TODAY, good_sentences, source_pdf_path 필요)
        project_root: analyzer 프로젝트 루트 (상대 경로 해석용)
        output_dir: output/ 디렉토리
        suffix: _v{N} 등의 버전 접미사 (generate_report.py 에서 전달)

    Returns:
        HighlightReport: 생성 결과 + 매치 통계. `report.generated` 로 성공 여부 체크.
    """
    student = getattr(sd, "STUDENT", "") or "unknown"
    today = getattr(sd, "TODAY", "") or ""

    output_path = output_dir / f"{student}_학생부_하이라이트_{today}{suffix}.pdf"
    report = HighlightReport(output_path=output_path)

    # 1. 원본 PDF 존재 확인
    source_pdf = _resolve_source_pdf(sd, project_root)
    if source_pdf is None:
        raw = getattr(sd, "source_pdf_path", "") or ""
        if not str(raw).strip():
            report.skipped_reason = "source_pdf_path 미정의 (원본 학생부 PDF 미지정)"
        else:
            report.skipped_reason = f"source_pdf_path 파일 없음: {raw}"
        return report
    report.source_pdf = source_pdf

    # 2. good_sentences + highlight_quotes 수집 (v1 노랑 + v2 초록·주황)
    good_sentences = getattr(sd, "good_sentences", []) or []
    highlight_quotes = getattr(sd, "highlight_quotes", {}) or {}
    entries = _collect_entries(good_sentences, highlight_quotes)
    report.entries = entries
    if not entries:
        report.skipped_reason = "하이라이트 대상 없음 (good_sentences 전부 '해당 없음' + highlight_quotes 비어있음)"
        return report

    # 3. PDF 열기 + 페이지별 매칭
    doc = fitz.open(str(source_pdf))
    report.total_pages = doc.page_count

    try:
        for entry in entries:
            for page in doc:
                rects = _search_rects(page, entry.sentence)
                if rects:
                    _annotate_entry(page, rects, entry)
                    entry.matched = True
                    entry.match_count += len(rects)

        # 4. 범례 페이지 추가
        _append_legend_page(doc, entries, student, today)

        # 5. 저장
        output_dir.mkdir(parents=True, exist_ok=True)
        doc.save(str(output_path), garbage=4, deflate=True)
    finally:
        doc.close()

    return report


def print_highlight_summary(report: HighlightReport):
    """하이라이트 PDF 생성 결과를 콘솔에 요약 출력 (색상별 통계 포함)."""
    print()
    print("=" * 60)
    print("  G6 v2: 상담용 학생부 하이라이트 PDF (노랑/초록/주황)")
    print("=" * 60)
    if report.skipped_reason:
        print(f"  [SKIP] {report.skipped_reason}")
        return
    if report.source_pdf:
        print(f"  원본 PDF: {report.source_pdf.name} ({report.total_pages}페이지)")

    # 색상별 통계
    per_color = {"yellow": [0, 0], "green": [0, 0], "orange": [0, 0]}  # [total, matched]
    for e in report.entries:
        per_color.setdefault(e.color, [0, 0])
        per_color[e.color][0] += 1
        if e.matched:
            per_color[e.color][1] += 1
    color_stats = []
    for c in ("yellow", "green", "orange"):
        total, matched = per_color[c]
        if total > 0:
            meta = COLOR_META[c]
            color_stats.append(f"{meta['name']}:{matched}/{total}")
    print(f"  전체 {len(report.entries)}개 (매치 {report.matched_count} / 미매치 {report.unmatched_count})  -  " + " · ".join(color_stats))

    if report.unmatched_count > 0:
        print(f"  [WARN] 미매치 항목 (OCR·줄바꿈·원본 차이):")
        for e in report.entries:
            if not e.matched:
                short = e.sentence[:40] + ("..." if len(e.sentence) > 40 else "")
                print(f"    - [{e.number}] [{e.color_name}] {e.subject_label}: {short}")
    print(f"  저장: {report.output_path}")
    print("=" * 60)
