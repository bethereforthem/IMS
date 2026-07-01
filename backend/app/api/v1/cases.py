"""
Cases API — criminal case management.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import get_current_user, require_permission, CurrentUser
from app.models.database import Case, AuditLog, get_db
from app.models.schemas import CaseCreate, CaseResponse, MessageResponse

router = APIRouter(prefix="/cases", tags=["Cases"])


def _generate_case_ref(institution: str) -> str:
    import random, string
    from datetime import datetime
    year = datetime.utcnow().year
    seq = "".join(random.choices(string.digits, k=5))
    return f"RWA-{institution}-{year}-{seq}"


@router.get("", response_model=list[CaseResponse])
async def list_cases(
    status: str | None = None,
    category: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: CurrentUser = Depends(require_permission("cases:read")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Case).order_by(Case.created_at.desc())
    if status:
        query = query.where(Case.status == status)
    if category:
        query = query.where(Case.category == category)
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=CaseResponse, status_code=201)
async def create_case(
    body: CaseCreate,
    user: CurrentUser = Depends(require_permission("cases:write")),
    db: AsyncSession = Depends(get_db),
):
    case = Case(
        case_reference=_generate_case_ref(user.institution),
        **body.model_dump(),
        owning_institution=user.institution,
        created_by=UUID(user.user_id),
    )
    db.add(case)
    db.add(AuditLog(
        event_type="CASE_CREATED",
        actor_id=UUID(user.user_id),
        actor_institution=user.institution,
        action="CREATE",
        target_type="case",
    ))
    await db.commit()
    await db.refresh(case)
    return case


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(
    case_id: UUID,
    user: CurrentUser = Depends(require_permission("cases:read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.patch("/{case_id}/status", response_model=CaseResponse)
async def update_case_status(
    case_id: UUID,
    new_status: str = Query(...),
    user: CurrentUser = Depends(require_permission("cases:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    old_status = case.status
    case.status = new_status
    db.add(AuditLog(
        event_type="CASE_STATUS_CHANGE",
        actor_id=UUID(user.user_id),
        action="UPDATE",
        target_type="case",
        target_id=case.id,
        before_state={"status": str(old_status)},
        after_state={"status": new_status},
    ))
    await db.commit()
    await db.refresh(case)
    return case


@router.post("/{case_id}/suspects/{suspect_id}", response_model=MessageResponse)
async def link_suspect_to_case(
    case_id: UUID,
    suspect_id: UUID,
    role: str = Query("PRIMARY_SUSPECT"),
    user: CurrentUser = Depends(require_permission("cases:write")),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import text
    await db.execute(
        text(
            "INSERT INTO case_suspects (case_id, suspect_id, role, added_by) "
            "VALUES (:c, :s, :r, :u) ON CONFLICT DO NOTHING"
        ),
        {"c": str(case_id), "s": str(suspect_id), "r": role, "u": user.user_id},
    )
    db.add(AuditLog(
        event_type="SUSPECT_LINKED_TO_CASE",
        actor_id=UUID(user.user_id),
        action="UPDATE",
        target_type="case",
        target_id=case_id,
        after_state={"suspect_id": str(suspect_id), "role": role},
    ))
    await db.commit()
    return MessageResponse(message="Suspect linked to case")
