"""
Pydantic v2 request/response schemas for all IMS API endpoints.
"""
from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


# ---- Auth ----

class LoginRequest(BaseModel):
    badge_number: str
    password: str
    totp_code: str = Field(..., min_length=6, max_length=6)
    device_id: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


# ---- Users ----

class UserCreate(BaseModel):
    institution_id: UUID
    role: str
    clearance_level: str = "CONFIDENTIAL"
    badge_number: str
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    password: str = Field(..., min_length=12)


class UserResponse(BaseModel):
    id: UUID
    institution_id: UUID
    role: str
    clearance_level: str
    badge_number: str
    full_name: str
    email: str
    active: bool
    locked: bool
    last_login_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class TOTPSetupResponse(BaseModel):
    totp_uri: str
    secret: str


# ---- Suspects ----

class SuspectCreate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    aliases: Optional[List[str]] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None
    national_id: Optional[str] = None      # will be hashed before storing
    passport_number: Optional[str] = None
    height_cm: Optional[int] = None
    weight_kg: Optional[int] = None
    eye_color: Optional[str] = None
    distinguishing_marks: Optional[str] = None
    owning_institution: str
    threat_level: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None
    clearance_level: str = "CONFIDENTIAL"


class SuspectUpdate(BaseModel):
    status: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    threat_level: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None
    clearance_level: Optional[str] = None


class SuspectResponse(BaseModel):
    id: UUID
    ims_reference: str
    status: str
    clearance_level: str
    first_name: Optional[str]
    last_name: Optional[str]
    aliases: Optional[List[str]]
    date_of_birth: Optional[date]
    gender: Optional[str]
    nationality: Optional[str]
    height_cm: Optional[int]
    weight_kg: Optional[int]
    owning_institution: str
    interpol_file_no: Optional[str]
    interpol_notice: Optional[str]
    threat_level: Optional[int]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SuspectListResponse(BaseModel):
    total: int
    items: List[SuspectResponse]


# ---- NID Verification (DIV App) ----

class NIDScanRequest(BaseModel):
    """Physical NID card scan result from OCR."""
    national_id_number: str = Field(..., min_length=16, max_length=16)
    full_name_from_card: Optional[str] = None
    dob_from_card: Optional[date] = None
    officer_location_lat: Optional[float] = None
    officer_location_lng: Optional[float] = None
    officer_location_accuracy_m: Optional[int] = None
    device_id: Optional[str] = None


class NIDManualRequest(BaseModel):
    """Manual national ID number entry."""
    national_id_number: str = Field(..., min_length=16, max_length=16)
    officer_location_lat: Optional[float] = None
    officer_location_lng: Optional[float] = None
    officer_location_accuracy_m: Optional[int] = None
    device_id: Optional[str] = None


class NIDVerificationResponse(BaseModel):
    """
    Response to officer — criminal record details are separated from identity result.
    Low-clearance roles (Irondo/Dasso) only receive the boolean match field.
    """
    verification_id: UUID
    nida_match: Optional[bool]
    identity_verified: bool
    # Criminal record is included only for roles with suspects:read
    criminal_record_found: bool
    suspect_id: Optional[UUID] = None
    alert_generated: bool
    # NIDA data shown for officer confirmation (not stored in IMS)
    nida_full_name: Optional[str] = None
    nida_photo_url: Optional[str] = None    # ephemeral URL; expires in 5 minutes


# ---- Face Scan ----

class FaceScanRequest(BaseModel):
    image_base64: str                       # base64-encoded JPEG/PNG
    officer_location_lat: Optional[float] = None
    officer_location_lng: Optional[float] = None
    officer_location_accuracy_m: Optional[int] = None
    device_id: Optional[str] = None
    linked_nid_verification_id: Optional[UUID] = None  # for dual NID+face


class FaceScanMatch(BaseModel):
    source: str                             # "IMS" | "NIDA" | "INTERPOL"
    confidence: float
    suspect_id: Optional[UUID] = None
    interpol_file_no: Optional[str] = None
    name: Optional[str] = None
    status: Optional[str] = None


class FaceScanResponse(BaseModel):
    event_id: UUID
    match_found: bool
    confidence_tier: Optional[str] = None  # HIGH | PROBABLE | POSSIBLE | NO_MATCH
    matches: List[FaceScanMatch]
    criminal_record_found: bool
    alert_generated: bool
    pending_human_review: bool


# ---- Intelligence Events ----

class IntelligenceEventResponse(BaseModel):
    id: UUID
    source_tag: str
    source_device_id: Optional[str]
    officer_id: Optional[UUID]
    institution: Optional[str]
    suspect_id: Optional[UUID]
    classification: str
    criminal_record_found: bool
    confidence: Optional[float]
    linked_event_ids: Optional[List[UUID]]
    event_timestamp: datetime

    model_config = {"from_attributes": True}


class OfficerReportCreate(BaseModel):
    suspect_id: Optional[UUID] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    location_accuracy_m: Optional[int] = None
    notes: str
    case_id: Optional[UUID] = None


# ---- Location Records ----

class LocationRecordResponse(BaseModel):
    id: UUID
    suspect_id: UUID
    location_lat: float
    location_lng: float
    accuracy_m: Optional[int]
    source_tag: str
    classification: str
    detection_timestamp: datetime

    model_config = {"from_attributes": True}


class SuspectMovementResponse(BaseModel):
    suspect_id: UUID
    total_detections: int
    locations: List[LocationRecordResponse]


# ---- Cases ----

class CaseCreate(BaseModel):
    title: str
    category: str
    clearance_level: str = "CONFIDENTIAL"
    summary: Optional[str] = None
    incident_date: Optional[datetime] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    location_name: Optional[str] = None


class CaseResponse(BaseModel):
    id: UUID
    case_reference: str
    title: str
    category: str
    status: str
    clearance_level: str
    owning_institution: str
    summary: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---- Corrections (RCS) ----

class IntakeCreate(BaseModel):
    suspect_id: UUID
    facility_name: str
    facility_code: Optional[str] = None
    intake_date: datetime
    case_id: Optional[UUID] = None
    offense_description: Optional[str] = None
    court_name: Optional[str] = None
    sentence_start: Optional[date] = None
    sentence_end: Optional[date] = None
    notes: Optional[str] = None


class CorrectionsResponse(BaseModel):
    id: UUID
    suspect_id: UUID
    facility_name: str
    custody_status: str
    intake_date: datetime
    sentence_end: Optional[date]
    release_date: Optional[date]
    escape_reported_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ---- Alerts ----

class AlertResponse(BaseModel):
    id: UUID
    priority: str
    classification: str
    source_tag: str
    title: str
    message: str
    suspect_id: Optional[UUID]
    acknowledged: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---- CCTV Node ----

class NodeHeartbeat(BaseModel):
    node_id: str
    firmware_version: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None


class CCTVAlertCreate(BaseModel):
    node_id: str
    suspect_id: Optional[UUID] = None
    interpol_file_no: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    face_frame_hash: str
    location_lat: float
    location_lng: float
    event_timestamp: datetime


# ---- Admin / SIEM ----

class RevocationCreate(BaseModel):
    scope: str                              # USER | GROUP | INSTITUTION | SERVICE | CAMERA_NODE | INTERNATIONAL_PARTNER
    target_user_id: Optional[UUID] = None
    target_role: Optional[str] = None
    target_institution: Optional[str] = None
    target_service: Optional[str] = None
    target_node_id: Optional[str] = None
    target_partner_id: Optional[UUID] = None
    reason: str


class RevocationResponse(BaseModel):
    id: UUID
    scope: str
    active: bool
    created_at: datetime
    reason: str

    model_config = {"from_attributes": True}


# ---- Warrants ----

class WarrantCreate(BaseModel):
    suspect_id: UUID
    warrant_type: str = "ARREST"
    issued_by_court: Optional[str] = None
    case_reference: Optional[str] = None
    charges: str
    issued_at: datetime
    expires_at: Optional[datetime] = None
    notes: Optional[str] = None


class WarrantResponse(BaseModel):
    id: UUID
    suspect_id: UUID
    warrant_type: str
    charges: str
    issued_at: datetime
    active: bool

    model_config = {"from_attributes": True}


# ---- Common ----

class MessageResponse(BaseModel):
    message: str


class HealthResponse(BaseModel):
    status: str
    version: str = "3.0"
    environment: str
