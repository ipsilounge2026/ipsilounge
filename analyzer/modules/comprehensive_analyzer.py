"""
종합 분석 모듈
- 종합 프롬프트 빌드
- 종합 경쟁력 점수 산출
- 전형 적합도 분석
- 대학 평가요소별 매핑
- 핵심 키워드 추출 및 워드클라우드 생성
- 역량별 보완법 상세 제시
"""
import os
import json
from typing import Optional
from modules.grade_analyzer import load_config


def build_comprehensive_prompt(setuek_analysis: dict, changche_analysis: dict,
                                haengtuk_analysis: dict, grade_analysis: dict) -> str:
    """종합 분석용 Claude 프롬프트 생성"""
    prompt_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                               'prompts', 'analyze_comprehensive.md')
    with open(prompt_path, 'r', encoding='utf-8') as f:
        template = f.read()

    setuek_summary = _summarize_setuek(setuek_analysis)
    changche_summary = _summarize_changche(changche_analysis)
    haengtuk_summary = _summarize_haengtuk(haengtuk_analysis)
    grade_summary = _summarize_grades(grade_analysis)

    prompt = template.replace('{{SETUEK_SUMMARY}}', setuek_summary)
    prompt = prompt.replace('{{CHANGCHE_SUMMARY}}', changche_summary)
    prompt = prompt.replace('{{HAENGTUK_SUMMARY}}', haengtuk_summary)
    prompt = prompt.replace('{{GRADE_SUMMARY}}', grade_summary)
    return prompt


def _summarize_setuek(analysis: dict) -> str:
    """세특 분석 결과 요약"""
    lines = [f"종합등급: {analysis.get('overall_grade', 'N/A')} "
             f"(가중평균: {analysis.get('overall_weighted_score', 0)})"]
    for subj in analysis.get('subject_scores', []):
        lines.append(f"- {subj.get('학기', '')} {subj.get('과목명', '')}: "
                     f"등급 {subj.get('grade', '')} / "
                     f"강점: {subj.get('강점', '')} / "
                     f"보완: {subj.get('보완점', '')}")
    return '\n'.join(lines)


def _summarize_changche(analysis: dict) -> str:
    """창체 분석 결과 요약"""
    lines = [f"종합등급: {analysis.get('overall_grade', 'N/A')}"]
    for area in ['자율', '동아리', '진로']:
        area_data = analysis.get('영역별', {}).get(area, {})
        lines.append(f"- {area}: 등급 {area_data.get('overall_grade', 'N/A')}")
        yearly = area_data.get('학년별', {})
        for year in ['1', '2', '3']:
            yd = yearly.get(year, {})
            if yd:
                lines.append(f"  {year}학년: 강점={yd.get('강점', '')} / 보완={yd.get('보완점', '')}")
    return '\n'.join(lines)


def _summarize_haengtuk(analysis: dict) -> str:
    """행특 분석 결과 요약"""
    lines = [f"종합등급: {analysis.get('overall_grade', 'N/A')}",
             f"성장추이: {analysis.get('growth_trend', '')}"]
    for year in ['1', '2', '3']:
        yd = analysis.get('학년별', {}).get(year, {})
        if yd:
            lines.append(f"- {year}학년: 등급 {yd.get('grade', '')} / "
                        f"강점={yd.get('강점', '')} / 보완={yd.get('보완점', '')}")
    return '\n'.join(lines)


def _summarize_grades(analysis: dict) -> str:
    """성적 분석 결과 요약"""
    lines = [
        f"전교과 평균: {analysis.get('overall_average', {}).get('전교과', 0)}",
        f"주요교과 평균: {analysis.get('overall_average', {}).get('주요교과', 0)}",
        f"9등급 환산: {analysis.get('grade_converted_9', 0)}",
        f"추이패턴: {analysis.get('trend_pattern', '')} ({analysis.get('trend_detail', '')})",
        f"교과이수충실도: {analysis.get('course_fulfillment', {}).get('score', 0)}점 "
        f"({analysis.get('course_fulfillment', {}).get('detail', '')})",
    ]
    return '\n'.join(lines)


# ────────────────────────────────────────
# 종합 경쟁력 점수 산출
# ────────────────────────────────────────

def calc_overall_score(grade_score: float, setuek_score: float,
                        changche_score: float, haengtuk_score: float,
                        attendance_score: float, config: dict = None) -> tuple:
    """종합 경쟁력 점수 산출 (100점 만점)"""
    if config is None:
        config = load_config()

    weights = config['scoring']['overall_weights']
    overall = (
        grade_score * weights['내신'] +
        setuek_score * weights['세특'] +
        changche_score * weights['창체'] +
        haengtuk_score * weights['행특'] +
        attendance_score * weights['출결']
    )
    overall = round(overall, 1)

    grades = config.get('grades', {})
    grade_letter = 'D'
    for g in ['S', 'A', 'B', 'C', 'D']:
        if overall >= grades.get(g, {}).get('min', 0):
            grade_letter = g
            break

    return overall, grade_letter


# ────────────────────────────────────────
# 전형 적합도 분석
# ────────────────────────────────────────

def determine_jeonhyung(grade_avg: float, setuek_grade: str,
                          changche_grade: str, overall_grade: str) -> dict:
    """최적 전형 추천"""
    good_grades = ['S', 'A']
    avg_grades = ['B']

    grade_good = grade_avg <= 2.0
    grade_mid = grade_avg <= 3.0
    bigyogwa_good = setuek_grade in good_grades and changche_grade in good_grades
    bigyogwa_avg = setuek_grade in avg_grades or changche_grade in avg_grades

    if overall_grade == 'S':
        recommendation = '학종 최상위 대학 도전 가능'
        reason = '전 영역 우수하여 최상위권 학종 지원이 유리합니다.'
    elif grade_good and bigyogwa_good:
        recommendation = '학종 (지역균형/학교추천)'
        reason = '내신 상위 + 비교과 우수로 학교추천전형이 최적입니다.'
    elif grade_mid and bigyogwa_good:
        recommendation = '학종 (활동우수형)'
        reason = '내신 중상위이나 비교과가 우수하여 활동우수형 학종이 유리합니다.'
    elif grade_good and not bigyogwa_good:
        recommendation = '교과전형'
        reason = '내신이 우수하나 비교과가 상대적으로 부족하여 교과전형이 안전합니다.'
    elif grade_mid and bigyogwa_avg:
        recommendation = '논술전형 고려'
        reason = '내신과 비교과 모두 중위권으로 논술전형을 추가 고려하세요.'
    else:
        recommendation = '교과전형 + 논술전형 병행'
        reason = '내신 중심의 교과전형과 논술전형 병행 지원을 권장합니다.'

    return {
        '추천전형': recommendation,
        '판단근거': reason
    }


# ────────────────────────────────────────
# 대학 평가요소별 매핑
# ────────────────────────────────────────

def build_university_eval_mapping(grade_analysis: dict, setuek_analysis: dict,
                                   changche_analysis: dict, haengtuk_analysis: dict,
                                   attendance_score: float) -> dict:
    """대학 평가요소별 매핑"""
    setuek_grade = setuek_analysis.get('overall_grade', 'N/A')
    changche_grade = changche_analysis.get('overall_grade', 'N/A')
    haengtuk_grade = haengtuk_analysis.get('overall_grade', 'N/A')
    grade_avg = grade_analysis.get('overall_average', {}).get('전교과', 0)
    trend = grade_analysis.get('trend_pattern', '')
    course_score = grade_analysis.get('course_fulfillment', {}).get('score', 0)

    return {
        '학업역량': {
            '학업성취도': f"전교과 평균 {grade_avg}등급, 추이 {trend}",
            '학업태도': f"세특 학업태도 종합 평가 ({setuek_grade}등급)",
            '탐구력': f"세특 탐구과정/결과성찰 종합 평가 ({setuek_grade}등급)",
        },
        '진로역량': {
            '교과이수노력': f"교과이수충실도 {course_score}점/5점",
            '교과성취도': f"주요교과 평균 {grade_analysis.get('overall_average', {}).get('주요교과', 0)}등급",
            '진로탐색': f"세특 전공적합성 + 창체 진로활동 종합 평가 ({changche_grade}등급)",
        },
        '공동체역량': {
            '협업소통': f"행특 인성·공동체 역량 평가 ({haengtuk_grade}등급)",
            '나눔배려': f"행특 인성 관련 에피소드 기반 평가 ({haengtuk_grade}등급)",
            '성실성규칙준수': f"출결 {attendance_score}점/100점, 행특 성실성 평가",
            '리더십': f"행특+창체 자율활동 리더십 종합 평가",
        }
    }


# ────────────────────────────────────────
# 핵심 키워드 추출 및 워드클라우드 생성
# ────────────────────────────────────────

def extract_keywords(setuek_data: dict, changche_data: dict,
                      haengtuk_data: dict, config: dict = None) -> dict:
    """세특+창체+행특 전체 텍스트에서 핵심 키워드 추출.

    kiwi(kiwipiepy) 형태소 분석기를 사용하여 명사를 추출하고,
    빈도 기반으로 상위 키워드를 선정.

    Returns:
        {
            'keywords': [
                {'키워드': '탐구', '빈도': 15, '카테고리': '학업역량', '출현영역': ['세특', '창체']},
                ...
            ],
            'by_year': {
                '1': ['키워드1', '키워드2', ...],
                '2': [...],
                '3': [...]
            }
        }
    """
    if config is None:
        config = load_config()

    wc_config = config.get('wordcloud', {})
    max_keywords = wc_config.get('max_keywords', 50)
    min_frequency = wc_config.get('min_frequency', 2)

    # 텍스트 수집 (영역별, 학년별)
    texts_by_area = {'세특': {}, '창체': {}, '행특': {}}
    all_text = ''

    # 세특 텍스트
    for semester, subjects in setuek_data.items():
        year = semester.split('-')[0] if '-' in str(semester) else str(semester)
        for subj in (subjects if isinstance(subjects, list) else []):
            text = subj.get('텍스트', '')
            texts_by_area['세특'].setdefault(year, '')
            texts_by_area['세특'][year] += ' ' + text
            all_text += ' ' + text

    # 창체 텍스트
    for area in ['자율', '동아리', '진로']:
        area_data = changche_data.get(area, {})
        for year in ['1', '2', '3']:
            text = area_data.get(year, '')
            texts_by_area['창체'].setdefault(year, '')
            texts_by_area['창체'][year] += ' ' + text
            all_text += ' ' + text

    # 행특 텍스트
    for year in ['1', '2', '3']:
        text = haengtuk_data.get(year, '')
        texts_by_area['행특'][year] = text
        all_text += ' ' + text

    # 형태소 분석으로 명사 추출
    try:
        from kiwipiepy import Kiwi
        kiwi = Kiwi()
        tokens = kiwi.tokenize(all_text)
        # NNG(일반명사), NNP(고유명사) 추출, 2글자 이상
        nouns = [t.form for t in tokens
                 if t.tag in ('NNG', 'NNP') and len(t.form) >= 2]
    except ImportError:
        print("경고: kiwipiepy 미설치. 기본 공백 분리로 대체합니다.")
        nouns = [w for w in all_text.split() if len(w) >= 2]

    # 빈도 계산
    from collections import Counter
    freq = Counter(nouns)

    # 불용어 제거
    stopwords = {'학생', '활동', '수업', '과목', '학교', '학습', '교과', '선생님',
                 '내용', '과정', '결과', '이해', '능력', '태도', '관련', '다양',
                 '적극', '참여', '모습', '노력', '자신', '친구', '사회', '문제'}
    for sw in stopwords:
        freq.pop(sw, None)

    # 상위 키워드 선정 (min_frequency 이상)
    top_keywords = [(word, count) for word, count in freq.most_common(max_keywords * 2)
                    if count >= min_frequency][:max_keywords]

    # 키워드별 출현 영역 확인
    keyword_list = []
    for word, count in top_keywords:
        areas = []
        for area_name, area_texts in texts_by_area.items():
            for year_text in area_texts.values():
                if word in year_text:
                    areas.append(area_name)
                    break

        category = _classify_keyword(word)
        keyword_list.append({
            '키워드': word,
            '빈도': count,
            '카테고리': category,
            '출현영역': list(set(areas)),
        })

    # 학년별 키워드 (상위 15개씩)
    by_year = {}
    for year in ['1', '2', '3']:
        year_text = ''
        for area_texts in texts_by_area.values():
            year_text += ' ' + area_texts.get(year, '')
        try:
            from kiwipiepy import Kiwi
            kiwi = Kiwi()
            tokens = kiwi.tokenize(year_text)
            year_nouns = [t.form for t in tokens
                         if t.tag in ('NNG', 'NNP') and len(t.form) >= 2]
        except ImportError:
            year_nouns = [w for w in year_text.split() if len(w) >= 2]

        year_freq = Counter(year_nouns)
        for sw in stopwords:
            year_freq.pop(sw, None)
        by_year[year] = [w for w, c in year_freq.most_common(15)]

    return {
        'keywords': keyword_list,
        'by_year': by_year,
    }


def _classify_keyword(word: str) -> str:
    """키워드를 역량 카테고리로 분류"""
    academic_words = {'연구', '분석', '실험', '논문', '데이터', '이론', '가설', '검증',
                      '통계', '수학', '과학', '탐구', '조사', '학술', '원리', '공식',
                      '증명', '풀이', '계산', '해석', '독서', '토론', '발표', '논증'}
    career_words = {'진로', '직업', '전공', '꿈', '목표', '미래', '대학', '학과',
                    '경영', '경제', '공학', '의학', '법학', '교육', '프로그래밍',
                    '설계', '개발', '기획', '창업', '기술', '산업'}
    community_words = {'협력', '소통', '리더', '봉사', '배려', '존중', '팀워크',
                       '갈등', '해결', '조율', '멘토', '도움', '나눔', '공동체',
                       '의사소통', '경청', '공감', '책임'}

    if word in academic_words:
        return '학업역량'
    elif word in career_words:
        return '진로역량'
    elif word in community_words:
        return '공동체역량'
    else:
        return '일반'


def generate_wordcloud(keywords: list, output_path: str,
                        config: dict = None) -> str:
    """키워드 빈도 기반 워드클라우드 이미지 생성.

    Returns: 생성된 이미지 파일 경로
    """
    if config is None:
        config = load_config()

    wc_config = config.get('wordcloud', {})
    width = wc_config.get('width', 800)
    height = wc_config.get('height', 400)
    font_path = wc_config.get('font_path', 'NanumGothic.ttf')

    # 키워드→빈도 딕셔너리
    freq_dict = {kw['키워드']: kw['빈도'] for kw in keywords}

    if not freq_dict:
        print("경고: 키워드가 없어 워드클라우드를 생성할 수 없습니다.")
        return ''

    try:
        from wordcloud import WordCloud
        import matplotlib.pyplot as plt
        import matplotlib
        matplotlib.use('Agg')  # GUI 없이 저장

        # 한글 폰트 경로 찾기
        actual_font = _find_korean_font(font_path)

        wc = WordCloud(
            font_path=actual_font,
            width=width,
            height=height,
            background_color='white',
            max_words=len(freq_dict),
            colormap='viridis',
        )
        wc.generate_from_frequencies(freq_dict)

        plt.figure(figsize=(width/100, height/100))
        plt.imshow(wc, interpolation='bilinear')
        plt.axis('off')
        plt.tight_layout(pad=0)
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        plt.close()

        print(f"워드클라우드 생성 완료: {output_path}")
        return output_path

    except ImportError as e:
        print(f"경고: 워드클라우드 라이브러리 미설치 ({e}). 이미지 생성을 건너뜁니다.")
        return ''


def _find_korean_font(preferred: str) -> str:
    """한글 폰트 경로 탐색"""
    import platform
    system = platform.system()

    # 1. 프로젝트 내 폰트
    project_font = os.path.join(os.path.dirname(os.path.dirname(__file__)), preferred)
    if os.path.exists(project_font):
        return project_font

    # 2. 시스템 폰트
    if system == 'Windows':
        candidates = [
            r'C:\Windows\Fonts\NanumGothic.ttf',
            r'C:\Windows\Fonts\malgun.ttf',
            r'C:\Windows\Fonts\gulim.ttc',
        ]
    elif system == 'Darwin':  # macOS
        candidates = [
            '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
            '/Library/Fonts/NanumGothic.ttf',
        ]
    else:  # Linux
        candidates = [
            '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
            '/usr/share/fonts/NanumGothic.ttf',
        ]

    for path in candidates:
        if os.path.exists(path):
            return path

    # 3. 기본값 반환 (wordcloud가 자체 처리)
    return preferred


# ────────────────────────────────────────
# 역량별 보완법 상세 제시
# ────────────────────────────────────────

def build_remedial_data(grade_analysis: dict, setuek_analysis: dict,
                         changche_analysis: dict, haengtuk_analysis: dict,
                         config: dict = None) -> dict:
    """역량별 보완법 생성을 위한 데이터 수집.

    3대 역량(학업/진로/공동체)의 세부 항목별 점수를 수집하고,
    보완 기준(3점 이하)에 해당하는 항목을 선별.

    Returns:
        {
            '학업역량': {
                '학업성취도': {'점수': 3.5, '보완대상': False, '소스': '...'},
                '학업태도': {'점수': 2.0, '보완대상': True, '소스': '...'},
                '탐구력': {'점수': 2.5, '보완대상': True, '소스': '...'},
            },
            '진로역량': { ... },
            '공동체역량': { ... },
        }
    """
    if config is None:
        config = load_config()

    threshold = config.get('remedial_threshold', 3.0)

    # ── 학업역량 ──
    # 학업성취도: 내신 등급 → 5점 환산 (1등급=5, 2등급=4, 3등급=3, 4등급=2, 5등급=1)
    grade_avg = grade_analysis.get('overall_average', {}).get('전교과', 3.0)
    academic_achievement = max(1, min(5, 6 - grade_avg))  # 등급 역산

    # 학업태도: 세특 ⑦학업태도 평균
    academic_attitude = _get_setuek_item_avg(setuek_analysis, '학업태도')

    # 탐구력: 세특 ②탐구동기 + ③탐구과정 + ④결과성찰 평균
    inquiry_scores = [
        _get_setuek_item_avg(setuek_analysis, '탐구동기'),
        _get_setuek_item_avg(setuek_analysis, '탐구과정'),
        _get_setuek_item_avg(setuek_analysis, '결과성찰'),
    ]
    inquiry = round(sum(inquiry_scores) / 3, 2) if inquiry_scores else 0

    # ── 진로역량 ──
    # 교과이수 노력
    course_fulfillment = grade_analysis.get('course_fulfillment', {}).get('score', 3)

    # 교과성취도 (전공 관련 과목)
    major_grade_avg = grade_analysis.get('overall_average', {}).get('주요교과', 3.0)
    major_achievement = max(1, min(5, 6 - major_grade_avg))

    # 진로탐색: 창체(진로) 평균 + 세특 전공적합성 평균
    jinro_area = changche_analysis.get('영역별', {}).get('진로', {})
    jinro_score = jinro_area.get('average_score', 0)
    major_fit = _get_setuek_item_avg(setuek_analysis, '전공적합성')
    career_exploration = round((jinro_score + major_fit) / 2, 2) if major_fit > 0 else jinro_score

    # ── 공동체역량 ──
    # 협업·소통: 행특 ④인성공동체역량 + 창체(자율) 평균
    haengtuk_community = _get_haengtuk_item_avg(haengtuk_analysis, '인성공동체역량')
    jayul_area = changche_analysis.get('영역별', {}).get('자율', {})
    jayul_score = jayul_area.get('average_score', 0)
    collaboration = round((haengtuk_community + jayul_score) / 2, 2)

    # 나눔·배려: 행특 ④인성공동체역량
    caring = haengtuk_community

    # 리더십: 창체(자율) ①주도성
    leadership = _get_changche_item_avg(changche_analysis, '자율', '참여의주도성')

    # 결과 조합
    result = {
        '학업역량': {
            '학업성취도': _make_item(academic_achievement, threshold,
                                f"전교과 평균 {grade_avg}등급"),
            '학업태도': _make_item(academic_attitude, threshold,
                                "세특 학업태도 항목 평균"),
            '탐구력': _make_item(inquiry, threshold,
                              "세특 탐구동기/탐구과정/결과성찰 평균"),
        },
        '진로역량': {
            '교과이수노력': _make_item(course_fulfillment, threshold,
                                  f"교과이수 충실도 {course_fulfillment}점/5점"),
            '교과성취도': _make_item(major_achievement, threshold,
                                f"주요교과 평균 {major_grade_avg}등급"),
            '진로탐색구체성': _make_item(career_exploration, threshold,
                                   "창체 진로활동 + 세특 전공적합성 평균"),
        },
        '공동체역량': {
            '협업소통': _make_item(collaboration, threshold,
                              "행특 인성공동체 + 창체 자율활동 평균"),
            '나눔배려': _make_item(caring, threshold,
                              "행특 인성공동체역량 평균"),
            '리더십': _make_item(leadership, threshold,
                             "창체 자율활동 주도성 평균"),
        },
    }

    return result


def _make_item(score: float, threshold: float, source: str) -> dict:
    """보완 항목 딕셔너리 생성"""
    return {
        '점수': round(score, 2),
        '보완대상': score <= threshold,
        '소스': source,
    }


def _get_setuek_item_avg(setuek_analysis: dict, item_name: str) -> float:
    """세특 분석 결과에서 특정 항목의 전 과목 평균 점수 추출"""
    scores = []
    for subj in setuek_analysis.get('subject_scores', []):
        item = subj.get('scores', {}).get(item_name, {})
        if isinstance(item, dict) and 'score' in item:
            scores.append(item['score'])
    return round(sum(scores) / len(scores), 2) if scores else 0


def _get_haengtuk_item_avg(haengtuk_analysis: dict, item_name: str) -> float:
    """행특 분석 결과에서 특정 항목의 전 학년 평균 점수 추출"""
    scores = []
    for year in ['1', '2', '3']:
        year_data = haengtuk_analysis.get('학년별', {}).get(year, {})
        item = year_data.get('scores', {}).get(item_name, {})
        if isinstance(item, dict) and 'score' in item:
            scores.append(item['score'])
    return round(sum(scores) / len(scores), 2) if scores else 0


def _get_changche_item_avg(changche_analysis: dict, area: str, item_name: str) -> float:
    """창체 분석 결과에서 특정 영역·항목의 전 학년 평균 점수 추출"""
    scores = []
    area_data = changche_analysis.get('영역별', {}).get(area, {})
    yearly = area_data.get('학년별', {})
    for year in ['1', '2', '3']:
        year_data = yearly.get(year, {})
        item = year_data.get('scores', {}).get(item_name, {})
        if isinstance(item, dict) and 'score' in item:
            scores.append(item['score'])
    return round(sum(scores) / len(scores), 2) if scores else 0


# ────────────────────────────────────────
# 메인 실행 함수
# ────────────────────────────────────────

def run_comprehensive_analysis(comprehensive_response: dict,
                                 grade_analysis: dict,
                                 setuek_analysis: dict,
                                 changche_analysis: dict,
                                 haengtuk_analysis: dict,
                                 setuek_data: dict = None,
                                 changche_data: dict = None,
                                 haengtuk_data: dict = None,
                                 output_dir: str = None,
                                 config: dict = None) -> dict:
    """종합 분석 메인 함수. Claude 응답 + Python 계산 결합."""
    if config is None:
        config = load_config()

    # Claude의 정성 분석 결과
    setuek_linkage = comprehensive_response.get('setuek_linkage', {})
    changche_setuek_linkage = comprehensive_response.get('changche_setuek_linkage', {})
    growth_story = comprehensive_response.get('growth_story', {})
    core_strengths = comprehensive_response.get('core_strengths', [])
    areas_to_improve = comprehensive_response.get('areas_to_improve', [])

    # Python 계산: 종합 점수
    grade_score = grade_analysis.get('grade_score_100', 0)
    setuek_score = setuek_analysis.get('setuek_score_100', 0)
    changche_score = changche_analysis.get('changche_score_100', 0)
    haengtuk_score = haengtuk_analysis.get('haengtuk_score_100', 0)
    attendance_score = grade_analysis.get('attendance_score_100', 100)

    overall_score, overall_grade = calc_overall_score(
        grade_score, setuek_score, changche_score,
        haengtuk_score, attendance_score, config)

    # 전형 추천
    grade_avg = grade_analysis.get('overall_average', {}).get('전교과', 3.0)
    jeonhyung = determine_jeonhyung(
        grade_avg,
        setuek_analysis.get('overall_grade', 'C'),
        changche_analysis.get('overall_grade', 'C'),
        overall_grade)

    # 대학 평가요소 매핑
    eval_mapping = build_university_eval_mapping(
        grade_analysis, setuek_analysis, changche_analysis,
        haengtuk_analysis, attendance_score)

    # 키워드 추출 및 워드클라우드
    keyword_result = {}
    wordcloud_path = ''
    if setuek_data and changche_data and haengtuk_data:
        keyword_result = extract_keywords(
            setuek_data, changche_data, haengtuk_data, config)

        if output_dir and keyword_result.get('keywords'):
            wc_path = os.path.join(output_dir, 'wordcloud.png')
            wordcloud_path = generate_wordcloud(
                keyword_result['keywords'], wc_path, config)

    # 역량별 보완법 데이터
    remedial_data = build_remedial_data(
        grade_analysis, setuek_analysis, changche_analysis,
        haengtuk_analysis, config)

    return {
        'setuek_linkage': setuek_linkage,
        'changche_setuek_linkage': changche_setuek_linkage,
        'growth_story': growth_story,
        'recommended_jeonhyung': jeonhyung,
        'core_strengths': core_strengths,
        'areas_to_improve': areas_to_improve,
        'overall_score': overall_score,
        'overall_grade': overall_grade,
        'score_breakdown': {
            '내신': grade_score,
            '세특': setuek_score,
            '창체': changche_score,
            '행특': haengtuk_score,
            '출결': attendance_score,
        },
        'university_evaluation_mapping': eval_mapping,
        'keyword_analysis': keyword_result,
        'wordcloud_path': wordcloud_path,
        'remedial_data': remedial_data,
    }
