# -*- coding: utf-8 -*-
"""
analysis_fetcher.py
- Phase C (2026-04-17): analyzer ↔ backend 배치 반자동 연동
- 관리자 Claude Code 대화 세션에서 사용. admin_web "분석 시작" 클릭이 된 건들
  (status=processing) 을 일괄 조회 · 다운로드 · 업로드.

워크플로우:
    1. /process_pending slash command 실행
    2. Claude 가 list_pending() 호출 → 대기 큐 확인
    3. 각 건마다:
       a. fetch(analysis_id) → 학생부 PDF + 학생 데이터 파일 템플릿
       b. Claude 가 학생부 분석 + data/students/<학생명>.py 작성 완료
       c. python generate_report.py <학생명> --analysis-id <id> --auto-upload
          → Excel/PDF 생성 + upload() 호출 → backend POST
       d. backend 가 status 를 review 로 전환
    4. 관리자 admin-web 에서 검수 → approve/reject

CLI 사용:
    python -m modules.analysis_fetcher --pending
    python -m modules.analysis_fetcher fetch <ANALYSIS_ID> --student <이름>
    python -m modules.analysis_fetcher upload <STUDENT_NAME> --analysis-id <ID>

환경변수:
    IPSILOUNGE_API_BASE   (기본 http://localhost:8000)
    IPSILOUNGE_ADMIN_TOKEN (관리자 JWT 액세스 토큰)
"""

from __future__ import annotations
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional


# ═══════════════════════════════════════════════════════
# 환경 설정
# ═══════════════════════════════════════════════════════

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR = PROJECT_ROOT / "input"
OUTPUT_DIR = PROJECT_ROOT / "output"
STUDENTS_DIR = PROJECT_ROOT / "data" / "students"
TEMPLATE_PATH = STUDENTS_DIR / "_template.py"


def _api_base() -> str:
    return os.environ.get("IPSILOUNGE_API_BASE", "http://localhost:8000").rstrip("/")


def _admin_token() -> str:
    token = os.environ.get("IPSILOUNGE_ADMIN_TOKEN", "").strip()
    if not token:
        raise RuntimeError(
            "[analysis_fetcher] IPSILOUNGE_ADMIN_TOKEN 환경변수가 설정되지 않았습니다.\n"
            "  1. admin-web 에서 관리자 로그인\n"
            "  2. 브라우저 개발자 도구 → localStorage 또는 쿠키에서 JWT 추출\n"
            "  3. set IPSILOUNGE_ADMIN_TOKEN=eyJhbGc... (Windows cmd)\n"
            "     export IPSILOUNGE_ADMIN_TOKEN=eyJhbGc... (bash)"
        )
    return token


def _auth_headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {_admin_token()}"}


# ═══════════════════════════════════════════════════════
# HTTP 호출 (표준 라이브러리 urllib 사용 — requests 의존 없음)
# ═══════════════════════════════════════════════════════

def _http_get_json(path: str) -> Any:
    """관리자 JWT 인증으로 backend GET → JSON 반환."""
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError

    url = f"{_api_base()}{path}"
    req = Request(url, headers=_auth_headers(), method="GET")
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code} {url}: {body}") from None


def _http_get_bytes(path: str, dest: Path) -> Path:
    """관리자 JWT 로 binary 다운로드 → dest 경로에 저장."""
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError

    url = f"{_api_base()}{path}"
    req = Request(url, headers=_auth_headers(), method="GET")
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urlopen(req, timeout=60) as resp:
            with open(dest, "wb") as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code} {url}: {body}") from None
    return dest


def _http_post_multipart(path: str, files: Dict[str, Path]) -> Dict[str, Any]:
    """multipart/form-data 로 여러 파일 POST. 표준 라이브러리로 수동 구성."""
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError
    import mimetypes
    import uuid as _uuid

    boundary = f"----analyzerBoundary{_uuid.uuid4().hex}"
    body = bytearray()
    for field, file_path in files.items():
        file_path = Path(file_path)
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{field}"; filename="{file_path.name}"\r\n'.encode()
        body += f"Content-Type: {content_type}\r\n\r\n".encode()
        with open(file_path, "rb") as f:
            body += f.read()
        body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()

    url = f"{_api_base()}{path}"
    headers = _auth_headers() | {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    req = Request(url, data=bytes(body), headers=headers, method="POST")
    try:
        with urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body_resp = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code} {url}: {body_resp}") from None


# ═══════════════════════════════════════════════════════
# 1. 대기 목록 조회 (list_pending)
# ═══════════════════════════════════════════════════════

def list_pending() -> List[Dict[str, Any]]:
    """status=processing 건 목록 반환.
    Returns: [{"analysis_id", "user_name", "service_type", "status",
               "school_record_filename", "target_university", "target_major",
               "memo", "review_feedback", "is_text_pdf",
               "uploaded_at", "processing_at"}]
    """
    return _http_get_json("/api/admin/analysis/_internal/pending-list")


def print_pending():
    """CLI: 대기 목록 콘솔 출력."""
    items = list_pending()
    if not items:
        print("[INFO] 대기 중인 분석 없음.")
        return

    print(f"[INFO] 대기 중인 분석 {len(items)}건:")
    print()
    for i, it in enumerate(items, 1):
        flag = ""
        if it.get("is_text_pdf") is False:
            flag = " ⚠️ 스캔 PDF"
        elif it.get("is_text_pdf") is None:
            flag = " (PDF 없음)"
        print(f"  {i}. analysis_id={it['analysis_id']}")
        print(f"     학생: {it['user_name']}")
        print(f"     서비스: {it.get('service_type', '-')}")
        print(f"     학생부: {it.get('school_record_filename', '-')}{flag}")
        print(f"     지원: {it.get('target_university', '-')} / {it.get('target_major', '-')}")
        if it.get("review_feedback"):
            print(f"     💬 재분석 피드백: {it['review_feedback'][:100]}")
        print()


# ═══════════════════════════════════════════════════════
# 2. 학생부 다운로드 + 템플릿 스캐폴딩 (fetch)
# ═══════════════════════════════════════════════════════

def fetch(analysis_id: str, student_name: str) -> Dict[str, Path]:
    """학생부 PDF 다운로드 + 학생 데이터 파일 템플릿 생성.
    반환: {"pdf_path": Path, "student_file": Path, "metadata": dict}
    """
    # 1. 메타 조회 (detail endpoint)
    meta = _http_get_json(f"/api/admin/analysis/{analysis_id}")

    if meta.get("status") != "processing":
        raise RuntimeError(
            f"[analysis_fetcher] analysis_id={analysis_id} 는 processing 상태가 아닙니다 "
            f"(현재: {meta.get('status')}). admin-web 에서 '분석 시작' 또는 '재분석 요청' 먼저 클릭 필요."
        )

    # 2. PDF 다운로드
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf_dest = INPUT_DIR / f"{analysis_id}_{student_name}.pdf"
    _http_get_bytes(f"/api/admin/analysis/_internal/{analysis_id}/school-record-file", pdf_dest)
    print(f"[OK] 학생부 다운로드: {pdf_dest}")

    # 3. 학생 데이터 파일 스캐폴딩
    student_file = STUDENTS_DIR / f"{student_name}.py"
    if student_file.exists():
        print(f"[SKIP] {student_file} 이미 존재. 수동 편집.")
    else:
        if not TEMPLATE_PATH.exists():
            raise RuntimeError(f"_template.py 없음: {TEMPLATE_PATH}")
        tpl = TEMPLATE_PATH.read_text(encoding="utf-8")

        # 메타 필드 자동 주입
        target_univ = meta.get("target_university") or ""
        target_major = meta.get("target_major") or ""
        today = _today_yyyymmdd()

        replaced = tpl
        replaced = replaced.replace('STUDENT = "학생이름"', f'STUDENT = "{student_name}"')
        replaced = replaced.replace('SCHOOL  = "××고등학교"', 'SCHOOL  = ""  # TODO: Claude 분석 후 기록')
        replaced = replaced.replace('TODAY   = "20260408"  # YYYYMMDD, 출력 파일명에 사용됨',
                                     f'TODAY   = "{today}"')
        replaced = replaced.replace('TARGET_UNIV  = ""', f'TARGET_UNIV  = "{target_univ}"')
        replaced = replaced.replace('TARGET_MAJOR = ""', f'TARGET_MAJOR = "{target_major}"')

        # Phase C (G6 대비): source_pdf_path + analysis_id 주입
        # _template.py 에는 이 필드가 없으므로 파일 끝에 추가
        addendum = (
            "\n\n"
            "# ═══════════════════════════════════════════════════════\n"
            "# Phase C (2026-04-17) analyzer ↔ backend 연동 메타\n"
            "# ═══════════════════════════════════════════════════════\n"
            f"analysis_id     = \"{analysis_id}\"\n"
            f"source_pdf_path = \"input/{analysis_id}_{student_name}.pdf\"\n"
        )
        # 재분석 피드백이 있으면 주석으로 기록
        if meta.get("review_feedback"):
            addendum += (
                "\n"
                "# ⚠️ 이전 검수에서 받은 재분석 피드백 (Claude 가 참고):\n"
                f"# {meta['review_feedback'].replace(chr(10), chr(10) + '# ')}\n"
            )

        student_file.write_text(replaced + addendum, encoding="utf-8")
        print(f"[OK] 학생 데이터 파일 스캐폴딩: {student_file}")

    return {"pdf_path": pdf_dest, "student_file": student_file, "metadata": meta}


def _today_yyyymmdd() -> str:
    from datetime import date
    return date.today().strftime("%Y%m%d")


# ═══════════════════════════════════════════════════════
# 3. 리포트 업로드 (upload)
# ═══════════════════════════════════════════════════════

def upload(student_name: str, analysis_id: str) -> Dict[str, Any]:
    """output/ 에서 Excel + PDF 를 찾아서 backend 에 업로드.
    성공 시 backend 는 status 를 review 로 전환.
    """
    # 가장 최근 생성된 파일 탐색 (_v{N} 포함 가능)
    xlsx_files = sorted(OUTPUT_DIR.glob(f"{student_name}_학생부분석_*.xlsx"),
                        key=lambda p: p.stat().st_mtime, reverse=True)
    pdf_files = sorted(OUTPUT_DIR.glob(f"{student_name}_학생부분석_*.pdf"),
                       key=lambda p: p.stat().st_mtime, reverse=True)

    if not xlsx_files or not pdf_files:
        raise RuntimeError(
            f"[analysis_fetcher] 업로드할 리포트 없음. output/ 에 {student_name}_학생부분석_*.xlsx/pdf 확인"
        )

    xlsx = xlsx_files[0]
    pdf = pdf_files[0]
    print(f"[INFO] 업로드 대상:")
    print(f"  Excel: {xlsx.name}")
    print(f"  PDF:   {pdf.name}")

    resp = _http_post_multipart(
        f"/api/admin/analysis/_internal/{analysis_id}/upload-report-auto",
        {"excel_file": xlsx, "pdf_file": pdf},
    )
    print(f"[OK] 업로드 완료. 응답: {resp}")
    return resp


# ═══════════════════════════════════════════════════════
# CLI entry point
# ═══════════════════════════════════════════════════════

def _usage():
    print("사용법:")
    print("  python -m modules.analysis_fetcher --pending")
    print("  python -m modules.analysis_fetcher fetch <ANALYSIS_ID> --student <이름>")
    print("  python -m modules.analysis_fetcher upload <학생이름> --analysis-id <ID>")
    print()
    print("환경변수:")
    print("  IPSILOUNGE_API_BASE   (기본 http://localhost:8000)")
    print("  IPSILOUNGE_ADMIN_TOKEN (관리자 JWT)")


def _parse_kv(argv: List[str], key: str) -> Optional[str]:
    """argv 에서 '--key value' 추출."""
    try:
        idx = argv.index(key)
        return argv[idx + 1]
    except (ValueError, IndexError):
        return None


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        _usage()
        return

    if argv[0] == "--pending":
        print_pending()
        return

    if argv[0] == "fetch":
        if len(argv) < 2:
            _usage()
            sys.exit(1)
        analysis_id = argv[1]
        student_name = _parse_kv(argv, "--student")
        if not student_name:
            print("[ERROR] --student <이름> 필수")
            sys.exit(1)
        fetch(analysis_id, student_name)
        return

    if argv[0] == "upload":
        if len(argv) < 2:
            _usage()
            sys.exit(1)
        student_name = argv[1]
        analysis_id = _parse_kv(argv, "--analysis-id")
        if not analysis_id:
            print("[ERROR] --analysis-id <ID> 필수")
            sys.exit(1)
        upload(student_name, analysis_id)
        return

    _usage()
    sys.exit(1)


if __name__ == "__main__":
    main()
