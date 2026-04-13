"""
상담시스템 점수 산출 엔진

[고등학교] 4각형 레이더: 내신 경쟁력(100) / 모의고사 역량(100) / 학습 습관&전략(100) / 진로·전형 전략(100)
[예비고1]  5각형 레이더: 학업기초력(100) / 학습습관&자기주도력(100) / 교과선행도(100) / 진로방향성(100) / 비교과역량(100)
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


# ============================================================
# 예비고1 — 5축 레이더 점수 산출
# ============================================================

# --- 4-1. 학업기초력 (100점) ---

# ① 전과목 평균 원점수 → 50점
_PH1_AVG_SCORE_TABLE = [
    (95, 100.1, 50), (90, 95, 45), (85, 90, 38), (80, 85, 30),
    (75, 80, 22), (70, 75, 15), (65, 70, 8), (0, 65, 3),
]

# ② 과목별 균형도 (최고-최저 차이) → 20점
_PH1_BALANCE_TABLE = [
    (0, 10.1, 20), (10.1, 15.1, 16), (15.1, 20.1, 12),
    (20.1, 26, 6), (26, 101, 0),
]

# ③ 성적 추이 → 20점
_PH1_TREND_MAP = {"상승": 20, "유지": 12, "등락": 8, "하락": 4}


def _calc_ph1_academic_score(answers: dict) -> dict:
    """4-1. 학업기초력 100점."""
    cat_c = answers.get("C", {})
    subjects = ["ko", "en", "ma", "so", "sc"]
    semesters = ["C1", "C2", "C3", "C4", "C5", "C6"]

    # 모든 학기별 과목 원점수 수집
    semester_avgs: list[float] = []
    latest_scores: list[float] = []
    latest_sem_key = None

    for sem_key in semesters:
        sem_data = cat_c.get(sem_key)
        if not sem_data or not isinstance(sem_data, dict):
            continue
        scores = []
        for subj in subjects:
            subj_data = sem_data.get(subj, {})
            if isinstance(subj_data, dict):
                raw = _sf(subj_data.get("raw_score"))
                if raw is not None:
                    scores.append(raw)
        if scores:
            semester_avgs.append(sum(scores) / len(scores))
            latest_scores = scores
            latest_sem_key = sem_key

    # ① 전과목 평균 원점수 (50점)
    avg_raw = sum(latest_scores) / len(latest_scores) if latest_scores else 0
    s1 = _range_score(avg_raw, _PH1_AVG_SCORE_TABLE)

    # ② 과목별 균형도 (20점)
    if len(latest_scores) >= 2:
        gap = max(latest_scores) - min(latest_scores)
        s2 = _range_score(gap, _PH1_BALANCE_TABLE)
    else:
        s2 = 10  # 중립

    # ③ 성적 추이 (20점)
    if len(semester_avgs) >= 2:
        diff = semester_avgs[-1] - semester_avgs[0]
        max_swing = max(
            abs(semester_avgs[i + 1] - semester_avgs[i])
            for i in range(len(semester_avgs) - 1)
        ) if len(semester_avgs) > 1 else 0
        if diff >= 3:
            trend = "상승"
        elif diff <= -3:
            trend = "하락"
        elif max_swing > 5:
            trend = "등락"
        else:
            trend = "유지"
    else:
        trend = "유지"
    s3 = _PH1_TREND_MAP.get(trend, 12)

    # ④ 강점 과목 보유 (10점): 90점 이상 과목 수
    strong_count = sum(1 for sc in latest_scores if sc >= 90)
    s4 = 10 if strong_count >= 2 else (6 if strong_count == 1 else 0)

    total = s1 + s2 + s3 + s4
    return {
        "total": round(total, 1),
        "grade": _grade_label(total),
        "details": {
            "전과목_평균원점수": {"score": s1, "max": 50, "value": round(avg_raw, 1)},
            "과목별_균형도": {"score": s2, "max": 20, "value": round(gap, 1) if len(latest_scores) >= 2 else None},
            "성적_추이": {"score": s3, "max": 20, "value": trend},
            "강점과목_보유": {"score": s4, "max": 10, "value": strong_count},
        },
    }


# --- 4-2. 학습습관 & 자기주도력 (100점) ---

# ① 자기주도 비율 → 20점
_PH1_SELF_RATIO_TABLE = [
    (50, 101, 20), (40, 50, 16), (30, 40, 12),
    (20, 30, 8), (10, 20, 4), (0, 10, 0),
]

# ② 자기주도 학습 시간 (주간) → 15점
_PH1_SELF_HOURS_TABLE = [
    (15, 200, 15), (10, 15, 12), (7, 10, 9),
    (4, 7, 6), (1, 4, 3), (0, 1, 0),
]

# D2 시험 준비 시작 시점 → 8점
_TEST_PREP_MAP = {
    "상시학습": 8, "2주이상전": 7, "1주전": 5, "3_5일전": 3, "1_2일전": 1,
}

# D2 과목별 계획표 작성 → 7점
_PLAN_DETAIL_MAP = {
    "매우구체적": 7, "구체적": 5, "대략적": 3, "안함": 1,
}

# D3 오답 정리 방법 점수
_WRONG_METHOD_SCORES = {
    "안함": 0, "문제집표시": 2, "별도노트": 4, "태블릿앱": 5, "번호체크재풀이": 6,
}

# D3 복습 빈도 → 8점
_REVIEW_FREQ_MAP = {
    "완전풀때까지": 8, "주1회": 6, "시험직전만": 3, "거의안함": 0,
}

# D3 복습 방법 점수
_REVIEW_METHOD_SCORES = {
    "답풀이확인": 1, "원인분석": 3, "개념재확인": 2, "유사문제풀이": 3,
}

# D4 문제 해결 적극성 점수
_SOLVE_METHOD_SCORES = {
    "혼자고민": 2, "답안지확인": 0, "개념서재확인": 2, "인터넷유튜브": 1,
    "AI도구": 1, "학원과외선생님": 1, "학교선생님": 2, "친구": 1,
    "부모님": 0, "그냥넘어감": -2,
}


def _calc_ph1_study_score(answers: dict) -> dict:
    """4-2. 학습습관 & 자기주도력 100점."""
    cat_d = answers.get("D", {})

    # --- D1: 학습 스케줄 분석 ---
    d1 = cat_d.get("D1")
    schedule = d1 if isinstance(d1, list) else (d1.get("schedule") if isinstance(d1, dict) else None)
    if not schedule or not isinstance(schedule, list):
        schedule = []

    total_hours = 0.0
    self_hours = 0.0
    subj_self: dict[str, float] = {}
    for entry in schedule:
        if not isinstance(entry, dict):
            continue
        h = _sf(entry.get("hours")) or 0
        cat = entry.get("category", "")
        subj = entry.get("subject", "기타")
        total_hours += h
        if cat == "self_study":
            self_hours += h
            subj_self[subj] = subj_self.get(subj, 0) + h

    # ① 자기주도 비율 (20점)
    ratio = (self_hours / total_hours * 100) if total_hours > 0 else 0
    s1 = _range_score(ratio, _PH1_SELF_RATIO_TABLE)

    # ② 자기주도 학습 시간 (15점)
    s2 = _range_score(self_hours, _PH1_SELF_HOURS_TABLE)

    # ③ 과목별 학습 밸런스 (10점): 자기주도 0시간 과목 수
    main_subjects = {"국어", "영어", "수학", "사회", "과학"}
    zero_count = sum(1 for s in main_subjects if subj_self.get(s, 0) == 0)
    s3 = max(0, 10 - zero_count * 2)  # 과목당 -2점

    # --- D2: 학습 계획 및 실행력 (25점) ---
    d2 = cat_d.get("D2", {})
    if not isinstance(d2, dict):
        d2 = {}
    plan_exec = _sf(d2.get("plan_execution")) or 0
    s4_exec = min(10, plan_exec * 1.0)  # 슬라이더 1~10 → 최대 10점
    s4_prep = _TEST_PREP_MAP.get(d2.get("test_prep_start", ""), 3)
    s4_plan = _PLAN_DETAIL_MAP.get(d2.get("subject_plan_detail", ""), 1)
    s4 = s4_exec + s4_prep + s4_plan

    # --- D3: 오답 관리 품질 (20점) ---
    d3 = cat_d.get("D3", {})
    if not isinstance(d3, dict):
        d3 = {}
    # 정리 방법 (6점): 가장 높은 점수 1개
    methods = d3.get("method", [])
    if isinstance(methods, list):
        s5_method = max((_WRONG_METHOD_SCORES.get(m, 0) for m in methods), default=0)
    else:
        s5_method = 0

    # 복습 빈도 (8점)
    s5_freq = _REVIEW_FREQ_MAP.get(d3.get("review_frequency", ""), 0)

    # 복습 방법 (6점): 합산 cap 6
    review_methods = d3.get("review_method", [])
    if isinstance(review_methods, list):
        s5_review = min(6, sum(_REVIEW_METHOD_SCORES.get(m, 0) for m in review_methods))
    else:
        s5_review = 0
    s5 = s5_method + s5_freq + s5_review

    # --- D4: 문제 해결 적극성 (10점) ---
    d4 = cat_d.get("D4", [])
    if isinstance(d4, list):
        s6 = min(10, max(0, sum(_SOLVE_METHOD_SCORES.get(m, 0) for m in d4)))
    else:
        s6 = 0

    total = s1 + s2 + s3 + s4 + s5 + s6
    return {
        "total": round(min(100, total), 1),
        "grade": _grade_label(min(100, total)),
        "details": {
            "자기주도_비율": {"score": s1, "max": 20, "value": f"{ratio:.0f}%"},
            "자기주도_학습시간": {"score": s2, "max": 15, "value": f"{self_hours:.1f}h/주"},
            "과목별_밸런스": {"score": s3, "max": 10, "value": f"0시간과목 {zero_count}개"},
            "학습계획_실행력": {"score": round(s4, 1), "max": 25},
            "오답관리_품질": {"score": s5, "max": 20},
            "문제해결_적극성": {"score": s6, "max": 10},
        },
    }


# --- 4-3. 교과선행도 (100점) ---

def _calc_ph1_prep_score(answers: dict) -> dict:
    """4-3. 교과선행도 100점."""
    cat_e = answers.get("E", {})

    # === 수학 선행 (30점): 진도(18) + 레벨(12) ===
    e1 = cat_e.get("E1", {})
    if not isinstance(e1, dict):
        e1 = {}

    # 진도 (18점): advance_progress 회독 수
    advance = e1.get("advance_progress", {})
    if not isinstance(advance, dict):
        advance = {}
    math_courses = ["공통수학1", "공통수학2", "미적분1", "확률과통계", "미적분2", "기하"]
    progress_pts = {"0": 0, "1": 2, "2": 4, "3+": 5}
    math_progress = 0
    for course in math_courses:
        val = advance.get(course, "0")
        math_progress += progress_pts.get(str(val), 0)
    s_math_progress = min(18, math_progress)

    # 레벨 (12점): problem_level 정답률
    prob_level = e1.get("problem_level", {})
    if not isinstance(prob_level, dict):
        prob_level = {}
    level_scores = {"low": 2, "mid": 3, "high": 4, "top": 5}
    math_level = 0
    for lv, pts in level_scores.items():
        acc = _sf(prob_level.get(lv))
        if acc is not None and acc >= 70:
            math_level += pts
        elif acc is not None and acc >= 50:
            math_level += pts * 0.5
    s_math_level = min(12, math_level)
    s_math = s_math_progress + s_math_level

    # === 영어 역량 (30점): 어휘(5)+독해(5)+문법(5)+영작에세이(4)+모의고사(4)+듣기(2)+영문자료독해(3)+의사소통(2) ===
    e2 = cat_e.get("E2", {})
    if not isinstance(e2, dict):
        e2 = {}

    # 어휘 (5점)
    vocab = e2.get("vocabulary", {})
    if not isinstance(vocab, dict):
        vocab = {}
    vocab_level = vocab.get("level", "")
    vocab_book = vocab.get("highschool_vocab_book", {})
    if isinstance(vocab_book, dict):
        vocab_status = vocab_book.get("status", "없음")
    else:
        vocab_status = "없음"
    vocab_count = vocab.get("vocab_count", "")
    vocab_map = {"중학필수": 1, "고등기본중": 2, "고등필수대부분": 3}
    book_map = {"없음": 0, "학습중": 0.5, "1회독완료": 1}
    count_map = {"1000이하": 0, "1000-2000": 0.5, "2000이상": 1}
    s_eng_vocab = min(5, vocab_map.get(vocab_level, 0) + book_map.get(vocab_status, 0) + count_map.get(vocab_count, 0))

    # 독해 (5점): radio_grid 3 items
    reading = e2.get("reading", {})
    s_eng_reading = _score_radio_grid(reading, 3, 5)

    # 문법 (5점): radio_grid 3 items
    grammar = e2.get("grammar", {})
    s_eng_grammar = _score_radio_grid(grammar, 3, 5)

    # 영작·에세이 (4점)
    writing = e2.get("writing", {})
    if not isinstance(writing, dict):
        writing = {}
    w_level_map = {"단문": 0.5, "중문": 1, "복문": 1.5}
    w_cond_map = {"없음": 0, "조금": 0.5, "꾸준히": 1}
    w_essay_map = {"없음": 0, "학교수업": 0.5, "자율": 1.5}
    s_eng_writing = min(4,
        w_level_map.get(writing.get("level", ""), 0)
        + w_cond_map.get(writing.get("conditional_writing", ""), 0)
        + w_essay_map.get(writing.get("essay_experience", ""), 0))

    # 모의고사 (4점)
    mock = e2.get("mock_exam", {})
    s_eng_mock = _score_mock_exam(mock, 4)

    # 듣기 (2점)
    listening = e2.get("listening", {})
    if not isinstance(listening, dict):
        listening = {}
    s_eng_listen = 0.0
    if listening.get("experience") == "있음":
        s_eng_listen = 0.5
        acc = _sf(listening.get("accuracy"))
        if acc is not None:
            if acc >= 90:
                s_eng_listen = 2
            elif acc >= 70:
                s_eng_listen = 1.5
            elif acc >= 50:
                s_eng_listen = 1

    # 영문 자료 독해 경험 (3점) — 외고/국제고 판별 핵심
    eng_extra = e2.get("english_reading_extra", {})
    if not isinstance(eng_extra, dict):
        eng_extra = {}
    freq_map = {"없음": 0, "가끔": 1, "자주": 2}
    s_eng_extra = freq_map.get(eng_extra.get("frequency", ""), 0)
    mat_types = eng_extra.get("material_types", [])
    if isinstance(mat_types, list) and len(mat_types) >= 2:
        s_eng_extra += 1
    s_eng_extra = min(3, s_eng_extra)

    # 영어 의사소통 경험 (2점) — 국제고 판별 핵심
    eng_comm = e2.get("english_communication", {})
    if not isinstance(eng_comm, dict):
        eng_comm = {}
    pres_map = {"없음": 0, "학교": 0.5, "외부": 1}
    conv_map = {"없음": 0, "가끔": 0.5, "자주": 1}
    s_eng_comm = min(2,
        pres_map.get(eng_comm.get("presentation", ""), 0)
        + conv_map.get(eng_comm.get("conversation", ""), 0))

    s_eng = s_eng_vocab + s_eng_reading + s_eng_grammar + s_eng_writing + s_eng_mock + s_eng_listen + s_eng_extra + s_eng_comm

    # === 국어 역량 (20점): 문학(5) + 비문학(5) + 문법어휘(3) + 모의고사(4) + 독서(3) ===
    e3 = cat_e.get("E3", {})
    if not isinstance(e3, dict):
        e3 = {}

    # 문학 (5점): radio_grid 5 items
    lit = e3.get("literature", {})
    s_kor_lit = _score_radio_grid(lit, 5, 5)

    # 비문학 (5점)
    nf = e3.get("non_fiction", {})
    if not isinstance(nf, dict):
        nf = {}
    nf_map = {"어려움": 0, "보통": 1, "자신있음": 2}
    nf_score = nf_map.get(nf.get("long_text", ""), 0) + nf_map.get(nf.get("term_inference", ""), 0)
    diff_fields = nf.get("difficult_fields", [])
    if isinstance(diff_fields, list) and "없음" in diff_fields:
        nf_score += 1
    s_kor_nf = min(5, nf_score)

    # 문법어휘 (3점)
    gv = e3.get("grammar_vocab", {})
    if not isinstance(gv, dict):
        gv = {}
    gv_mid_map = {"거의모름": 0, "정리안됨": 0.5, "체계적정리": 1}
    gv_high_map = {"안함": 0, "학습중": 0.5, "완료": 1}
    gv_hanja_map = {"안함": 0, "학습중": 0.25, "완료": 0.5}
    gv_habit_map = {"없음": 0, "가끔": 0.25, "꾸준히": 0.5}
    s_kor_gv = min(3, gv_mid_map.get(gv.get("middle_grammar", ""), 0)
                   + gv_high_map.get(gv.get("high_grammar", ""), 0)
                   + gv_hanja_map.get(gv.get("hanja_terms", ""), 0)
                   + gv_habit_map.get(gv.get("vocab_habit", ""), 0))

    # 모의고사 (4점)
    kor_mock = e3.get("mock_exam", {})
    s_kor_mock = _score_mock_exam(kor_mock, 4)

    # 독서 (3점)
    rh = e3.get("reading_habit", {})
    if not isinstance(rh, dict):
        rh = {}
    books_map = {"0권": 0, "1_2권": 0.5, "3_4권": 1, "5권이상": 1.5}
    news_map = {"안읽음": 0, "가끔": 0.5, "주1_2회이상": 1}
    fields = rh.get("fields", [])
    field_pts = min(0.5, len(fields) * 0.1) if isinstance(fields, list) else 0
    s_kor_reading = min(3, books_map.get(rh.get("monthly_books", ""), 0) + news_map.get(rh.get("newspaper", ""), 0) + field_pts)

    s_kor = s_kor_lit + s_kor_nf + s_kor_gv + s_kor_mock + s_kor_reading

    # === 과학 선행 (20점): 기초(8) + 선행(8) + 역량(4) ===
    e4 = cat_e.get("E4", {})
    if not isinstance(e4, dict):
        e4 = {}

    # 기초 (8점): radio_grid 4 items
    basic = e4.get("basic_skills", {})
    s_sci_basic = _score_radio_grid(basic, 4, 8)

    # 선행 (8점): advance_progress
    sci_advance = e4.get("advance_progress", {})
    if not isinstance(sci_advance, dict):
        sci_advance = {}
    sci_courses = ["통합과학1", "통합과학2", "물리학", "화학", "생명과학", "지구과학"]
    status_pts = {"안함": 0, "진행중": 0.5, "1회독": 1.5, "2회독이상": 2}
    level_bonus = {"개념만": 0, "문제집까지": 0.5}
    sci_prog = 0
    for course in sci_courses:
        c_data = sci_advance.get(course, {})
        if isinstance(c_data, dict):
            sci_prog += status_pts.get(c_data.get("study_status", "안함"), 0)
            sci_prog += level_bonus.get(c_data.get("study_level", ""), 0)
        elif isinstance(c_data, str):
            sci_prog += status_pts.get(c_data, 0)
    s_sci_advance = min(8, sci_prog)

    # 역량 (4점): radio_grid 3 items
    skills = e4.get("science_skills", {})
    s_sci_skills = _score_radio_grid(skills, 3, 4)

    s_sci = s_sci_basic + s_sci_advance + s_sci_skills

    total = s_math + s_eng + s_kor + s_sci
    return {
        "total": round(min(100, total), 1),
        "grade": _grade_label(min(100, total)),
        "details": {
            "수학_선행": {"score": round(s_math, 1), "max": 30, "sub": {"진도": round(s_math_progress, 1), "레벨": round(s_math_level, 1)}},
            "영어_역량": {"score": round(s_eng, 1), "max": 30, "sub": {"어휘": round(s_eng_vocab, 1), "독해": round(s_eng_reading, 1), "문법": round(s_eng_grammar, 1), "영작에세이": round(s_eng_writing, 1), "모의고사": round(s_eng_mock, 1), "듣기": round(s_eng_listen, 1), "영문자료독해": round(s_eng_extra, 1), "의사소통": round(s_eng_comm, 1)}},
            "국어_역량": {"score": round(s_kor, 1), "max": 20, "sub": {"문학": round(s_kor_lit, 1), "비문학": round(s_kor_nf, 1), "문법어휘": round(s_kor_gv, 1), "모의고사": round(s_kor_mock, 1), "독서": round(s_kor_reading, 1)}},
            "과학_선행": {"score": round(s_sci, 1), "max": 20, "sub": {"기초": round(s_sci_basic, 1), "선행": round(s_sci_advance, 1), "역량": round(s_sci_skills, 1)}},
        },
    }


def _score_radio_grid(data: Any, n_items: int, max_pts: float) -> float:
    """radio_grid 항목 공통 채점. 어려움=0, 보통=1, 자신있음=2 → 비율로 max_pts 환산."""
    if not data or not isinstance(data, (dict, list)):
        return 0
    val_map = {"어려움": 0, "어려움 / 모름": 0, "보통": 1, "자신있음": 2, "자신 있음": 2}
    total = 0
    count = 0
    if isinstance(data, dict):
        for v in data.values():
            if isinstance(v, str):
                total += val_map.get(v, 0)
                count += 1
    elif isinstance(data, list):
        for v in data:
            if isinstance(v, str):
                total += val_map.get(v, 0)
                count += 1
    if count == 0:
        return 0
    return round(total / (count * 2) * max_pts, 1)


def _score_mock_exam(data: Any, max_pts: float) -> float:
    """모의고사 경험 채점. 등급 기반."""
    if not data or not isinstance(data, dict):
        return 0
    # 등급 값들 수집
    ranks = []
    for grade_key, entry in data.items():
        if isinstance(entry, dict):
            rank = _sf(entry.get("rank"))
            if rank is not None:
                ranks.append(rank)
        elif isinstance(entry, list):
            for e in entry:
                if isinstance(e, dict):
                    rank = _sf(e.get("rank"))
                    if rank is not None:
                        ranks.append(rank)
    if not ranks:
        return 0
    best_rank = min(ranks)
    # 등급 → 점수 환산
    if best_rank <= 2:
        return max_pts
    elif best_rank <= 3:
        return max_pts * 0.8
    elif best_rank <= 4:
        return max_pts * 0.6
    elif best_rank <= 5:
        return max_pts * 0.4
    elif best_rank <= 6:
        return max_pts * 0.2
    return 0


# --- 4-4. 진로방향성 (100점) ---

# B1 진로 구체성 점수 매핑
_CAREER_DEPTH_MAP = {
    "exploring": 5,  # 탐색 중
}


def _calc_ph1_career_score(answers: dict) -> dict:
    """4-4. 진로방향성 100점."""
    cat_b = answers.get("B", {})

    # ① 진로 구체성 (35점): B1 선택 깊이
    b1 = cat_b.get("B1", {})
    if not b1 or (isinstance(b1, dict) and not b1) or (isinstance(b1, list) and not b1):
        s1 = 5  # 미응답
    else:
        # B1은 career_select: 카테고리 + 서브카테고리 선택
        if isinstance(b1, dict):
            categories = b1.get("categories", [])
            subcategories = b1.get("subcategories", [])
            if not isinstance(categories, list):
                categories = [b1.get("key")] if b1.get("key") else []
            if not isinstance(subcategories, list):
                subcategories = []
        elif isinstance(b1, list):
            categories = b1
            subcategories = []
        else:
            categories = []
            subcategories = []

        # "exploring" 또는 "탐색 중" 선택
        is_exploring = any(
            c in ("exploring", "탐색 중", "탐색중") or (isinstance(c, dict) and c.get("key") == "exploring")
            for c in categories
        ) if categories else True

        if is_exploring and not subcategories:
            s1 = 5
        elif len(subcategories) >= 2:
            s1 = 35
        elif len(subcategories) == 1:
            s1 = 25
        elif len(categories) >= 2:
            s1 = 20
        elif len(categories) == 1:
            s1 = 15
        else:
            s1 = 5

    # ② 전형 이해도 (30점): B2 슬라이더 x 3
    b2 = _sf(cat_b.get("B2"))
    s2 = min(30, (b2 or 0) * 3)

    # ③ 전형 선택 명확성 (15점): B3
    b3 = cat_b.get("B3", "")
    if b3 in ("아직모름", "아직 모름", ""):
        s3 = 3
    else:
        s3 = 15

    # ④ 진로-전형 정합성 (20점): B1 x B3 자동 판정
    if s1 <= 5 or s3 <= 3:
        s4 = 5  # 판정 불가
        coherence = "판정불가"
    else:
        # 간단 규칙: 진로와 전형이 모두 구체적이면 높은 점수
        # 의약계열 + 수능위주/학생부교과 → 일치
        # 예체능계열 + 예체능 → 일치
        # 대부분의 경우 구체적 선택이 있으면 "부분일치"
        if isinstance(b1, dict):
            cats = b1.get("categories", [])
        elif isinstance(b1, list):
            cats = b1
        else:
            cats = []

        cat_keys = set()
        for c in cats:
            if isinstance(c, dict):
                cat_keys.add(c.get("key", ""))
            elif isinstance(c, str):
                cat_keys.add(c)

        track_match = {
            "arts": {"예체능"},
            "medical": {"학생부교과", "수능위주", "학생부종합"},
            "engineering": {"학생부종합", "수능위주", "논술"},
            "natural_science": {"학생부종합", "수능위주", "논술"},
            "humanities": {"학생부종합", "학생부교과"},
            "social": {"학생부종합", "학생부교과"},
            "business": {"학생부종합", "학생부교과", "수능위주"},
            "education": {"학생부종합", "학생부교과"},
        }
        matched = False
        for ck in cat_keys:
            valid_tracks = track_match.get(ck, set())
            if b3 in valid_tracks:
                matched = True
                break

        if matched:
            s4 = 20
            coherence = "일치"
        elif s1 >= 15 and s3 >= 15:
            s4 = 12
            coherence = "부분일치"
        else:
            s4 = 5
            coherence = "불일치"

    total = s1 + s2 + s3 + s4
    return {
        "total": round(min(100, total), 1),
        "grade": _grade_label(min(100, total)),
        "details": {
            "진로_구체성": {"score": s1, "max": 35},
            "전형_이해도": {"score": round(s2, 1), "max": 30, "value": b2},
            "전형_선택명확성": {"score": s3, "max": 15, "value": b3 or "미선택"},
            "진로전형_정합성": {"score": s4, "max": 20, "value": coherence},
        },
    }


# --- 4-5. 비교과역량 (100점) ---

def _calc_ph1_extracurricular_score(answers: dict) -> dict:
    """4-5. 비교과역량 100점."""
    cat_f = answers.get("F", {})

    # ① 동아리 활동 (20점): F1 개수
    f1 = cat_f.get("F1", [])
    if not isinstance(f1, list):
        f1 = []
    club_count = len([x for x in f1 if x and str(x).strip()])
    if club_count >= 3:
        s1 = 20
    elif club_count == 2:
        s1 = 14
    elif club_count == 1:
        s1 = 8
    else:
        s1 = 0

    # ② 수상 경험 (15점): F2 개수
    f2 = cat_f.get("F2", [])
    if not isinstance(f2, list):
        f2 = []
    award_count = len([x for x in f2 if x and str(x).strip()])
    if award_count >= 3:
        s2 = 15
    elif award_count >= 1:
        s2 = 8
    else:
        s2 = 0

    # ③ 봉사활동 (15점): F3
    f3 = cat_f.get("F3", "")
    volunteer_map = {"자발적참여": 15, "의무만": 7, "없음": 0}
    s3 = volunteer_map.get(f3, 0)

    # ④ 리더십 경험 (20점): F4
    f4 = cat_f.get("F4", {})
    if not isinstance(f4, dict):
        f4 = {}
    has_exp = f4.get("has_experience", "없음")
    role = str(f4.get("role", "")).strip()
    if has_exp == "있음" and role:
        # 학생회 키워드 감지
        if any(kw in role for kw in ("학생회", "부회장", "회장")):
            s4 = 20
        elif any(kw in role for kw in ("반장", "임원", "부장")):
            s4 = 14
        else:
            s4 = 10
    elif has_exp == "있음":
        s4 = 10
    else:
        s4 = 0

    # ⑤ 자기개발 활동 (15점): F5 개수
    f5 = cat_f.get("F5", [])
    if not isinstance(f5, list):
        f5 = []
    dev_count = len([x for x in f5 if x and str(x).strip()])
    if dev_count >= 2:
        s5 = 15
    elif dev_count == 1:
        s5 = 7
    else:
        s5 = 0

    # ⑥ 자기 인식 역량 (15점): F6 다양성
    f6 = cat_f.get("F6", [])
    if not isinstance(f6, list):
        f6 = []
    strength_count = len(f6)
    # 다양성 판단: 서로 다른 카테고리 수
    leadership_type = {"리더십", "협업", "의사소통", "공감능력"}
    analytical_type = {"분석력", "창의성", "문제해결"}
    personal_type = {"끈기", "자기관리"}
    cats_found = set()
    for s in f6:
        if s in leadership_type:
            cats_found.add("social")
        elif s in analytical_type:
            cats_found.add("analytical")
        elif s in personal_type:
            cats_found.add("personal")
    if strength_count >= 3 and len(cats_found) >= 2:
        s6 = 15  # 다양 3개
    elif strength_count >= 3:
        s6 = 10  # 유사 편중
    else:
        s6 = 5   # 2개 이하

    total = s1 + s2 + s3 + s4 + s5 + s6
    return {
        "total": round(min(100, total), 1),
        "grade": _grade_label(min(100, total)),
        "details": {
            "동아리_활동": {"score": s1, "max": 20, "value": club_count},
            "수상_경험": {"score": s2, "max": 15, "value": award_count},
            "봉사활동": {"score": s3, "max": 15, "value": f3 or "미응답"},
            "리더십_경험": {"score": s4, "max": 20, "value": role or ("있음" if has_exp == "있음" else "없음")},
            "자기개발_활동": {"score": s5, "max": 15, "value": dev_count},
            "자기인식_역량": {"score": s6, "max": 15, "value": strength_count},
        },
    }


# ============================================================
# 종합 산출 — 예비고1 5각형 레이더
# ============================================================

def compute_preheigh1_radar_scores(answers: dict) -> dict:
    """5영역 점수 + 등급 + 레이더 데이터 산출 (예비고1)."""
    academic = _calc_ph1_academic_score(answers)
    study = _calc_ph1_study_score(answers)
    prep = _calc_ph1_prep_score(answers)
    career = _calc_ph1_career_score(answers)
    extra = _calc_ph1_extracurricular_score(answers)

    radar = {
        "학업기초력": {"score": academic["total"], "grade": academic["grade"]},
        "학습습관_자기주도력": {"score": study["total"], "grade": study["grade"]},
        "교과선행도": {"score": prep["total"], "grade": prep["grade"]},
        "진로방향성": {"score": career["total"], "grade": career["grade"]},
        "비교과역량": {"score": extra["total"], "grade": extra["grade"]},
    }

    avg = (academic["total"] + study["total"] + prep["total"] + career["total"] + extra["total"]) / 5
    overall_grade = _grade_label(avg)

    roadmap = _generate_preheigh1_roadmap(academic, study, prep, career, extra)

    return {
        "radar": radar,
        "overall_score": round(avg, 1),
        "overall_grade": overall_grade,
        "academic": academic,
        "study": study,
        "prep": prep,
        "career": career,
        "extracurricular": extra,
        "roadmap": roadmap,
    }


# ============================================================
# 예비고1 로드맵 자동 초안 생성
# ============================================================

_ROADMAP_ITEMS: dict[str, list[dict]] = {
    "academic": [
        {"condition": lambda d: d["total"] < 55, "priority": "상",
         "title": "기초 학력 보강",
         "desc": "중학 주요과목(국·영·수) 기초 개념을 다시 정리하고, 취약 단원 집중 복습이 필요합니다.",
         "period": "입학 전 ~ 고1 1학기"},
        {"condition": lambda d: d["total"] < 75, "priority": "중",
         "title": "성적 균형 맞추기",
         "desc": "과목 간 편차가 큰 경우, 약한 과목에 주당 2~3시간 추가 학습을 배분하세요.",
         "period": "입학 전 ~ 고1 1학기"},
        {"condition": lambda d: d["total"] >= 75, "priority": "하",
         "title": "심화 학습 도전",
         "desc": "기초가 탄탄하므로, 고등 선행보다는 사고력·서술형 문제 풀이로 깊이를 더하세요.",
         "period": "입학 전"},
    ],
    "study": [
        {"condition": lambda d: d["total"] < 55, "priority": "상",
         "title": "자기주도 학습 습관 만들기",
         "desc": "매일 정해진 시간에 스스로 공부하는 루틴을 만드세요. 처음엔 30분부터 시작해 점진적으로 늘려갑니다.",
         "period": "즉시 ~ 입학 전"},
        {"condition": lambda d: d["total"] < 75, "priority": "중",
         "title": "학습 계획 수립·실행력 강화",
         "desc": "주간 학습 계획표를 작성하고 매주 실행률을 점검하세요. 오답노트 습관화가 핵심입니다.",
         "period": "입학 전 ~ 고1 1학기"},
        {"condition": lambda d: d["total"] >= 75, "priority": "하",
         "title": "효율적 학습 전략 최적화",
         "desc": "학습 시간 대비 효율을 높이는 전략(예: 시간 블록법, 간격 반복)을 적용해 보세요.",
         "period": "고1 1학기"},
    ],
    "prep": [
        {"condition": lambda d: _detail_score(d, "수학_선행도") < 15, "priority": "상",
         "title": "수학 선행 보강 (최우선)",
         "desc": "고등 수학(상)의 기초 단원(다항식, 방정식, 부등식)을 입학 전에 1회독 완료하세요.",
         "period": "즉시 ~ 입학 전"},
        {"condition": lambda d: _detail_score(d, "영어_역량") < 13, "priority": "상",
         "title": "영어 기초 역량 보강",
         "desc": "고등 필수 어휘 암기 + 중장문 독해 훈련을 매일 30분 이상 실시하세요.",
         "period": "즉시 ~ 입학 전"},
        {"condition": lambda d: _detail_score(d, "국어_역량") < 13, "priority": "중",
         "title": "국어 독해·문법 기초 다지기",
         "desc": "비문학 지문 독해 연습과 기본 문법 개념 정리가 필요합니다.",
         "period": "입학 전 ~ 고1 1학기"},
        {"condition": lambda d: d["total"] >= 75, "priority": "하",
         "title": "선행 심화 및 내신 대비",
         "desc": "기본 선행이 잘 되어 있으므로, 학교별 기출 유형 분석과 서술형 대비에 집중하세요.",
         "period": "고1 1학기"},
    ],
    "career": [
        {"condition": lambda d: d["total"] < 55, "priority": "상",
         "title": "진로 탐색 시작하기",
         "desc": "관심 분야 3~5개를 정하고 관련 직업·학과를 조사해 보세요. 진로 심리검사도 추천합니다.",
         "period": "즉시 ~ 고1 1학기"},
        {"condition": lambda d: d["total"] < 75, "priority": "중",
         "title": "진로 방향 구체화",
         "desc": "관심 학과의 교육과정과 졸업 후 진로를 조사하고, 고교 선택과목 로드맵과 연결하세요.",
         "period": "입학 전 ~ 고1 1학기"},
        {"condition": lambda d: d["total"] >= 75, "priority": "하",
         "title": "진로 활동 계획 수립",
         "desc": "진로 방향이 뚜렷하므로, 고1부터 세특·창체에 연결할 수 있는 활동 계획을 세우세요.",
         "period": "고1 1학기"},
    ],
    "extracurricular": [
        {"condition": lambda d: d["total"] < 55, "priority": "중",
         "title": "비교과 활동 경험 넓히기",
         "desc": "동아리, 봉사, 리더십 경험 중 1~2가지를 시작하세요. 고교 입학 후 창체 활동의 기반이 됩니다.",
         "period": "입학 전 ~ 고1 1학기"},
        {"condition": lambda d: d["total"] < 75, "priority": "중",
         "title": "비교과 활동 심화·연결",
         "desc": "기존 활동을 진로와 연결하고, 활동의 깊이를 더할 수 있는 프로젝트를 기획해 보세요.",
         "period": "고1 1학기"},
        {"condition": lambda d: d["total"] >= 75, "priority": "하",
         "title": "비교과 포트폴리오 전략",
         "desc": "활동 경험이 풍부하므로, 학생부 기재에 유리한 활동 중심으로 전략적으로 선택·집중하세요.",
         "period": "고1 1학기"},
    ],
}


def _detail_score(data: dict, key: str) -> float:
    """details 딕셔너리에서 특정 항목의 score를 안전하게 추출."""
    details = data.get("details", {})
    item = details.get(key, {})
    return item.get("score", 0) if isinstance(item, dict) else 0


def _generate_preheigh1_roadmap(
    academic: dict, study: dict, prep: dict, career: dict, extra: dict,
) -> dict:
    """5축 점수 기반 로드맵 자동 초안 생성."""
    area_data = {
        "academic": academic,
        "study": study,
        "prep": prep,
        "career": career,
        "extracurricular": extra,
    }
    area_labels = {
        "academic": "학업기초력",
        "study": "학습습관·자기주도력",
        "prep": "교과선행도",
        "career": "진로방향성",
        "extracurricular": "비교과역량",
    }

    items: list[dict] = []
    for area_key, candidates in _ROADMAP_ITEMS.items():
        data = area_data[area_key]
        for cand in candidates:
            if cand["condition"](data):
                items.append({
                    "area": area_labels[area_key],
                    "area_key": area_key,
                    "priority": cand["priority"],
                    "title": cand["title"],
                    "description": cand["desc"],
                    "period": cand["period"],
                    "current_score": data["total"],
                    "current_grade": data["grade"],
                })
                break  # 각 영역에서 가장 먼저 매칭되는 항목 1개만

    # 우선순위 정렬: 상 > 중 > 하
    priority_order = {"상": 0, "중": 1, "하": 2}
    items.sort(key=lambda x: priority_order.get(x["priority"], 9))

    return {
        "items": items,
        "summary": _roadmap_summary(items),
    }


def _roadmap_summary(items: list[dict]) -> str:
    """로드맵 한 줄 요약 생성."""
    high_priority = [it for it in items if it["priority"] == "상"]
    if not high_priority:
        return "전체적으로 양호한 수준입니다. 세부 항목별 심화 전략을 참고하세요."
    names = ", ".join(it["title"] for it in high_priority[:3])
    return f"우선 보강 영역: {names}. 입학 전 집중적인 준비가 필요합니다."
