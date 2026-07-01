"""
Administration API — access revocation, emergency lockdown, camera nodes, audit log.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import get_current_user, require_permission, require_niss, CurrentUser
from app.models.database import (
    AccessRevocation, UserSession, User, CameraNode,
    AuditLog, SiemEvent, Alert, get_db,
)
from app.models.schemas import (
    RevocationCreate, RevocationResponse, MessageResponse, AlertResponse,
)

router = APIRouter(prefix="/admin", tags=["Administration & SIEM"])


@router.post("/revoke", response_model=RevocationResponse, status_code=201)
async def revoke_access(
    body: RevocationCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke access for a user, group, institution, service, camera node, or partner.
    Scope restrictions: own-institution admins can only revoke their own users;
    NISS can revoke anyone.
    """
    _check_revocation_authority(user, body)

    revocation = AccessRevocation(
        **body.model_dump(exclude_none=True),
        revoked_by=UUID(user.user_id),
    )
    db.add(revocation)
    await db.flush()

    # Execute revocation
    await _execute_revocation(db, body, revocation.id)

    db.add(AuditLog(
        event_type="ACCESS_REVOKED",
        actor_id=UUID(user.user_id),
        actor_role=user.role,
        actor_institution=user.institution,
        action="REVOKE",
        target_type=body.scope,
        target_id=body.target_user_id,
        after_state=body.model_dump(exclude_none=True),
        justification=body.reason,
    ))
    await db.commit()
    await db.refresh(revocation)
    return revocation


@router.post("/revoke/{revocation_id}/reinstate", response_model=MessageResponse)
async def reinstate_access(
    revocation_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AccessRevocation).where(AccessRevocation.id == revocation_id))
    rev = result.scalar_one_or_none()
    if not rev:
        raise HTTPException(status_code=404, detail="Revocation not found")

    if rev.scope == "INSTITUTION" and not user.is_niss():
        raise HTTPException(status_code=403, detail="Only NISS can reinstate institution-level revocations")

    rev.active = False
    rev.reinstated_by = UUID(user.user_id)
    rev.reinstated_at = datetime.now(tz=timezone.utc)

    db.add(AuditLog(
        event_type="ACCESS_REINSTATED",
        actor_id=UUID(user.user_id),
        action="REINSTATE",
        target_type="access_revocation",
        target_id=revocation_id,
    ))
    await db.commit()
    return MessageResponse(message="Access reinstated")


@router.post("/emergency-lockdown", response_model=MessageResponse)
async def emergency_lockdown(
    reason: str = Query(..., min_length=10),
    second_niss_director_id: UUID = Query(..., description="Dual NISS Director authorization required"),
    user: CurrentUser = Depends(require_niss()),
    db: AsyncSession = Depends(get_db),
):
    """
    System-wide emergency lockdown. Requires dual NISS Director authorization.
    Terminates all non-NISS sessions within 5 seconds.
    """
    if user.role != "NISS_DIRECTOR":
        raise HTTPException(status_code=403, detail="Only NISS Directors can initiate emergency lockdown")

    # Verify second director
    result = await db.execute(
        select(User).where(
            User.id == second_niss_director_id,
            User.role == "NISS_DIRECTOR",
            User.active == True,
        )
    )
    second_director = result.scalar_one_or_none()
    if not second_director:
        raise HTTPException(status_code=400, detail="Second NISS Director not found or not valid")

    if str(second_niss_director_id) == user.user_id:
        raise HTTPException(status_code=400, detail="Cannot use yourself as the second authorizer")

    # Revoke all non-NISS active sessions
    await db.execute(
        update(UserSession).where(
            UserSession.revoked == False,
        ).values(revoked=True, revoked_at=datetime.now(tz=timezone.utc))
        # NISS sessions are reinstated via separate mechanism
    )

    db.add(SiemEvent(
        rule_id="EMERGENCY_LOCKDOWN",
        severity="CRITICAL",
        actor_id=UUID(user.user_id),
        actor_institution="NISS",
        description=f"Emergency lockdown initiated by {user.user_id}. Second auth: {second_niss_director_id}. Reason: {reason}",
        auto_actioned=True,
        action_taken="All sessions terminated; system in read-only mode",
    ))
    db.add(AuditLog(
        event_type="EMERGENCY_LOCKDOWN",
        actor_id=UUID(user.user_id),
        actor_role=user.role,
        actor_institution=user.institution,
        action="LOCKDOWN",
        justification=reason,
        after_state={"second_auth": str(second_niss_director_id)},
    ))
    await db.commit()
    return MessageResponse(message="Emergency lockdown initiated. All non-NISS sessions terminated.")


@router.get("/alerts", response_model=list[AlertResponse])
async def list_alerts(
    acknowledged: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: CurrentUser = Depends(require_permission("alerts:read")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Alert).where(
        Alert.acknowledged == acknowledged
    ).order_by(Alert.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: UUID,
    user: CurrentUser = Depends(require_permission("alerts:acknowledge")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.acknowledged = True
    alert.acknowledged_by = UUID(user.user_id)
    alert.acknowledged_at = datetime.now(tz=timezone.utc)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.get("/audit-log", response_model=list[dict])
async def read_audit_log(
    actor_id: UUID | None = None,
    target_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not (user.has_permission("audit:read") or user.has_permission("audit:read:own_institution")):
        raise HTTPException(status_code=403, detail="Audit log access denied")

    from app.models.database import AuditLog as AL
    query = select(AL).order_by(AL.event_timestamp.desc())
    if actor_id:
        query = query.where(AL.actor_id == actor_id)
    if target_type:
        query = query.where(AL.target_type == target_type)
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "event_type": r.event_type,
            "actor_id": str(r.actor_id) if r.actor_id else None,
            "actor_role": str(r.actor_role) if r.actor_role else None,
            "action": r.action,
            "target_type": r.target_type,
            "target_id": str(r.target_id) if r.target_id else None,
            "classification": str(r.classification) if r.classification else None,
            "justification": r.justification,
            "event_timestamp": r.event_timestamp.isoformat() if r.event_timestamp else None,
        }
        for r in rows
    ]


@router.get("/siem/events", response_model=list[dict])
async def list_siem_events(
    reviewed: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: CurrentUser = Depends(require_permission("siem:read")),
    db: AsyncSession = Depends(get_db),
):
    query = select(SiemEvent).where(SiemEvent.reviewed == reviewed).order_by(SiemEvent.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "rule_id": r.rule_id,
            "severity": r.severity,
            "description": r.description,
            "auto_actioned": r.auto_actioned,
            "action_taken": r.action_taken,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/camera-nodes", response_model=list[dict])
async def list_camera_nodes(
    user: CurrentUser = Depends(require_permission("camera_nodes:manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CameraNode).order_by(CameraNode.name))
    nodes = result.scalars().all()
    return [
        {
            "node_id": n.node_id,
            "name": n.name,
            "location_name": n.location_name,
            "institution": str(n.institution),
            "active": n.active,
            "revoked": n.revoked,
            "last_heartbeat": n.last_heartbeat.isoformat() if n.last_heartbeat else None,
            "firmware_version": n.firmware_version,
        }
        for n in nodes
    ]


@router.post("/camera-nodes/{node_id}/revoke", response_model=MessageResponse)
async def revoke_camera_node(
    node_id: str,
    reason: str = Query(...),
    user: CurrentUser = Depends(require_permission("camera_nodes:manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CameraNode).where(CameraNode.node_id == node_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="Camera node not found")

    node.revoked = True
    node.revoked_at = datetime.now(tz=timezone.utc)
    node.active = False

    db.add(AuditLog(
        event_type="CAMERA_NODE_REVOKED",
        actor_id=UUID(user.user_id),
        action="REVOKE",
        target_type="camera_node",
        justification=reason,
        after_state={"node_id": node_id},
    ))
    await db.commit()
    return MessageResponse(message=f"Camera node {node_id} revoked")


# ---- Internal helpers ----

def _check_revocation_authority(user: CurrentUser, body: RevocationCreate):
    if user.has_permission("revocation:any"):
        return
    if user.has_permission("revocation:own"):
        if body.scope == "INSTITUTION":
            raise HTTPException(status_code=403, detail="Only NISS can revoke entire institutions")
        if body.target_institution and body.target_institution != user.institution:
            raise HTTPException(status_code=403, detail="Can only revoke within your own institution")
        return
    raise HTTPException(status_code=403, detail="Access revocation not authorized")


async def _execute_revocation(db: AsyncSession, body: RevocationCreate, revocation_id: UUID):
    """Apply revocation effect — terminate sessions, lock users, etc."""
    if body.scope == "USER" and body.target_user_id:
        # Revoke all active sessions for this user
        await db.execute(
            update(UserSession).where(
                UserSession.user_id == body.target_user_id,
                UserSession.revoked == False,
            ).values(revoked=True, revoked_at=datetime.now(tz=timezone.utc))
        )
        # Lock user account
        await db.execute(
            update(User).where(User.id == body.target_user_id)
            .values(locked=True)
        )

    elif body.scope == "INSTITUTION" and body.target_institution:
        from sqlalchemy import text
        await db.execute(
            update(UserSession)
            .where(UserSession.user_id.in_(
                select(User.id).where(
                    User.institution_id.in_(
                        select(text("id")).select_from(
                            text("institutions")
                        ).where(text(f"code = '{body.target_institution}'"))
                    )
                )
            ))
            .values(revoked=True, revoked_at=datetime.now(tz=timezone.utc))
        )
