"""
고등학교 상담시스템 기획서 V3 — 4영역 점수 산출 엔진

4각형 레이더: 내신 경쟁력(100) / 모의고사 역량(100) / 학습 습관&전략(100) / 진로·전형 전략(100)
종합 등급: S(90~100) / A(75~89) / B(55~74) / C(35~54) / D(0~34)
"""

from typing import Any


# ============================================================
# 공통 유틸
# ============================================================

def _sf(v: Any) -> float | None:
    """안전한 float 변환."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _grade_label(score: float) -> str:
    """100점 만점 점수 → S/A/B/C/D 등급."""
    if score >= 90:
        return "S"
    if score >= 75:
        return "A"
    if score >= 55:
        return "B"
    if score >= 35:
        return "C"
    return "D"


def _range_score(value: float, table: list[tuple[float, float, float]], desc: bool = False) -> float:
    """범위 테이블에서 점수 매핑. table: [(min_val, max_val, score), ...]"""
    for lo, hi, sc in table:
        if desc:
            if lo <= value < hi:
                return sc
        else:
            if lo <= value <= hi:
                return sc
    return table[-1][2] if table else 0


# ============================================================
# 5-1. 내신 경쟁력 (100점)
# ============================================================

# ① 전과목 평균 등급 → 40점
_GRADE_ALL_TABLE = [
    (1.0, 1.3, 40), (1.3, 1.6, 36), (1.6, 2.0, 32), (2.0, 2.5, 26),
    (2.5, 3.0, 20), (3.0, 3.5, 14), (3.5, 4.0, 8), (4.0, 5.0, 4),
]

# ② 주요 과목(국수영탐) 평균 등급 → 25점
_GRADE_MAJOR_TABLE = [
    (1.0, 1.3, 25), (1.3, 1.6, 22), (1.6, 2.0, 19), (2.0, 2.5, 15),
    (2.5, 3.0, 11), (3.0, 3.5, 7), (3.5, 4.0, 4), (4.0, 5.0, 2),
]

# ④ 과목 간 균형도 (최고-최저 등급 차이) → 10점
_BALANCE_TABLE = {0: 10, 1: 8, 2: 5, 3: 3}  # 4+: 1


def _calc_naesin_score(answers: dict, timing: str | None = None) -> dict:
    """5-1. 내신 경쟁력 100점 산출."""
    cat_b = answers.get("B", {})
    major_cats = {"ko", "en", "ma", "sc1", "sc2"}  # 국수영탐
    semesters = ["B1", "B2", "B3", "B4"]

    # 가장 최근 학기 데이터 찾기
    latest_grades_all: list[float] = []
    latest_grades_major: list[float] = []
    latest_performance_issues = 0  # 수행 비중 높은데 평균 이하인 과목 수
    has_high_perf = False  # 수행 비중 40%+ 과목 존재 여부

    # 모든 학기 평균 등급 (추이용)
    semester_avgs: list[float] = []

    for sem_key in semesters:
        sem_data = cat_b.get(sem_key)
        if not sem_data or not isinstance(sem_data, dict):
            continue
        sem_grades = []
        for subj_key, subj_data in sem_data.items():
            if not isinstance(subj_data, dict):
                continue
            grade = _sf(subj_data.get("rank_grade"))
            if grade is not None:
                sem_grades.append(grade)
        if sem_grades:
            semester_avgs.append(round(sum(sem_grades) / len(sem_grades), 2))

    # 최근 학기 상세 분석
    for sem_key in reversed(semesters):
        sem_data = cat_b.get(sem_key)
        if not sem_data or not isinstance(sem_data, dict):
            continue
        for subj_key, subj_data in sem_data.items():
            if not isinstance(subj_data, dict):
                continue
            grade = _sf(subj_data.get("rank_grade"))
            if grade is None:
                continue
            latest_grades_all.append(grade)
            cat = subj_data.get("category", "")
            code = subj_key
            if cat in ("국어", "수학", "영어", "과학") or code in major_cats:
                latest_grades_major.append(grade)
            # 수행평가 비중 체크
            ratio_str = subj_data.get("exam_ratio", "")
            if ratio_str and ":" in str(ratio_str):
                parts = str(ratio_str).split(":")
                try:
                    perf_ratio = float(parts[1]) if len(parts) > 1 else 0
                except ValueError:
                    perf_ratio = 0
                if perf_ratio >= 40:
                    has_high_perf = True
                    avg_grade = sum(latest_grades_all) / len(latest_grades_all) if latest_grades_all else 3
                    if grade > avg_grade:
                        latest_performance_issues += 1
        if latest_grades_all:
            break  # 최근 학기만

    # ① 전과목 평균 등급
    avg_all = sum(latest_grades_all) / len(latest_grades_all) if latest_grades_all else 5.0
    score_1 = _range_score(avg_all, _GRADE_ALL_TABLE)

    # ② 주요 과목 평균 등급
    avg_major = sum(latest_grades_major) / len(latest_grades_major) if latest_grades_major else 5.0
    score_2 = _range_score(avg_major, _GRADE_MAJOR_TABLE)

    # ③ 등급 추이 (15점)
    is_t1 = timing == "T1"
    if is_t1 or len(semester_avgs) < 2:
        score_3 = 10  # 중립
        trend_label = "데이터부족"
    else:
        diff = semester_avgs[-1] - semester_avgs[0]  # 등급: 감소=상승
        # 학기 간 편차 체크
        max_swing = 0
        for i in range(len(semester_avgs) - 1):
            max_swing = max(max_swing, abs(semester_avgs[i + 1] - semester_avgs[i]))
        if diff <= -0.3:
            score_3, trend_label = 15, "상승"
        elif abs(diff) < 0.3 and max_swing <= 0.5:
            score_3, trend_label = 10, "유지"
        elif abs(diff) < 0.3 and max_swing > 0.5:
            score_3, trend_label = 7, "등락"
        else:
            score_3, trend_label = 4, "하락"

    # ④ 과목 간 균형도 (10점)
    if latest_grades_all:
        gap = round(max(latest_grades_all) - min(latest_grades_all))
        score_4 = _BALANCE_TABLE.get(gap, 1)
    else:
        score_4 = 5

    # ⑤ 수행평가 비중 대응력 (10점)
    if not has_high_perf:
        score_5 = 7  # 중립
    elif latest_performance_issues == 0:
        score_5 = 10
    elif latest_performance_issues == 1:
        score_5 = 7
    elif latest_performance_issues == 2:
        score_5 = 4
    else:
        score_5 = 2

    total = score_1 + score_2 + score_3 + score_4 + score_5
    return {
        "total": total,
        "grade": _grade_label(total),
        "details": {
            "전과목_평균등급": {"score": score_1, "max": 40, "value": round(avg_all, 2)},
            "주요과목_평균등급": {"score": score_2, "max": 25, "value": round(avg_major, 2)},
            "등급추이": {"score": score_3, "max": 15, "value": trend_label},
            "과목간_균형도": {"score": score_4, "max": 10, "value": round(max(latest_grades_all) - min(latest_grades_all), 1) if latest_grades_all else None},
            "수행평가_대응력": {"score": score_5, "max": 10},
        },
    }


# ============================================================
# 5-2. 모의고사 역량 (100점)
# ============================================================

_PERCENTILE_TABLE = [
    (95, 100, 30), (90, 95, 27), (85, 90, 24), (80, 85, 20),
    (70, 80, 15), (60, 70, 10), (50, 60, 6), (40, 50, 3), (0, 40, 1),
]

_ENG_TABLE = [(90, 100, 15), (80, 90, 10), (70, 80, 6), (0, 70, 2)]

_PERCENTILE_OVERALL_TABLE = [
    (90, 100, 20), (80, 90, 16), (70, 80, 12), (60, 70, 8), (50, 60, 5), (0, 50, 2),
]


def _calc_mock_score(answers: dict, timing: str | None = None) -> dict:
    """5-2. 모의고사 역량 100점 산출."""
    cat_c = answers.get("C", {})
    mock_data = cat_c.get("C1")
    if not mock_data or not isinstance(mock_data, dict):
        return {"total": 0, "grade": "D", "details": {}, "no_data": True}

    areas_no_eng = ["korean", "math", "inquiry1", "inquiry2"]
    all_sessions_pctiles: list[list[float]] = []  # 세션별 백분위 리스트
    all_eng_scores: list[float] = []
    all_pctiles_flat: list[float] = []  # 통산용

    sorted_sessions = sorted(mock_data.items(), key=lambda x: x[0])
    for session_key, session in sorted_sessions:
        if not isinstance(session, dict):
            continue
        pctiles = []
        for area in areas_no_eng:
            area_data = session.get(area, {})
            if isinstance(area_data, dict):
                p = _sf(area_data.get("percentile"))
                if p is not None:
                    pctiles.append(p)
                    all_pctiles_flat.append(p)
        all_sessions_pctiles.append(pctiles)
        eng = session.get("english", {})
        if isinstance(eng, dict):
            raw = _sf(eng.get("raw_score"))
            if raw is not None:
                all_eng_scores.append(raw)

    # ① 최근 모의 국수탐 백분위 평균 (30점)
    if all_sessions_pctiles and all_sessions_pctiles[-1]:
        latest_avg = sum(all_sessions_pctiles[-1]) / len(all_sessions_pctiles[-1])
    else:
        latest_avg = 0
    score_1 = _range_score(latest_avg, _PERCENTILE_TABLE)

    # ② 영어 원점수 (15점) — 최근
    if all_eng_scores:
        score_2 = _range_score(all_eng_scores[-1], _ENG_TABLE)
        eng_val = all_eng_scores[-1]
    else:
        score_2 = 7  # 중립
        eng_val = None

    # ③ 백분위 추이 (20점)
    is_t1 = timing == "T1"
    session_avgs = [sum(s) / len(s) for s in all_sessions_pctiles if s]
    if is_t1 or len(session_avgs) < 2:
        score_3 = 13
        pctile_trend = "데이터부족"
    else:
        diff = session_avgs[-1] - session_avgs[0]
        max_swing = max(abs(session_avgs[i + 1] - session_avgs[i]) for i in range(len(session_avgs) - 1))
        if diff >= 5:
            score_3, pctile_trend = 20, "상승"
        elif abs(diff) < 5 and max_swing <= 10:
            score_3, pctile_trend = 13, "유지"
        elif abs(diff) < 5 and max_swing > 10:
            score_3, pctile_trend = 8, "등락"
        else:
            score_3, pctile_trend = 4, "하락"

    # ④ 취약 영역 유무 (15점)
    if all_sessions_pctiles and all_sessions_pctiles[-1] and len(all_sessions_pctiles[-1]) >= 2:
        latest_pctiles = all_sessions_pctiles[-1]
        avg_p = sum(latest_pctiles) / len(latest_pctiles)
        weak_count = sum(1 for p in latest_pctiles if p < avg_p - 15)
        if weak_count == 0:
            score_4 = 15
        elif weak_count == 1:
            score_4 = 9
        else:
            score_4 = 4
    else:
        score_4 = 8  # 중립

    # ⑤ 통산 백분위 수준 (20점)
    if all_pctiles_flat:
        overall_avg = sum(all_pctiles_flat) / len(all_pctiles_flat)
    else:
        overall_avg = 0
    score_5 = _range_score(overall_avg, _PERCENTILE_OVERALL_TABLE)

    total = score_1 + score_2 + score_3 + score_4 + score_5
    return {
        "total": total,
        "grade": _grade_label(total),
        "details": {
            "최근_백분위평균": {"score": score_1, "max": 30, "value": round(latest_avg, 1)},
            "영어_원점수": {"score": score_2, "max": 15, "value": eng_val},
            "백분위_추이": {"score": score_3, "max": 20, "value": pctile_trend},
            "취약영역_유무": {"score": score_4, "max": 15},
            "통산_백분위수준": {"score": score_5, "max": 20, "value": round(overall_avg, 1)},
        },
    }


# ============================================================
# 5-3. 학습 습관 & 전략 (100점)
# ============================================================

def _calc_study_score(answers: dict) -> dict:
    """5-3. 학습 습관 & 전략 100점 산출."""
    cat_d = answers.get("D", {})

    # --- D1: 학습 스케줄 ---
    d1 = cat_d.get("D1", {})
    schedule = d1 if isinstance(d1, list) else d1.get("schedule") if isinstance(d1, dict) else None
    total_hours = 0.0
    by_type: dict[str, float] = {}
    by_subject: dict[str, float] = {}
    if schedule and isinstance(schedule, list):
        for entry in schedule:
            if not isinstance(entry, dict):
                continue
            h = _sf(entry.get("hours"))
            if h is None:
                continue
            total_hours += h
            t = entry.get("type", "자기주도")
            by_type[t] = by_type.get(t, 0) + h
            s = entry.get("subject", "기타")
            by_subject[s] = by_subject.get(s, 0) + h

    self_study = by_type.get("자기주도", 0) + by_type.get("자기주도 학습", 0)
    self_ratio = (self_study / total_hours * 100) if total_hours > 0 else 0

    # ① 자기주도 비율 (15점)
    if self_ratio >= 50: s1 = 15
    elif self_ratio >= 40: s1 = 12
    elif self_ratio >= 30: s1 = 9
    elif self_ratio >= 20: s1 = 6
    elif self_ratio >= 10: s1 = 3
    else: s1 = 1

    # ② 자기주도 학습 시간 (10점)
    if self_study >= 20: s2 = 10
    elif self_study >= 15: s2 = 8
    elif self_study >= 10: s2 = 6
    elif self_study >= 5: s2 = 4
    else: s2 = 2

    # ③ 과목별 학습 밸런스 (10점)
    main_subjects = {"국어", "수학", "영어", "사회", "과학"}
    zero_count = sum(1 for s in main_subjects if by_subject.get(s, 0) == 0)
    if zero_count == 0: s3 = 10
    elif zero_count == 1: s3 = 7
    elif zero_count == 2: s3 = 4
    elif zero_count == 3: s3 = 2
    else: s3 = 1

    # --- D2: 학습 계획 및 실행력 (15점) ---
    d2 = cat_d.get("D2", {})
    if isinstance(d2, dict):
        # 슬라이더값 × 0.5 (5점)
        slider_val = _sf(d2.get("plan_execution")) or 5
        s4_slider = min(5, round(slider_val * 0.5, 1))

        # 시험 준비 시작 시점 (5점)
        prep_map = {"상시학습": 5, "2주이상전": 4, "1주전": 3, "3~5일전": 2, "1~2일전": 1}
        s4_prep = prep_map.get(d2.get("test_prep_start", ""), 2)

        # 시험 기간 계획표 작성 (5점)
        plan_map = {"매우구체적": 5, "구체적": 4, "대략적": 2, "안함": 1}
        s4_plan = plan_map.get(d2.get("subject_plan_detail", ""), 2)

        s4 = s4_slider + s4_prep + s4_plan
    else:
        s4 = 7  # 중립

    # --- D2: 내신 대비 방법 적절성 (10점) ---
    if isinstance(d2, dict):
        materials = d2.get("study_materials", [])
        if not isinstance(materials, list):
            materials = []
        essentials = {"교과서", "프린트필기", "이전기출"}
        ess_count = sum(1 for m in materials if m in essentials)
        total_sel = len(materials)
        if ess_count >= 3 and total_sel >= 4: s5_mat = 6
        elif ess_count >= 2 and total_sel >= 4: s5_mat = 5
        elif ess_count >= 2 and total_sel >= 3: s5_mat = 4
        elif ess_count >= 1 and total_sel >= 3: s5_mat = 3
        elif total_sel >= 2: s5_mat = 2
        elif total_sel >= 1 and ess_count >= 1: s5_mat = 1
        else: s5_mat = 0

        exam_map = {"반드시구해서분석": 4, "있으면풀어봄": 2, "안함": 0}
        s5_exam = exam_map.get(d2.get("past_exam_usage", ""), 1)
        s5 = s5_mat + s5_exam
    else:
        s5 = 5

    # --- D3: 오답 관리 품질 (15점) ---
    d3 = cat_d.get("D3", {})
    if isinstance(d3, dict):
        freq_map = {"완전풀때까지": 8, "주1회": 6, "시험직전만": 3, "거의안함": 0}
        s6_freq = freq_map.get(d3.get("review_frequency", ""), 3)

        methods = d3.get("review_method", [])
        if not isinstance(methods, list):
            methods = []
        method_scores = {"유사문제풀이": 7, "개념재확인": 5, "원인분석": 4, "답풀이확인": 1}
        s6_method = max((method_scores.get(m, 0) for m in methods), default=0)
        s6 = s6_freq + s6_method
    else:
        s6 = 7

    # --- D4: 문제 해결 적극성 (10점) ---
    d4 = cat_d.get("D4", [])
    if not isinstance(d4, list):
        d4 = []
    d4_set = set(d4)
    if {"개념서재확인", "혼자고민"} <= d4_set:
        s7 = 10  # S
    elif "개념서재확인" in d4_set or "혼자고민" in d4_set:
        s7 = 8   # A
    elif d4_set & {"학원과외선생님", "학교선생님", "친구"}:
        s7 = 6   # B
    elif d4_set & {"인터넷유튜브", "부모님"}:
        s7 = 4   # C
    elif d4_set & {"AI도구", "답안지확인"}:
        s7 = 2   # D
    elif "그냥넘어감" in d4_set:
        s7 = 0   # F
    else:
        s7 = 5   # 중립

    # --- D7: 과목별 학습법 적절성 (10점) ---
    d7 = cat_d.get("D7", {})
    if isinstance(d7, dict) and d7:
        method_counts = []
        satisfaction_scores = []
        sat_map = {"만족": 1, "보통": 0.5, "불만족": 0}
        for subj_key, subj_data in d7.items():
            if not isinstance(subj_data, dict):
                continue
            methods = subj_data.get("study_method", [])
            if isinstance(methods, list):
                method_counts.append(len(methods))
            sat = subj_data.get("satisfaction", "")
            if sat in sat_map:
                satisfaction_scores.append(sat_map[sat])

        # 다양성 (5점)
        avg_methods = sum(method_counts) / len(method_counts) if method_counts else 0
        if avg_methods >= 4: s8_div = 5
        elif avg_methods >= 3: s8_div = 4
        elif avg_methods >= 2: s8_div = 2
        else: s8_div = 1

        # 만족도 (5점)
        if satisfaction_scores:
            sat_ratio = sum(1 for s in satisfaction_scores if s == 1) / len(satisfaction_scores)
            if sat_ratio >= 0.6: s8_sat = 5
            elif sat_ratio >= 0.3: s8_sat = 3
            else: s8_sat = 1
        else:
            s8_sat = 3
        s8 = s8_div + s8_sat
    else:
        s8 = 5

    # --- D8: 학습 심리 및 컨디션 (5점) ---
    d8 = cat_d.get("D8", {})
    if isinstance(d8, dict):
        warnings = 0
        if d8.get("test_anxiety") == "자주": warnings += 1
        if d8.get("motivation") in ("매우낮음", "낮음"): warnings += 1
        if d8.get("study_load") == "많이버거움": warnings += 1
        sleep = d8.get("sleep_hours", "")
        if sleep == "under5": warnings += 1
        giveup = d8.get("subject_giveup", {})
        has_giveup = giveup.get("has_giveup", "") == "고민중" if isinstance(giveup, dict) else False

        if has_giveup or warnings >= 3:
            s9 = 1
        elif warnings == 2:
            s9 = 2
        elif warnings == 1:
            s9 = 3
        else:
            s9 = 5
    else:
        s9 = 3

    total = s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8 + s9
    return {
        "total": total,
        "grade": _grade_label(total),
        "details": {
            "자기주도_비율": {"score": s1, "max": 15, "value": round(self_ratio, 1)},
            "자기주도_시간": {"score": s2, "max": 10, "value": round(self_study, 1)},
            "과목별_밸런스": {"score": s3, "max": 10, "value": f"{zero_count}개 과목 0시간"},
            "학습계획_실행력": {"score": s4, "max": 15},
            "내신대비_적절성": {"score": s5, "max": 10},
            "오답관리_품질": {"score": s6, "max": 15},
            "문제해결_적극성": {"score": s7, "max": 10},
            "과목별_학습법": {"score": s8, "max": 10},
            "학습심리_컨디션": {"score": s9, "max": 5},
        },
    }


# ============================================================
# 5-4. 진로·전형 전략 명확도 (100점)
# ============================================================

def _calc_career_score(answers: dict, timing: str | None = None) -> dict:
    """5-4. 진로·전형 전략 명확도 100점 산출."""
    cat_e = answers.get("E", {})

    # ① 진로 구체성 (30점)
    e1 = cat_e.get("E1", [])
    if not isinstance(e1, list):
        e1 = [e1] if e1 else []
    # career_select: 탐색중 / 대분류만 / 중분류 선택
    has_exploring = any(
        (isinstance(v, str) and "탐색" in v) or (isinstance(v, dict) and v.get("key") == "exploring")
        for v in e1
    )
    # 중분류 선택 수 세기
    subcategory_count = 0
    has_only_major = False
    for v in e1:
        if isinstance(v, dict):
            if v.get("subcategory") or v.get("sub"):
                subcategory_count += 1
            elif v.get("category") or v.get("major"):
                has_only_major = True
        elif isinstance(v, str) and "탐색" not in v:
            has_only_major = True

    if subcategory_count >= 2:
        s1 = 30
    elif subcategory_count == 1:
        s1 = 25
    elif has_only_major:
        s1 = 15
    elif has_exploring or not e1:
        s1 = 5
    else:
        s1 = 10

    # ② 목표 대학 구체성 (15점)
    e2 = cat_e.get("E2", {})
    if isinstance(e2, dict):
        targets = e2.get("target_universities", [])
        if not isinstance(targets, list):
            targets = []
        target_count = len([t for t in targets if t and str(t).strip()])
        level = e2.get("target_level", "")

        if target_count >= 2:
            s2 = 15
        elif target_count == 1:
            s2 = 12
        elif level and level != "미정":
            s2 = 8
        else:
            s2 = 3
    else:
        s2 = 3

    # ③ 전형 이해도 (20점)
    e3 = cat_e.get("E3", {})
    if isinstance(e3, dict):
        understanding = _sf(e3.get("understanding")) or 5
        if understanding >= 9: s3 = 20
        elif understanding >= 7: s3 = 16
        elif understanding >= 5: s3 = 12
        elif understanding >= 3: s3 = 8
        else: s3 = 4
    else:
        s3 = 10

    # ④ 전형-성적 정합성 (20점)
    # E3 방향 vs C4 상담사 유형 판정 매칭
    # C4는 admin이 입력하는 값 — answers에 없을 수 있음
    if isinstance(e3, dict):
        main_track = e3.get("main_track", "미정")
    else:
        main_track = "미정"

    # 상담사 유형 판정 (admin이 입력 — answers.C.C4에 저장될 수 있음)
    cat_c = answers.get("C", {})
    c4_type = cat_c.get("C4", "")  # 내신형/균형형/수능형
    if not c4_type:
        c4_type = ""

    match_table = {
        ("수시", "내신형"): 20, ("수시", "균형형"): 14, ("수시", "수능형"): 7,
        ("정시", "내신형"): 7, ("정시", "균형형"): 14, ("정시", "수능형"): 20,
    }
    if c4_type and main_track != "미정":
        s4 = match_table.get((main_track, c4_type), 10)
    else:
        s4 = 10  # 중립

    # ⑤ 수능 최저 대비도 (15점)
    is_t1 = timing == "T1"
    e4 = cat_e.get("E4", {})
    if is_t1 or not isinstance(e4, dict) or not e4:
        s5 = 7  # T1은 E4 비활성 → 중립
    else:
        # 인지 여부 (5점)
        aware_map = {"구체적파악": 5, "일부확인": 3, "모름": 1}
        s5_aware = aware_map.get(e4.get("awareness", ""), 2)

        # 충족 가능성 (5점)
        feas_map = {"여유있음": 5, "충족가능": 4, "1_2영역부족": 2, "불가": 1}
        s5_feas = feas_map.get(e4.get("feasibility", ""), 2)

        # 집중 영역 선택 (5점)
        focus = e4.get("focus_areas", [])
        s5_focus = 5 if (isinstance(focus, list) and len(focus) >= 1) else 1

        s5 = s5_aware + s5_feas + s5_focus

    total = s1 + s2 + s3 + s4 + s5
    return {
        "total": total,
        "grade": _grade_label(total),
        "details": {
            "진로_구체성": {"score": s1, "max": 30},
            "목표대학_구체성": {"score": s2, "max": 15},
            "전형_이해도": {"score": s3, "max": 20},
            "전형성적_정합성": {"score": s4, "max": 20, "value": f"{main_track} vs {c4_type or '미판정'}"},
            "수능최저_대비도": {"score": s5, "max": 15},
        },
    }


# ============================================================
# 종합 산출 — 4각형 레이더
# ============================================================

def compute_radar_scores(answers: dict, timing: str | None = None) -> dict:
    """4영역 점수 + 등급 + 레이더 데이터 산출."""
    naesin = _calc_naesin_score(answers, timing)
    mock = _calc_mock_score(answers, timing)
    study = _calc_study_score(answers)
    career = _calc_career_score(answers, timing)

    radar = {
        "내신_경쟁력": {"score": naesin["total"], "grade": naesin["grade"]},
        "모의고사_역량": {"score": mock["total"], "grade": mock["grade"]},
        "학습습관_전략": {"score": study["total"], "grade": study["grade"]},
        "진로전형_전략": {"score": career["total"], "grade": career["grade"]},
    }

    # 종합 등급 (4영역 평균)
    avg = (naesin["total"] + mock["total"] + study["total"] + career["total"]) / 4
    overall_grade = _grade_label(avg)

    return {
        "radar": radar,
        "overall_score": round(avg, 1),
        "overall_grade": overall_grade,
        "naesin": naesin,
        "mock": mock,
        "study": study,
        "career": career,
    }
