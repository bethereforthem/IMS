"""
Rwanda Correctional Service (RCS) integration API.
Manages inmate intake, custody status, and release notifications.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import get_current_user, require_permission, CurrentUser
from app.models.database import CorrectionsRecord, Suspect, AuditLog, Alert, get_db
from app.models.schemas import IntakeCreate, CorrectionsResponse, MessageResponse
from app.services.notification import notification_service

router = APIRouter(prefix="/corrections", tags=["Corrections (RCS)"])


@router.post("/intake", response_model=CorrectionsResponse, status_code=201)
async def record_intake(
    body: IntakeCreate,
    user: CurrentUser = Depends(require_permission("corrections:write")),
    db: AsyncSession = Depends(get_db),
):
    """Record inmate intake. NID is verified via DIV app separately before calling this."""
    if user.institution not in ("RCS", "NISS"):
        raise HTTPException(status_code=403, detail="Only RCS or NISS can record intake")

    # Update suspect status
    result = await db.execute(select(Suspect).where(Suspect.id == body.suspect_id))
    suspect = result.scalar_one_or_none()
    if not suspect:
        raise HTTPException(status_code=404, detail="Suspect not found")

    suspect.status = "IN_CUSTODY"

    record = CorrectionsRecord(
        **body.model_dump(),
        intake_verified_by=UUID(user.user_id),
        custody_status="PRE_TRIAL",
    )
    db.add(record)
    db.add(AuditLog(
        event_type="INTAKE_RECORDED",
        actor_id=UUID(user.user_id),
        actor_institution=user.institution,
        action="CREATE",
        target_type="corrections_record",
        after_state={"facility": body.facility_name, "suspect_id": str(body.suspect_id)},
    ))
    await db.commit()
    await db.refresh(record)
    return record


@router.patch("/{record_id}/status", response_model=CorrectionsResponse)
async def update_custody_status(
    record_id: UUID,
    new_status: str = Query(..., description="PRE_TRIAL | SENTENCED | TRANSFERRED | RELEASED | ESCAPED"),
    user: CurrentUser = Depends(require_permission("corrections:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CorrectionsRecord).where(CorrectionsRecord.id == record_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Corrections record not found")

    old_status = str(record.custody_status)
    record.custody_status = new_status

    if new_status == "RELEASED":
        record.actual_release_at = datetime.now(tz=timezone.utc)
        await _notify_release(db, record, user)

    if new_status == "ESCAPED":
        record.escape_reported_at = datetime.now(tz=timezone.utc)
        await _notify_escape(db, record, user)

    db.add(AuditLog(
        event_type="CUSTODY_STATUS_CHANGE",
        actor_id=UUID(user.user_id),
        actor_institution=user.institution,
        action="UPDATE",
        target_type="corrections_record",
        target_id=record.id,
        before_state={"custody_status": old_status},
        after_state={"custody_status": new_status},
    ))
    await db.commit()
    await db.refresh(record)
    return record


@router.get("/suspect/{suspect_id}", response_model=list[CorrectionsResponse])
async def get_corrections_for_suspect(
    suspect_id: UUID,
    user: CurrentUser = Depends(require_permission("corrections:read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CorrectionsRecord).where(CorrectionsRecord.suspect_id == suspect_id)
        .order_by(CorrectionsRecord.intake_date.desc())
    )
    return result.scalars().all()


@router.get("/pending-releases", response_model=list[CorrectionsResponse])
async def pending_releases(
    days_ahead: int = Query(7, ge=1, le=90),
    user: CurrentUser = Depends(require_permission("corrections:read")),
    db: AsyncSession = Depends(get_db),
):
    """Returns inmates with release dates within the specified window."""
    from datetime import timedelta
    cutoff = datetime.now(tz=timezone.utc) + timedelta(days=days_ahead)
    result = await db.execute(
        select(CorrectionsRecord).where(
            CorrectionsRecord.custody_status == "SENTENCED",
            CorrectionsRecord.sentence_end <= cutoff,
        ).order_by(CorrectionsRecord.sentence_end)
    )
    return result.scalars().all()


async def _notify_release(db, record: CorrectionsRecord, user: CurrentUser):
    """Automatic RNP + NISS notification on release of high-threat individual."""
    result = await db.execute(select(Suspect).where(Suspect.id == record.suspect_id))
    suspect = result.scalar_one_or_none()
    if not suspect:
        return

    if suspect.threat_level and suspect.threat_level >= 4:
        alert = Alert(
            intelligence_event_id=None,
            suspect_id=record.suspect_id,
            priority="HIGH",
            classification="SECRET",
            source_tag="SYSTEM_ALERT",
            title=f"High-threat inmate released — {record.facility_name}",
            message=(
                f"SOURCE: SYSTEM_ALERT | Suspect: {record.suspect_id} | "
                f"Facility: {record.facility_name} | Released: {datetime.now(tz=timezone.utc).isoformat()}"
            ),
            target_institutions=["RNP", "NISS"],
        )
        db.add(alert)
        await notification_service.push_alert(alert, user)


async def _notify_escape(db, record: CorrectionsRecord, user: CurrentUser):
    """Immediate RNP + NISS notification on escape."""
    alert = Alert(
        intelligence_event_id=None,
        suspect_id=record.suspect_id,
        priority="CRITICAL",
        classification="TOP_SECRET",
        source_tag="SYSTEM_ALERT",
        title=f"ESCAPE REPORTED — {record.facility_name}",
        message=(
            f"SOURCE: SYSTEM_ALERT | Suspect: {record.suspect_id} | "
            f"Facility: {record.facility_name} | Reported: {datetime.now(tz=timezone.utc).isoformat()}"
        ),
        target_institutions=["RNP", "NISS", "RDF"],
    )
    db.add(alert)
    await notification_service.push_alert(alert, user)
