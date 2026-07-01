"""
Intelligence Events API — source attribution, CCTV node alerts, officer reports.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import get_current_user, require_permission, CurrentUser
from app.models.database import IntelligenceEvent, AuditLog, CameraNode, Alert, get_db
from app.models.schemas import (
    IntelligenceEventResponse, OfficerReportCreate, CCTVAlertCreate,
    NodeHeartbeat, MessageResponse,
)
from app.services.notification import notification_service

router = APIRouter(prefix="/intelligence", tags=["Intelligence Events"])


@router.get("/events", response_model=list[IntelligenceEventResponse])
async def list_events(
    suspect_id: UUID | None = None,
    source_tag: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: CurrentUser = Depends(require_permission("source_attribution:read")),
    db: AsyncSession = Depends(get_db),
):
    query = select(IntelligenceEvent).order_by(IntelligenceEvent.event_timestamp.desc())
    if suspect_id:
        query = query.where(IntelligenceEvent.suspect_id == suspect_id)
    if source_tag:
        query = query.where(IntelligenceEvent.source_tag == source_tag)

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/events/{event_id}", response_model=IntelligenceEventResponse)
async def get_event(
    event_id: UUID,
    user: CurrentUser = Depends(require_permission("source_attribution:read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IntelligenceEvent).where(IntelligenceEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Intelligence event not found")
    return event


@router.post("/events/officer-report", response_model=IntelligenceEventResponse, status_code=201)
async def submit_officer_report(
    body: OfficerReportCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Officer manually submits a suspect report. SOURCE: OFFICER_REPORT"""
    event = IntelligenceEvent(
        source_tag="OFFICER_REPORT",
        officer_id=UUID(user.user_id),
        institution=user.institution,
        suspect_id=body.suspect_id,
        location_lat=body.location_lat,
        location_lng=body.location_lng,
        location_accuracy_m=body.location_accuracy_m,
        classification="CONFIDENTIAL",
        criminal_record_found=body.suspect_id is not None,
        notes=body.notes,
        event_timestamp=datetime.now(tz=timezone.utc),
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/cctv/alert", response_model=MessageResponse, status_code=201)
async def cctv_node_alert(
    body: CCTVAlertCreate,
    user: CurrentUser = Depends(require_permission("camera_nodes:manage")),
    db: AsyncSession = Depends(get_db),
):
    """
    Receives detection alerts POSTed by Raspberry Pi CCTV nodes.
    SOURCE: CCTV_NODE
    Only system_admin / NISS roles can authenticate as camera nodes.
    """
    # Verify the camera node is registered and not revoked
    result = await db.execute(
        select(CameraNode).where(
            CameraNode.node_id == body.node_id,
            CameraNode.active == True,
            CameraNode.revoked == False,
        )
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=403, detail="Unknown or revoked camera node")

    from app.config import settings
    criminal_record_found = (
        body.suspect_id is not None
        and body.confidence >= settings.FACE_MATCH_THRESHOLD_PROBABLE
    )

    event = IntelligenceEvent(
        source_tag="CCTV_NODE",
        source_device_id=body.node_id,
        institution=node.institution.value,
        suspect_id=body.suspect_id,
        location_lat=node.location_lat if criminal_record_found else None,
        location_lng=node.location_lng if criminal_record_found else None,
        classification="TOP_SECRET" if criminal_record_found else "CONFIDENTIAL",
        criminal_record_found=criminal_record_found,
        confidence=body.confidence,
        face_frame_hash=body.face_frame_hash,
        event_timestamp=body.event_timestamp,
    )
    db.add(event)
    await db.flush()

    if criminal_record_found:
        alert = Alert(
            intelligence_event_id=event.id,
            suspect_id=body.suspect_id,
            priority="CRITICAL",
            classification="TOP_SECRET",
            source_tag="CCTV_NODE",
            title=f"[CCTV_NODE] {node.node_id} — Criminal match detected",
            message=(
                f"SOURCE: CCTV_NODE | Camera: {node.node_id} | "
                f"Location: {node.location_name} ({node.location_lat}, {node.location_lng}) | "
                f"Confidence: {body.confidence:.2f}"
            ),
            target_institutions=[node.institution.value, "NISS"],
        )
        db.add(alert)
        await notification_service.push_cctv_alert(alert, node)

    # Update node heartbeat
    node.last_heartbeat = datetime.now(tz=timezone.utc)

    db.add(AuditLog(
        event_type="CCTV_ALERT",
        action="CREATE",
        target_type="intelligence_event",
        target_id=event.id,
        after_state={"node_id": body.node_id, "confidence": body.confidence},
    ))
    await db.commit()
    return MessageResponse(message="Alert recorded")


@router.post("/cctv/heartbeat", response_model=MessageResponse)
async def node_heartbeat(
    body: NodeHeartbeat,
    user: CurrentUser = Depends(require_permission("camera_nodes:manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CameraNode).where(CameraNode.node_id == body.node_id)
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="Camera node not found")

    node.last_heartbeat = datetime.now(tz=timezone.utc)
    if body.firmware_version:
        node.firmware_version = body.firmware_version
    await db.commit()
    return MessageResponse(message="Heartbeat recorded")


@router.get("/events/{event_id}/source-chain", response_model=list[IntelligenceEventResponse])
async def get_source_chain(
    event_id: UUID,
    user: CurrentUser = Depends(require_permission("source_attribution:read")),
    db: AsyncSession = Depends(get_db),
):
    """Returns all intelligence events in the source chain for a given event."""
    result = await db.execute(select(IntelligenceEvent).where(IntelligenceEvent.id == event_id))
    root = result.scalar_one_or_none()
    if not root:
        raise HTTPException(status_code=404, detail="Event not found")

    chain = [root]
    if root.linked_event_ids:
        linked_result = await db.execute(
            select(IntelligenceEvent).where(
                IntelligenceEvent.id.in_(root.linked_event_ids)
            )
        )
        chain.extend(linked_result.scalars().all())

    return chain
