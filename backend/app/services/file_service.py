import uuid

import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile, status

from app.config import settings


def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )


async def upload_file(file: UploadFile, folder: str) -> tuple[str, str]:
    """파일을 S3에 업로드하고 (S3 키, 원본 파일명)을 반환"""
    s3 = get_s3_client()
    file_ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    s3_key = f"{folder}/{uuid.uuid4()}.{file_ext}"

    try:
        contents = await file.read()
        s3.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=contents,
            ContentType=file.content_type or "application/octet-stream",
        )
    except ClientError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"파일 업로드에 실패했습니다: {e}",
        )

    return s3_key, file.filename


def generate_download_url(s3_key: str, expires_in: int = 3600) -> str:
    """S3 파일의 임시 다운로드 URL 생성 (기본 1시간)"""
    s3 = get_s3_client()
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": s3_key},
            ExpiresIn=expires_in,
        )
        return url
    except ClientError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"다운로드 URL 생성에 실패했습니다: {e}",
        )
