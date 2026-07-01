"""
Suspect records API — CRUD with RBAC and audit logging.
"""
import hashlib
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import get_current_user, CurrentUser, require_permission
from app.core.security import hash_national_id, sha256_bytes
from app.models.database import Suspect, Warrant, AuditLog, get_db
from app.models.schemas import (
    SuspectCreate, SuspectUpdate, SuspectResponse, SuspectListResponse,
    WarrantCreate, WarrantResponse, MessageResponse,
)

router = APIRouter(prefix="/suspects", tags=["Suspects"])


@router.get("", response_model=SuspectListResponse)
async def list_suspects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    name: str | None = None,
    user: CurrentUser = Depends(require_permission("suspects:read")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Suspect)
    if status:
        query = query.where(Suspect.status == status)
    if name:
        query = query.where(
            func.to_tsvector("english",
                func.coalesce(Suspect.first_name, "") + " " + func.coalesce(Suspect.last_name, "")
            ).op("@@")(func.plainto_tsquery("english", name))
        )

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    suspects = result.scalars().all()

    await _audit_read(db, user, "suspect_list", None)
    return SuspectListResponse(total=total, items=suspects)


@router.post("", response_model=SuspectResponse, status_code=201)
async def create_suspect(
    body: SuspectCreate,
    user: CurrentUser = Depends(require_permission("suspects:write")),
    db: AsyncSession = Depends(get_db),
):
    suspect = Suspect(
        **body.model_dump(exclude={"national_id"}),
        national_id_hash=hash_national_id(body.national_id) if body.national_id else None,
        created_by=UUID(user.user_id),
    )
    db.add(suspect)
    await db.flush()  # get generated IMS reference

    db.add(AuditLog(
        event_type="SUSPECT_CREATED",
        actor_id=UUID(user.user_id),
        actor_role=user.role,
        actor_institution=user.institution,
        action="CREATE",
        target_type="suspect",
        target_id=suspect.id,
        after_state={"ims_reference": suspect.ims_reference},
    ))
    await db.commit()
    await db.refresh(suspect)
    return suspect


@router.get("/{suspect_id}", response_model=SuspectResponse)
async def get_suspect(
    suspect_id: UUID,
    justification: str | None = Query(None, description="Required for TOP SECRET records"),
    user: CurrentUser = Depends(require_permission("suspects:read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Suspect).where(Suspect.id == suspect_id))
    suspect: Suspect | None = result.scalar_one_or_none()
    if not suspect:
        raise HTTPException(status_code=404, detail="Suspect not found")

    if suspect.clearance_level == "TOP_SECRET" and not user.has_permission("suspects:classify"):
        if not justification:
            raise HTTPException(
                status_code=403,
                detail="Justification required to access TOP SECRET suspect records",
            )

    db.add(AuditLog(
        event_type="SUSPECT_READ",
        actor_id=UUID(user.user_id),
        actor_role=user.role,
        actor_institution=user.institution,
        action="READ",
        target_type="suspect",
        target_id=suspect.id,
        classification=suspect.clearance_level,
        justification=justification,
    ))
    await db.commit()
    return suspect


@router.patch("/{suspect_id}", response_model=SuspectResponse)
async def update_suspect(
    suspect_id: UUID,
    body: SuspectUpdate,
    user: CurrentUser = Depends(require_permission("suspects:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Suspect).where(Suspect.id == suspect_id))
    suspect: Suspect | None = result.scalar_one_or_none()
    if not suspect:
        raise HTTPException(status_code=404, detail="Suspect not found")

    before = {
        "status": str(suspect.status),
        "threat_level": suspect.threat_level,
        "clearance_level": str(suspect.clearance_level),
    }

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(suspect, field, value)

    db.add(AuditLog(
        event_type="SUSPECT_UPDATED",
        actor_id=UUID(user.user_id),
        actor_role=user.role,
        actor_institution=user.institution,
        action="UPDATE",
        target_type="suspect",
        target_id=suspect.id,
        before_state=before,
        after_state=body.model_dump(exclude_none=True),
    ))
    await db.commit()
    await db.refresh(suspect)
    return suspect


@router.post("/{suspect_id}/mugshot", response_model=MessageResponse)
async def upload_mugshot(
    suspect_id: UUID,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_permission("suspects:write")),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ("image/jpeg", "image/png"):
        raise HTTPException(status_code=400, detail="Only JPEG or PNG images accepted")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image exceeds 10 MB limit")

    sha = sha256_bytes(data)

    result = await db.execute(select(Suspect).where(Suspect.id == suspect_id))
    suspect: Suspect | None = result.scalar_one_or_none()
    if not suspect:
        raise HTTPException(status_code=404, detail="Suspect not found")

    suspect.mugshot_sha256 = sha
    db.add(AuditLog(
        event_type="MUGSHOT_UPLOADED",
        actor_id=UUID(user.user_id),
        action="UPDATE",
        target_type="suspect",
        target_id=suspect.id,
        after_state={"mugshot_sha256": sha},
    ))
    await db.commit()
    return MessageResponse(message=f"Mugshot stored. SHA-256: {sha}")


@router.get("/{suspect_id}/warrants", response_model=list[WarrantResponse])
async def list_warrants(
    suspect_id: UUID,
    user: CurrentUser = Depends(require_permission("suspects:read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Warrant).where(Warrant.suspect_id == suspect_id)
    )
    return result.scalars().all()


@router.post("/{suspect_id}/warrants", response_model=WarrantResponse, status_code=201)
async def create_warrant(
    suspect_id: UUID,
    body: WarrantCreate,
    user: CurrentUser = Depends(require_permission("suspects:write")),
    db: AsyncSession = Depends(get_db),
):
    warrant = Warrant(
        **body.model_dump(),
        issued_by=user.institution,
    )
    db.add(warrant)
    db.add(AuditLog(
        event_type="WARRANT_ISSUED",
        actor_id=UUID(user.user_id),
        actor_institution=user.institution,
        action="CREATE",
        target_type="warrant",
        target_id=warrant.id,
    ))
    await db.commit()
    await db.refresh(warrant)
    return warrant


async def _audit_read(db, user: CurrentUser, target_type: str, target_id):
    from uuid import UUID as _UUID
    db.add(AuditLog(
        event_type="DATA_READ",
        actor_id=_UUID(user.user_id),
        actor_role=user.role,
        actor_institution=user.institution,
        action="READ",
        target_type=target_type,
        target_id=target_id,
    ))
