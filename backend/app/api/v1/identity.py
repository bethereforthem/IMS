"""
Digital Identity Verification (DIV) API — NID scan, NID manual entry, face scan.
All three pathways feed into the same intelligence_events table with source attribution.
"""
import base64
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import get_current_user, CurrentUser
from app.core.security import hash_national_id
from app.models.database import (
    IntelligenceEvent, NidVerification, Suspect, Alert, AuditLog,
    User, get_db,
)
from app.models.schemas import (
    NIDScanRequest, NIDManualRequest, NIDVerificationResponse,
    FaceScanRequest, FaceScanResponse, FaceScanMatch,
)
from app.services.nida import nida_service
from app.services.face_recognition import face_recognition_service
from app.services.notification import notification_service

router = APIRouter(prefix="/identity", tags=["Digital Identity Verification"])

# Roles allowed to see full criminal records (not just match/no-match)
FULL_RECORD_ROLES = {
    "NISS_DIRECTOR", "NISS_OFFICER",
    "RNP_COMMANDER", "RNP_DETECTIVE", "RNP_PATROL",
    "RIB_INVESTIGATOR", "RIB_ANALYST",
    "RDF_COMMANDER", "RDF_BORDER_OFFICER",
    "RCS_SUPERINTENDENT", "RCS_OFFICER",
    "SIEM_ANALYST",
}


@router.post("/nid/scan", response_model=NIDVerificationResponse)
async def nid_scan(
    body: NIDScanRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Physical NID card scan (OCR/barcode result sent from mobile app).
    SOURCE: NID_SCAN
    """
    if not _can_use_div(user):
        raise HTTPException(status_code=403, detail="DIV app access not authorized")

    nid_hash = hash_national_id(body.national_id_number)
    return await _process_nid_check(
        db=db,
        user=user,
        nid_hash=nid_hash,
        method="NID_SCAN",
        source_tag="NID_SCAN",
        location_lat=body.officer_location_lat,
        location_lng=body.officer_location_lng,
        location_accuracy_m=body.officer_location_accuracy_m,
        device_id=body.device_id,
        national_id_number=body.national_id_number,
    )


@router.post("/nid/manual", response_model=NIDVerificationResponse)
async def nid_manual(
    body: NIDManualRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Manual national ID number entry.
    SOURCE: NID_MANUAL
    """
    if not _can_use_div(user):
        raise HTTPException(status_code=403, detail="DIV app access not authorized")

    nid_hash = hash_national_id(body.national_id_number)
    return await _process_nid_check(
        db=db,
        user=user,
        nid_hash=nid_hash,
        method="NID_MANUAL",
        source_tag="NID_MANUAL",
        location_lat=body.officer_location_lat,
        location_lng=body.officer_location_lng,
        location_accuracy_m=body.officer_location_accuracy_m,
        device_id=body.device_id,
        national_id_number=body.national_id_number,
    )


@router.post("/face/scan", response_model=FaceScanResponse)
async def face_scan(
    body: FaceScanRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Officer face scan — AI identifies subject against IMS, NIDA, and Interpol.
    SOURCE: FACE_SCAN
    """
    if not _can_face_scan(user):
        raise HTTPException(status_code=403, detail="Face scan not authorized for your role")

    try:
        image_bytes = base64.b64decode(body.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    from app.core.security import sha256_bytes
    frame_hash = sha256_bytes(image_bytes)

    # Run face recognition against IMS + NIDA + Interpol in parallel
    matches = await face_recognition_service.identify(image_bytes)

    # Determine confidence tier
    top_confidence = max((m["confidence"] for m in matches), default=0.0)
    tier = _confidence_tier(top_confidence)
    criminal_record_found = any(m.get("criminal_record") for m in matches if m["source"] == "IMS")
    alert_generated = False
    pending_review = tier == "POSSIBLE"

    # Store intelligence event
    suspect_id = None
    for m in matches:
        if m["source"] == "IMS" and m.get("suspect_id"):
            suspect_id = m["suspect_id"]
            break

    event = IntelligenceEvent(
        source_tag="FACE_SCAN",
        officer_id=UUID(user.user_id),
        institution=user.institution,
        suspect_id=suspect_id,
        location_lat=body.officer_location_lat if criminal_record_found else None,
        location_lng=body.officer_location_lng if criminal_record_found else None,
        location_accuracy_m=body.officer_location_accuracy_m if criminal_record_found else None,
        classification="TOP_SECRET" if criminal_record_found else "CONFIDENTIAL",
        criminal_record_found=criminal_record_found,
        confidence=top_confidence,
        face_frame_hash=frame_hash,
        event_timestamp=datetime.now(tz=timezone.utc),
    )

    # Link to NID verification if provided
    if body.linked_nid_verification_id:
        event.linked_event_ids = [body.linked_nid_verification_id]

    db.add(event)

    if criminal_record_found and tier in ("HIGH", "PROBABLE"):
        alert_generated = True
        await _generate_alert(db, event, suspect_id, user, "FACE_SCAN")

    await _log_audit(db, user, "FACE_SCAN", "face_scan", None)
    await db.commit()
    await db.refresh(event)

    # Notify if Interpol match
    interpol_matches = [m for m in matches if m["source"] == "INTERPOL"]
    if interpol_matches:
        await notification_service.notify_interpol_match(event.id, interpol_matches, user)

    return FaceScanResponse(
        event_id=event.id,
        match_found=len(matches) > 0,
        confidence_tier=tier,
        matches=[
            FaceScanMatch(
                source=m["source"],
                confidence=m["confidence"],
                suspect_id=m.get("suspect_id"),
                interpol_file_no=m.get("interpol_file_no"),
                name=m.get("name"),
                status=m.get("status"),
            )
            for m in matches
        ],
        criminal_record_found=criminal_record_found,
        alert_generated=alert_generated,
        pending_human_review=pending_review,
    )


# ---- Internal helpers ----

async def _process_nid_check(
    db: AsyncSession,
    user: CurrentUser,
    nid_hash: str,
    method: str,
    source_tag: str,
    location_lat, location_lng, location_accuracy_m,
    device_id: str | None,
    national_id_number: str,
) -> NIDVerificationResponse:
    show_full_record = user.role in FULL_RECORD_ROLES

    # 1. Query NIDA for identity verification
    nida_result = await nida_service.verify(national_id_number)
    nida_match = nida_result.get("match", False)

    # 2. Check IMS criminal records by NID hash
    result = await db.execute(
        select(Suspect).where(Suspect.national_id_hash == nid_hash)
    )
    matched_suspect: Suspect | None = result.scalar_one_or_none()
    criminal_record_found = matched_suspect is not None

    # 3. Create intelligence event
    event = IntelligenceEvent(
        source_tag=source_tag,
        officer_id=UUID(user.user_id),
        institution=user.institution,
        suspect_id=matched_suspect.id if matched_suspect else None,
        location_lat=location_lat if criminal_record_found else None,
        location_lng=location_lng if criminal_record_found else None,
        location_accuracy_m=location_accuracy_m if criminal_record_found else None,
        classification="TOP_SECRET" if criminal_record_found else "UNCLASSIFIED",
        criminal_record_found=criminal_record_found,
        confidence=None,  # NID checks have no AI confidence
        event_timestamp=datetime.now(tz=timezone.utc),
    )
    db.add(event)
    await db.flush()

    # 4. Create NID verification record
    verif = NidVerification(
        method=method,
        officer_id=UUID(user.user_id),
        national_id_hash=nid_hash,
        nida_match=nida_match,
        ims_criminal_record=criminal_record_found,
        suspect_id_linked=matched_suspect.id if matched_suspect else None,
        location_lat=location_lat if criminal_record_found else None,
        location_lng=location_lng if criminal_record_found else None,
        classification="TOP_SECRET" if criminal_record_found else "UNCLASSIFIED",
        citizen_data_retained=False,           # PII never retained if no record
        intelligence_event_id=event.id,
    )
    db.add(verif)

    alert_generated = False
    if criminal_record_found:
        alert_generated = True
        await _generate_alert(db, event, matched_suspect.id, user, source_tag)

    await _log_audit(db, user, f"NID_{method}", "nid_verification", None)
    await db.commit()
    await db.refresh(verif)

    return NIDVerificationResponse(
        verification_id=verif.id,
        nida_match=nida_match,
        identity_verified=nida_match or False,
        criminal_record_found=criminal_record_found if show_full_record else criminal_record_found,
        suspect_id=matched_suspect.id if (matched_suspect and show_full_record) else None,
        alert_generated=alert_generated,
        nida_full_name=nida_result.get("full_name") if show_full_record else None,
        nida_photo_url=nida_result.get("photo_url"),
    )


async def _generate_alert(db: AsyncSession, event: IntelligenceEvent, suspect_id, user: CurrentUser, source_tag: str):
    from app.models.database import Alert as AlertModel
    from app.models.database import InstitutionType

    # Determine which institutions to notify
    target_institutions = _get_notification_targets(user.institution, source_tag)

    alert = AlertModel(
        intelligence_event_id=event.id,
        suspect_id=suspect_id,
        priority="CRITICAL" if source_tag in ("NID_SCAN", "FACE_SCAN") else "HIGH",
        classification="TOP_SECRET",
        source_tag=source_tag,
        title=f"[{source_tag}] Criminal record match — {user.institution}",
        message=(
            f"SOURCE: {source_tag} | Officer: {user.user_id} | "
            f"Institution: {user.institution} | Criminal record found"
        ),
        target_institutions=target_institutions,
    )
    db.add(alert)

    # Push real-time notification
    await notification_service.push_alert(alert, user)


def _get_notification_targets(institution: str, source_tag: str) -> list:
    if source_tag in ("INTERPOL_FEED",):
        return ["NISS"]
    base = [institution, "NISS"]
    if institution == "RDF":
        base.append("RNP")
    return list(set(base))


def _confidence_tier(confidence: float) -> str:
    from app.config import settings
    if confidence >= settings.FACE_MATCH_THRESHOLD_HIGH:
        return "HIGH"
    if confidence >= settings.FACE_MATCH_THRESHOLD_PROBABLE:
        return "PROBABLE"
    if confidence >= settings.FACE_MATCH_THRESHOLD_POSSIBLE:
        return "POSSIBLE"
    return "NO_MATCH"


def _can_use_div(user: CurrentUser) -> bool:
    return (
        user.has_permission("nid:scan")
        or user.has_permission("nid:scan:result_only")
        or user.has_permission("nid:query")
    )


def _can_face_scan(user: CurrentUser) -> bool:
    return (
        user.has_permission("face:scan")
        or user.has_permission("face:scan:limited")
    )


async def _log_audit(db: AsyncSession, user: CurrentUser, event_type: str, target_type: str, target_id):
    db.add(AuditLog(
        event_type=event_type,
        actor_id=UUID(user.user_id),
        actor_role=user.role,
        actor_institution=user.institution,
        action="SCAN",
        target_type=target_type,
        target_id=target_id,
    ))
