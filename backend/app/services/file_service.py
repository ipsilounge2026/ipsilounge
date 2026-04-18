import os
import uuid

from fastapi import HTTPException, UploadFile, status

from app.config import settings

# ─── 저장 모드 결정 ──────────────────────────────────────────────────────
# AWS 키가 설정되어 있으면 S3 사용, 없으면 로컬 파일시스템 사용
USE_S3 = bool(settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY)

# 로컬 저장 경로 (서버 루트 기준)
LOCAL_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")

# ─── 파일 업로드 보안 설정 ──────────────────────────────────────────────
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

# 용도별 허용 확장자
# ※ [2026-04-17 G6/Phase A] school-records 에서 JPG/PNG 제거:
#   - 하이라이트 PDF 생성은 텍스트 레이어 있는 PDF 에서만 가능 (PyMuPDF 좌표 검색)
#   - 이미지 파일은 OCR 필요 → 추후 과제 (G9)
#   - 사용자 측 업로드 UI 에도 "PDF만 가능" 안내 문구 동기화 필요
ALLOWED_EXTENSIONS = {
    "school-records": {"pdf"},                               # 사용자: 학생부 업로드 (PDF 전용)
    "reports": {"pdf", "xlsx", "xls"},                       # 관리자: 리포트 업로드
}

# 확장자별 허용 MIME 타입 (실제 파일 내용 검증용)
ALLOWED_MIME_TYPES = {
    "pdf": {"application/pdf"},
    "jpg": {"image/jpeg"},
    "jpeg": {"image/jpeg"},
    "png": {"image/png"},
    "xlsx": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",  # xlsx는 zip 형식
    },
    "xls": {
        "application/vnd.ms-excel",
        "application/octet-stream",
    },
}

# 파일 매직 넘버 (실제 파일 내용의 첫 바이트로 진짜 파일인지 확인)
FILE_SIGNATURES = {
    "pdf": [b"%PDF"],
    "jpg": [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "png": [b"\x89PNG"],
    "xlsx": [b"PK"],      # xlsx는 ZIP 포맷
    "xls": [b"\xd0\xcf\x11\xe0"],  # OLE2 포맷
}


def _validate_file(file: UploadFile, contents: bytes, folder: str):
    """파일 보안 검증: 크기, 확장자, MIME 타입, 매직 넘버"""

    # 1. 파일 크기 검증
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"파일 크기가 {MAX_FILE_SIZE // (1024*1024)}MB를 초과합니다",
        )

    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="빈 파일은 업로드할 수 없습니다",
        )

    # 2. 확장자 검증
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed = ALLOWED_EXTENSIONS.get(folder, set())

    if not ext or ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"허용되지 않는 파일 형식입니다. 허용 형식: {', '.join(sorted(allowed))}",
        )

    # 3. MIME 타입 검증
    content_type = (file.content_type or "").lower()
    allowed_mimes = ALLOWED_MIME_TYPES.get(ext, set())
    if allowed_mimes and content_type not in allowed_mimes:
        # content_type이 없거나 generic인 경우 매직 넘버로만 판단
        if content_type and content_type != "application/octet-stream":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"파일 내용이 확장자({ext})와 일치하지 않습니다",
            )

    # 4. 매직 넘버 (파일 시그니처) 검증
    signatures = FILE_SIGNATURES.get(ext, [])
    if signatures:
        matched = any(contents[:len(sig)] == sig for sig in signatures)
        if not matched:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"파일 내용이 {ext.upper()} 형식이 아닙니다. 올바른 파일을 업로드해주세요.",
            )


def _ensure_local_dir(folder: str):
    """로컬 저장 디렉토리 생성"""
    path = os.path.join(LOCAL_UPLOAD_DIR, folder)
    os.makedirs(path, exist_ok=True)
    return path


# ─── S3 클라이언트 ───────────────────────────────────────────────────────

def get_s3_client():
    import boto3
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )


# ─── 파일 업로드 ─────────────────────────────────────────────────────────

async def upload_file(file: UploadFile, folder: str) -> tuple[str, str]:
    """파일을 업로드하고 (저장 키, 원본 파일명)을 반환.
    S3 키가 설정되면 S3에, 아니면 로컬에 저장."""

    contents = await file.read()

    # 보안 검증 수행
    _validate_file(file, contents, folder)

    file_ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    unique_name = f"{uuid.uuid4()}.{file_ext}"
    storage_key = f"{folder}/{unique_name}"

    if USE_S3:
        try:
            from botocore.exceptions import ClientError
            s3 = get_s3_client()
            s3.put_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=storage_key,
                Body=contents,
                ContentType=file.content_type or "application/octet-stream",
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"S3 파일 업로드에 실패했습니다: {e}",
            )
    else:
        try:
            dir_path = _ensure_local_dir(folder)
            file_path = os.path.join(dir_path, unique_name)
            with open(file_path, "wb") as f:
                f.write(contents)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"로컬 파일 저장에 실패했습니다: {e}",
            )

    return storage_key, file.filename


# ─── 다운로드 URL 생성 ───────────────────────────────────────────────────

def generate_download_url(storage_key: str, expires_in: int = 3600) -> str:
    """파일의 다운로드 URL 생성.
    S3이면 presigned URL, 로컬이면 서버 API 경로 반환."""

    if USE_S3:
        try:
            from botocore.exceptions import ClientError
            s3 = get_s3_client()
            url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.S3_BUCKET_NAME, "Key": storage_key},
                ExpiresIn=expires_in,
            )
            return url
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"다운로드 URL 생성에 실패했습니다: {e}",
            )
    else:
        # 로컬 파일 → 서버의 /api/files/ 경로로 반환
        return f"/api/files/{storage_key}"


def get_local_file_path(storage_key: str) -> str:
    """로컬 파일의 실제 경로 반환"""
    file_path = os.path.join(LOCAL_UPLOAD_DIR, storage_key)
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="파일을 찾을 수 없습니다",
        )
    return file_path
