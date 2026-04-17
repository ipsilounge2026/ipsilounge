"""
내신 성적 분석 모듈
- 학기별/학년별 평균 등급 산출
- 5등급→9등급 환산
- 성적 추이 패턴 분석
- 원점수/평균/분포 맥락 분석
- 교과 이수 충실도 평가
- 소인수 과목 표기
- 출결 점수 산출
"""
import os
import yaml
import openpyxl
from typing import Optional


def load_config(config_path: str = None) -> dict:
    """config.yaml 로드"""
    if config_path is None:
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                                   'config', 'config.yaml')
    with open(config_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def load_grade_conversion(xlsx_path: str = None, sheet_name: str = None) -> list:
    """5등급→9등급 환산표 로드. 선형보간에 사용할 테이블 반환."""
    if xlsx_path is None:
        xlsx_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                                 'config', 'grade_conversion.xlsx')
    config = load_config()
    if sheet_name is None:
        sheet_name = config.get('grade_conversion_source', '부산광역시교육청')

    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb[sheet_name]

    table = []
    if sheet_name == '부산광역시교육청':
        # 부산: A열=5등급 평균(숫자, 일부 None), C열=9등급 평균
        for row in ws.iter_rows(min_row=2, values_only=True):
            five = row[0]
            nine = row[2]
            if five is not None and nine is not None:
                table.append({'five': float(five), 'nine': float(nine)})
    elif sheet_name == '경기진협':
        # 경기진협: A열="1.000 (6)" 형식 문자열, C열=환산 9등급
        for row in ws.iter_rows(min_row=2, values_only=True):
            five_str = row[0]
            nine = row[2]
            if five_str is not None and nine is not None:
                five = float(str(five_str).split('(')[0].strip())
                table.append({'five': five, 'nine': float(nine)})

    wb.close()
    table.sort(key=lambda x: x['five'])
    return table


def convert_5to9(five_grade_avg: float, conversion_table: list = None) -> float:
    """5등급 평균을 9등급으로 환산 (선형보간)"""
    if conversion_table is None:
        conversion_table = load_grade_conversion()

    if not conversion_table:
        return five_grade_avg  # fallback

    # 범위 밖 처리
    if five_grade_avg <= conversion_table[0]['five']:
        return conversion_table[0]['nine']
    if five_grade_avg >= conversion_table[-1]['five']:
        return conversion_table[-1]['nine']

    # 선형보간
    for i in range(len(conversion_table) - 1):
        low = conversion_table[i]
        high = conversion_table[i + 1]
        if low['five'] <= five_grade_avg <= high['five']:
            ratio = (five_grade_avg - low['five']) / (high['five'] - low['five'])
            return round(low['nine'] + ratio * (high['nine'] - low['nine']), 2)

    return conversion_table[-1]['nine']


def _get_subject_grade(subject: dict) -> float:
    """과목의 등급 값 반환. 석차등급 있으면 사용, 없으면 성취도 환산."""
    if subject.get('석차등급') is not None:
        return float(subject['석차등급'])
    # 진로선택과목: 성취도 → 등급 환산
    grade_map = {'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5}
    return grade_map.get(subject.get('성취도', 'C'), 3)


def _is_major_subject(subject: dict, track: str = '공통') -> bool:
    """주요교과 여부 판별"""
    major_groups = {
        '공통': ['국어', '수학', '영어'],
        '인문': ['국어', '수학', '영어', '사회', '한국사'],
        '자연': ['국어', '수학', '영어', '과학'],
    }
    groups = major_groups.get(track, major_groups['공통'])
    return subject.get('교과군', '') in groups


def estimate_track(grades: dict) -> str:
    """이수 과목으로 인문/자연 계열 추정"""
    science_keywords = ['물리학', '화학', '생명과학', '지구과학', '물리', '화학Ⅱ',
                        '생명과학Ⅱ', '지구과학Ⅱ', '미적분', '기하', '확률과통계']
    humanities_keywords = ['정치와법', '경제', '사회문화', '생활과윤리', '윤리와사상',
                          '세계사', '동아시아사', '한국지리', '세계지리']

    science_count = 0
    humanities_count = 0
    for semester_subjects in grades.values():
        for subj in semester_subjects:
            name = subj.get('과목명', '')
            if any(kw in name for kw in science_keywords):
                science_count += 1
            if any(kw in name for kw in humanities_keywords):
                humanities_count += 1

    if science_count > humanities_count:
        return '자연'
    elif humanities_count > science_count:
        return '인문'
    return '공통'


def calc_semester_average(subjects: list, track: str = None) -> dict:
    """학기별 학점 가중 평균 등급 산출. 전교과 + 주요교과 동시 계산."""
    all_weighted_sum = 0
    all_credit_sum = 0
    major_weighted_sum = 0
    major_credit_sum = 0

    for subj in subjects:
        credit = subj.get('학점', 0)
        if credit <= 0:
            continue
        grade = _get_subject_grade(subj)

        all_weighted_sum += grade * credit
        all_credit_sum += credit

        if track and _is_major_subject(subj, track):
            major_weighted_sum += grade * credit
            major_credit_sum += credit

    result = {
        '전교과': round(all_weighted_sum / all_credit_sum, 2) if all_credit_sum > 0 else 0,
        '주요교과': round(major_weighted_sum / major_credit_sum, 2) if major_credit_sum > 0 else 0,
    }
    return result


def calc_yearly_averages(grades: dict, track: str = '공통') -> dict:
    """학년별 평균 산출 (두 학기 합산)"""
    yearly = {}
    for year in ['1', '2', '3']:
        all_subjects = []
        for semester in [f'{year}-1', f'{year}-2']:
            all_subjects.extend(grades.get(semester, []))
        if all_subjects:
            yearly[year] = calc_semester_average(all_subjects, track)
        else:
            yearly[year] = {'전교과': 0, '주요교과': 0}
    return yearly


def analyze_trend(yearly_averages: dict, threshold: float = 0.3) -> tuple:
    """성적 추이 5유형 판별. 등급 숫자가 작을수록 좋은 성적."""
    avgs = []
    for year in ['1', '2', '3']:
        avg = yearly_averages.get(year, {}).get('전교과', 0)
        if avg > 0:
            avgs.append(avg)

    if len(avgs) < 2:
        return '판별불가', '데이터 부족'

    if len(avgs) == 2:
        diff = avgs[1] - avgs[0]
        if diff < -threshold:
            return '상승형', f'{avgs[0]:.2f} → {avgs[1]:.2f} (등급 향상)'
        elif diff > threshold:
            return '하락형', f'{avgs[0]:.2f} → {avgs[1]:.2f} (등급 하락)'
        else:
            return '안정형', f'{avgs[0]:.2f} → {avgs[1]:.2f} (변동 미미)'

    # 3학년 데이터
    d12 = avgs[1] - avgs[0]  # 1→2 변화 (음수=상승)
    d23 = avgs[2] - avgs[1]  # 2→3 변화

    detail = f'{avgs[0]:.2f} → {avgs[1]:.2f} → {avgs[2]:.2f}'

    if d12 < -threshold and d23 < -threshold:
        return '상승형', f'{detail} (지속적 등급 향상)'
    elif d12 > threshold and d23 < -threshold:
        return 'V자반등형', f'{detail} (중간 하락 후 회복)'
    elif d12 < -threshold and d23 > threshold:
        return '역V자형', f'{detail} (중간 상승 후 하락)'
    elif d12 > threshold and d23 > threshold:
        return '하락형', f'{detail} (지속적 등급 하락)'
    else:
        return '안정형', f'{detail} (등급 변동 미미)'


def find_small_class_subjects(grades: dict, threshold: int = 13) -> list:
    """소인수 과목 (수강자수 <= threshold) 목록"""
    result = []
    for semester, subjects in grades.items():
        for subj in subjects:
            if subj.get('수강자수', 999) <= threshold:
                result.append({
                    '학기': semester,
                    '과목명': subj['과목명'],
                    '수강자수': subj['수강자수']
                })
    return result


def analyze_jinro_subjects(grades: dict) -> list:
    """진로선택과목 성취도 분석"""
    result = []
    for semester, subjects in grades.items():
        for subj in subjects:
            if subj.get('과목유형') == '진로선택':
                result.append({
                    '학기': semester,
                    '과목명': subj['과목명'],
                    '성취도': subj.get('성취도', ''),
                    '성취도별분포비율': subj.get('성취도별분포비율', ''),
                    '수강자수': subj.get('수강자수', 0),
                })
    return result


def analyze_grade_context(grades: dict) -> list:
    """원점수/평균/성취도분포 기반 실질 위치 분석"""
    result = []
    for semester, subjects in grades.items():
        for subj in subjects:
            raw = subj.get('원점수', 0)
            avg = subj.get('과목평균', 0)
            grade = subj.get('성취도', '')
            ratio_str = subj.get('성취도별분포비율', '')

            if not grade or not ratio_str:
                continue

            gap = raw - avg
            ratios = _parse_ratio(ratio_str)
            my_grade_ratio = ratios.get(grade, 0)

            # 분석 텍스트 생성
            if gap >= 15:
                position = '과목 내 최상위권'
            elif gap >= 5:
                position = '과목 내 상위권'
            elif gap >= -5:
                position = '과목 내 중위권'
            else:
                position = '과목 내 하위권'

            if my_grade_ratio <= 10:
                density = f'{grade}등급 비율 {my_grade_ratio}%로 경쟁력 높음'
            elif my_grade_ratio <= 25:
                density = f'{grade}등급 비율 {my_grade_ratio}%로 보통'
            else:
                density = f'{grade}등급 비율 {my_grade_ratio}%로 변별력 낮음'

            result.append({
                '학기': semester,
                '과목명': subj['과목명'],
                '성취도': grade,
                '원점수': raw,
                '과목평균': avg,
                '원점수_평균차': round(gap, 1),
                '실질위치': position,
                '분포분석': density,
            })
    return result


def _parse_ratio(ratio_str: str) -> dict:
    """성취도별분포비율 문자열 파싱. "15.2/25.3/30.1/20.0/9.4" → {'A':15.2, 'B':25.3, ...}"""
    grades = ['A', 'B', 'C', 'D', 'E']
    parts = str(ratio_str).split('/')
    result = {}
    for i, g in enumerate(grades):
        if i < len(parts):
            try:
                result[g] = float(parts[i])
            except ValueError:
                result[g] = 0
        else:
            result[g] = 0
    return result


def load_course_requirements(xlsx_path: str = None,
                              university: str = None,
                              department: str = None) -> Optional[dict]:
    """교과 이수 기준표 로드. 대학+학과에 맞는 핵심/권장 과목 반환.

    ※ 2026-04 스키마 정규화:
        - 단일 시트 "권장과목" (Wide + 쉼표 구분)
        - 열: 대학 | 모집단위 | 핵심과목 | 권장과목 | 비고
        - school-record-analyzer 와 ipsilounge 가 동일 파일 공유

    Args:
        xlsx_path: 파일 경로 (기본 data/course_requirements.xlsx)
        university: 대학명 (예: "서울대")
        department: 모집단위명 (예: "컴퓨터공학부")

    Returns:
        {'핵심': [...], '권장': [...], '대학': university_or_"종합"}
        또는 None (파일 없음/매칭 없음)
    """
    if xlsx_path is None:
        xlsx_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                                 'data', 'course_requirements.xlsx')

    if not os.path.exists(xlsx_path):
        return None

    rows = _load_normalized_rows(xlsx_path)
    if not rows:
        return None

    if university and department:
        # 우선순위 1: 대학+모집단위 지정
        row = _lookup_row(rows, university, department)
        if row:
            return {
                '핵심': list(row['핵심과목']),
                '권장': list(row['권장과목']),
                '대학': row['대학'],
            }
        return None
    elif department:
        # 우선순위 2: 모집단위만 지정 → 모든 대학 대상 매칭 후 과반수 종합
        matched = [r for r in rows if _major_match(r['모집단위'], department)]
        if not matched:
            return None
        universal_style = [
            {'핵심': r['핵심과목'], '권장': r['권장과목'], '대학': r['대학']}
            for r in matched
        ]
        return _merge_requirements(universal_style)
    else:
        return None


def _load_normalized_rows(xlsx_path: str) -> list:
    """정규화된 권장과목 시트를 읽어 행 딕셔너리 리스트로 반환."""
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    sheet_name = '권장과목' if '권장과목' in wb.sheetnames else wb.sheetnames[0]
    ws = wb[sheet_name]

    rows = []
    for i, row_cells in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        if not row_cells or len(row_cells) < 2:
            continue
        univ = row_cells[0]
        major = row_cells[1] if len(row_cells) > 1 else None
        if not univ or not major:
            continue
        univ_s = str(univ).strip()
        major_s = str(major).strip()
        # 주석 행(※) 스킵
        if univ_s.startswith('※'):
            continue
        core = _split_courses(row_cells[2] if len(row_cells) > 2 else None)
        recommended = _split_courses(row_cells[3] if len(row_cells) > 3 else None)
        rows.append({
            '대학': univ_s,
            '모집단위': major_s,
            '핵심과목': core,
            '권장과목': recommended,
        })

    wb.close()
    return rows


def _split_courses(cell_value) -> list:
    """쉼표 구분 셀 → 과목 리스트."""
    if cell_value is None:
        return []
    text = str(cell_value).strip()
    if not text or text == '-':
        return []
    return [p.strip() for p in text.split(',') if p.strip()]


def _normalize_key(name: str) -> str:
    """매칭용 키 정규화 (공백 제거 + 소문자)."""
    if not name:
        return ''
    return ''.join(name.split()).lower()


def _lookup_row(rows: list, university: str, department: str) -> Optional[dict]:
    """대학+모집단위로 행 조회. 정확 매칭 → 부분 매칭 순."""
    univ_n = _normalize_key(university)
    major_n = _normalize_key(department)

    # 정확 매칭
    for r in rows:
        if _normalize_key(r['대학']) == univ_n and _normalize_key(r['모집단위']) == major_n:
            return r

    # 대학 정확 + 모집단위 부분 매칭
    for r in rows:
        if _normalize_key(r['대학']) == univ_n:
            r_major = _normalize_key(r['모집단위'])
            if major_n in r_major or r_major in major_n:
                return r

    # 대학 부분 매칭까지 허용
    for r in rows:
        r_univ = _normalize_key(r['대학'])
        if univ_n in r_univ or r_univ in univ_n:
            r_major = _normalize_key(r['모집단위'])
            if major_n in r_major or r_major in major_n:
                return r

    return None


def _major_match(db_major: str, student_major: str) -> bool:
    """모집단위 부분 매칭 (학과만 지정한 경우 전체 대학 스캔용)."""
    a = _normalize_key(db_major)
    b = _normalize_key(student_major)
    if not a or not b:
        return False
    return a == b or a in b or b in a


def _merge_requirements(requirements_list: list) -> dict:
    """여러 대학의 이수 기준을 종합 (과반수 핵심 기준)"""
    from collections import Counter
    core_counter = Counter()
    rec_counter = Counter()
    total = len(requirements_list)

    for req in requirements_list:
        for s in req.get('핵심', []):
            core_counter[s] += 1
        for s in req.get('권장', []):
            rec_counter[s] += 1

    # 과반수 이상 등장한 과목을 핵심으로
    threshold = total / 2
    core = [s for s, c in core_counter.items() if c >= threshold]
    recommended = [s for s, c in rec_counter.items() if c >= threshold and s not in core]

    return {'핵심': core, '권장': recommended, '대학': '종합'}


def evaluate_course_fulfillment(student_subjects: list,
                                 requirements: Optional[dict]) -> dict:
    """교과 이수 충실도 평가 (1~5점)"""
    if not requirements:
        return {
            'score': 0,
            '핵심_이수': [],
            '핵심_미이수': [],
            '권장_이수': [],
            '권장_미이수': [],
            'detail': '교과 이수 기준 데이터 없음 (미평가)'
        }

    core_required = requirements.get('핵심', [])
    recommended = requirements.get('권장', [])

    # 학생 이수 과목 이름 리스트
    student_names = [s.get('과목명', '') for s in student_subjects]

    def is_taken(req_name):
        return any(req_name in sn or sn in req_name for sn in student_names)

    core_taken = [s for s in core_required if is_taken(s)]
    core_missing = [s for s in core_required if not is_taken(s)]
    rec_taken = [s for s in recommended if is_taken(s)]
    rec_missing = [s for s in recommended if not is_taken(s)]

    # 점수 산출
    if not core_required:
        score = 3  # 기준 없으면 중간
        detail = '핵심과목 기준 없음'
    elif len(core_missing) == 0:
        if len(rec_taken) >= 2:
            score = 5
            detail = f'핵심과목 전부 이수 + 권장과목 {len(rec_taken)}개 이수'
        elif len(rec_taken) == 1:
            score = 4
            detail = f'핵심과목 전부 이수 + 권장과목 1개 이수'
        else:
            score = 3
            detail = '핵심과목 전부 이수, 권장과목 미이수'
    elif len(core_missing) <= len(core_required) / 2:
        score = 2
        detail = f'핵심과목 일부 미이수: {", ".join(core_missing)}'
    else:
        score = 1
        detail = f'핵심과목 대부분 미이수: {", ".join(core_missing)}'

    return {
        'score': score,
        '핵심_이수': core_taken,
        '핵심_미이수': core_missing,
        '권장_이수': rec_taken,
        '권장_미이수': rec_missing,
        'detail': detail
    }


def calc_attendance_score(attendance: dict, config: dict = None) -> float:
    """출결 데이터를 100점 만점 점수로 환산"""
    if config is None:
        config = load_config()
    scoring = config.get('attendance_scoring', {})
    base = scoring.get('base', 100)

    total_deduction = 0
    for year, data in attendance.items():
        if not isinstance(data, dict):
            continue
        absence = data.get('결석', {})
        total_deduction += absence.get('미인정', 0) * abs(scoring.get('미인정결석_per_day', -5))
        total_deduction += absence.get('질병', 0) * abs(scoring.get('질병결석_per_day', -1))
        total_deduction += absence.get('기타', 0) * abs(scoring.get('질병결석_per_day', -1))

        for category in ['지각', '조퇴', '결과']:
            cat_data = data.get(category, {})
            if isinstance(cat_data, dict):
                for _, count in cat_data.items():
                    total_deduction += count * abs(scoring.get(f'{category}_per_count', -0.5))

    score = max(scoring.get('min_score', 0), base - total_deduction)
    return round(score, 1)


def calc_grade_score_100(overall_avg: float) -> float:
    """등급 평균(1.0~5.0)을 100점 만점으로 환산. 1.0→100, 5.0→0"""
    if overall_avg <= 0:
        return 0
    score = max(0, min(100, (5.0 - overall_avg) / 4.0 * 100))
    return round(score, 1)


def run_grade_analysis(extracted_data: dict, config: dict = None,
                        university: str = None, department: str = None) -> dict:
    """성적 분석 메인 함수. Step 3 전체 실행."""
    if config is None:
        config = load_config()

    grades = extracted_data.get('grades', {})
    attendance = extracted_data.get('attendance', {})

    # 계열 추정
    track = estimate_track(grades)

    # 학기별 평균
    semester_averages = {}
    for semester, subjects in grades.items():
        if subjects:
            semester_averages[semester] = calc_semester_average(subjects, track)

    # 학년별 평균
    yearly_averages = calc_yearly_averages(grades, track)

    # 전체 평균
    all_subjects = []
    for subjects in grades.values():
        all_subjects.extend(subjects)
    overall_average = calc_semester_average(all_subjects, track) if all_subjects else {'전교과': 0, '주요교과': 0}

    # 5→9등급 환산
    conversion_table = load_grade_conversion()
    grade_converted_9 = convert_5to9(overall_average['전교과'], conversion_table)

    # 성적 추이
    threshold = config.get('trend_threshold', 0.3)
    trend_pattern, trend_detail = analyze_trend(yearly_averages, threshold)

    # 소인수 과목
    small_threshold = config.get('scoring', {}).get('small_class_threshold', 13)
    small_class_subjects = find_small_class_subjects(grades, small_threshold)

    # 진로선택과목
    jinro_subjects = analyze_jinro_subjects(grades)

    # 원점수/분포 맥락 분석
    context_analysis = analyze_grade_context(grades)

    # 교과 이수 충실도
    requirements = load_course_requirements(university=university, department=department)
    course_fulfillment = evaluate_course_fulfillment(all_subjects, requirements)

    # 점수 환산
    grade_score_100 = calc_grade_score_100(overall_average['전교과'])
    attendance_score_100 = calc_attendance_score(attendance, config)

    return {
        'track': track,
        'semester_averages': semester_averages,
        'yearly_averages': yearly_averages,
        'overall_average': overall_average,
        'grade_converted_9': grade_converted_9,
        'trend_pattern': trend_pattern,
        'trend_detail': trend_detail,
        'small_class_subjects': small_class_subjects,
        'jinro_subjects': jinro_subjects,
        'context_analysis': context_analysis,
        'course_fulfillment': course_fulfillment,
        'grade_score_100': grade_score_100,
        'attendance_score_100': attendance_score_100,
    }
