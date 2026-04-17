# -*- coding: utf-8 -*-
"""
generate_report.py - 학생부 분석 리포트 생성기 진입점

사용법:
    python generate_report.py <학생명>

예시:
    python generate_report.py 연승훈
    python generate_report.py 의대샘플

학생 데이터 파일은 data/students/<학생명>.py 에 저장되어 있어야 함.
새 학생을 추가하려면 data/students/_template.py를 복사하여 작성.
"""

import sys
import os
import importlib.util
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
STUDENTS_DIR = PROJECT_ROOT / "data" / "students"
OUTPUT_DIR   = PROJECT_ROOT / "output"

REQUIRED_VARS = [
    "STUDENT", "SCHOOL", "TODAY",
    "setuek_data", "setuek_comments", "comment_keys", "good_sentences",
    "changche_data", "changche_comments",
    "haengtuk_data", "haengtuk_comments",
    "linkage_data", "eval_data", "fix_data", "summary_data",
]


def list_available_students():
    """data/students/ 폴더에 있는 학생 파일 목록 반환 (_template, __init__ 제외)"""
    if not STUDENTS_DIR.exists():
        return []
    students = []
    for p in sorted(STUDENTS_DIR.glob("*.py")):
        if p.stem.startswith("_") or p.stem == "__init__":
            continue
        students.append(p.stem)
    return students


def print_usage_with_students():
    """사용법 + 사용 가능한 학생 목록 출력"""
    print("사용법: python generate_report.py <학생명>")
    print()
    students = list_available_students()
    if students:
        print("사용 가능한 학생:")
        for s in students:
            print(f"  - {s}")
        print()
        print(f"사용 예: python generate_report.py {students[0]}")
    else:
        print(f"data/students/ 폴더에 학생 파일이 없습니다.")
        print(f"data/students/_template.py를 복사하여 새 학생 파일을 작성하세요.")


def load_student_data(student_name: str):
    """학생 데이터 파일을 동적으로 로드.
    한글 파일명도 안전하게 처리 (importlib.util.spec_from_file_location 사용).
    """
    file_path = STUDENTS_DIR / f"{student_name}.py"

    if not file_path.exists():
        print(f"[ERROR] 학생 데이터 파일을 찾을 수 없습니다: {file_path}")
        print()
        students = list_available_students()
        if students:
            print("사용 가능한 학생:")
            for s in students:
                print(f"  - {s}")
            print()
            print(f"사용 예: python generate_report.py {students[0]}")
        else:
            print("data/students/ 폴더에 학생 파일이 없습니다.")
        sys.exit(1)

    # 한글 파일명 안전 import: 경로 기반 + ASCII 모듈명
    spec = importlib.util.spec_from_file_location(
        f"student_data_{abs(hash(student_name))}",
        str(file_path),
    )
    if spec is None or spec.loader is None:
        print(f"[ERROR] 데이터 파일을 로드할 수 없습니다: {file_path}")
        sys.exit(2)

    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as e:
        print(f"[ERROR] 데이터 파일 실행 중 오류: {file_path}")
        print(f"        {type(e).__name__}: {e}")
        sys.exit(2)

    # 필수 변수 검증
    missing = [v for v in REQUIRED_VARS if not hasattr(module, v)]
    if missing:
        print(f"[ERROR] {file_path.name}에 필수 변수가 누락되었습니다:")
        for v in missing:
            print(f"  - {v}")
        print()
        print("data/students/_template.py를 참고하여 모든 필수 변수를 정의하세요.")
        sys.exit(2)

    return module


def main():
    # 명령행 인자 검증
    if len(sys.argv) < 2:
        print_usage_with_students()
        sys.exit(1)

    student_name = sys.argv[1]

    # 학생 데이터 로드
    sd = load_student_data(student_name)

    # 모듈 import 경로 설정
    sys.path.insert(0, str(PROJECT_ROOT))

    # ── Step 8.5: QA 검증 ──
    from modules.qa_validator import run_full_qa, print_qa_report

    print("=" * 60)
    print(f"  Step 8.5: QA 검증 실행 - {sd.STUDENT}")
    print("=" * 60)

    qa_report = run_full_qa(
        setuek_data=sd.setuek_data,
        setuek_comments=sd.setuek_comments,
        good_sentences=sd.good_sentences,
        changche_data=sd.changche_data,
        haengtuk_data=sd.haengtuk_data,
        haengtuk_comments=sd.haengtuk_comments,
        linkage_data=sd.linkage_data,
        fix_data=sd.fix_data,
        student_name=sd.STUDENT,
    )
    print_qa_report(qa_report)

    if not qa_report.all_blocking_passed():
        print("QA FAIL - 리포트 생성 차단. FAIL 항목 수정 후 재실행하세요.")
        sys.exit(3)

    # ── Step 9: 리포트 생성 ──
    print("QA 통과 - 리포트 생성 시작")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    xlsx_path = OUTPUT_DIR / f"{sd.STUDENT}_학생부분석_{sd.TODAY}.xlsx"
    pdf_path  = OUTPUT_DIR / f"{sd.STUDENT}_학생부분석_{sd.TODAY}.pdf"

    from modules.report_logic import create_excel, create_pdf
    create_excel(sd, xlsx_path)
    create_pdf(sd, pdf_path)
    print("Done.")


if __name__ == "__main__":
    main()
