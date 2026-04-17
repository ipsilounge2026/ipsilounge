"""
행특 분석 모듈
- 프롬프트 빌드
- Claude 응답 파싱/검증
- 가중점수 산출
- 좋은 평가 문장 추출
"""
import os
import json
from modules.grade_analyzer import load_config


HAENGTUK_ITEMS = ['활동의구체성', '동기과정결과', '성장변화', '인성공동체역량', '분량밀도']


def build_haengtuk_prompt(haengtuk_data: dict) -> str:
    """행특 분석용 Claude 프롬프트 생성"""
    prompt_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                               'prompts', 'analyze_haengtuk.md')
    with open(prompt_path, 'r', encoding='utf-8') as f:
        template = f.read()

    data_text = _format_haengtuk_data(haengtuk_data)
    prompt = template.replace('{{HAENGTUK_DATA}}', data_text)
    return prompt


def _format_haengtuk_data(haengtuk_data: dict) -> str:
    """행특 데이터를 프롬프트용 텍스트로 변환"""
    lines = []
    for year in ['1', '2', '3']:
        text = haengtuk_data.get(year, '')
        lines.append(f'\n### {year}학년')
        lines.append(text if text else '(기록 없음)')
    return '\n'.join(lines)


def parse_haengtuk_response(response_json: dict) -> dict:
    """Claude 응답 검증 및 정규화.

    기대하는 Claude 응답 구조:
    {
        "학년별": {
            "1": {
                "scores": { "활동의구체성": {"score": 3, "근거": "..."}, ... },
                "강점": "...",
                "보완점": "...",
                "좋은평가문장": [
                    {"문장": "인용 문장", "이유": "이 문장이 좋은 평가를 받는 이유"}
                ]
            }
        },
        "growth_trend": "..."
    }
    """
    yearly = response_json.get('학년별', {})
    for year, year_data in yearly.items():
        scores = year_data.get('scores', {})
        for item_name, item_data in scores.items():
            score = item_data.get('score', 0)
            item_data['score'] = max(1, min(10, int(score)))
        # 좋은 평가 문장 필드 기본값 보장
        if '좋은평가문장' not in year_data:
            year_data['좋은평가문장'] = []
    return response_json


def calc_haengtuk_scores(haengtuk_response: dict, config: dict = None) -> dict:
    """행특 학년별 점수 및 종합 점수 산출"""
    if config is None:
        config = load_config()

    rubric_grades = config.get('rubric_grades', {})
    yearly = haengtuk_response.get('학년별', {})
    growth_trend = haengtuk_response.get('growth_trend', '')

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
        overall_avg = sum(year_scores) / len(year_scores)
    else:
        overall_avg = 0

    score_100 = _rubric_to_100(overall_avg)

    return {
        '학년별': yearly,
        'growth_trend': growth_trend,
        'average_score': round(overall_avg, 2),
        'overall_grade': _score_to_grade(overall_avg, rubric_grades),
        'haengtuk_score_100': score_100,
    }


def _rubric_to_100(score: float) -> float:
    """루브릭 점수(1~10)를 100점으로 환산"""
    return round(max(0, min(100, (score - 1.0) / 9.0 * 100)), 1)


def _score_to_grade(score: float, rubric_grades: dict) -> str:
    """점수를 S/A/B/C/D 등급으로 변환"""
    for grade in ['S', 'A', 'B', 'C', 'D']:
        g = rubric_grades.get(grade, {})
        if score >= g.get('min', 0):
            return grade
    return 'D'


def run_haengtuk_analysis(haengtuk_response: dict, config: dict = None) -> dict:
    """행특 분석 결과 처리. Claude 응답을 받아 점수 산출."""
    if config is None:
        config = load_config()

    parsed = parse_haengtuk_response(haengtuk_response)
    return calc_haengtuk_scores(parsed, config)
