"""
입결 매칭 모듈
- 입결 DB 로드
- 학생 환산 내신 vs 입결 70% 수치 비교
- 비교과 종합등급 병기
- 종합 판단 코멘트 생성 (Claude용 데이터 준비)
"""
import os
import openpyxl
from typing import Optional


def load_admission_db(xlsx_path: str = None) -> list:
    """입결 DB 로드. 시트 '수시입결RAW', 헤더 3행, 데이터 5행부터."""
    if xlsx_path is None:
        xlsx_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                                 'data', 'admission_db.xlsx')

    wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
    ws = wb['수시입결RAW']

    # 헤더는 3행 (Row 3)
    # 컬럼: 대학, 전형구분, 전형명, 모집단위명, 학년도, 모집인원,
    #        지원자, 경쟁률, 추합, 입결50%, 입결70%, 비고
    # 인덱스: 0     1       2      3         4      5
    #         6      7      8     9       10       11

    records = []
    for i, row in enumerate(ws.iter_rows(min_row=5, values_only=True), 5):
        # 입결 데이터가 있는 행만 로드
        if row[9] is None and row[10] is None:
            continue

        try:
            record = {
                '대학': str(row[0]) if row[0] else '',
                '전형구분': str(row[1]) if row[1] else '',
                '전형명': str(row[2]) if row[2] else '',
                '모집단위명': str(row[3]) if row[3] else '',
                '학년도': int(row[4]) if row[4] else 0,
                '모집인원': int(row[5]) if row[5] else 0,
                '지원자': int(row[6]) if row[6] else 0,
                '경쟁률': float(row[7]) if row[7] else 0,
                '추합': int(row[8]) if row[8] else 0,
                '입결50': _parse_grade_value(row[9]),
                '입결70': _parse_grade_value(row[10]),
                '비고': str(row[11]) if row[11] else '',
            }
            if record['입결50'] > 0 or record['입결70'] > 0:
                records.append(record)
        except (ValueError, TypeError):
            continue

    wb.close()
    print(f"입결 DB 로드 완료: {len(records)}건")
    return records


def _parse_grade_value(value) -> float:
    """입결 등급 값 파싱. 숫자 또는 '4.36 (평균)' 형식 처리."""
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        # "4.36 (평균)" 같은 형식에서 숫자만 추출
        text = str(value).strip()
        num_part = text.split('(')[0].strip().split()[0]
        return float(num_part)
    except (ValueError, IndexError):
        return 0


def match_admissions(student_grade_9: float,
                      admission_data: list,
                      bigyogwa_grades: dict = None,
                      target_university: str = None,
                      target_department: str = None,
                      track: str = None) -> dict:
    """학생 환산 9등급과 입결 DB 비교. 수치 비교 + 비교과 등급 병기."""

    # 필터링
    filtered = admission_data
    if target_university:
        filtered = [r for r in filtered if target_university in r['대학']]
    if target_department:
        filtered = [r for r in filtered
                    if target_department in r['모집단위명'] or
                    _is_related_department(target_department, r['모집단위명'])]
    elif track:
        filtered = _filter_by_track(filtered, track)

    # 최신 연도 우선 (가장 최근 2개 연도)
    if filtered:
        years = sorted(set(r['학년도'] for r in filtered if r['학년도'] > 0), reverse=True)
        recent_years = years[:2] if years else []
        if recent_years:
            filtered = [r for r in filtered if r['학년도'] in recent_years]

    # 수치 비교 (안정/적정/소신 분류 없이 수치 표시)
    matches = []
    for record in filtered:
        # 입결 70%를 기준으로 비교 (없으면 입결50%)
        cutoff_70 = record['입결70'] if record['입결70'] > 0 else None
        cutoff_50 = record['입결50'] if record['입결50'] > 0 else None
        cutoff = cutoff_70 if cutoff_70 else cutoff_50
        if not cutoff or cutoff <= 0:
            continue

        diff = round(student_grade_9 - cutoff, 2)  # 양수=학생이 입결보다 낮음(불리), 음수=유리

        entry = {
            '대학': record['대학'],
            '전형구분': record['전형구분'],
            '전형명': record['전형명'],
            '모집단위명': record['모집단위명'],
            '학년도': record['학년도'],
            '입결70': cutoff_70,
            '입결50': cutoff_50,
            '경쟁률': record['경쟁률'],
            '내환산등급': student_grade_9,
            '차이': diff,
        }
        matches.append(entry)

    # 입결 70% 기준 정렬 (차이가 작은 순 = 가장 적정한 것부터)
    matches.sort(key=lambda x: abs(x['차이']))

    # 비교과 종합 등급 정보
    bigyogwa_summary = {}
    if bigyogwa_grades:
        bigyogwa_summary = {
            '세특': bigyogwa_grades.get('세특', 'N/A'),
            '창체': bigyogwa_grades.get('창체', 'N/A'),
            '행특': bigyogwa_grades.get('행특', 'N/A'),
            '비교과종합': _calc_bigyogwa_overall(bigyogwa_grades),
        }

    return {
        'student_grade_9': student_grade_9,
        'bigyogwa_grades': bigyogwa_summary,
        'matches': matches[:30],  # 상위 30개
        'total_matched': len(matches),
        'disclaimer': '5등급↔9등급 환산에 따른 참고 결과이며, 2022 교육과정 적용 첫 입시에서는 입결이 변동될 수 있음'
    }


def _calc_bigyogwa_overall(bigyogwa_grades: dict) -> str:
    """비교과 종합 등급 산출 (S/A/B/C/D 중 최빈값 또는 평균)"""
    grade_to_num = {'S': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'N/A': 0}
    num_to_grade = {5: 'S', 4: 'A', 3: 'B', 2: 'C', 1: 'D'}

    values = []
    for key in ['세특', '창체', '행특']:
        g = bigyogwa_grades.get(key, 'N/A')
        if g in grade_to_num and grade_to_num[g] > 0:
            values.append(grade_to_num[g])

    if not values:
        return 'N/A'

    avg = sum(values) / len(values)
    # 반올림하여 가장 가까운 등급 반환
    rounded = round(avg)
    return num_to_grade.get(rounded, 'N/A')


def build_admission_comment_data(match_result: dict) -> dict:
    """입결 매칭 결과를 Claude 종합 판단 코멘트 생성용 데이터로 변환"""
    student_grade = match_result.get('student_grade_9', 0)
    bigyogwa = match_result.get('bigyogwa_grades', {})
    matches = match_result.get('matches', [])

    # 상위 10개 대학에 대한 코멘트 데이터
    comment_data = []
    for m in matches[:10]:
        diff = m.get('차이', 0)
        if diff < -0.3:
            position = '입결 70% 대비 여유 있음'
        elif diff <= 0.3:
            position = '입결 70% 수준'
        else:
            position = f'입결 70%보다 {abs(diff):.1f}등급 낮음'

        comment_data.append({
            '대학': m['대학'],
            '모집단위명': m['모집단위명'],
            '전형명': m['전형명'],
            '입결70': m['입결70'],
            '내환산등급': student_grade,
            '차이': diff,
            '내신위치': position,
            '비교과종합': bigyogwa.get('비교과종합', 'N/A'),
        })

    return {
        'student_grade_9': student_grade,
        'bigyogwa_overall': bigyogwa.get('비교과종합', 'N/A'),
        'entries': comment_data,
    }


def _is_related_department(target: str, dept_name: str) -> bool:
    """학과명 유사 매칭"""
    # 핵심 키워드 추출 (2글자 이상 단위)
    keywords = []
    for length in [4, 3, 2]:
        if len(target) >= length:
            keywords.append(target[:length])
    return any(kw in dept_name for kw in keywords)


def _filter_by_track(records: list, track: str) -> list:
    """계열별 필터링"""
    if track == '자연':
        science_keywords = ['공과', '자연과학', '이과', 'IT', '컴퓨터', '전자', '기계',
                          '화학', '생명', '수학', '물리', '공학', '소프트웨어', '데이터',
                          '인공지능', 'AI', '반도체', '신소재', '건축', '환경', '에너지']
        return [r for r in records
                if any(kw in r['모집단위명'] for kw in science_keywords)]
    elif track == '인문':
        humanities_keywords = ['인문', '사회', '경영', '경제', '법', '정치', '행정',
                             '국어', '영어', '역사', '철학', '심리', '교육', '언론',
                             '미디어', '문학', '국제', '통상', '무역']
        return [r for r in records
                if any(kw in r['모집단위명'] for kw in humanities_keywords)]
    return records


def run_admission_matching(grade_analysis: dict, config: dict = None,
                            university: str = None, department: str = None,
                            bigyogwa_grades: dict = None) -> dict:
    """입결 매칭 메인 함수. Step 4 실행."""
    student_grade_9 = grade_analysis.get('grade_converted_9', 5.0)
    track = grade_analysis.get('track', '공통')

    admission_data = load_admission_db()
    result = match_admissions(
        student_grade_9=student_grade_9,
        admission_data=admission_data,
        bigyogwa_grades=bigyogwa_grades,
        target_university=university,
        target_department=department,
        track=track,
    )
    return result
