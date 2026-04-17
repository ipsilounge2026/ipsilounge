"""
창체 분석 모듈
- 자율/동아리/진로 영역별 프롬프트 빌드
- Claude 응답 파싱/검증
- 가중점수 산출
- 좋은 평가 문장 추출
- 분량 비율 분석 (글자수 제한 대비 실제 작성 비율)
"""
import os
import json
from typing import Optional
from modules.grade_analyzer import load_config


# 영역별 평가 항목명
CHANGCHE_ITEMS = {
    '자율': ['참여의주도성', '활동의구체성', '동기과정결과', '성장변화', '전공적합성'],
    '동아리': ['활동의전문성깊이', '개인기여도', '동기과정결과', '지속성발전', '전공적합성'],
    '진로': ['진로탐색의구체성', '진로목표의일관성', '동기과정결과', '자기주도성', '전공적합성'],
}


def build_changche_prompt(changche_data: dict, major: str = None) -> str:
    """창체 분석용 Claude 프롬프트 생성"""
    prompt_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                               'prompts', 'analyze_changche.md')
    with open(prompt_path, 'r', encoding='utf-8') as f:
        template = f.read()

    if major:
        major_instruction = f'지원 학과: **{major}**\n전공 적합성 항목을 포함하여 5개 항목 모두 채점하세요.'
    else:
        major_instruction = '지원 학과 미지정. 전공 적합성은 일반적 관점에서 평가하세요.'

    data_text = _format_changche_data(changche_data)

    prompt = template.replace('{{MAJOR_INSTRUCTION}}', major_instruction)
    prompt = prompt.replace('{{CHANGCHE_DATA}}', data_text)
    return prompt


def _format_changche_data(changche_data: dict) -> str:
    """창체 데이터를 프롬프트용 텍스트로 변환"""
    lines = []
    for area in ['자율', '동아리', '진로']:
        area_data = changche_data.get(area, {})
        lines.append(f'\n## {area}활동')
        for year in ['1', '2', '3']:
            text = area_data.get(year, '')
            lines.append(f'\n### {year}학년')
            lines.append(text if text else '(기록 없음)')
    return '\n'.join(lines)


def parse_changche_response(response_json: dict) -> dict:
    """Claude 응답 검증 및 정규화.

    기대하는 Claude 응답 구조:
    {
        "영역별": {
            "자율": {
                "학년별": {
                    "1": {
                        "scores": { "참여의주도성": {"score": 3, "근거": "..."}, ... },
                        "강점": "...",
                        "보완점": "...",
                        "좋은평가문장": [
                            {"문장": "인용 문장", "이유": "이 문장이 좋은 평가를 받는 이유"}
                        ]
                    }
                }
            }
        }
    }
    """
    areas = response_json.get('영역별', {})
    for area_name, area_data in areas.items():
        yearly = area_data.get('학년별', {})
        for year, year_data in yearly.items():
            scores = year_data.get('scores', {})
            for item_name, item_data in scores.items():
                score = item_data.get('score', 0)
                item_data['score'] = max(1, min(5, int(score)))
            # 좋은 평가 문장 필드 기본값 보장
            if '좋은평가문장' not in year_data:
                year_data['좋은평가문장'] = []
    return response_json


def calc_volume_ratio(changche_data: dict, config: dict = None) -> dict:
    """창체 영역별 분량 비율 분석.

    각 영역(자율/동아리/진로)의 글자수를 측정하고,
    글자수 제한 대비 실제 작성 비율을 산출.

    Returns:
        {
            '자율': {
                '1': {'글자수': 320, '제한': 500, '비율': 0.64, '판정': '활용부족'},
                '2': {'글자수': 480, '제한': 500, '비율': 0.96, '판정': '충실활용'},
                ...
            },
            ...
        }
    """
    if config is None:
        config = load_config()

    volume_config = config.get('changche_volume', {})
    limits = volume_config.get('limits', {'자율': 500, '동아리': 500, '진로': 700})
    thresholds = volume_config.get('thresholds', {'충실활용': 0.95, '활용부족': 0.80})

    result = {}
    for area in ['자율', '동아리', '진로']:
        area_data = changche_data.get(area, {})
        area_limit = limits.get(area, 500)
        area_result = {}

        for year in ['1', '2', '3']:
            text = area_data.get(year, '')
            char_count = len(text.replace(' ', '').replace('\n', '')) if text else 0
            ratio = round(char_count / area_limit, 2) if area_limit > 0 else 0

            if ratio >= thresholds.get('충실활용', 0.95):
                judgment = '충실활용'
            elif ratio < thresholds.get('활용부족', 0.80):
                judgment = '활용부족'
            else:
                judgment = '적정활용'

            area_result[year] = {
                '글자수': char_count,
                '제한': area_limit,
                '비율': ratio,
                '비율%': f"{round(ratio * 100)}%",
                '판정': judgment,
            }

        result[area] = area_result

    return result


def calc_changche_scores(changche_response: dict, config: dict = None) -> dict:
    """창체 영역별 점수 및 종합 점수 산출"""
    if config is None:
        config = load_config()

    rubric_grades = config.get('rubric_grades', {})
    area_weights = config['scoring']['changche_weights']

    area_results = {}
    area_scores_100 = {}

    for area in ['자율', '동아리', '진로']:
        area_data = changche_response.get('영역별', {}).get(area, {})
        yearly = area_data.get('학년별', {})

        year_scores = []
        for year in ['1', '2', '3']:
            year_data = yearly.get(year, {})
            scores = year_data.get('scores', {})
            if scores:
                avg = sum(s['score'] for s in scores.values()) / len(scores)
                year_data['total'] = round(avg, 2)
                year_data['grade'] = _score_to_grade(avg, rubric_grades)
                year_scores.append(avg)

        if year_scores:
            area_avg = sum(year_scores) / len(year_scores)
        else:
            area_avg = 0

        area_results[area] = {
            '학년별': yearly,
            'average_score': round(area_avg, 2),
            'overall_grade': _score_to_grade(area_avg, rubric_grades),
        }
        area_scores_100[area] = _rubric_to_100(area_avg)

    # 종합 (가중평균)
    overall_score_100 = sum(
        area_scores_100.get(area, 0) * area_weights.get(area, 0)
        for area in ['자율', '동아리', '진로']
    )
    overall_avg = sum(
        area_results.get(area, {}).get('average_score', 0) * area_weights.get(area, 0)
        for area in ['자율', '동아리', '진로']
    )

    return {
        '영역별': area_results,
        'overall_score': round(overall_avg, 2),
        'overall_grade': _score_to_grade(overall_avg, rubric_grades),
        'changche_score_100': round(overall_score_100, 1),
    }


def _rubric_to_100(score: float) -> float:
    """루브릭 점수(1~5)를 100점으로 환산"""
    return round(max(0, min(100, (score - 1.0) / 4.0 * 100)), 1)


def _score_to_grade(score: float, rubric_grades: dict) -> str:
    """점수를 S/A/B/C/D 등급으로 변환"""
    for grade in ['S', 'A', 'B', 'C', 'D']:
        g = rubric_grades.get(grade, {})
        if score >= g.get('min', 0):
            return grade
    return 'D'


def run_changche_analysis(changche_response: dict, changche_data: dict = None,
                           config: dict = None) -> dict:
    """창체 분석 결과 처리. Claude 응답을 받아 점수 산출 + 분량 비율 분석."""
    if config is None:
        config = load_config()

    parsed = parse_changche_response(changche_response)
    result = calc_changche_scores(parsed, config)

    # 분량 비율 분석 (원본 텍스트 데이터가 있을 때만)
    if changche_data:
        result['volume_ratio'] = calc_volume_ratio(changche_data, config)

    return result
