"""
Location Intelligence API — TOP SECRET GPS records access.
Strictly controlled: NISS full, others limited per RBAC.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import get_current_user, CurrentUser, require_niss
from app.models.database import LocationRecord, AuditLog, Suspect, get_db
from app.models.schemas import LocationRecordResponse, SuspectMovementResponse

router = APIRouter(prefix="/location", tags=["Location Intelligence"])

LOCATION_ACCESS_ROLES = {
    "NISS_DIRECTOR", "NISS_OFFICER",
    "RNP_COMMANDER", "RNP_DETECTIVE",
    "RIB_INVESTIGATOR", "RIB_ANALYST",
    "RDF_COMMANDER",
}


@router.get("/suspect/{suspect_id}/movement", response_model=SuspectMovementResponse)
async def suspect_movement(
    suspect_id: UUID,
    justification: str = Query(..., description="Mandatory justification for TOP SECRET access"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all GPS location records for a suspect — movement history.
    NISS-only for full movement pattern analysis.
    """
    if user.role not in LOCATION_ACCESS_ROLES:
        raise HTTPException(status_code=403, detail="Location intelligence access denied")
    if not justification:
        raise HTTPException(status_code=400, detail="Justification is mandatory for TOP SECRET location data")

    # Non-NISS users: only WANTED suspects or cases assigned to them
    if not user.is_niss():
        result = await db.execute(
            select(Suspect).where(Suspect.id == suspect_id)
        )
        suspect = result.scalar_one_or_none()
        if not suspect:
            raise HTTPException(status_code=404, detail="Suspect not found")

        if user.institution == "RNP":
            if suspect.status not in ("WANTED", "ACTIVE"):
                raise HTTPException(
                    status_code=403,
                    detail="RNP location access limited to WANTED suspects",
                )

    query = select(LocationRecord).where(
        LocationRecord.suspect_id == suspect_id
    ).order_by(LocationRecord.detection_timestamp.desc())

    result = await db.execute(query)
    records = result.scalars().all()

    # Mandatory audit log for every location record access
    db.add(AuditLog(
        event_type="LOCATION_ACCESS",
        actor_id=UUID(user.user_id),
        actor_role=user.role,
        actor_institution=user.institution,
        action="READ",
        target_type="location_records",
        target_id=suspect_id,
        classification="TOP_SECRET",
        justification=justification,
        after_state={"records_accessed": len(records)},
    ))
    await db.commit()

    return SuspectMovementResponse(
        suspect_id=suspect_id,
        total_detections=len(records),
        locations=records,
    )


@router.get("/records/{record_id}", response_model=LocationRecordResponse)
async def get_location_record(
    record_id: UUID,
    justification: str = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role not in LOCATION_ACCESS_ROLES:
        raise HTTPException(status_code=403, detail="Location intelligence access denied")

    result = await db.execute(
        select(LocationRecord).where(LocationRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Location record not found")

    db.add(AuditLog(
        event_type="LOCATION_RECORD_READ",
        actor_id=UUID(user.user_id),
        actor_role=user.role,
        actor_institution=user.institution,
        action="READ",
        target_type="location_record",
        target_id=record.id,
        classification="TOP_SECRET",
        justification=justification,
    ))
    await db.commit()
    return record


@router.get("/summary/niss", response_model=dict)
async def niss_location_summary(
    user: CurrentUser = Depends(require_niss()),
    db: AsyncSession = Depends(get_db),
):
    """NISS-only: aggregate statistics on location intelligence."""
    from sqlalchemy import func
    result = await db.execute(
        select(
            func.count(LocationRecord.id).label("total"),
            func.count(LocationRecord.suspect_id.distinct()).label("distinct_suspects"),
        )
    )
    row = result.one()
    return {
        "total_location_records": row.total,
        "distinct_suspects_tracked": row.distinct_suspects,
        "classification": "TOP_SECRET",
        "access_institution": "NISS",
    }
