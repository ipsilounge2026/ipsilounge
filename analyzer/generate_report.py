"""
generate_report.py - 학생부 분석 리포트 생성기 진입점

사용법:
    python generate_report.py <학생명> [옵션]

기본 사용 (전체 분석):
    python generate_report.py 연승훈
    python generate_report.py 의대샘플

실행 모드 옵션 (CLAUDE.md § 13, 2026-04-19 추가):
    --mode full        : 전체 분석 (기본값, 내신+세특+창체+행특+입결)
    --mode no-grade    : 내신 제외 분석 (세특+창체+행특)
    --mode partial     : 특정 영역만 (--areas 필수)
    --areas <목록>     : partial 모드에서 포함할 영역 (쉼표 구분)
                         가능한 값: setuek, changche, haengtuk

예시:
    python generate_report.py 연승훈 --mode no-grade
    python generate_report.py 연승훈 --mode partial --areas setuek
    python generate_report.py 연승훈 --mode partial --areas setuek,changche

학생 데이터 파일은 data/students/<학생명>.py 에 저장되어 있어야 함.
새 학생을 추가하려면 data/students/_template.py를 복사하여 작성.
"""

import importlib.util
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
STUDENTS_DIR = PROJECT_ROOT / "data" / "students"
OUTPUT_DIR   = PROJECT_ROOT / "output"

REQUIRED_VARS = [
    "STUDENT", "SCHOOL", "TODAY",
    "TARGET_UNIV", "TARGET_MAJOR",  # 지원 대학·학과 (빈 문자열이면 미지정 모드)
    "setuek_data", "setuek_comments", "comment_keys", "good_sentences",
    "changche_data", "changche_comments",
    "haengtuk_data", "haengtuk_comments",
    "linkage_data", "eval_data", "fix_data", "summary_data",
]
# 선택 필드 (없어도 generate_report 동작, 있으면 해당 시트·섹션·QA 추가)
OPTIONAL_VARS = [
    "raw_texts",       # G5 워드클라우드·키워드분석
    "attendance_data", # G7 출결
    "volunteer_data",  # G7 봉사
    "compare_data",    # G3+G4 이전 대비 변화
    "grade_data",      # 대학별 내신 산출 raw 성적 (2026-05-05)
    "TARGET_ADMISSION_TYPE",      # 지망 전형명 (대학별 내신 산출용)
    "TARGET_ADMISSION_CATEGORY",  # 지망 전형유형
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
        print("data/students/ 폴더에 학생 파일이 없습니다.")
        print("data/students/_template.py를 복사하여 새 학생 파일을 작성하세요.")


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


def _parse_optional_flag(argv, flag_name):
    """argv 에서 '--flag value' 형태의 값 추출 (없으면 None)."""
    try:
        idx = argv.index(flag_name)
        return argv[idx + 1] if idx + 1 < len(argv) else None
    except ValueError:
        return None


def main():
    # 명령행 인자 검증
    if len(sys.argv) < 2:
        print_usage_with_students()
        sys.exit(1)

    student_name = sys.argv[1]

    # Phase C (2026-04-17): analyzer ↔ backend 연동 옵션
    # --analysis-id <ID>: backend 의 analysis_orders.id (upload 시 참조)
    # --auto-upload: 리포트 생성 직후 analysis_fetcher.upload() 호출
    _analysis_id = _parse_optional_flag(sys.argv, "--analysis-id")
    _auto_upload = "--auto-upload" in sys.argv

    # 2026-04-19: 실행 모드 옵션 (CLAUDE.md § 13)
    _mode  = _parse_optional_flag(sys.argv, "--mode")  or "full"
    _areas = _parse_optional_flag(sys.argv, "--areas") or None

    # 학생 데이터 로드
    sd = load_student_data(student_name)

    # 모듈 import 경로 설정
    sys.path.insert(0, str(PROJECT_ROOT))

    # ── 실행 모드 설정 ──
    from modules.mode_config import build_mode_config
    try:
        mode_cfg = build_mode_config(_mode, _areas)
    except ValueError as e:
        print(f"[ERROR] {e}")
        sys.exit(1)
    print(f"실행 모드: {mode_cfg.label()}")

    # ── Step 8.5: QA 검증 ──
    from modules.qa_validator import print_qa_report, run_full_qa

    print("=" * 60)
    print(f"  Step 8.5: QA 검증 실행 - {sd.STUDENT}")
    print("=" * 60)

    # ── 이전 리포트 자동 탐색 (G3) ──
    # compare_data 가 있을 경우 QA P1-G-001/002 가 "이전 리포트에 몇 개였는지" 를 필요로 함.
    # compare_generator 로 이전 리포트 파싱해서 expected_*_count 계산.
    _expected_st = 0
    _expected_is = 0
    try:
        from modules.compare_generator import build_tracking_targets, extract_previous_info, find_previous_reports
        _prev_list = find_previous_reports(sd.STUDENT, OUTPUT_DIR)
        if _prev_list and (getattr(sd, "compare_data", {}) or {}):
            _prev_path, _prev_ver, _prev_date, _prev_round = _prev_list[-1]
            _prev_info = extract_previous_info(_prev_path, round_num=_prev_round)
            _targets = build_tracking_targets(_prev_info)
            _expected_st = len(_targets.strengths_to_track)
            _expected_is = len(_targets.issues_to_track)
            print(f"[INFO] 이전 리포트 발견: {_prev_path.name}")
            print(f"       판정 대상 - 강점 {_expected_st}개 / 보완점 {_expected_is}개")
    except Exception as _e:
        print(f"[WARN] 이전 리포트 파싱 중 예외 (스킵): {type(_e).__name__}: {_e}")

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
        target_major=getattr(sd, "TARGET_MAJOR", "") or "",
        attendance_data=getattr(sd, "attendance_data", None),
        volunteer_data=getattr(sd, "volunteer_data", None),
        compare_data=getattr(sd, "compare_data", None),
        expected_strengths_count=_expected_st,
        expected_issues_count=_expected_is,
        mode_config=mode_cfg,
    )
    print_qa_report(qa_report)

    # 모드 안내 출력
    _is_major = bool(getattr(sd, "TARGET_MAJOR", "") and str(sd.TARGET_MAJOR).strip())
    _mode_label = f"지정 모드 (7항목, 지원 학과: {sd.TARGET_MAJOR})" if _is_major else "미지정 모드 (6항목, 전공적합성 제외)"
    print(f"세특 루브릭: {_mode_label}")

    if not qa_report.all_blocking_passed():
        print("QA FAIL - 리포트 생성 차단. FAIL 항목 수정 후 재실행하세요.")
        sys.exit(3)

    # ── Step 9: 리포트 생성 ──
    print("QA 통과 - 리포트 생성 시작")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── G4 (2026-04-17): _v{N} 자동 접미사 ──
    # output/ 에 기존 리포트 있으면 다음 버전 번호 부여.
    from modules.compare_generator import get_next_version_number
    _next_ver = get_next_version_number(sd.STUDENT, sd.TODAY, OUTPUT_DIR)
    if _next_ver is None:
        # 최초 분석
        _suffix = ""
    else:
        # 2회차 이상
        _suffix = f"_v{_next_ver}"
        if not (getattr(sd, "compare_data", {}) or {}):
            print(f"[WARN] 기존 리포트가 있지만 compare_data 가 비어있습니다. _v{_next_ver} 로 저장하되,")
            print("       CLAUDE.md § Step 0-4 에 따라 이전 대비 변화 분석을 compare_data 에 기록하는 것을 권장합니다.")

    xlsx_path = OUTPUT_DIR / f"{sd.STUDENT}_학생부분석_{sd.TODAY}{_suffix}.xlsx"
    pdf_path  = OUTPUT_DIR / f"{sd.STUDENT}_학생부분석_{sd.TODAY}{_suffix}.pdf"

    from modules.report_logic import create_excel, create_pdf
    create_excel(sd, xlsx_path, mode_config=mode_cfg)
    create_pdf(sd, pdf_path, mode_config=mode_cfg)

    # ── G6 v1+v2 (2026-04-19): 상담용 학생부 하이라이트 PDF ──
    # source_pdf_path + good_sentences 또는 highlight_quotes 가 있을 때 생성.
    # v1: 노란색 (good_sentences 핵심평가문장)
    # v2: 초록·주황 (highlight_quotes.setuek 의 강점·보완점 근거)
    # partial 모드에서 세특 제외 시 전체 스킵.
    if mode_cfg.include_setuek:
        try:
            from modules.highlight_pdf_generator import generate_highlight_pdf, print_highlight_summary
            highlight_report = generate_highlight_pdf(
                sd, project_root=PROJECT_ROOT, output_dir=OUTPUT_DIR, suffix=_suffix
            )
            print_highlight_summary(highlight_report)
        except Exception as _hl_e:
            print(f"[WARN] G6 하이라이트 PDF 생성 실패 (스킵): {type(_hl_e).__name__}: {_hl_e}")
    else:
        print("[INFO] partial 모드 setuek 제외 → G6 하이라이트 PDF 스킵")

    print("Done.")

    # Phase C (2026-04-17): --auto-upload 시 backend 에 자동 업로드 + review 전이
    if _auto_upload:
        # analysis_id 우선순위: CLI 인자 > 학생 데이터 파일 내 analysis_id 필드
        aid = _analysis_id or getattr(sd, "analysis_id", None)
        if not aid:
            print("[WARN] --auto-upload 지정되었으나 --analysis-id 도 없고 sd.analysis_id 도 비어있음. 업로드 스킵.")
        else:
            try:
                from modules.analysis_fetcher import upload as _fetcher_upload
                print("=" * 60)
                print(f"  Phase C: backend 자동 업로드 (analysis_id={aid})")
                print("=" * 60)
                _fetcher_upload(sd.STUDENT, str(aid))
                print("[OK] 업로드 완료. 관리자 검수 대기 (status=review).")
            except Exception as _upload_e:
                print(f"[ERROR] 자동 업로드 실패: {type(_upload_e).__name__}: {_upload_e}")
                print("        → admin-web 에서 수동 업로드 또는 환경변수/토큰 확인 필요")
                sys.exit(4)


if __name__ == "__main__":
    main()
