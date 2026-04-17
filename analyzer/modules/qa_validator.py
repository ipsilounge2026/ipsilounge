# -*- coding: utf-8 -*-
"""
QA Validator (검수 에이전트)
- Step 8.5: 분석 완료 후, 리포트 생성 전에 데이터 정확성/일관성을 자동 검증
- P1(필수): FAIL 시 리포트 생성 차단
- P2(중요): WARN, 품질 저하 위험
- P3(참고): INFO, 품질 개선 제안
"""

from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional
from datetime import date


# ── 설정 ──
# 세특 가중치 (두 모드)
SETUEK_WEIGHTS_NO_MAJOR   = [0.19, 0.19, 0.19, 0.19, 0.08, 0.16]            # 6항목
SETUEK_WEIGHTS_WITH_MAJOR = [0.17, 0.17, 0.17, 0.17, 0.10, 0.07, 0.15]      # 7항목 (CLAUDE.md 원안)
GRADE_THRESHOLDS = {"S": 8.5, "A": 7.0, "B": 5.0, "C": 3.5, "D": 0.0}
TOLERANCE = 0.05  # 가중합산 허용 오차


def _resolve_setuek_mode(setuek_data, is_major: bool):
    """세특 모드별 슬라이스/가중치 계산.
    반환: (n_items, score_end, weights)
      - n_items: 항목 수 (6 or 7)
      - score_end: 튜플 슬라이싱 종료 인덱스 (8 or 9). 점수 = d[2:score_end], 가중합산 = d[score_end], 등급 = d[score_end+1]
      - weights: 해당 모드의 가중치 리스트
    """
    if is_major:
        return 7, 9, SETUEK_WEIGHTS_WITH_MAJOR
    return 6, 8, SETUEK_WEIGHTS_NO_MAJOR

MIN_CHARS = {
    "setuek_comment": 200,
    "changche_comment": 300,
    "haengtuk_comment": 200,
    "linkage_detail": 200,
    "fix_activity": 300,
}

CHANGCHE_VOLUME_THRESHOLDS = {
    "충실활용": 0.95,
    "적정활용": 0.80,
}


# ── 결과 클래스 ──
@dataclass
class QAResult:
    check_id: str       # e.g., "P1-A-001"
    check_name: str     # e.g., "구조 완전성 - 세특 과목 수"
    priority: str       # "P1", "P2", "P3"
    status: str         # "PASS", "FAIL", "WARN", "INFO"
    message: str = ""   # 상세 설명
    found: str = ""     # 발견된 값
    expected: str = ""  # 기대된 값
    remediation: str = ""  # 수정 방법


@dataclass
class QAReport:
    student_name: str = ""
    date_str: str = ""
    results: List[QAResult] = field(default_factory=list)

    def add(self, result: QAResult):
        self.results.append(result)

    def all_blocking_passed(self) -> bool:
        return all(r.status != "FAIL" for r in self.results if r.priority == "P1")

    def fail_count(self) -> int:
        return sum(1 for r in self.results if r.status == "FAIL")

    def warn_count(self) -> int:
        return sum(1 for r in self.results if r.status == "WARN")

    def pass_count(self) -> int:
        return sum(1 for r in self.results if r.status == "PASS")


# ══════════════════════════════════════════════
#  P1 - 필수 검증 (FAIL 시 리포트 차단)
# ══════════════════════════════════════════════

def check_structural_completeness(setuek_data, setuek_comments, good_sentences,
                                   changche_data, haengtuk_comments, linkage_data, fix_data):
    """P1-A: 구조 완전성 검증"""
    results = []

    # 세특 데이터 존재
    n_subj = len(setuek_data)
    if n_subj < 1:
        results.append(QAResult("P1-A-001", "세특 데이터 존재", "P1", "FAIL",
                                f"세특 데이터가 비어 있음", str(n_subj), "1개 이상"))
    else:
        results.append(QAResult("P1-A-001", f"세특 과목 수 ({n_subj}개)", "P1", "PASS"))

    # 세특 코멘트 - 모든 과목 존재
    n_comments = len(setuek_comments)
    if n_comments < n_subj:
        missing = n_subj - n_comments
        results.append(QAResult("P1-A-002", "세특 코멘트 완전성", "P1", "FAIL",
                                f"코멘트 누락 {missing}개", str(n_comments), str(n_subj)))
    else:
        results.append(QAResult("P1-A-002", f"세특 코멘트 완전성 ({n_comments}개)", "P1", "PASS"))

    # 창체 데이터: 최소 1행 이상 존재 (자율/동아리/진로 중 일부만 있어도 허용)
    # 1학년 1학기 같은 초기 상태에서는 자율활동만 있고 동아리·진로가 비어 있을 수 있음
    n_changche = len(changche_data)
    changche_years = sorted(set(d[0] for d in changche_data)) if changche_data else []
    changche_areas = sorted(set(d[1] for d in changche_data)) if changche_data else []
    if n_changche < 1:
        results.append(QAResult("P1-A-003", "창체 데이터 완전성", "P1", "FAIL",
                                f"창체 데이터 없음 (최소 1행 필요)", str(n_changche), "최소 1"))
    else:
        msg = f"창체 {n_changche}행 (학년 {len(changche_years)}개, 영역 {len(changche_areas)}종)"
        results.append(QAResult("P1-A-003", msg, "P1", "PASS"))

    # 행특 코멘트: 최소 1학년 이상 존재
    n_haengtuk = len(haengtuk_comments)
    if n_haengtuk < 1:
        results.append(QAResult("P1-A-004", "행특 코멘트 완전성", "P1", "FAIL",
                                f"행특 코멘트 {n_haengtuk}개 (최소 1개 필요)", str(n_haengtuk), "최소 1"))
    else:
        results.append(QAResult("P1-A-004", f"행특 코멘트 완전성 ({n_haengtuk}개 학년)", "P1", "PASS"))

    # 연계성 데이터: 최소 1항목 이상 (학년 수에 따라 권장 항목 수 다름)
    n_linkage = len(linkage_data)
    setuek_years = sorted(set(d[0] for d in setuek_data)) if setuek_data else []
    # 학년이 1개뿐이면 "학년별 성장 흐름"이 불가능하므로 2항목으로 충분
    expected_linkage_min = 1 if len(setuek_years) <= 1 else 2
    if n_linkage < 1:
        results.append(QAResult("P1-A-005", "연계성 데이터 완전성", "P1", "FAIL",
                                f"연계성 데이터 없음 (최소 1항목 필요)", str(n_linkage), "최소 1"))
    elif n_linkage < expected_linkage_min:
        results.append(QAResult("P1-A-005", "연계성 데이터 권장 수 미달", "P1", "WARN",
                                f"연계성 {n_linkage}항목 (권장: {expected_linkage_min}항목 이상, 학년 {len(setuek_years)}개 기준)",
                                str(n_linkage), f"{expected_linkage_min}+"))
    else:
        results.append(QAResult("P1-A-005", f"연계성 데이터 완전성 ({n_linkage}항목, 학년 {len(setuek_years)}개)", "P1", "PASS"))

    # 핵심문장 존재
    n_sentences = len(good_sentences)
    if n_sentences < 1:
        results.append(QAResult("P1-A-006", "핵심평가문장 존재", "P1", "FAIL",
                                "핵심문장 데이터 없음", str(n_sentences), "1개 이상"))
    else:
        results.append(QAResult("P1-A-006", f"핵심평가문장 ({n_sentences}개)", "P1", "PASS"))

    # 보완법 데이터
    n_fix = len(fix_data)
    if n_fix < 1:
        results.append(QAResult("P1-A-007", "역량별 보완법 존재", "P1", "FAIL",
                                "보완법 데이터 없음", str(n_fix), "1개 이상"))
    else:
        results.append(QAResult("P1-A-007", f"역량별 보완법 ({n_fix}개)", "P1", "PASS"))

    return results


def check_score_ranges(setuek_data, changche_data, haengtuk_data, is_major: bool = False):
    """P1-B: 점수 범위 검증 (1~10). is_major=True 면 세특 7항목 모드."""
    n_items, score_end, _ = _resolve_setuek_mode(setuek_data, is_major)
    results = []
    all_ok = True

    # 세특 점수
    for d in setuek_data:
        yr, subj = d[0], d[1]
        scores = d[2:score_end]
        for i, s in enumerate(scores):
            if not (1 <= s <= 10):
                results.append(QAResult("P1-B-001", f"세특 점수 범위 - {subj}({yr}학년)", "P1", "FAIL",
                                        f"항목{i+1} 점수 {s}이 범위(1~10) 밖", str(s), "1~10"))
                all_ok = False

    # 창체 점수
    for d in changche_data:
        yr, area = d[0], d[1]
        scores = d[3]
        for i, s in enumerate(scores):
            if not (1 <= s <= 10):
                results.append(QAResult("P1-B-002", f"창체 점수 범위 - {area}({yr}학년)", "P1", "FAIL",
                                        f"항목{i+1} 점수 {s}이 범위(1~10) 밖", str(s), "1~10"))
                all_ok = False

    # 행특 점수
    for d in haengtuk_data:
        yr = d[0]
        scores = d[1]
        for i, s in enumerate(scores):
            if not (1 <= s <= 10):
                results.append(QAResult("P1-B-003", f"행특 점수 범위 - {yr}학년", "P1", "FAIL",
                                        f"항목{i+1} 점수 {s}이 범위(1~10) 밖", str(s), "1~10"))
                all_ok = False

    if all_ok:
        total = len(setuek_data) * n_items + len(changche_data) * 5 + len(haengtuk_data) * 5
        results.append(QAResult("P1-B-000", f"전체 점수 범위 검증 ({total}개 점수)", "P1", "PASS"))

    return results


def check_weighted_averages(setuek_data, weights=None, is_major: bool = False):
    """P1-C: 가중합산 수학 검증. is_major=True 면 7항목 가중치 사용."""
    n_items, score_end, default_weights = _resolve_setuek_mode(setuek_data, is_major)
    if weights is None:
        weights = default_weights

    results = []
    all_ok = True

    for d in setuek_data:
        yr, subj = d[0], d[1]
        scores = d[2:score_end]
        recorded_avg = d[score_end]

        calculated = sum(s * w for s, w in zip(scores, weights))
        diff = abs(calculated - recorded_avg)

        if diff > TOLERANCE:
            results.append(QAResult("P1-C-001", f"가중합산 검증 - {subj}({yr}학년)", "P1", "FAIL",
                                    f"기록값 {recorded_avg} vs 계산값 {calculated:.2f} (차이 {diff:.2f})",
                                    str(recorded_avg), f"{calculated:.2f}",
                                    f"{subj}의 가중합산을 {calculated:.2f}로 수정 필요"))
            all_ok = False

    if all_ok:
        results.append(QAResult("P1-C-000", f"가중합산 검증 ({len(setuek_data)}개 과목)", "P1", "PASS"))

    return results


def score_to_grade(score):
    """점수 -> 등급 변환"""
    if score >= 8.5: return "S"
    elif score >= 7.0: return "A"
    elif score >= 5.0: return "B"
    elif score >= 3.5: return "C"
    else: return "D"


def check_grade_matching(setuek_data, is_major: bool = False):
    """P1-D: 등급 일치 검증. is_major=True 면 7항목 튜플 구조 기준."""
    _, score_end, _ = _resolve_setuek_mode(setuek_data, is_major)
    results = []
    all_ok = True

    for d in setuek_data:
        yr, subj = d[0], d[1]
        avg = d[score_end]
        recorded_grade = d[score_end + 1]
        expected_grade = score_to_grade(avg)

        if recorded_grade != expected_grade:
            results.append(QAResult("P1-D-001", f"등급 일치 - {subj}({yr}학년)", "P1", "FAIL",
                                    f"기록 등급 '{recorded_grade}' vs 계산 등급 '{expected_grade}' (점수 {avg})",
                                    recorded_grade, expected_grade,
                                    f"등급을 '{expected_grade}'로 수정 필요"))
            all_ok = False

    if all_ok:
        results.append(QAResult("P1-D-000", f"등급 일치 검증 ({len(setuek_data)}개 과목)", "P1", "PASS"))

    return results


# ══════════════════════════════════════════════
#  P2 - 중요 검증 (WARN)
# ══════════════════════════════════════════════

def check_char_counts(setuek_comments, haengtuk_comments, linkage_data, fix_data):
    """P2-A: 글자수 최소 기준 검증"""
    results = []
    issues = []

    # 세특 코멘트 (각 200자)
    for key, (strength, weakness) in setuek_comments.items():
        if len(strength) < MIN_CHARS["setuek_comment"]:
            issues.append(f"세특 강점 '{key}': {len(strength)}자 (최소 {MIN_CHARS['setuek_comment']}자)")
        if len(weakness) < MIN_CHARS["setuek_comment"]:
            issues.append(f"세특 보완점 '{key}': {len(weakness)}자 (최소 {MIN_CHARS['setuek_comment']}자)")

    # 창체 코멘트 (각 300자) - changche_comments가 있는 경우
    # changche_comments는 {(영역, 학년): (강점, 보완점, 역량리스트)} 형태
    # 또는 외부에서 전달된 경우에만 검증

    # 행특 코멘트 (각 200자)
    for yr, vals in haengtuk_comments.items():
        strength = vals[0]
        weakness = vals[1]
        if len(strength) < MIN_CHARS["haengtuk_comment"]:
            issues.append(f"행특 강점 {yr}학년: {len(strength)}자 (최소 {MIN_CHARS['haengtuk_comment']}자)")
        if len(weakness) < MIN_CHARS["haengtuk_comment"]:
            issues.append(f"행특 보완점 {yr}학년: {len(weakness)}자 (최소 {MIN_CHARS['haengtuk_comment']}자)")

    # 연계성 상세내용 (각 200자)
    for area, level, detail in linkage_data:
        if len(detail) < MIN_CHARS["linkage_detail"]:
            issues.append(f"연계성 '{area}': {len(detail)}자 (최소 {MIN_CHARS['linkage_detail']}자)")

    # 보완법 활동 (각 300자)
    for item in fix_data:
        activity = item[4] if len(item) > 4 else ""
        if len(activity) < MIN_CHARS["fix_activity"]:
            label = item[1] if len(item) > 1 else "?"
            issues.append(f"보완법 '{label}': {len(activity)}자 (최소 {MIN_CHARS['fix_activity']}자)")

    if issues:
        results.append(QAResult("P2-A-001", f"글자수 최소 기준 미달 ({len(issues)}건)", "P2", "WARN",
                                "\n".join(issues[:5]) + ("..." if len(issues) > 5 else "")))
    else:
        results.append(QAResult("P2-A-000", "글자수 최소 기준 검증", "P2", "PASS"))

    return results


def check_good_sentences_completeness(good_sentences, setuek_data):
    """P2-B: 핵심문장 과목 커버리지 검증"""
    results = []

    # 세특 과목 목록 추출
    subj_set = set()
    for d in setuek_data:
        subj_set.add(f"{d[1]}({d[0]})")

    # 핵심문장에 포함된 과목 추출
    sentence_subjs = set()
    for s in good_sentences:
        subj = s[0]
        sentence_subjs.add(subj)

    # 누락 과목 확인
    missing = subj_set - sentence_subjs
    if missing:
        results.append(QAResult("P2-B-001", f"핵심문장 과목 커버리지", "P2", "WARN",
                                f"핵심문장 누락 과목: {', '.join(sorted(missing))}",
                                str(len(sentence_subjs)), str(len(subj_set))))
    else:
        results.append(QAResult("P2-B-000", f"핵심문장 과목 커버리지 (전체 {len(subj_set)}과목)", "P2", "PASS"))

    # 4항목 구성 확인
    incomplete = []
    for s in good_sentences:
        if len(s) < 4:
            incomplete.append(s[0])
        elif s[1] != "해당 없음" and (not s[2] or not s[3]):
            incomplete.append(s[0])

    if incomplete:
        results.append(QAResult("P2-B-002", "핵심문장 4항목 구성", "P2", "WARN",
                                f"4항목 불완전: {', '.join(incomplete)}"))
    else:
        results.append(QAResult("P2-B-002", "핵심문장 4항목 구성", "P2", "PASS"))

    return results


def check_cross_references(setuek_data, setuek_comments, good_sentences):
    """P2-C: 교차 참조 일관성"""
    results = []

    # setuek_data 과목명 추출
    data_keys = set()
    for d in setuek_data:
        data_keys.add(f"{d[1]}({d[0]})")

    # setuek_comments 키 추출
    comment_keys_set = set(setuek_comments.keys())

    # 매칭 검증
    data_only = data_keys - comment_keys_set
    comment_only = comment_keys_set - data_keys

    if data_only or comment_only:
        msg_parts = []
        if data_only:
            msg_parts.append(f"데이터에만 존재: {', '.join(sorted(data_only))}")
        if comment_only:
            msg_parts.append(f"코멘트에만 존재: {', '.join(sorted(comment_only))}")
        results.append(QAResult("P2-C-001", "세특 데이터↔코멘트 매칭", "P2", "WARN",
                                " | ".join(msg_parts)))
    else:
        results.append(QAResult("P2-C-001", "세특 데이터↔코멘트 매칭", "P2", "PASS"))

    return results


def check_changche_volume(changche_data):
    """P2-D: 창체 분량 비율 정합성"""
    results = []
    issues = []

    for d in changche_data:
        yr, area = d[0], d[1]
        pct_str = d[7]  # 비율 문자열
        usage = d[8]    # 활용 판정

        if pct_str == "-" or usage == "-":
            continue

        # 비율 파싱
        try:
            pct = float(pct_str.replace("%", "")) / 100
        except (ValueError, AttributeError):
            continue

        # 판정 검증
        if pct >= 0.95 and usage != "충실활용":
            issues.append(f"{yr}학년 {area}: {pct_str}인데 '{usage}' (충실활용이어야 함)")
        elif 0.80 <= pct < 0.95 and usage != "적정활용":
            issues.append(f"{yr}학년 {area}: {pct_str}인데 '{usage}' (적정활용이어야 함)")
        elif pct < 0.80 and usage != "활용부족":
            issues.append(f"{yr}학년 {area}: {pct_str}인데 '{usage}' (활용부족이어야 함)")

    if issues:
        results.append(QAResult("P2-D-001", "창체 분량 판정 정합성", "P2", "WARN",
                                "\n".join(issues)))
    else:
        results.append(QAResult("P2-D-000", "창체 분량 판정 정합성", "P2", "PASS"))

    return results


# ══════════════════════════════════════════════
#  P3 - 참고 검증 (INFO)
# ══════════════════════════════════════════════

def check_comment_repetition(setuek_comments):
    """P3-A: 코멘트 반복 검출"""
    results = []

    # 모든 코멘트 텍스트 수집
    all_texts = []
    for key, (s, w) in setuek_comments.items():
        all_texts.append((key, "강점", s))
        all_texts.append((key, "보완점", w))

    # 50자 윈도우 슬라이딩 -> 반복 구절 검출
    window_size = 50
    phrase_counts = {}
    for key, label, text in all_texts:
        for i in range(len(text) - window_size + 1):
            phrase = text[i:i+window_size]
            if phrase not in phrase_counts:
                phrase_counts[phrase] = []
            phrase_counts[phrase].append(f"{key}-{label}")

    # 3개 이상 과목에서 반복
    repeated = [(phrase, sources) for phrase, sources in phrase_counts.items()
                if len(set(s.rsplit("-", 1)[0] for s in sources)) >= 3]

    if repeated:
        results.append(QAResult("P3-A-001", f"코멘트 반복 구절 ({len(repeated)}건)", "P3", "WARN",
                                f"50자 이상 동일 구절이 3개 이상 과목에서 반복됨"))
    else:
        results.append(QAResult("P3-A-000", "코멘트 반복 검출", "P3", "PASS"))

    return results


def check_grade_score_consistency(setuek_data, is_major: bool = False):
    """P3-B: 등급-점수 정합성. is_major=True 면 7항목 튜플 구조 기준."""
    _, score_end, _ = _resolve_setuek_mode(setuek_data, is_major)
    results = []
    issues = []

    for d in setuek_data:
        yr, subj = d[0], d[1]
        scores = d[2:score_end]
        grade = d[score_end + 1]

        # 모든 점수 8+인데 등급이 B 이하
        if all(s >= 8 for s in scores) and grade in ("B", "C", "D"):
            issues.append(f"{subj}({yr}학년): 모든 점수 8+인데 등급 {grade}")

        # 모든 점수 4 이하인데 등급이 A 이상
        if all(s <= 4 for s in scores) and grade in ("S", "A"):
            issues.append(f"{subj}({yr}학년): 모든 점수 4이하인데 등급 {grade}")

    if issues:
        results.append(QAResult("P3-B-001", "등급-점수 정합성", "P3", "WARN",
                                "\n".join(issues)))
    else:
        results.append(QAResult("P3-B-000", "등급-점수 정합성", "P3", "PASS"))

    return results


def check_attendance_structure(attendance_data, volunteer_data):
    """P1-F: 출결/봉사 데이터 구조 검증 (G7, 2026-04-17).
    - 출결 카운트가 음수이면 FAIL
    - 봉사 시간이 음수이면 FAIL
    - attendance_data 비어있으면 INFO (건너뜀)
    """
    results = []
    issues = []

    # 출결
    if isinstance(attendance_data, dict) and attendance_data:
        for yr, entry in attendance_data.items():
            if not isinstance(entry, dict):
                continue
            for t in ("결석", "지각", "조퇴", "결과"):
                sub = entry.get(t, {})
                if not isinstance(sub, dict):
                    continue
                for r in ("질병", "미인정", "기타"):
                    v = sub.get(r, 0)
                    try:
                        n = int(v)
                    except (TypeError, ValueError):
                        issues.append(f"{yr}학년 {t}_{r} 값 '{v}' (정수 아님)")
                        continue
                    if n < 0:
                        issues.append(f"{yr}학년 {t}_{r} = {n} (음수)")
    # 봉사
    if isinstance(volunteer_data, dict) and volunteer_data:
        for yr, entry in volunteer_data.items():
            if not isinstance(entry, dict):
                continue
            hrs = entry.get("hours", 0)
            try:
                h = int(hrs)
            except (TypeError, ValueError):
                issues.append(f"{yr}학년 봉사시간 '{hrs}' (정수 아님)")
                continue
            if h < 0:
                issues.append(f"{yr}학년 봉사시간 = {h} (음수)")

    # 결과 판정
    has_data = bool(attendance_data) or bool(volunteer_data)
    if issues:
        results.append(QAResult(
            "P1-F-001", "출결/봉사 데이터 구조", "P1", "FAIL",
            f"이상치 {len(issues)}건: " + "; ".join(issues[:3]) + ("..." if len(issues) > 3 else ""),
            str(issues[0]), "모든 카운트 ≥ 0 정수",
            "attendance_data / volunteer_data 값 수정"))
    elif has_data:
        results.append(QAResult("P1-F-000", "출결/봉사 데이터 구조", "P1", "PASS"))
    else:
        results.append(QAResult(
            "P1-F-INFO", "출결/봉사 데이터 미입력", "P1", "INFO",
            "attendance_data / volunteer_data 비어있음. 출결·봉사 시트 생성 스킵됨."))
    return results


def check_compare_data_structure(compare_data, expected_strengths_count: int = 0,
                                   expected_issues_count: int = 0):
    """P1-G / P2-G (G3+G4 2026-04-17): compare_data 구조/enum/근거/글자수 검증.

    expected_strengths_count: 이전 리포트에서 추출한 핵심강점 개수 (compare_generator 제공)
    expected_issues_count: 이전 보완영역 + fix_items 개수 (compare_generator 제공)

    compare_data 가 비어있으면 모든 체크 스킵 (최초 분석).
    """
    results = []
    if not isinstance(compare_data, dict) or not compare_data:
        # 최초 분석 — 검증 스킵
        return results

    # 가져오기
    st_tracking = compare_data.get("strengths_tracking", []) or []
    is_tracking = compare_data.get("issues_tracking", []) or []
    new_strengths = compare_data.get("new_strengths", []) or []
    new_issues = compare_data.get("new_issues", []) or []
    growth_comment = str(compare_data.get("growth_comment", "") or "")

    # ── P1-G-001: strengths_tracking 항목 수 ──
    if expected_strengths_count > 0 and len(st_tracking) < expected_strengths_count:
        results.append(QAResult(
            "P1-G-001", "이전 핵심강점 tracking 누락", "P1", "FAIL",
            f"이전 핵심강점 {expected_strengths_count}개 중 {len(st_tracking)}개만 tracking",
            str(len(st_tracking)), str(expected_strengths_count),
            "이전 리포트의 모든 핵심강점을 strengths_tracking 에 포함"))
    else:
        results.append(QAResult("P1-G-001", "strengths_tracking 개수", "P1", "PASS"))

    # ── P1-G-002: issues_tracking 항목 수 ──
    if expected_issues_count > 0 and len(is_tracking) < expected_issues_count:
        results.append(QAResult(
            "P1-G-002", "이전 보완점 tracking 누락", "P1", "FAIL",
            f"이전 보완영역+fix_items {expected_issues_count}개 중 {len(is_tracking)}개만 tracking",
            str(len(is_tracking)), str(expected_issues_count),
            "이전 리포트의 모든 보완점(종합요약 보완영역+역량별보완법 fix_items) 을 issues_tracking 에 포함"))
    else:
        results.append(QAResult("P1-G-002", "issues_tracking 개수", "P1", "PASS"))

    # ── P1-G-003: strengths_tracking 현재상태 enum ──
    valid_st = {"강화됨", "유지됨", "약화됨"}
    st_enum_issues = []
    for i, s in enumerate(st_tracking):
        if not isinstance(s, dict):
            st_enum_issues.append(f"#{i+1}: dict 아님")
            continue
        state = s.get("현재상태", "")
        if state not in valid_st:
            st_enum_issues.append(f"#{i+1} '{state}'")
    if st_enum_issues:
        results.append(QAResult(
            "P1-G-003", "strengths_tracking.현재상태 enum", "P1", "FAIL",
            f"유효 값 {valid_st} 이외: " + "; ".join(st_enum_issues[:3]) + ("..." if len(st_enum_issues) > 3 else ""),
            "?", " | ".join(sorted(valid_st)),
            "현재상태 값을 강화됨/유지됨/약화됨 중 하나로 수정"))
    elif st_tracking:
        results.append(QAResult("P1-G-003", "strengths_tracking.현재상태 enum", "P1", "PASS"))

    # ── P1-G-004: issues_tracking 상태 enum ──
    valid_is = {"반영됨", "부분반영", "미반영"}
    is_enum_issues = []
    for i, s in enumerate(is_tracking):
        if not isinstance(s, dict):
            is_enum_issues.append(f"#{i+1}: dict 아님")
            continue
        state = s.get("상태", "")
        if state not in valid_is:
            is_enum_issues.append(f"#{i+1} '{state}'")
    if is_enum_issues:
        results.append(QAResult(
            "P1-G-004", "issues_tracking.상태 enum", "P1", "FAIL",
            f"유효 값 {valid_is} 이외: " + "; ".join(is_enum_issues[:3]) + ("..." if len(is_enum_issues) > 3 else ""),
            "?", " | ".join(sorted(valid_is)),
            "상태 값을 반영됨/부분반영/미반영 중 하나로 수정"))
    elif is_tracking:
        results.append(QAResult("P1-G-004", "issues_tracking.상태 enum", "P1", "PASS"))

    # ── P1-G-005: 근거 필드 비어있지 않음 ──
    reason_missing = []
    for i, s in enumerate(st_tracking):
        if isinstance(s, dict) and not str(s.get("근거", "")).strip():
            reason_missing.append(f"strengths#{i+1}")
    for i, s in enumerate(is_tracking):
        if isinstance(s, dict) and not str(s.get("근거", "")).strip():
            reason_missing.append(f"issues#{i+1}")
    if reason_missing:
        results.append(QAResult(
            "P1-G-005", "tracking 근거 필드 누락", "P1", "FAIL",
            f"근거 비어있음 {len(reason_missing)}건: " + ", ".join(reason_missing[:5]) + ("..." if len(reason_missing) > 5 else ""),
            "empty", "비어있지 않은 근거 문자열",
            "각 tracking 항목에 구체적 근거(학생부 원문 인용 또는 비교 분석) 기록"))
    elif st_tracking or is_tracking:
        results.append(QAResult("P1-G-005", "tracking 근거 필드", "P1", "PASS"))

    # ── P2-G-001: growth_comment 글자수 ──
    if growth_comment:
        if len(growth_comment) < 200:
            results.append(QAResult(
                "P2-G-001", "growth_comment 글자수", "P2", "WARN",
                f"{len(growth_comment)}자 (최소 200자)",
                str(len(growth_comment)), "≥200",
                "성장 코멘트를 최소 200자 이상으로 확장 (방향/두드러진 변화/남은 과제 포함)"))
        else:
            results.append(QAResult("P2-G-001", f"growth_comment 글자수 ({len(growth_comment)}자)", "P2", "PASS"))

    # ── P2-G-002: new_strengths / new_issues 개수 ──
    if not new_strengths:
        results.append(QAResult(
            "P2-G-002a", "new_strengths 개수", "P2", "WARN",
            "새로 발견된 강점 0개. 이전 분석에 없던 강점 포함 권장 (최소 1개)"))
    if not new_issues:
        results.append(QAResult(
            "P2-G-002b", "new_issues 개수", "P2", "WARN",
            "새로 발견된 보완점 0개. 이전 분석에 없던 보완점 포함 권장 (최소 1개)"))
    if new_strengths and new_issues:
        results.append(QAResult("P2-G-002", "new_strengths/new_issues 개수", "P2", "PASS"))

    return results


def check_mode_consistency(setuek_data, target_major: str):
    """P1-E: 메타(TARGET_MAJOR) ↔ setuek_data 튜플 길이 일관성 검증.
    - 지정 모드 (TARGET_MAJOR 있음): 튜플 길이 11 이어야 함 (학년+과목+7점수+합산+등급)
    - 미지정 모드 (TARGET_MAJOR 없음): 튜플 길이 10 이어야 함
    """
    results = []
    is_major = bool(target_major and str(target_major).strip())
    expected_len = 11 if is_major else 10
    mode_label = "지정 모드 (7항목)" if is_major else "미지정 모드 (6항목)"

    if not setuek_data:
        return results  # 데이터 없으면 스킵 (다른 체크에서 잡힘)

    mismatch = []
    for d in setuek_data:
        if len(d) != expected_len:
            subj_label = f"{d[1]}({d[0]}학년)" if len(d) >= 2 else "?"
            mismatch.append(f"{subj_label} 튜플 길이 {len(d)}")

    if mismatch:
        results.append(QAResult(
            "P1-E-001", f"모드-데이터 일관성 ({mode_label})", "P1", "FAIL",
            f"TARGET_MAJOR='{target_major}' 기준 튜플 길이 {expected_len} 예상. 불일치 {len(mismatch)}건: "
            + ", ".join(mismatch[:3]) + ("..." if len(mismatch) > 3 else ""),
            f"{mismatch[0]} 등", str(expected_len),
            "TARGET_MAJOR 값과 setuek_data 튜플 점수 개수가 일치하도록 수정"))
    else:
        results.append(QAResult(
            "P1-E-000", f"모드-데이터 일관성 ({mode_label})", "P1", "PASS"))

    return results


# ══════════════════════════════════════════════
#  통합 실행
# ══════════════════════════════════════════════

def run_full_qa(setuek_data, setuek_comments, good_sentences,
                changche_data, haengtuk_data, haengtuk_comments,
                linkage_data, fix_data, student_name="",
                target_major: str = "",
                attendance_data=None, volunteer_data=None,
                compare_data=None,
                expected_strengths_count: int = 0,
                expected_issues_count: int = 0):
    """전체 QA 검증 실행.
    target_major: 지원 학과명 (빈 문자열이면 미지정 모드, 값 있으면 지정 모드).
    attendance_data / volunteer_data: G7 출결·봉사 (선택, None/빈 dict 허용).
    compare_data: G3/G4 이전 대비 변화 (선택).
    expected_*_count: compare_generator 가 이전 리포트에서 추출한 개수 (P1-G-001/002 검증용).
    """
    report = QAReport(
        student_name=student_name,
        date_str=date.today().strftime("%Y-%m-%d"),
    )
    is_major = bool(target_major and str(target_major).strip())
    attendance_data = attendance_data or {}
    volunteer_data = volunteer_data or {}
    compare_data = compare_data or {}

    # P1 - 필수
    report.results.extend(
        check_structural_completeness(setuek_data, setuek_comments, good_sentences,
                                       changche_data, haengtuk_comments, linkage_data, fix_data))

    # 모드-데이터 일관성 먼저 확인. FAIL 이면 튜플 구조가 깨져 있어
    # 세특 계산 체크(weighted_averages, grade_matching 등) 가 크래시할 수 있으므로 스킵.
    mode_results = check_mode_consistency(setuek_data, target_major)
    report.results.extend(mode_results)
    mode_ok = all(r.status != "FAIL" for r in mode_results)

    if mode_ok:
        report.results.extend(check_score_ranges(setuek_data, changche_data, haengtuk_data, is_major=is_major))
        report.results.extend(check_weighted_averages(setuek_data, is_major=is_major))
        report.results.extend(check_grade_matching(setuek_data, is_major=is_major))
    else:
        # 세특 계산 검증 스킵 안내만 기록
        report.results.append(QAResult(
            "P1-SKIP", "세특 계산 검증 스킵", "P1", "INFO",
            "모드-데이터 불일치로 인해 점수 범위/가중합산/등급 일치 검증을 스킵함. P1-E 항목 먼저 수정 필요."))

    # P1-F (G7 2026-04-17): 출결/봉사 데이터 구조
    report.results.extend(check_attendance_structure(attendance_data, volunteer_data))

    # P1-G / P2-G (G3+G4 2026-04-17): compare_data 구조/enum/근거/글자수
    report.results.extend(check_compare_data_structure(
        compare_data,
        expected_strengths_count=expected_strengths_count,
        expected_issues_count=expected_issues_count,
    ))

    # P2 - 중요
    report.results.extend(check_char_counts(setuek_comments, haengtuk_comments, linkage_data, fix_data))
    report.results.extend(check_good_sentences_completeness(good_sentences, setuek_data))
    report.results.extend(check_cross_references(setuek_data, setuek_comments, good_sentences))
    report.results.extend(check_changche_volume(changche_data))

    # P3 - 참고
    report.results.extend(check_comment_repetition(setuek_comments))
    if mode_ok:
        report.results.extend(check_grade_score_consistency(setuek_data, is_major=is_major))

    return report


def print_qa_report(report: QAReport):
    """QA 검증 결과 콘솔 출력"""
    print()
    print("=" * 60)
    print(f"  QA 검증 리포트")
    print(f"  학생: {report.student_name} | 검증일: {report.date_str}")
    print("=" * 60)
    print()

    status_icons = {"PASS": "OK", "FAIL": "XX", "WARN": "!!", "INFO": "--"}

    # 우선순위별 그룹핑
    for priority in ["P1", "P2", "P3"]:
        priority_results = [r for r in report.results if r.priority == priority]
        if not priority_results:
            continue

        label = {"P1": "필수 검증", "P2": "중요 검증", "P3": "참고 검증"}[priority]
        print(f"  [{priority}] {label}")
        print(f"  {'-' * 50}")

        for r in priority_results:
            icon = status_icons.get(r.status, "?")
            print(f"    {icon} [{r.status:4s}] {r.check_name}")
            if r.status in ("FAIL", "WARN") and r.message:
                for line in r.message.split("\n")[:3]:
                    print(f"           -> {line}")
                if r.remediation:
                    print(f"           수정: {r.remediation}")
        print()

    # 요약
    print("=" * 60)
    total = len(report.results)
    p = report.pass_count()
    f = report.fail_count()
    w = report.warn_count()

    if f > 0:
        overall = "FAIL"
        action = "리포트 생성 차단 - FAIL 항목 수정 후 재실행 필요"
    elif w > 0:
        overall = f"PASS (경고 {w}건)"
        action = "리포트 생성 진행 가능 - 경고 항목 검토 권장"
    else:
        overall = "PASS"
        action = "리포트 생성 진행 가능"

    print(f"  결과: {overall}")
    print(f"  통과 {p}건 / 실패 {f}건 / 경고 {w}건 (총 {total}건)")
    print(f"  -> {action}")
    print("=" * 60)
    print()
