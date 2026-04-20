"""
keyword_extractor.py
- 학생 세특/창체/행특 원본 텍스트 → 핵심 키워드 추출
- 한국어 형태소 분석 (kiwipiepy) 기반
- 빈도 계산 + 4대 역량 카테고리 분류 + 학년별 변화 추이
- 워드클라우드 이미지 생성 (matplotlib + wordcloud)

CLAUDE.md § Step 8-4 구현체.

입력 구조 (학생 데이터 모듈의 raw_texts 필드):
    raw_texts = {
        "setuek": {
            1: ["학년1 과목1 세특 원본...", "학년1 과목2 세특 원본...", ...],
            2: [...],
            3: [...],
        },
        "changche": {
            1: {"자율": "...", "동아리": "...", "진로": "..."},
            2: {...},
            3: {...},
        },
        "haengtuk": {
            1: "1학년 행특 원본...",
            2: "...",
            3: "...",
        },
    }

출력:
    extract_keywords(raw_texts, config) → KeywordReport
        .keywords: [KeywordEntry] (빈도 상위 N개)
        .by_year: {year: [top keywords]} (학년별 상위 키워드)
        .yearly_changes: {year: {"new": [..], "disappeared": [..]}}
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ═══════════════════════════════════════════════════════
# 데이터 클래스
# ═══════════════════════════════════════════════════════

@dataclass
class KeywordEntry:
    """단일 키워드 항목."""
    word: str
    frequency: int
    category: str              # 학업역량 / 진로역량 / 공동체역량 / 일반
    areas: list[str]           # ["세특", "창체", "행특"] 중 등장한 영역
    year_frequencies: dict[int, int] = field(default_factory=dict)  # 학년별 빈도


@dataclass
class KeywordReport:
    """키워드 분석 결과 종합."""
    keywords: list[KeywordEntry]                                # 전체 상위 키워드 (빈도순)
    by_year: dict[int, list[tuple[str, int]]]                   # 학년별 상위 N개 [(word, freq), ...]
    yearly_changes: dict[int, dict[str, list[str]]]             # {year: {"new": [..], "disappeared": [..]}}
    total_tokens: int                                           # 총 형태소 수 (참고)
    categories_summary: dict[str, int]                          # 카테고리별 키워드 수


# ═══════════════════════════════════════════════════════
# 설정 로딩
# ═══════════════════════════════════════════════════════

_CATEGORIES_CACHE: dict | None = None


def _load_categories(config_path: Path | None = None) -> dict:
    """keyword_categories.yaml 로드. 모듈 로드 후 1회만 읽음."""
    global _CATEGORIES_CACHE
    if _CATEGORIES_CACHE is not None:
        return _CATEGORIES_CACHE

    import yaml
    if config_path is None:
        config_path = Path(__file__).resolve().parent.parent / "config" / "keyword_categories.yaml"
    with open(config_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    _CATEGORIES_CACHE = data
    return data


def _load_wordcloud_settings(config_path: Path | None = None) -> dict:
    """config.yaml 의 wordcloud 섹션 로드."""
    import yaml
    if config_path is None:
        config_path = Path(__file__).resolve().parent.parent / "config" / "config.yaml"
    with open(config_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("wordcloud", {})


# ═══════════════════════════════════════════════════════
# 형태소 분석 기반 키워드 추출
# ═══════════════════════════════════════════════════════

_KIWI_INSTANCE = None


def _get_kiwi():
    """Kiwi 인스턴스 싱글턴. 초기화 비용이 크므로 1회만 생성."""
    global _KIWI_INSTANCE
    if _KIWI_INSTANCE is None:
        from kiwipiepy import Kiwi
        _KIWI_INSTANCE = Kiwi()
    return _KIWI_INSTANCE


# 명사 품사 (kiwipiepy 기준)
# NNG: 일반명사 / NNP: 고유명사 / NNB: 의존명사 / NR: 수사 (제외)
_NOUN_TAGS = {"NNG", "NNP"}
_MIN_WORD_LEN = 2  # 2글자 미만 단어 제외


def _extract_nouns(text: str) -> list[str]:
    """주어진 텍스트에서 명사만 추출. 2글자 이상, 일반·고유명사만."""
    if not text or not text.strip():
        return []
    kiwi = _get_kiwi()
    result = kiwi.analyze(text)
    if not result:
        return []
    tokens = result[0][0]  # 첫 결과의 토큰 리스트
    nouns = []
    for t in tokens:
        if t.tag in _NOUN_TAGS and len(t.form) >= _MIN_WORD_LEN:
            nouns.append(t.form)
    return nouns


# ═══════════════════════════════════════════════════════
# 카테고리 매핑
# ═══════════════════════════════════════════════════════

def _classify_keyword(word: str, categories: dict) -> str:
    """키워드 → 역량 카테고리 매핑.
    우선순위 순으로 순회하며 첫 매칭 카테고리 반환.
    """
    settings = categories.get("settings", {})
    priority = settings.get("priority_order", ["학업역량", "진로역량", "공동체역량", "일반"])
    match_mode = settings.get("match_mode", "contains")
    unmatched = settings.get("unmatched_policy", "general")

    for cat in priority:
        vocab = categories.get(cat, [])
        if not isinstance(vocab, list):
            continue
        for entry in vocab:
            if match_mode == "exact":
                if word == entry:
                    return cat
            else:  # contains
                if entry in word or word in entry:
                    return cat
    # 미매칭
    return "일반" if unmatched == "general" else "__skip__"


# ═══════════════════════════════════════════════════════
# 키워드 추출 메인
# ═══════════════════════════════════════════════════════

def extract_keywords(
    raw_texts: dict,
    top_n: int = 50,
    min_frequency: int = 2,
    config_path: Path | None = None,
) -> KeywordReport:
    """raw_texts 딕셔너리에서 키워드 추출 + 카테고리 분류 + 학년별 추이.

    raw_texts 스키마:
        {
            "setuek":  {year: [text1, text2, ...]},
            "changche": {year: {"자율": text, "동아리": text, "진로": text}},
            "haengtuk": {year: text},
        }
    """
    categories = _load_categories(config_path)

    # 영역·학년별 명사 추출
    by_area_year: dict[str, dict[int, list[str]]] = {"세특": {}, "창체": {}, "행특": {}}

    # 세특
    for yr, texts in (raw_texts.get("setuek") or {}).items():
        bag: list[str] = []
        for t in (texts or []):
            bag.extend(_extract_nouns(t))
        by_area_year["세특"][int(yr)] = bag

    # 창체 (자율/동아리/진로 합산)
    for yr, area_map in (raw_texts.get("changche") or {}).items():
        bag = []
        if isinstance(area_map, dict):
            for _, t in area_map.items():
                bag.extend(_extract_nouns(t or ""))
        else:  # 문자열로 들어온 경우
            bag.extend(_extract_nouns(area_map or ""))
        by_area_year["창체"][int(yr)] = bag

    # 행특
    for yr, t in (raw_texts.get("haengtuk") or {}).items():
        by_area_year["행특"][int(yr)] = _extract_nouns(t or "")

    # 전체 빈도
    total_counter: Counter = Counter()
    # 영역별 빈도 (어느 영역에 등장했는지)
    area_counter: dict[str, Counter] = {"세특": Counter(), "창체": Counter(), "행특": Counter()}
    # 학년별 빈도
    year_counter: dict[int, Counter] = defaultdict(Counter)

    for area, year_map in by_area_year.items():
        for yr, bag in year_map.items():
            area_counter[area].update(bag)
            year_counter[yr].update(bag)
            total_counter.update(bag)

    # min_frequency 필터
    filtered = [(w, f) for w, f in total_counter.items() if f >= min_frequency]
    # 빈도순 상위 top_n
    filtered.sort(key=lambda x: (-x[1], x[0]))
    top_keywords = filtered[:top_n]

    # KeywordEntry 생성
    entries: list[KeywordEntry] = []
    for word, freq in top_keywords:
        cat = _classify_keyword(word, categories)
        if cat == "__skip__":
            continue
        areas = [a for a in ("세특", "창체", "행특") if area_counter[a].get(word, 0) > 0]
        year_freqs = {yr: cnt.get(word, 0) for yr, cnt in year_counter.items() if cnt.get(word, 0) > 0}
        entries.append(KeywordEntry(
            word=word,
            frequency=freq,
            category=cat,
            areas=areas,
            year_frequencies=year_freqs,
        ))

    # 학년별 상위 키워드 (상위 15개씩)
    by_year_top: dict[int, list[tuple[str, int]]] = {}
    for yr in sorted(year_counter.keys()):
        yr_filtered = [(w, f) for w, f in year_counter[yr].items() if f >= min_frequency]
        yr_filtered.sort(key=lambda x: (-x[1], x[0]))
        by_year_top[yr] = yr_filtered[:15]

    # 학년별 변화 (신규 등장 / 사라진 키워드)
    yearly_changes: dict[int, dict[str, list[str]]] = {}
    sorted_years = sorted(year_counter.keys())
    for i, yr in enumerate(sorted_years):
        if i == 0:
            yearly_changes[yr] = {"new": [], "disappeared": []}
            continue
        prev_yr = sorted_years[i - 1]
        curr_set = {w for w, _ in by_year_top[yr]}
        prev_set = {w for w, _ in by_year_top[prev_yr]}
        yearly_changes[yr] = {
            "new": sorted(curr_set - prev_set),
            "disappeared": sorted(prev_set - curr_set),
        }

    # 카테고리별 키워드 수
    cat_summary: dict[str, int] = Counter(e.category for e in entries)

    return KeywordReport(
        keywords=entries,
        by_year=by_year_top,
        yearly_changes=yearly_changes,
        total_tokens=sum(total_counter.values()),
        categories_summary=dict(cat_summary),
    )


# ═══════════════════════════════════════════════════════
# 워드클라우드 이미지 생성
# ═══════════════════════════════════════════════════════

def generate_wordcloud_image(
    report: KeywordReport,
    output_path: Path,
    config_path: Path | None = None,
) -> Path | None:
    """KeywordReport → 워드클라우드 PNG 이미지 생성.

    성공 시 output_path 반환. 키워드 0개면 None 반환 (이미지 생성 스킵).
    """
    if not report.keywords:
        return None

    settings = _load_wordcloud_settings(config_path)
    max_kw = settings.get("max_keywords", 50)
    width = settings.get("width", 800)
    height = settings.get("height", 400)

    # 폰트 경로: analyzer/fonts/NanumSquareRoundR.ttf 우선, config 에 font_path 있으면 override
    fonts_dir = Path(__file__).resolve().parent.parent / "fonts"
    font_path = fonts_dir / "NanumSquareRoundR.ttf"
    cfg_font = settings.get("font_path", "")
    if cfg_font:
        candidate = Path(cfg_font)
        if not candidate.is_absolute():
            candidate = fonts_dir / cfg_font
        if candidate.exists():
            font_path = candidate

    # 빈도 dict (상위 max_kw 만)
    freq_dict = {e.word: e.frequency for e in report.keywords[:max_kw]}
    if not freq_dict:
        return None

    # matplotlib 은 GUI 없는 환경에서 Agg 백엔드 필요
    import matplotlib
    matplotlib.use("Agg")
    from wordcloud import WordCloud

    wc = WordCloud(
        font_path=str(font_path),
        width=width,
        height=height,
        background_color="white",
        colormap="tab10",  # 색상 팔레트 (다양한 색)
        max_words=max_kw,
        relative_scaling=0.5,
        prefer_horizontal=0.9,
    )
    wc.generate_from_frequencies(freq_dict)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    wc.to_file(str(output_path))
    return output_path


# ═══════════════════════════════════════════════════════
# 편의 함수
# ═══════════════════════════════════════════════════════

def has_raw_texts(sd) -> bool:
    """학생 데이터 모듈(sd) 에 raw_texts 가 있고 비어있지 않은지 확인."""
    rt = getattr(sd, "raw_texts", None)
    if not isinstance(rt, dict):
        return False
    # 어느 한 영역이라도 내용이 있으면 True
    for area in ("setuek", "changche", "haengtuk"):
        v = rt.get(area)
        if v and any(v.values() if isinstance(v, dict) else [v]):
            return True
    return False
