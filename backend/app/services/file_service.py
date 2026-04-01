import os
import uuid

from fastapi import HTTPException, UploadFile, status

from app.config import settings

# ─── 저장 모드 결정 ──────────────────────────────────────────────────────
# AWS 키가 설정되어 있으면 S3 사용, 없으면 로컬 파일시스템 사용
USE_S3 = bool(settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY)

# 로컬 저장 경로 (서버 루트 기준)
LOCAL_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")


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

    file_ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    unique_name = f"{uuid.uuid4()}.{file_ext}"
    storage_key = f"{folder}/{unique_name}"

    contents = await file.read()

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
