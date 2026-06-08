"""대학모집요강 관리자 라우터."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.university_guide import UniversityGuide
from app.schemas.university_guide import (
    UniversityGuideBulkCopyRequest,
    UniversityGuideCreate,
    UniversityGuideListResponse,
    UniversityGuideResponse,
    UniversityGuideUpdate,
)
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin/university-guide", tags=["관리자-대학모집요강"])


def _require_super_admin(admin: Admin):
    """super_admin 또는 admins 메뉴 권한자만 운영 가능."""
    if admin.role == "super_admin":
        return
    allowed = admin.allowed_menus or []
    if "admins" not in allowed:
        raise HTTPException(status_code=403, detail="권한이 없습니다 (super_admin 또는 admins 권한 필요)")


@router.get("/", response_model=UniversityGuideListResponse)
async def admin_list(
    year: int | None = Query(None),
    search: str | None = Query(None),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """전체 목록 (활성/비활성 포함)."""
    _require_super_admin(admin)

    year_result = await db.execute(
        select(distinct(UniversityGuide.year)).order_by(UniversityGuide.year.desc())
    )
    available_years = [row[0] for row in year_result.all()]

    target_year = year if year is not None else (available_years[0] if available_years else None)

    if target_year is None:
        return UniversityGuideListResponse(items=[], total=0, available_years=[])

    conditions = [UniversityGuide.year == target_year]
    if search:
        conditions.append(UniversityGuide.university.ilike(f"%{search}%"))

    count_query = select(func.count()).select_from(UniversityGuide).where(and_(*conditions))
    total = (await db.execute(count_query)).scalar() or 0

    result = await db.execute(
        select(UniversityGuide)
        .where(and_(*conditions))
        .order_by(UniversityGuide.sort_order.asc(), UniversityGuide.university.asc())
    )
    guides = result.scalars().all()

    items = [UniversityGuideResponse.model_validate(g) for g in guides]
    return UniversityGuideListResponse(items=items, total=total, available_years=available_years)


@router.post("/", response_model=UniversityGuideResponse)
async def admin_create(
    data: UniversityGuideCreate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """대학모집요강 생성."""
    _require_super_admin(admin)

    # 중복 체크
    existing = await db.execute(
        select(UniversityGuide).where(
            and_(
                UniversityGuide.university == data.university,
                UniversityGuide.year == data.year,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="해당 대학·학년도가 이미 존재합니다")

    guide = UniversityGuide(**data.model_dump())
    db.add(guide)
    await db.commit()
    await db.refresh(guide)
    return UniversityGuideResponse.model_validate(guide)


@router.put("/{guide_id}", response_model=UniversityGuideResponse)
async def admin_update(
    guide_id: uuid.UUID,
    data: UniversityGuideUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """대학모집요강 수정."""
    _require_super_admin(admin)

    result = await db.execute(select(UniversityGuide).where(UniversityGuide.id == guide_id))
    guide = result.scalar_one_or_none()
    if not guide:
        raise HTTPException(status_code=404, detail="대학모집요강을 찾을 수 없습니다")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(guide, field, value)

    await db.commit()
    await db.refresh(guide)
    return UniversityGuideResponse.model_validate(guide)


@router.delete("/{guide_id}")
async def admin_delete(
    guide_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """대학모집요강 삭제."""
    _require_super_admin(admin)

    result = await db.execute(select(UniversityGuide).where(UniversityGuide.id == guide_id))
    guide = result.scalar_one_or_none()
    if not guide:
        raise HTTPException(status_code=404, detail="대학모집요강을 찾을 수 없습니다")

    await db.delete(guide)
    await db.commit()
    return {"message": "대학모집요강이 삭제되었습니다"}


@router.post("/bulk-copy")
async def admin_bulk_copy(
    data: UniversityGuideBulkCopyRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    학년도 일괄 복사.
    - from_year 의 대학 목록을 to_year 로 복사.
    - copy_urls=False (기본): 대학명·코드·sort_order 만 복사하고 URL 은 빈 값.
    - copy_urls=True: URL 까지 그대로 복사.
    - to_year 에 이미 존재하는 대학은 건너뜀 (덮어쓰지 않음).
    """
    _require_super_admin(admin)

    if data.from_year == data.to_year:
        raise HTTPException(status_code=400, detail="from_year 와 to_year 가 같습니다")

    # 원본
    src_result = await db.execute(
        select(UniversityGuide).where(UniversityGuide.year == data.from_year)
    )
    src_guides = src_result.scalars().all()

    if not src_guides:
        raise HTTPException(status_code=404, detail=f"{data.from_year}학년도 데이터가 없습니다")

    # 기존 to_year 의 대학 목록 (중복 회피)
    dst_result = await db.execute(
        select(UniversityGuide.university).where(UniversityGuide.year == data.to_year)
    )
    existing_universities = {row[0] for row in dst_result.all()}

    created_count = 0
    skipped_count = 0
    for src in src_guides:
        if src.university in existing_universities:
            skipped_count += 1
            continue

        new_guide = UniversityGuide(
            university=src.university,
            university_code=src.university_code,
            year=data.to_year,
            sort_order=src.sort_order,
            is_active=src.is_active,
        )
        if data.copy_urls:
            new_guide.official_admission_url = src.official_admission_url
            new_guide.official_jonghap_guidebook_url = src.official_jonghap_guidebook_url
            new_guide.official_result_url = src.official_result_url
            new_guide.adiga_admission_plan_url = src.adiga_admission_plan_url
            new_guide.adiga_susi_guide_url = src.adiga_susi_guide_url
            new_guide.adiga_jeongsi_guide_url = src.adiga_jeongsi_guide_url
            new_guide.adiga_result_url = src.adiga_result_url
            new_guide.adiga_prior_learning_eval_url = src.adiga_prior_learning_eval_url

        db.add(new_guide)
        created_count += 1

    await db.commit()
    return {
        "created": created_count,
        "skipped": skipped_count,
        "from_year": data.from_year,
        "to_year": data.to_year,
    }


@router.post("/{guide_id}/mark-checked")
async def admin_mark_checked(
    guide_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """수동으로 URL 점검 완료 표시 (last_checked 갱신)."""
    _require_super_admin(admin)

    result = await db.execute(select(UniversityGuide).where(UniversityGuide.id == guide_id))
    guide = result.scalar_one_or_none()
    if not guide:
        raise HTTPException(status_code=404, detail="대학모집요강을 찾을 수 없습니다")

    guide.last_checked = datetime.utcnow()
    await db.commit()
    return {"message": "점검 완료로 표시되었습니다", "last_checked": guide.last_checked}
