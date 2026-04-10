"""가족 연결 관련 공통 헬퍼

핵심 원칙 (project_family_linking 메모리 참조):
- owner_user_id 는 항상 "자녀(학생)"의 user_id 로 기록한다.
- 학부모는 연결된 모든 자녀의 데이터를 본다.
- 형제자매끼리는 서로의 데이터를 보지 않는다 (owner 일치만 비교).
- 가족 연결 도입 이전에 학부모가 직접 만든 데이터(owner_user_id = parent.id)도
  본인에게는 계속 보여야 하므로 학부모의 visible owner_ids 에 본인 id 도 포함한다.
"""

import uuid

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family_link import FamilyLink
from app.models.user import User


async def get_visible_owner_ids(user: User, db: AsyncSession) -> list[uuid.UUID]:
    """주어진 사용자가 볼 수 있는 owner_user_id 목록을 반환한다.

    - student / branch_manager: [본인 id]
    - parent: [본인 id] + 연결된 active 자녀들의 id
      (본인 id 포함은 가족 연결 도입 이전 학부모 생성 데이터의 가시성을 위함)
    """
    owner_ids: list[uuid.UUID] = [user.id]

    if user.member_type == "parent":
        result = await db.execute(
            select(FamilyLink.child_user_id).where(
                and_(
                    FamilyLink.parent_user_id == user.id,
                    FamilyLink.status == "active",
                )
            )
        )
        for (child_id,) in result.all():
            if child_id not in owner_ids:
                owner_ids.append(child_id)

    return owner_ids


async def get_linked_child_ids(parent: User, db: AsyncSession) -> list[uuid.UUID]:
    """학부모와 active 상태로 연결된 자녀들의 user_id 목록.

    학부모 계정에서 자녀를 선택해 신청을 만들 때 사용한다.
    학부모가 아니면 빈 리스트를 반환한다.
    """
    if parent.member_type != "parent":
        return []

    result = await db.execute(
        select(FamilyLink.child_user_id).where(
            and_(
                FamilyLink.parent_user_id == parent.id,
                FamilyLink.status == "active",
            )
        )
    )
    return [child_id for (child_id,) in result.all()]
