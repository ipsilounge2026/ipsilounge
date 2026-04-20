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


# 예비고1 C1~C6 학기 데이터 구조 매핑
# user-web SemesterGradeMatrix 가 실제로 submit 하는 구조:
#   {"C1": {"exempt": false, "subjects": {"국어": {raw_score, subject_avg, stdev}, ...}}}
# 한편 스코어링/차트 로직은 내부적으로 english 코드(ko/en/ma/so/sc)를 사용하므로
# Korean → english 변환 helper 가 필요. (2026-04-20 #9 작업 중 파싱 버그 발견)
PH1_SUBJECT_KO_TO_EN: dict[str, str] = {
    "국어": "ko",
    "영어": "en",
    "수학": "ma",
    "사회": "so",
    "과학": "sc",
}


def _extract_ph1_subjects(sem_data: dict) -> dict[str, dict]:
    """예비고1 학기 데이터에서 english-keyed 과목 dict 추출.

    신/구 포맷 모두 지원 (backward-compat):
      - 신(정식): sem_data["subjects"]["국어"] = {...} — 한글 키 nested
      - 구(레거시): sem_data["ko"] = {...} — 직접 english 키

    exempt=True 학기는 빈 dict 반환 (스코어링 제외).
    """
    if not isinstance(sem_data, dict):
        return {}
    if sem_data.get("exempt"):
        return {}
    # 신 포맷: subjects sub-dict 한글 키
    subjects_nested = sem_data.get("subjects")
    if isinstance(subjects_nested, dict) and subjects_nested:
        result: dict[str, dict] = {}
        for ko, v in subjects_nested.items():
            if ko in PH1_SUBJECT_KO_TO_EN and isinstance(v, dict):
                result[PH1_SUBJECT_KO_TO_EN[ko]] = v
        if result:
            return result
    # 구 포맷 fallback: 직접 english 키
    result = {}
    for en in PH1_SUBJECT_KO_TO_EN.values():
        v = sem_data.get(en)
        if isinstance(v, dict):
            result[en] = v
    return result


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
        subj_dict = _extract_ph1_subjects(sem_data)
        scores = []
        for subj in subjects:
            subj_data = subj_dict.get(subj, {})
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
    compatibility = compute_school_type_compatibility(answers, academic, prep, study, career)

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
        "school_type_compatibility": compatibility,
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

    # 4단계 × 6트랙 매트릭스 생성
    matrix = _generate_roadmap_matrix(academic, study, prep, career, extra)

    return {
        "items": items,
        "matrix": matrix,
        "summary": _roadmap_summary(items),
    }


def _generate_roadmap_matrix(
    academic: dict, study: dict, prep: dict, career: dict, extra: dict,
) -> dict:
    """4단계(Phase) × 6트랙 로드맵 매트릭스 자동 생성."""
    phases = [
        {"key": "phase0", "label": "Phase 0: 지금~입학 전", "theme": "기초 보완 & 습관 형성"},
        {"key": "phase1", "label": "Phase 1: 고1-1학기", "theme": "고등학교 적응 & 첫 내신"},
        {"key": "phase2", "label": "Phase 2: 고1-2학기", "theme": "진로 구체화 & 심화 탐색"},
        {"key": "phase3", "label": "Phase 3: 고2 이후", "theme": "전형 전략 본격화"},
    ]
    tracks = [
        {"key": "academic", "label": "교과 학습", "icon": "📘"},
        {"key": "naesin", "label": "내신 전략", "icon": "📋"},
        {"key": "setuek", "label": "세특", "icon": "📝"},
        {"key": "mock", "label": "수능/모의고사", "icon": "🎯"},
        {"key": "extra", "label": "비교과", "icon": "🏫"},
        {"key": "habit", "label": "습관 개선", "icon": "🔧"},
    ]

    scores = {
        "academic": academic["total"],
        "study": study["total"],
        "prep": prep["total"],
        "career": career["total"],
        "extra": extra["total"],
    }

    math_weak = _detail_score(prep, "수학_선행도") < 15
    eng_weak = _detail_score(prep, "영어_역량") < 15
    kor_weak = _detail_score(prep, "국어_역량") < 10
    sci_weak = _detail_score(prep, "과학_역량") < 10
    study_weak = scores["study"] < 55
    career_weak = scores["career"] < 55
    extra_weak = scores["extra"] < 55

    # 매트릭스 셀 생성 (phase_key → track_key → content)
    cells: dict[str, dict[str, str]] = {}

    # Phase 0: 지금~입학 전
    p0: dict[str, str] = {}
    p0["academic"] = "수학: 중학 핵심 단원(방정식·함수) 완전 정복" if math_weak else "고등수학(상) 1회독 완료 목표"
    p0["academic"] += "\n영어: 고등 필수 어휘 암기 시작" if eng_weak else "\n영어: 수능형 독해 유형 연습"
    if kor_weak:
        p0["academic"] += "\n국어: 비문학 지문 독해 연습(주 3회)"
    p0["naesin"] = "고등학교 내신 체계(지필+수행) 이해\n중학 오답 정리로 개념 구멍 점검"
    p0["setuek"] = "세특이 무엇인지 이해하기\n관심 분야 탐구 주제 브레인스토밍"
    p0["mock"] = "고1 3월 모의고사 기출 1회 풀어보기\n시간 배분 연습(국·영·수)"
    p0["extra"] = "고등학교 동아리 목록 사전 조사" if career_weak else "진로 연계 동아리 1순위 선정"
    p0["habit"] = "매일 자기주도 학습 1시간 루틴 만들기\n오답노트 습관 시작" if study_weak else "주간 학습 계획표 작성 연습\n시간 블록법 적용 시도"
    cells["phase0"] = p0

    # Phase 1: 고1-1학기
    p1: dict[str, str] = {}
    p1["academic"] = "수학: 공통수학1·2 진도 따라가기 + 유형 반복" if math_weak else "수학: 내신 기출 분석 + 심화 문제 도전"
    p1["academic"] += "\n영어: 교과서 지문 완벽 이해 + 어휘 확장"
    p1["naesin"] = "첫 중간고사 준비 전략 수립\n수행평가 일정 파악 및 계획\n시험 2주 전 과목별 계획표 작성"
    p1["setuek"] = "교과 수업에서 궁금한 점 메모 습관\n1과목 이상 탐구 주제 선정 시도"
    p1["mock"] = "3월 모의고사 결과 분석\n취약 유형 파악 및 보완 계획"
    p1["extra"] = "동아리 가입 + 자율활동 적극 참여\n진로활동: 관심 분야 직업 탐색"
    p1["habit"] = "주간 학습 계획 수립·실행·점검 루틴\n시험 기간 오답 정리 철저히" if study_weak else "효율적 복습 주기 정립(당일·3일·1주)\n자기주도 학습 비율 50% 이상 유지"
    cells["phase1"] = p1

    # Phase 2: 고1-2학기
    p2: dict[str, str] = {}
    p2["academic"] = "1학기 취약 과목 집중 보완\n기말고사 목표 등급 설정 및 실행"
    p2["naesin"] = "1학기 성적 분석 → 2학기 전략 조정\n수행평가 퀄리티 높이기(보고서·발표)"
    p2["setuek"] = "1학기 탐구 심화 또는 새 주제 확장\n교과 연계 탐구 보고서 1편 작성" if scores["career"] >= 55 else "관심 분야 찾기 위한 다양한 탐구 시도\n선생님과 탐구 주제 상담"
    p2["mock"] = "9월·11월 모의고사 응시 및 분석\n수능 국·영·수 기본 유형 정리"
    p2["extra"] = "동아리 활동 내용 정리(학생부 기재용)\n봉사·자율활동 기록 관리 시작"
    p2["habit"] = "학습 루틴 안정화 + 시간 관리 최적화\n월 1회 학습 방법 자기 점검"
    cells["phase2"] = p2

    # Phase 3: 고2 이후
    p3: dict[str, str] = {}
    p3["academic"] = "선택과목 전략적 수강(진로 연계)\n전공 관련 과목 최상위 등급 목표"
    p3["naesin"] = "학종/교과전형 목표에 맞는 등급 관리\n세특·수행평가의 전형 연계 전략"
    p3["setuek"] = "학년별 심화되는 탐구 스토리라인 구축\n과목 간 연계 탐구로 차별화"
    p3["mock"] = "수능 영역별 목표 등급 설정\n매 모의고사 후 오답 분석 루틴"
    p3["extra"] = "3년 활동의 일관성 있는 스토리 정리\n학생부 기재 내용 점검 및 보완"
    p3["habit"] = "자기주도 학습 비율 70% 이상\n입시 전략에 맞는 시간 배분"
    cells["phase3"] = p3

    return {
        "phases": phases,
        "tracks": tracks,
        "cells": cells,
    }


def _roadmap_summary(items: list[dict]) -> str:
    """로드맵 한 줄 요약 생성."""
    high_priority = [it for it in items if it["priority"] == "상"]
    if not high_priority:
        return "전체적으로 양호한 수준입니다. 세부 항목별 심화 전략을 참고하세요."
    names = ", ".join(it["title"] for it in high_priority[:3])
    return f"우선 보강 영역: {names}. 입학 전 집중적인 준비가 필요합니다."


# ============================================================
# 예비고1 고교유형 적합도 분석
# ============================================================

# 4축 가중치 (학업기초력 / 교과선행도 / 학습습관·자기주도력 / 진로방향성)
_SCHOOL_TYPE_WEIGHTS: dict[str, tuple[float, float, float, float]] = {
    "과고": (0.35, 0.20, 0.35, 0.10),
    "외고": (0.30, 0.25, 0.30, 0.15),
    "국제고": (0.30, 0.25, 0.30, 0.15),
    "자사고": (0.35, 0.35, 0.20, 0.10),
    "일반고": (0.25, 0.25, 0.25, 0.25),
}

# 가산 조건 (+5): (과목키 리스트, 기준 원점수)
_BONUS_CONDITIONS: dict[str, tuple[list[str], float]] = {
    "과고": (["ma", "sc"], 97),
    "외고": (["ko", "en"], 95),
    "국제고": (["en", "so"], 95),
    "자사고": (["ko", "en", "ma", "so", "sc"], 95),  # 전과목 평균
}

# 감산 조건 (-5): (과목키 리스트, 기준 원점수)
_PENALTY_CONDITIONS: dict[str, tuple[list[str], float]] = {
    "과고": (["ma", "sc"], 93),
    "외고": (["ko", "en"], 93),
    "국제고": (["en", "so"], 93),
    "자사고": (["ko", "ma", "sc"], 90),
}


def _get_latest_subject_scores(answers: dict) -> dict[str, float]:
    """가장 최근 학기의 과목별 원점수를 반환."""
    cat_c = answers.get("C", {})
    semesters = ["C1", "C2", "C3", "C4", "C5", "C6"]
    subjects = ["ko", "en", "ma", "so", "sc"]
    latest: dict[str, float] = {}

    for sem_key in semesters:
        sem_data = cat_c.get(sem_key)
        if not sem_data or not isinstance(sem_data, dict):
            continue
        subj_dict = _extract_ph1_subjects(sem_data)
        found = {}
        for subj in subjects:
            subj_data = subj_dict.get(subj, {})
            if isinstance(subj_data, dict):
                raw = _sf(subj_data.get("raw_score"))
                if raw is not None:
                    found[subj] = raw
        if found:
            latest = found  # 가장 마지막에 데이터가 있는 학기가 latest

    return latest


def _check_correction(
    subject_scores: dict[str, float],
    subjects: list[str],
    threshold: float,
    is_avg: bool = False,
) -> bool:
    """과목 점수가 조건을 충족하는지 확인.
    is_avg=True면 과목들의 평균이 threshold 이상/이하인지 확인.
    is_avg=False면 모든 과목이 threshold 이상/이하인지 확인.
    """
    scores = [subject_scores[s] for s in subjects if s in subject_scores]
    if not scores:
        return False
    if is_avg:
        return (sum(scores) / len(scores)) >= threshold
    return all(s >= threshold for s in scores)


def _check_penalty(
    subject_scores: dict[str, float],
    subjects: list[str],
    threshold: float,
) -> bool:
    """감산 조건: 해당 과목 중 하나라도 threshold 이하면 True."""
    scores = [subject_scores[s] for s in subjects if s in subject_scores]
    if not scores:
        return False
    return any(s <= threshold for s in scores)


def compute_school_type_compatibility(
    answers: dict,
    academic: dict,
    prep: dict,
    study: dict,
    career: dict,
) -> dict:
    """고교유형 적합도 분석.

    4축(학업기초력/교과선행도/학습습관·자기주도력/진로방향성) 가중합산 + 보정(±5).
    """
    subject_scores = _get_latest_subject_scores(answers)
    desired_types: list[str] = answers.get("A", {}).get("A4", [])
    if not isinstance(desired_types, list):
        desired_types = []

    axis_scores = {
        "학업기초력": academic["total"],
        "교과선행도": prep["total"],
        "학습습관_자기주도력": study["total"],
        "진로방향성": career["total"],
    }

    results: dict[str, dict] = {}

    for school_type, weights in _SCHOOL_TYPE_WEIGHTS.items():
        w_academic, w_prep, w_study, w_career = weights
        base = (
            axis_scores["학업기초력"] * w_academic
            + axis_scores["교과선행도"] * w_prep
            + axis_scores["학습습관_자기주도력"] * w_study
            + axis_scores["진로방향성"] * w_career
        )

        bonus = 0
        penalty = 0
        bonus_reason = ""
        penalty_reason = ""

        # 가산 체크
        if school_type in _BONUS_CONDITIONS:
            subjs, thresh = _BONUS_CONDITIONS[school_type]
            # 자사고는 전과목 평균 기준
            is_avg = (school_type == "자사고")
            if _check_correction(subject_scores, subjs, thresh, is_avg=is_avg):
                bonus = 5
                subj_names = {"ko": "국어", "en": "영어", "ma": "수학", "so": "사회", "sc": "과학"}
                if is_avg:
                    bonus_reason = f"전과목 평균 {thresh}점 이상"
                else:
                    names = "·".join(subj_names.get(s, s) for s in subjs)
                    bonus_reason = f"{names} 모두 {thresh}점 이상"

        # 감산 체크
        if school_type in _PENALTY_CONDITIONS:
            subjs, thresh = _PENALTY_CONDITIONS[school_type]
            if _check_penalty(subject_scores, subjs, thresh):
                penalty = -5
                subj_names = {"ko": "국어", "en": "영어", "ma": "수학", "so": "사회", "sc": "과학"}
                names = "·".join(subj_names.get(s, s) for s in subjs)
                penalty_reason = f"{names} 중 {thresh}점 이하 과목 존재"

        total = round(min(100, max(0, base + bonus + penalty)), 1)

        results[school_type] = {
            "score": total,
            "grade": _grade_label(total),
            "base_score": round(base, 1),
            "bonus": bonus,
            "bonus_reason": bonus_reason,
            "penalty": penalty,
            "penalty_reason": penalty_reason,
            "weights": {
                "학업기초력": w_academic,
                "교과선행도": w_prep,
                "학습습관_자기주도력": w_study,
                "진로방향성": w_career,
            },
            "is_desired": school_type in desired_types,
        }

    # 적합도 높은 순으로 정렬된 추천 목록
    ranked = sorted(results.items(), key=lambda x: x[1]["score"], reverse=True)
    recommendations = []
    for school_type, data in ranked:
        recommendations.append({
            "school_type": school_type,
            "score": data["score"],
            "grade": data["grade"],
            "is_desired": data["is_desired"],
        })

    return {
        "details": results,
        "recommendations": recommendations,
        "axis_scores": axis_scores,
        "subject_scores": {k: round(v, 1) for k, v in subject_scores.items()},
    }


# ============================================================
# 고등학생 로드맵 자동 초안 생성
# ============================================================

_HIGH_ROADMAP_ITEMS: dict[str, list[dict]] = {
    "naesin": [
        {"condition": lambda d: d["total"] < 55, "priority": "상",
         "title": "내신 등급 긴급 보강",
         "desc": "전과목 평균 등급이 낮습니다. 주요 과목(국·영·수) 기본 개념부터 재정비하고, 수행평가 비중이 높은 과목을 우선 공략하세요.",
         "period": "즉시"},
        {"condition": lambda d: d["total"] < 75, "priority": "중",
         "title": "내신 취약 과목 집중 보강",
         "desc": "주요 과목 등급 편차를 줄이고, 수행평가 대응력을 높여 전체 평균 등급을 끌어올리세요.",
         "period": "이번 학기"},
        {"condition": lambda d: d["total"] >= 75, "priority": "하",
         "title": "내신 최상위 등급 도전",
         "desc": "기본이 탄탄하므로, 1등급 과목 수를 늘리고 과목 간 균형을 유지하세요.",
         "period": "다음 학기"},
    ],
    "mock": [
        {"condition": lambda d: d.get("no_data"), "priority": "중",
         "title": "모의고사 데이터 확보 필요",
         "desc": "모의고사 응시 이력이 없습니다. 다음 모의고사에 반드시 응시하여 수능 대비 현 위치를 파악하세요.",
         "period": "다음 모의고사"},
        {"condition": lambda d: d["total"] < 55, "priority": "상",
         "title": "모의고사 기초 역량 보강",
         "desc": "백분위가 전반적으로 낮습니다. 취약 영역을 파악하고 기본 개념부터 다시 정리하세요.",
         "period": "즉시"},
        {"condition": lambda d: d["total"] < 75, "priority": "중",
         "title": "모의고사 취약 영역 집중",
         "desc": "전체 평균 대비 뒤처지는 영역에 주당 추가 2~3시간을 배분하세요.",
         "period": "이번 학기"},
        {"condition": lambda d: d["total"] >= 75, "priority": "하",
         "title": "모의고사 1등급 안착",
         "desc": "상위권이므로, 킬러 문항 대비와 시간 관리 최적화에 집중하세요.",
         "period": "다음 모의고사"},
    ],
    "study": [
        {"condition": lambda d: d["total"] < 55, "priority": "상",
         "title": "학습 습관 전면 재구축",
         "desc": "자기주도 학습 비율과 오답 관리 습관이 부족합니다. 매일 정해진 시간에 스스로 공부하는 루틴부터 만드세요.",
         "period": "즉시"},
        {"condition": lambda d: d["total"] < 75, "priority": "중",
         "title": "학습 전략 체계화",
         "desc": "학습 계획 수립과 실행력을 높이세요. 주간 계획표 작성, 오답노트 습관화가 핵심입니다.",
         "period": "이번 학기"},
        {"condition": lambda d: d["total"] >= 75, "priority": "하",
         "title": "학습 효율 최적화",
         "desc": "좋은 습관이 갖춰져 있으므로, 시간 블록법과 간격 반복 등 고급 전략으로 효율을 더 높이세요.",
         "period": "지속"},
    ],
    "career": [
        {"condition": lambda d: d["total"] < 55, "priority": "상",
         "title": "진로·전형 방향 설정 시급",
         "desc": "진로 방향이 불명확합니다. 관심 분야 탐색과 전형(수시/정시) 기본 이해부터 시작하세요.",
         "period": "즉시"},
        {"condition": lambda d: d["total"] < 75, "priority": "중",
         "title": "전형 전략 구체화",
         "desc": "진로 방향에 맞는 전형을 구체적으로 탐색하고, 성적-전형 정합성을 점검하세요.",
         "period": "이번 학기"},
        {"condition": lambda d: d["total"] >= 75, "priority": "하",
         "title": "전형 전략 정교화",
         "desc": "방향이 잘 잡혀 있으므로, 목표 대학별 세부 전형 요건을 분석하고 맞춤 전략을 세우세요.",
         "period": "다음 학기"},
    ],
}


def generate_high_roadmap(
    naesin: dict, mock: dict, study: dict, career: dict,
    timing: str | None = None,
) -> dict:
    """4축 점수 + timing 기반 고등학생 로드맵 자동 초안 생성."""
    area_data = {
        "naesin": naesin,
        "mock": mock,
        "study": study,
        "career": career,
    }
    area_labels = {
        "naesin": "내신 경쟁력",
        "mock": "모의고사 역량",
        "study": "학습습관·전략",
        "career": "진로·전형 전략",
    }

    items: list[dict] = []
    for area_key, candidates in _HIGH_ROADMAP_ITEMS.items():
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
                break

    priority_order = {"상": 0, "중": 1, "하": 2}
    items.sort(key=lambda x: priority_order.get(x["priority"], 9))

    matrix = _generate_high_roadmap_matrix(naesin, mock, study, career, timing)

    return {
        "items": items,
        "matrix": matrix,
        "summary": _high_roadmap_summary(items, timing),
    }


def _generate_high_roadmap_matrix(
    naesin: dict, mock: dict, study: dict, career: dict,
    timing: str | None = None,
) -> dict:
    """timing별 Phase × 4트랙 고등학생 로드맵 매트릭스."""
    # 조건 플래그
    naesin_weak = naesin["total"] < 55
    naesin_mid = 55 <= naesin["total"] < 75
    mock_weak = mock["total"] < 55 or mock.get("no_data")
    mock_mid = 55 <= mock["total"] < 75
    study_weak = study["total"] < 55
    career_weak = career["total"] < 55

    naesin_trend = _detail_score(naesin, "등급추이")
    mock_trend_val = _detail_score(mock, "백분위_추이")

    tracks = [
        {"key": "academic", "label": "교과 학습", "icon": "📘"},
        {"key": "naesin", "label": "내신 전략", "icon": "📋"},
        {"key": "mock_prep", "label": "수능·모의고사", "icon": "🎯"},
        {"key": "habit", "label": "학습 습관 개선", "icon": "🔧"},
    ]

    # timing에 따른 Phase 구성
    t = timing or "T1"

    if t == "T1":
        phases = [
            {"key": "p0", "label": "Phase 0: 여름방학", "theme": "1학기 보완 & 체질 개선"},
            {"key": "p1", "label": "Phase 1: 고1-2학기", "theme": "내신 반등 & 학습법 정착"},
            {"key": "p2", "label": "Phase 2: 고2 진입", "theme": "선택과목 & 진로 구체화"},
        ]
    elif t == "T2":
        phases = [
            {"key": "p0", "label": "Phase 0: 겨울방학", "theme": "1년 성적 분석 & 보강"},
            {"key": "p1", "label": "Phase 1: 고2-1학기", "theme": "선택과목 첫 내신 & 모의 체계"},
            {"key": "p2", "label": "Phase 2: 고2-2학기", "theme": "전형 방향 탐색 & 심화"},
            {"key": "p3", "label": "Phase 3: 고3 방향", "theme": "수시/정시 윤곽 & 고3 전략"},
        ]
    elif t == "T3":
        phases = [
            {"key": "p0", "label": "Phase 0: 여름방학", "theme": "선택과목 성적 보완 & 수능 기반"},
            {"key": "p1", "label": "Phase 1: 고2-2학기", "theme": "내신 마무리 & 전형 확정 준비"},
            {"key": "p2", "label": "Phase 2: 고3 진입 준비", "theme": "고3 학습 로드맵 확정"},
        ]
    else:  # T4
        phases = [
            {"key": "p0", "label": "Phase 0: 겨울방학", "theme": "2년 종합 분석 & 고3 돌입 준비"},
            {"key": "p1", "label": "Phase 1: 고3-1학기", "theme": "최종 내신 + 수능 병행"},
            {"key": "p2", "label": "Phase 2: 수능 대비", "theme": "수능 집중 & 실전 감각"},
            {"key": "p3", "label": "Phase 3: 수능·원서", "theme": "수능 마무리 & 원서 전략"},
        ]

    cells: dict[str, dict[str, str]] = {}

    # ── T1: 고1-1학기 말 ──
    if t == "T1":
        p0: dict[str, str] = {}
        p0["academic"] = ("1학기 취약 과목(특히 수학·영어) 기본 개념 재정리\n여름방학 중 2학기 범위 예습 1회독" if naesin_weak
                          else "1학기 취약 단원 보완 + 2학기 선행\n심화 문제 풀이로 상위 등급 대비")
        p0["naesin"] = "1학기 중간·기말 오답 분석 → 취약 유형 정리\n2학기 수행평가 대비 계획 수립"
        p0["mock_prep"] = ("3월·6월 모의 오답 분석 + 기본 유형 정리\n수학: 킬러 제외 2~3등급 문항 반복" if not mock_weak
                           else "모의고사 기본 유형 익히기(국·영·수)\n시간 배분 연습 + 오답 유형 분류")
        p0["habit"] = ("매일 자기주도 학습 2시간 루틴 만들기\n오답노트 작성 습관 형성" if study_weak
                       else "주간 학습 계획표 작성 + 실행률 점검\n과목별 시간 배분 최적화")
        cells["p0"] = p0

        p1: dict[str, str] = {}
        p1["academic"] = ("수학·영어 기본 개념 완성에 집중\n모든 과목 교과서 완전 이해 목표" if naesin_weak
                          else "내신 1~2등급 과목 수 늘리기\n전공 관련 과목 최상위 등급 목표")
        p1["naesin"] = "중간·기말 시험 2주 전 과목별 계획표\n수행평가 일정 관리 + 보고서 퀄리티 향상"
        p1["mock_prep"] = "9월·11월 모의고사 응시 + 결과 분석\n영역별 취약점 파악 및 보완 계획"
        p1["habit"] = ("자기주도 학습 비율 40%+ 확보\n시험 기간 오답 정리 철저히" if study_weak
                       else "효율적 복습 주기(당일·3일·1주) 정립\n시험 후 분석 루틴 정착")
        cells["p1"] = p1

        p2: dict[str, str] = {}
        p2["academic"] = "고2 선택과목 전략적 수강 계획\n진로 연계 과목에서 최상위 등급 목표"
        p2["naesin"] = "1학년 성적 분석 → 고2 등급 목표 설정\n학종/교과전형 방향에 맞는 등급 관리"
        p2["mock_prep"] = "수능 영역별 목표 등급 설정\n매 모의고사 후 오답 분석 루틴 정착"
        p2["habit"] = ("자기주도 학습 비율 50%+ 목표\n과목별 학습법 최적화" if study_weak
                       else "학습 효율 극대화(시간 블록법, 간격 반복)\n자기주도 학습 비율 60%+ 유지")
        cells["p2"] = p2

    # ── T2: 고1-2학기 말 ──
    elif t == "T2":
        p0 = {}
        p0["academic"] = ("1년간 취약 과목 집중 보강\n고2 선택과목 예습 시작" if naesin_weak
                          else "1학년 성적 분석 → 취약 단원 보완\n고2 선택과목 선행 학습")
        p0["naesin"] = "1학년 4회 시험 패턴 분석(출제 경향, 수행 비중)\n고2 내신 전략 재설계"
        p0["mock_prep"] = ("모의고사 기본기 다지기: 국·영·수 유형 정리\n영어 절대평가 90점+ 기반 구축" if mock_weak
                           else "모의 취약 영역 겨울방학 집중 보강\n수능 기출 연도별 풀이 시작")
        p0["habit"] = ("겨울방학 학습 루틴 재정비\n하루 3시간+ 자기주도 학습 목표" if study_weak
                       else "학습 계획 정교화 + 실행률 80%+ 목표\n과목별 학습법 만족도 점검 및 조정")
        cells["p0"] = p0

        p1 = {}
        p1["academic"] = ("선택과목 기본 개념 확실히 잡기\n취약 과목 주당 2~3시간 추가 배분" if naesin_weak
                          else "선택과목 심화 학습 + 내신 최상위 도전\n전공 관련 과목 1등급 확보")
        p1["naesin"] = "고2 첫 중간고사 전략적 준비\n수행평가 초기부터 꼼꼼히 관리"
        p1["mock_prep"] = "3월·6월 모의고사 집중 대비\n수능 유형별 풀이 전략 정립"
        p1["habit"] = "주간 학습 계획 수립·실행·점검 정착\n시험 분석 → 다음 시험 전략 반영 루틴"
        cells["p1"] = p1

        p2 = {}
        p2["academic"] = "1학기 성적 기반 2학기 보완 계획\n약한 선택과목 집중 보강"
        p2["naesin"] = "고2 내신 마무리 — 등급 최적화\n수행평가 보고서·발표 퀄리티 극대화"
        p2["mock_prep"] = "9월·11월 모의고사 결과 분석\n수능 최저 충족 가능성 사전 점검"
        p2["habit"] = "학습 효율 분석 + 비효율 요소 제거\n시험 기간 vs 평소 학습 비율 최적화"
        cells["p2"] = p2

        p3 = {}
        p3["academic"] = "고3 수능 과목 확정 + 선행 시작\n전공 관련 과목 심화 학습"
        p3["naesin"] = ("학종 vs 교과전형 최종 방향 설정\n고3 내신 목표 등급 수립" if not career_weak
                        else "수시/정시 방향 탐색 본격화\n성적 추이 기반 전형 적합도 분석")
        p3["mock_prep"] = "수능 영역별 목표 등급 확정\n킬러 문항 대비 vs 기본 완성 전략 선택"
        p3["habit"] = "고3 학습 로드맵 초안 작성\n자기주도 학습 비율 60%+ 목표"
        cells["p3"] = p3

    # ── T3: 고2-1학기 말 ──
    elif t == "T3":
        p0 = {}
        p0["academic"] = ("선택과목 취약 단원 여름방학 집중 보강\n수능 과목 기본기 재점검" if naesin_weak or naesin_mid
                          else "내신 최상위 유지 + 수능 기본기 병행\n전공 관련 심화 학습")
        p0["naesin"] = "고2-1학기 성적 분석 → 2학기 전략 수정\n수행평가 유형별 대비법 정리"
        p0["mock_prep"] = ("모의고사 취약 영역 집중 보강\n수능 기출 3개년 풀이 시작" if mock_weak or mock_mid
                           else "모의 1~2등급 안착 전략\n킬러 문항 유형 분석 + 풀이법 훈련")
        p0["habit"] = ("학습 습관 점검 + 개선 계획 수립\n오답 관리 시스템 재정비" if study_weak
                       else "학습 효율 극대화 전략 적용\n수능 대비 시간 배분 계획")
        cells["p0"] = p0

        p1 = {}
        p1["academic"] = "고2 마지막 내신 — 등급 최적화\n수능 연계 학습 비중 점진적 확대"
        p1["naesin"] = "고2 마지막 내신 전력투구\n수시 지원 시 반영되는 최종 내신"
        p1["mock_prep"] = "9월·11월 모의 목표 등급 설정\n수능 최저 충족 가능성 구체적 점검"
        p1["habit"] = "내신 vs 수능 학습 시간 배분 전략\n시험 기간 집중도 극대화"
        cells["p1"] = p1

        p2 = {}
        p2["academic"] = "고3 학습 로드맵 확정\n수능 과목별 목표 점수 설정"
        p2["naesin"] = ("수시 6장 카드 시뮬레이션 시작\n학종/교과 지원 대학 리스트 작성" if not career_weak
                        else "수시 vs 정시 방향 최종 확정\n전형별 유불리 분석")
        p2["mock_prep"] = "수능 D-300 학습 계획 수립\n영역별 목표 백분위·등급 확정"
        p2["habit"] = "고3 학습 루틴 시뮬레이션\n하루 8시간+ 자기주도 학습 체계"
        cells["p2"] = p2

    # ── T4: 고2-2학기 말 ──
    else:
        p0 = {}
        p0["academic"] = ("수능 취약 과목 겨울방학 집중 보강\n기본 개념 최종 점검 + 실전 문풀" if naesin_weak or mock_weak
                          else "수능 실전 감각 유지 + 내신 마무리 준비\n전 과목 기출 회독 완료")
        p0["naesin"] = "2년 내신 종합 분석 → 고3 전략 확정\n학종 서류 소재 정리 시작"
        p0["mock_prep"] = ("수능 기출 5개년 1회독 완료 목표\n취약 유형 집중 반복" if mock_weak or mock_mid
                           else "수능 기출 정밀 분석 + 변형 문제 풀이\n시간 단축 훈련 + 실전 모의 연습")
        p0["habit"] = ("하루 10시간 학습 체계 구축\n시간 블록법 + 집중도 관리" if study_weak
                       else "고3 학습 루틴 최종 확정\n컨디션 관리 + 멘탈 관리 계획")
        cells["p0"] = p0

        p1 = {}
        p1["academic"] = "고3 내신 최종 전력투구\n수능 연계교재 + 기출 병행"
        p1["naesin"] = "고3-1학기 내신 = 수시 최종 반영\n수행평가 완벽 대비 + 세특 마무리"
        p1["mock_prep"] = "매월 모의고사 결과 분석 + 보완\n6월 모평 = 수능 예측 핵심 지표"
        p1["habit"] = "내신 기간 / 수능 기간 시간 배분 전환\n주 단위 학습량 점검 + 조정"
        cells["p1"] = p1

        p2 = {}
        p2["academic"] = "수능 전 과목 최종 회독\n취약 단원 마지막 보강"
        p2["naesin"] = "수시 원서 6장 최종 확정\n자소서·면접 준비 (해당 시)"
        p2["mock_prep"] = "9월 모평 결과 → 수능 최종 전략 조정\n실전 모의고사 주 1회 풀이"
        p2["habit"] = "수능 D-60 집중 루틴\n체력·수면·멘탈 관리 최우선"
        cells["p2"] = p2

        p3 = {}
        p3["academic"] = "수능 당일 컨디션 조절\n과목별 마지막 정리 노트 활용"
        p3["naesin"] = "수능 후 정시 원서 전략 수립\n수시 합격 시 등록 절차 확인"
        p3["mock_prep"] = "수능 직전 실전 감각 유지\n새 문제보다 기출 재확인 중심"
        p3["habit"] = "수능 전 1주: 가벼운 복습 + 컨디션 관리\n시험 당일 시간 배분 최종 리허설"
        cells["p3"] = p3

    return {
        "phases": phases,
        "tracks": tracks,
        "cells": cells,
    }


def _high_roadmap_summary(items: list[dict], timing: str | None = None) -> str:
    """고등학생 로드맵 한 줄 요약."""
    timing_label = {
        "T1": "고1-1학기 말", "T2": "고1-2학기 말",
        "T3": "고2-1학기 말", "T4": "고2-2학기 말",
    }.get(timing or "T1", "현재 시점")

    high_priority = [it for it in items if it["priority"] == "상"]
    if not high_priority:
        return f"{timing_label} 기준, 전체적으로 양호한 수준입니다. 단계별 세부 전략을 참고하세요."
    names = ", ".join(it["title"] for it in high_priority[:3])
    return f"{timing_label} 기준 우선 보강 영역: {names}."
