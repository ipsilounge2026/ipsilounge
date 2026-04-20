"""
학생부 분석 프로그램 - 메인 실행 스크립트

사용법:
  python analyze.py [--university 대학명] [--department 학과명] [--step N] [--resume N]

파이프라인:
  Step 1 [자동]   파일 준비 (PDF → 이미지)
  Step 2 [Claude]  데이터 추출 → temp/01_extracted_data.json
  Step 3 [자동]   내신 성적 분석 → temp/02_grade_analysis.json
  Step 4 [자동]   입결 매칭 → temp/03_admission_matching.json
  Step 5 [Claude]  세특 분석 → temp/04_setuek_analysis.json
  Step 6 [Claude]  창체 분석 → temp/05_changche_analysis.json
  Step 7 [Claude]  행특 분석 → temp/06_haengtuk_analysis.json
  Step 8 [Claude]  종합 분석 → temp/07_comprehensive_analysis.json
  Step 9 [자동]   리포트 생성 → output/
"""
import argparse
import json
import os
import sys

# 프로젝트 루트를 모듈 경로에 추가
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PROJECT_ROOT)

from modules.admission_matcher import run_admission_matching
from modules.changche_analyzer import build_changche_prompt, run_changche_analysis
from modules.comprehensive_analyzer import build_comprehensive_prompt, run_comprehensive_analysis
from modules.extractor import get_temp_dir, load_json, prepare_all_images, save_json
from modules.grade_analyzer import load_config, run_grade_analysis
from modules.haengtuk_analyzer import build_haengtuk_prompt, run_haengtuk_analysis
from modules.report_generator import generate_excel_report, generate_pdf_report
from modules.setuek_analyzer import build_setuek_prompt, run_setuek_analysis

INPUT_DIR = os.path.join(PROJECT_ROOT, 'input')
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'output')


def step1_prepare_files(temp_dir: str) -> list:
    """Step 1: 파일 준비 (PDF → 이미지 변환)"""
    print('\n' + '='*60)
    print('Step 1: 파일 준비')
    print('='*60)
    images = prepare_all_images(INPUT_DIR, temp_dir)
    save_json({'image_paths': images}, os.path.join(temp_dir, '00_images.json'))
    return images


def step2_extraction(temp_dir: str) -> None:
    """Step 2: 데이터 추출 (Claude 수동 단계)"""
    print('\n' + '='*60)
    print('Step 2: 데이터 추출 [Claude 분석 필요]')
    print('='*60)

    images_info = load_json(os.path.join(temp_dir, '00_images.json'))
    image_paths = images_info.get('image_paths', [])

    # 추출 프롬프트 로드
    prompts_dir = os.path.join(PROJECT_ROOT, 'prompts')
    prompt_files = [
        'extract_grades.md',
        'extract_setuek.md',
        'extract_haengtuk.md',
        'extract_changche.md',
    ]

    print(f'\n이미지 {len(image_paths)}개가 준비되었습니다.')
    print('\n다음 작업을 Claude Code에서 수행해주세요:')
    print('1. temp/images/ 폴더의 이미지를 읽어주세요')
    print('2. 아래 프롬프트의 형식에 맞춰 데이터를 추출해주세요:')
    for pf in prompt_files:
        print(f'   - prompts/{pf}')
    print('3. 추출 결과를 아래 JSON 형식으로 저장해주세요:')
    print('   temp/01_extracted_data.json')
    print('\n필수 JSON 구조:')
    print(json.dumps({
        'student_info': {'name': '학생이름', 'school': '학교명'},
        'attendance': {'1': {}, '2': {}, '3': {}},
        'grades': {'1-1': [], '1-2': [], '2-1': [], '2-2': [], '3-1': [], '3-2': []},
        'setuek': {'1-1': [], '1-2': [], '2-1': [], '2-2': [], '3-1': [], '3-2': []},
        'haengtuk': {'1': '', '2': '', '3': ''},
        'changche': {'자율': {}, '동아리': {}, '진로': {}},
        'volunteer_hours': {'1': 0, '2': 0, '3': 0}
    }, ensure_ascii=False, indent=2))

    output_path = os.path.join(temp_dir, '01_extracted_data.json')
    if os.path.exists(output_path):
        print(f'\n[기존 파일 발견] {output_path}')
        print('기존 추출 데이터를 사용합니다. 재추출하려면 파일을 삭제 후 재실행하세요.')
    else:
        print(f'\n[대기] {output_path} 파일이 생성되면 Step 3부터 계속 실행하세요:')
        print('  python analyze.py --resume 3')


def step3_grade_analysis(temp_dir: str, university: str = None,
                          department: str = None) -> dict:
    """Step 3: 내신 성적 분석 (자동)"""
    print('\n' + '='*60)
    print('Step 3: 내신 성적 분석')
    print('='*60)

    extracted = load_json(os.path.join(temp_dir, '01_extracted_data.json'))
    config = load_config()
    result = run_grade_analysis(extracted, config, university, department)
    save_json(result, os.path.join(temp_dir, '02_grade_analysis.json'))

    print(f'  전교과 평균: {result["overall_average"]["전교과"]}')
    print(f'  주요교과 평균: {result["overall_average"]["주요교과"]}')
    print(f'  9등급 환산: {result["grade_converted_9"]}')
    print(f'  추이 패턴: {result["trend_pattern"]}')
    return result


def step4_admission_matching(temp_dir: str, university: str = None,
                              department: str = None) -> dict:
    """Step 4: 입결 매칭 (자동) - 입결 70% 기준 수치 비교"""
    print('\n' + '='*60)
    print('Step 4: 입결 매칭 (입결 70% 기준 수치 비교)')
    print('='*60)

    grade_analysis = load_json(os.path.join(temp_dir, '02_grade_analysis.json'))
    config = load_config()

    # 비교과 등급 정보 (이전 단계에서 분석된 경우 가져옴)
    bigyogwa_grades = None
    setuek_path = os.path.join(temp_dir, '04_setuek_analysis.json')
    changche_path = os.path.join(temp_dir, '05_changche_analysis.json')
    haengtuk_path = os.path.join(temp_dir, '06_haengtuk_analysis.json')
    if (os.path.exists(setuek_path) and os.path.exists(changche_path)
            and os.path.exists(haengtuk_path)):
        setuek = load_json(setuek_path)
        changche = load_json(changche_path)
        haengtuk = load_json(haengtuk_path)
        bigyogwa_grades = {
            '세특': setuek.get('overall_grade', 'N/A'),
            '창체': changche.get('overall_grade', 'N/A'),
            '행특': haengtuk.get('overall_grade', 'N/A'),
        }

    result = run_admission_matching(
        grade_analysis, config, university, department, bigyogwa_grades)
    save_json(result, os.path.join(temp_dir, '03_admission_matching.json'))

    matches = result.get('matches', [])
    bigyogwa = result.get('bigyogwa_grades', {})
    print(f'  매칭 대학·학과: {len(matches)}건')
    print(f'  학생 환산 등급: {result.get("student_grade_9", "N/A")}')
    if bigyogwa:
        print(f'  비교과 종합: {bigyogwa.get("비교과종합", "N/A")}')
    return result


def step5_setuek_analysis(temp_dir: str, department: str = None) -> None:
    """Step 5: 세특 분석 (Claude 수동 단계)"""
    print('\n' + '='*60)
    print('Step 5: 세특 분석 [Claude 분석 필요]')
    print('='*60)

    extracted = load_json(os.path.join(temp_dir, '01_extracted_data.json'))
    prompt = build_setuek_prompt(extracted.get('setuek', {}), department)

    prompt_path = os.path.join(temp_dir, '05_setuek_prompt.md')
    with open(prompt_path, 'w', encoding='utf-8') as f:
        f.write(prompt)

    output_path = os.path.join(temp_dir, '04_setuek_analysis.json')
    if os.path.exists(output_path):
        print(f'[기존 파일 발견] {output_path}')
    else:
        print(f'프롬프트 저장: {prompt_path}')
        print('Claude Code에서 위 프롬프트로 세특을 분석하고,')
        print(f'결과를 {output_path}에 저장해주세요.')
        print('완료 후: python analyze.py --resume 6')


def step6_changche_analysis(temp_dir: str, department: str = None) -> None:
    """Step 6: 창체 분석 (Claude 수동 단계)"""
    print('\n' + '='*60)
    print('Step 6: 창체 분석 [Claude 분석 필요]')
    print('='*60)

    extracted = load_json(os.path.join(temp_dir, '01_extracted_data.json'))
    prompt = build_changche_prompt(extracted.get('changche', {}), department)

    prompt_path = os.path.join(temp_dir, '06_changche_prompt.md')
    with open(prompt_path, 'w', encoding='utf-8') as f:
        f.write(prompt)

    output_path = os.path.join(temp_dir, '05_changche_analysis.json')
    if os.path.exists(output_path):
        print(f'[기존 파일 발견] {output_path}')
    else:
        print(f'프롬프트 저장: {prompt_path}')
        print('Claude Code에서 위 프롬프트로 창체를 분석하고,')
        print(f'결과를 {output_path}에 저장해주세요.')
        print('완료 후: python analyze.py --resume 7')


def step7_haengtuk_analysis(temp_dir: str) -> None:
    """Step 7: 행특 분석 (Claude 수동 단계)"""
    print('\n' + '='*60)
    print('Step 7: 행특 분석 [Claude 분석 필요]')
    print('='*60)

    extracted = load_json(os.path.join(temp_dir, '01_extracted_data.json'))
    prompt = build_haengtuk_prompt(extracted.get('haengtuk', {}))

    prompt_path = os.path.join(temp_dir, '07_haengtuk_prompt.md')
    with open(prompt_path, 'w', encoding='utf-8') as f:
        f.write(prompt)

    output_path = os.path.join(temp_dir, '06_haengtuk_analysis.json')
    if os.path.exists(output_path):
        print(f'[기존 파일 발견] {output_path}')
    else:
        print(f'프롬프트 저장: {prompt_path}')
        print('Claude Code에서 위 프롬프트로 행특을 분석하고,')
        print(f'결과를 {output_path}에 저장해주세요.')
        print('완료 후: python analyze.py --resume 8')


def step8_comprehensive(temp_dir: str) -> None:
    """Step 8: 종합 분석 (Claude + Python)"""
    print('\n' + '='*60)
    print('Step 8: 종합 분석 [Claude 분석 필요]')
    print('='*60)

    grade_analysis = load_json(os.path.join(temp_dir, '02_grade_analysis.json'))
    setuek_raw = load_json(os.path.join(temp_dir, '04_setuek_analysis.json'))
    changche_raw = load_json(os.path.join(temp_dir, '05_changche_analysis.json'))
    haengtuk_raw = load_json(os.path.join(temp_dir, '06_haengtuk_analysis.json'))

    # 원본 텍스트 데이터 로드 (키워드 추출 및 분량 분석용)
    extracted = load_json(os.path.join(temp_dir, '01_extracted_data.json'))
    setuek_data = extracted.get('setuek', {})
    changche_data = extracted.get('changche', {})
    haengtuk_data = extracted.get('haengtuk', {})

    # Python 점수 산출
    config = load_config()
    setuek_result = run_setuek_analysis(setuek_raw, config, has_major=True)
    changche_result = run_changche_analysis(changche_raw, changche_data, config)
    haengtuk_result = run_haengtuk_analysis(haengtuk_raw, config)

    save_json(setuek_result, os.path.join(temp_dir, '04_setuek_analysis.json'))
    save_json(changche_result, os.path.join(temp_dir, '05_changche_analysis.json'))
    save_json(haengtuk_result, os.path.join(temp_dir, '06_haengtuk_analysis.json'))

    # 종합 프롬프트 생성
    prompt = build_comprehensive_prompt(
        setuek_result, changche_result, haengtuk_result, grade_analysis)

    prompt_path = os.path.join(temp_dir, '08_comprehensive_prompt.md')
    with open(prompt_path, 'w', encoding='utf-8') as f:
        f.write(prompt)

    output_path = os.path.join(temp_dir, '07_comprehensive_response.json')
    if os.path.exists(output_path):
        print(f'[기존 파일 발견] {output_path}')
        # Claude 응답 + Python 계산 결합
        comp_response = load_json(output_path)
        comp_result = run_comprehensive_analysis(
            comp_response, grade_analysis, setuek_result,
            changche_result, haengtuk_result,
            setuek_data=setuek_data, changche_data=changche_data,
            haengtuk_data=haengtuk_data, output_dir=OUTPUT_DIR,
            config=config)
        save_json(comp_result, os.path.join(temp_dir, '07_comprehensive_analysis.json'))
        print(f'  종합등급: {comp_result["overall_grade"]} ({comp_result["overall_score"]}점)')
    else:
        print(f'프롬프트 저장: {prompt_path}')
        print('Claude Code에서 위 프롬프트로 종합 분석하고,')
        print(f'결과를 {output_path}에 저장해주세요.')
        print('완료 후: python analyze.py --resume 9')


def step9_generate_reports(temp_dir: str) -> None:
    """Step 9: 리포트 생성 (자동)"""
    print('\n' + '='*60)
    print('Step 9: 리포트 생성')
    print('='*60)

    extracted = load_json(os.path.join(temp_dir, '01_extracted_data.json'))
    grade_analysis = load_json(os.path.join(temp_dir, '02_grade_analysis.json'))
    admission = load_json(os.path.join(temp_dir, '03_admission_matching.json'))
    setuek = load_json(os.path.join(temp_dir, '04_setuek_analysis.json'))
    changche = load_json(os.path.join(temp_dir, '05_changche_analysis.json'))
    haengtuk = load_json(os.path.join(temp_dir, '06_haengtuk_analysis.json'))
    comprehensive = load_json(os.path.join(temp_dir, '07_comprehensive_analysis.json'))

    all_results = {
        'extracted_data': extracted,
        'grade_analysis': grade_analysis,
        'admission_matching': admission,
        'setuek_analysis': setuek,
        'changche_analysis': changche,
        'haengtuk_analysis': haengtuk,
        'comprehensive_analysis': comprehensive,
    }

    student_name = extracted.get('student_info', {}).get('name', '학생')

    excel_path = os.path.join(OUTPUT_DIR, f'{student_name}_학생부분석.xlsx')
    generate_excel_report(all_results, excel_path)

    pdf_path = os.path.join(OUTPUT_DIR, f'{student_name}_학생부분석.pdf')
    try:
        generate_pdf_report(all_results, pdf_path)
    except Exception as e:
        print(f'PDF 생성 실패 (Excel은 정상 생성됨): {e}')

    print('\n' + '='*60)
    print('분석 완료!')
    print(f'  Excel: {excel_path}')
    print(f'  PDF: {pdf_path}')
    print('='*60)


def main():
    parser = argparse.ArgumentParser(description='학생부 분석 프로그램')
    parser.add_argument('--university', '-u', help='지원 대학명')
    parser.add_argument('--department', '-d', help='지원 학과명')
    parser.add_argument('--step', '-s', type=int, help='특정 단계만 실행 (1-9)')
    parser.add_argument('--resume', '-r', type=int, help='특정 단계부터 재개')
    args = parser.parse_args()

    temp_dir = get_temp_dir(OUTPUT_DIR)
    start_step = args.resume or args.step or 1
    end_step = args.step or 9

    steps = {
        1: lambda: step1_prepare_files(temp_dir),
        2: lambda: step2_extraction(temp_dir),
        3: lambda: step3_grade_analysis(temp_dir, args.university, args.department),
        4: lambda: step4_admission_matching(temp_dir, args.university, args.department),
        5: lambda: step5_setuek_analysis(temp_dir, args.department),
        6: lambda: step6_changche_analysis(temp_dir, args.department),
        7: lambda: step7_haengtuk_analysis(temp_dir),
        8: lambda: step8_comprehensive(temp_dir),
        9: lambda: step9_generate_reports(temp_dir),
    }

    for step_num in range(start_step, end_step + 1):
        if step_num in steps:
            try:
                steps[step_num]()
            except FileNotFoundError as e:
                print(f'\n[오류] 필요한 파일이 없습니다: {e}')
                print('이전 단계를 먼저 완료해주세요.')
                break
            except Exception as e:
                print(f'\n[오류] Step {step_num} 실행 중 오류: {e}')
                import traceback
                traceback.print_exc()
                break


if __name__ == '__main__':
    main()
