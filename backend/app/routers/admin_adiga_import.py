"""대학어디가 입결 Excel 업로드 관리자 라우터.

흐름:
1. 관리자가 Excel 업로드 (multipart/form-data)
2. 백엔드가 임시 디렉토리에서 파싱 + 컬럼 구조 검증 (표준 형식 아니면 400)
3. DB import (해당 학년도 삭제 후 새로 INSERT)
4. import 성공 시에만 backend/data/admission_results/ 에 영구 저장 (백업·복원용)
5. 결과 응답 (학년도, 삭제·신규 건수, 학년도별 요약)
"""

import logging
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.services.adiga_result_import_service import (
    extract_year_from_filename,
    get_year_summary,
    import_to_db,
    parse_excel,
)
from app.utils.dependencies import get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/adiga-results", tags=["관리자-대학어디가 입결"])

# 영구 보관 폴더 (backend/data/admission_results/)
# 이 파일이 backend/app/routers/admin_adiga_import.py 이므로 부모 3단계 위가 backend/
BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
PERSIST_DIR = BACKEND_ROOT / "data" / "admission_results"


def _require_super_admin(admin: Admin):
    if admin.role == "super_admin":
        return
    allowed = admin.allowed_menus or []
    if "admins" not in allowed:
        raise HTTPException(status_code=403, detail="권한이 없습니다 (super_admin 또는 admins 권한 필요)")


@router.get("/summary")
async def admin_summary(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """학년도별 import 현황."""
    _require_super_admin(admin)
    items = await get_year_summary(db)
    return {"items": items, "total_years": len(items)}


@router.post("/upload")
async def admin_upload(
    file: UploadFile = File(..., description="대학어디가 입결 Excel"),
    year: int | None = Query(None, description="학년도 강제 지정 (파일명에서 추출 안 되면)"),
    mode: str = Query("full", description="full=해당 학년도 전체 교체 / partial=파일에 포함된 대학만 교체"),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    대학어디가 입결 Excel 업로드 → 검증 → DB import → 영구 저장.

    - mode=full: 해당 학년도 데이터 전체 교체
    - mode=partial: 파일에 포함된 대학만 교체 (없는 대학 기존 데이터 유지)
    """
    if mode not in ("full", "partial"):
        raise HTTPException(status_code=400, detail="mode 는 full 또는 partial 이어야 합니다")
    _require_super_admin(admin)

    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Excel 파일(.xlsx) 만 허용됩니다")

    # 임시 파일에 저장
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        # 1. 파싱
        try:
            parsed = parse_excel(tmp_path)
        except Exception as e:
            logger.error(f"adiga import parse 실패: {e}")
            raise HTTPException(status_code=400, detail=f"Excel 파싱 실패: {e}")

        if parsed["total_rows"] == 0:
            raise HTTPException(status_code=400, detail="Excel 에 유효한 행이 없습니다")

        # 2. 학년도 결정
        effective_year = year or parsed.get("year") or extract_year_from_filename(file.filename)
        if not effective_year:
            raise HTTPException(
                status_code=400,
                detail="학년도를 결정할 수 없습니다. 파일명을 'adiga_입결_YYYY.xlsx' 형식으로 하거나 year 파라미터를 지정하세요.",
            )

        # 3. DB import (실패 시 기존 백업 파일을 건드리지 않도록 영구 저장보다 먼저 수행)
        try:
            result = await import_to_db(db, parsed, override_year=effective_year, mode=mode)
        except Exception as e:
            logger.error(f"adiga import DB 실패: {e}")
            raise HTTPException(status_code=500, detail=f"DB import 실패: {e}")

        # 4. import 성공 후에만 영구 저장 (백업·복원용 — 실패한 파일로 덮어쓰기 방지)
        #    부분 교체 파일은 전체 백업을 덮어쓰지 않도록 _partial 접미사로 저장
        PERSIST_DIR.mkdir(parents=True, exist_ok=True)
        suffix = "_partial" if mode == "partial" else ""
        dest_path = PERSIST_DIR / f"adiga_입결_{effective_year}{suffix}.xlsx"
        shutil.copyfile(tmp_path, dest_path)
        logger.info(f"adiga import: 영구 보관 → {dest_path}")

        # 5. 학년도별 요약 함께 반환
        summary = await get_year_summary(db)

        return {
            "year": result["year"],
            "display_year": result["display_year"],
            "mode": result["mode"],
            "deleted": result["deleted"],
            "inserted": result["inserted"],
            "source_file": result["filename"],
            "saved_path": str(dest_path.relative_to(BACKEND_ROOT)),
            "summary": summary,
        }
    finally:
        # 임시 파일 정리
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


@router.delete("/year/{year}")
async def admin_delete_year(
    year: int,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """특정 학년도 데이터 전체 삭제 (영구 저장 파일은 보존)."""
    _require_super_admin(admin)

    from sqlalchemy import delete as sa_delete

    from app.models.adiga_admission_result import AdigaAdmissionResult

    result = await db.execute(
        sa_delete(AdigaAdmissionResult).where(AdigaAdmissionResult.year == year)
    )
    deleted = result.rowcount or 0
    await db.commit()

    return {"year": year, "deleted": deleted}
