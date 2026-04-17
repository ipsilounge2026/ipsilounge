"""
세특 분석 모듈
- 프롬프트 빌드
- Claude 응답 파싱/검증
- 가중점수 산출
- 좋은 평가 문장 추출
"""
import os
import json
from typing import Optional
from modules.grade_analyzer import load_config


SETUEK_ITEMS = ['교과연계성', '탐구동기', '탐구과정', '결과성찰', '전공적합성', '차별성', '학업태도']
SETUEK_ITEMS_NO_MAJOR = ['교과연계성', '탐구동기', '탐구과정', '결과성찰', '차별성', '학업태도']


def build_setuek_prompt(setuek_data: dict, major: str = None) -> str:
    """세특 분석용 Claude 프롬프트 생성"""
    prompt_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                               'prompts', 'analyze_setuek.md')
    with open(prompt_path, 'r', encoding='utf-8') as f:
        template = f.read()

    # 전공적합성 지시문
    if major:
        major_instruction = f'지원 학과: **{major}**\n전공적합성 항목을 포함하여 7개 항목 모두 채점하세요.'
    else:
        major_instruction = '지원 학과 미지정. **전공적합성 항목을 제외**하고 나머지 6개 항목만 채점하세요.'

    # 세특 데이터 포맷
    data_text = _format_setuek_data(setuek_data)

    prompt = template.replace('{{MAJOR_INSTRUCTION}}', major_instruction)
    prompt = prompt.replace('{{SETUEK_DATA}}', data_text)
    return prompt


def _format_setuek_data(setuek_data: dict) -> str:
    """세특 데이터를 프롬프트용 텍스트로 변환"""
    lines = []
    for semester in sorted(setuek_data.keys()):
        subjects = setuek_data[semester]
        if not subjects:
            continue
        lines.append(f'\n### {semester}학기')
        for subj in subjects:
            lines.append(f'\n**{subj["과목명"]}**')
            lines.append(subj.get('텍스트', '(없음)'))
    return '\n'.join(lines)


def parse_setuek_response(response_json: dict) -> dict:
    """Claude 응답 검증 및 정규화.

    기대하는 Claude 응답 구조:
    {
        "subject_scores": [
            {
                "학기": "1-1",
                "과목명": "수학",
                "scores": {
                    "교과연계성": {"score": 4, "근거": "..."},
                    ...
                },
                "강점": "...",
                "보완점": "...",
                "좋은평가문장": [
                    {"문장": "인용 문장", "이유": "이 문장이 좋은 평가를 받는 이유"}
                ]
            }
        ]
    }
    """
    subject_scores = response_json.get('subject_scores', [])
    for subj in subject_scores:
        scores = subj.get('scores', {})
        for item_name, item_data in scores.items():
            score = item_data.get('score', 0)
            item_data['score'] = max(1, min(10, int(score)))
        # 좋은 평가 문장 필드 기본값 보장
        if '좋은평가문장' not in subj:
            subj['좋은평가문장'] = []
    return response_json


def calc_setuek_weighted_scores(subject_scores: list, config: dict = None,
                                 has_major: bool = True) -> tuple:
    """전체 세특 가중평균 및 등급 산출"""
    if config is None:
        config = load_config()

    if has_major:
        weights = config['scoring']['setuek_weights']
    else:
        weights = config['scoring']['setuek_weights_no_major']

    rubric_grades = config.get('rubric_grades', {})

    all_weighted_scores = []
    for subj in subject_scores:
        scores = subj.get('scores', {})
        weighted_sum = 0
        weight_total = 0
        for item_name, weight in weights.items():
            if item_name in scores:
                weighted_sum += scores[item_name]['score'] * weight
                weight_total += weight
        if weight_total > 0:
            subj_weighted = weighted_sum / weight_total
            all_weighted_scores.append(subj_weighted)
            subj['weighted_score'] = round(subj_weighted, 2)
            subj['grade'] = _score_to_grade(subj_weighted, rubric_grades)

    if all_weighted_scores:
        overall = round(sum(all_weighted_scores) / len(all_weighted_scores), 2)
    else:
        overall = 0

    overall_grade = _score_to_grade(overall, rubric_grades)
    return overall, overall_grade


def setuek_score_to_100(weighted_avg: float) -> float:
    """세특 가중평균(1.0~10.0)을 100점으로 환산"""
    return round(max(0, min(100, (weighted_avg - 1.0) / 9.0 * 100)), 1)


def _score_to_grade(score: float, rubric_grades: dict) -> str:
    """점수를 S/A/B/C/D 등급으로 변환"""
    for grade in ['S', 'A', 'B', 'C', 'D']:
        g = rubric_grades.get(grade, {})
        if score >= g.get('min', 0):
            return grade
    return 'D'


def run_setuek_analysis(setuek_response: dict, config: dict = None,
                         has_major: bool = True) -> dict:
    """세특 분석 결과 처리. Claude 응답을 받아 점수 산출."""
    if config is None:
        config = load_config()

    parsed = parse_setuek_response(setuek_response)
    subject_scores = parsed.get('subject_scores', [])

    overall_score, overall_grade = calc_setuek_weighted_scores(
        subject_scores, config, has_major)
    score_100 = setuek_score_to_100(overall_score)

    return {
        'subject_scores': subject_scores,
        'overall_weighted_score': overall_score,
        'overall_grade': overall_grade,
        'setuek_score_100': score_100,
    }
