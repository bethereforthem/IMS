"""
SQLAlchemy ORM models mirroring the PostgreSQL schema.
"""
import enum
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime, Enum, Float, ForeignKey,
    Index, Integer, String, Text, ARRAY, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, TIMESTAMPTZ, UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncAttrs, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship, mapped_column, Mapped

from app.config import settings


class Base(AsyncAttrs, DeclarativeBase):
    pass


# ---- Enums ----

class InstitutionType(str, enum.Enum):
    RNP = "RNP"; RIB = "RIB"; RDF = "RDF"; NISS = "NISS"
    RCS = "RCS"; IRONDO = "IRONDO"; DASSO = "DASSO"; INTERNATIONAL = "INTERNATIONAL"

class UserRole(str, enum.Enum):
    NISS_DIRECTOR = "NISS_DIRECTOR"; NISS_OFFICER = "NISS_OFFICER"
    RNP_COMMANDER = "RNP_COMMANDER"; RNP_DETECTIVE = "RNP_DETECTIVE"; RNP_PATROL = "RNP_PATROL"
    RIB_INVESTIGATOR = "RIB_INVESTIGATOR"; RIB_ANALYST = "RIB_ANALYST"
    RDF_COMMANDER = "RDF_COMMANDER"; RDF_BORDER_OFFICER = "RDF_BORDER_OFFICER"
    RCS_SUPERINTENDENT = "RCS_SUPERINTENDENT"; RCS_OFFICER = "RCS_OFFICER"
    IRONDO_PATROL = "IRONDO_PATROL"; DASSO_OFFICER = "DASSO_OFFICER"
    SYSTEM_ADMIN = "SYSTEM_ADMIN"; SIEM_ANALYST = "SIEM_ANALYST"

class ClearanceLevel(str, enum.Enum):
    UNCLASSIFIED = "UNCLASSIFIED"; CONFIDENTIAL = "CONFIDENTIAL"
    SECRET = "SECRET"; TOP_SECRET = "TOP_SECRET"

class SourceTag(str, enum.Enum):
    CCTV_NODE = "CCTV_NODE"; FACE_SCAN = "FACE_SCAN"
    NID_SCAN = "NID_SCAN"; NID_MANUAL = "NID_MANUAL"
    INTERPOL_FEED = "INTERPOL_FEED"; PARTNER_QUERY = "PARTNER_QUERY"
    OFFICER_REPORT = "OFFICER_REPORT"; SYSTEM_ALERT = "SYSTEM_ALERT"

class SuspectStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"; WANTED = "WANTED"; ARRESTED = "ARRESTED"
    IN_CUSTODY = "IN_CUSTODY"; CONVICTED = "CONVICTED"; RELEASED = "RELEASED"
    DECEASED = "DECEASED"; CLEARED = "CLEARED"; INTERPOL_FLAGGED = "INTERPOL_FLAGGED"

class CrimeCategory(str, enum.Enum):
    HOMICIDE = "HOMICIDE"; ROBBERY = "ROBBERY"; FRAUD = "FRAUD"
    CYBERCRIME = "CYBERCRIME"; TERRORISM = "TERRORISM"
    ORGANIZED_CRIME = "ORGANIZED_CRIME"; TRAFFICKING = "TRAFFICKING"
    CORRUPTION = "CORRUPTION"; SEXUAL_OFFENSE = "SEXUAL_OFFENSE"
    DRUG_OFFENSE = "DRUG_OFFENSE"; BORDER_VIOLATION = "BORDER_VIOLATION"; OTHER = "OTHER"

class AlertPriority(str, enum.Enum):
    LOW = "LOW"; MEDIUM = "MEDIUM"; HIGH = "HIGH"; CRITICAL = "CRITICAL"

class CustodyStatus(str, enum.Enum):
    PRE_TRIAL = "PRE_TRIAL"; SENTENCED = "SENTENCED"; TRANSFERRED = "TRANSFERRED"
    RELEASED = "RELEASED"; ESCAPED = "ESCAPED"; DECEASED = "DECEASED"

class RevocationScope(str, enum.Enum):
    USER = "USER"; GROUP = "GROUP"; INSTITUTION = "INSTITUTION"
    SERVICE = "SERVICE"; CAMERA_NODE = "CAMERA_NODE"; INTERNATIONAL_PARTNER = "INTERNATIONAL_PARTNER"


# ---- ORM Models ----

class Institution(Base):
    __tablename__ = "institutions"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    code = Column(Enum(InstitutionType), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    contact_email = Column(String(255))
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    institution_id = Column(PGUUID(as_uuid=True), ForeignKey("institutions.id"), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    clearance_level = Column(Enum(ClearanceLevel), nullable=False, default=ClearanceLevel.CONFIDENTIAL)
    badge_number = Column(String(50), unique=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    phone = Column(String(20))
    password_hash = Column(Text, nullable=False)
    totp_secret = Column(Text)
    fingerprint_template = Column(Text)
    fido2_credential_id = Column(Text)
    active = Column(Boolean, nullable=False, default=True)
    locked = Column(Boolean, nullable=False, default=False)
    mfa_failures = Column(Integer, nullable=False, default=0)
    last_login_at = Column(TIMESTAMPTZ)
    last_login_ip = Column(INET)
    last_login_country = Column(String(2))
    password_changed_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    updated_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    institution = relationship("Institution", lazy="joined")
    sessions = relationship("UserSession", back_populates="user", lazy="noload")


class UserSession(Base):
    __tablename__ = "user_sessions"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(Text, nullable=False)
    device_id = Column(String(255))
    ip_address = Column(INET)
    country = Column(String(2))
    user_agent = Column(Text)
    expires_at = Column(TIMESTAMPTZ, nullable=False)
    revoked = Column(Boolean, nullable=False, default=False)
    revoked_at = Column(TIMESTAMPTZ)
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")


class Suspect(Base):
    __tablename__ = "suspects"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    ims_reference = Column(String(30), unique=True)
    status = Column(Enum(SuspectStatus), nullable=False, default=SuspectStatus.ACTIVE)
    clearance_level = Column(Enum(ClearanceLevel), nullable=False, default=ClearanceLevel.CONFIDENTIAL)
    first_name = Column(String(100))
    last_name = Column(String(100))
    aliases = Column(ARRAY(Text))
    date_of_birth = Column(Date)
    gender = Column(String(1))
    nationality = Column(String(3))
    national_id_hash = Column(String(64))
    passport_number = Column(String(30))
    height_cm = Column(Integer)
    weight_kg = Column(Integer)
    eye_color = Column(String(20))
    distinguishing_marks = Column(Text)
    face_embedding = Column(Vector(512))
    mugshot_sha256 = Column(String(64))
    created_by = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    owning_institution = Column(Enum(InstitutionType), nullable=False)
    interpol_file_no = Column(String(50))
    interpol_notice = Column(String(50))
    threat_level = Column(Integer)
    notes = Column(Text)
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    updated_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    warrants = relationship("Warrant", back_populates="suspect", lazy="noload")
    corrections = relationship("CorrectionsRecord", back_populates="suspect", lazy="noload")


class Warrant(Base):
    __tablename__ = "warrants"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    suspect_id = Column(PGUUID(as_uuid=True), ForeignKey("suspects.id"), nullable=False)
    warrant_type = Column(String(30), nullable=False, default="ARREST")
    issued_by = Column(Enum(InstitutionType), nullable=False)
    issued_by_court = Column(String(255))
    case_reference = Column(String(50))
    charges = Column(Text, nullable=False)
    issued_at = Column(TIMESTAMPTZ, nullable=False)
    expires_at = Column(TIMESTAMPTZ)
    active = Column(Boolean, nullable=False, default=True)
    executed_at = Column(TIMESTAMPTZ)
    notes = Column(Text)
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    suspect = relationship("Suspect", back_populates="warrants")


class IntelligenceEvent(Base):
    __tablename__ = "intelligence_events"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source_tag = Column(Enum(SourceTag), nullable=False)
    source_device_id = Column(String(255))
    officer_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    institution = Column(Enum(InstitutionType))
    suspect_id = Column(PGUUID(as_uuid=True), ForeignKey("suspects.id"))
    location_lat = Column(Float)
    location_lng = Column(Float)
    location_accuracy_m = Column(Integer)
    classification = Column(Enum(ClearanceLevel), nullable=False, default=ClearanceLevel.UNCLASSIFIED)
    criminal_record_found = Column(Boolean, nullable=False, default=False)
    confidence = Column(Float)
    linked_event_ids = Column(ARRAY(PGUUID(as_uuid=True)))
    face_frame_hash = Column(String(64))
    notes = Column(Text)
    event_timestamp = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    officer = relationship("User", foreign_keys=[officer_id], lazy="noload")
    suspect = relationship("Suspect", lazy="noload")


class NidVerification(Base):
    __tablename__ = "nid_verifications"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    method = Column(Enum("NID_SCAN", "NID_MANUAL", name="nid_method"), nullable=False)
    officer_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    national_id_hash = Column(String(64), nullable=False)
    nida_match = Column(Boolean)
    ims_criminal_record = Column(Boolean, nullable=False, default=False)
    suspect_id_linked = Column(PGUUID(as_uuid=True), ForeignKey("suspects.id"))
    location_lat = Column(Float)
    location_lng = Column(Float)
    classification = Column(Enum(ClearanceLevel), nullable=False, default=ClearanceLevel.UNCLASSIFIED)
    citizen_data_retained = Column(Boolean, nullable=False, default=False)
    intelligence_event_id = Column(PGUUID(as_uuid=True), ForeignKey("intelligence_events.id"))
    verified_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    officer = relationship("User", lazy="noload")


class LocationRecord(Base):
    __tablename__ = "location_records"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    intelligence_event_id = Column(PGUUID(as_uuid=True), ForeignKey("intelligence_events.id"), nullable=False)
    suspect_id = Column(PGUUID(as_uuid=True), ForeignKey("suspects.id"), nullable=False)
    location_lat = Column(Float, nullable=False)
    location_lng = Column(Float, nullable=False)
    location_alt_m = Column(Float)
    accuracy_m = Column(Integer)
    source_tag = Column(Enum(SourceTag), nullable=False)
    detecting_officer_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    detecting_node_id = Column(String(255))
    classification = Column(Enum(ClearanceLevel), nullable=False, default=ClearanceLevel.TOP_SECRET)
    authorized_institutions = Column(ARRAY(Enum(InstitutionType)))
    detection_timestamp = Column(TIMESTAMPTZ, nullable=False)
    retention_expires_at = Column(TIMESTAMPTZ, nullable=False)
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)


class CorrectionsRecord(Base):
    __tablename__ = "corrections_records"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    suspect_id = Column(PGUUID(as_uuid=True), ForeignKey("suspects.id"), nullable=False)
    case_id = Column(PGUUID(as_uuid=True), ForeignKey("cases.id"))
    facility_name = Column(String(255), nullable=False)
    facility_code = Column(String(50))
    custody_status = Column(Enum(CustodyStatus), nullable=False, default=CustodyStatus.PRE_TRIAL)
    intake_date = Column(TIMESTAMPTZ, nullable=False)
    intake_verified_by = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    sentence_start = Column(Date)
    sentence_end = Column(Date)
    offense_description = Column(Text)
    court_name = Column(String(255))
    judge_name = Column(String(100))
    release_date = Column(Date)
    actual_release_at = Column(TIMESTAMPTZ)
    escape_reported_at = Column(TIMESTAMPTZ)
    escape_recaptured_at = Column(TIMESTAMPTZ)
    notes = Column(Text)
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    updated_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    suspect = relationship("Suspect", back_populates="corrections")


class Case(Base):
    __tablename__ = "cases"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    case_reference = Column(String(30), unique=True, nullable=False)
    title = Column(String(255), nullable=False)
    category = Column(Enum(CrimeCategory), nullable=False)
    status = Column(String(30), nullable=False, default="OPEN")
    clearance_level = Column(Enum(ClearanceLevel), nullable=False, default=ClearanceLevel.CONFIDENTIAL)
    owning_institution = Column(Enum(InstitutionType), nullable=False)
    lead_officer_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    summary = Column(Text)
    incident_date = Column(TIMESTAMPTZ)
    location_lat = Column(Float)
    location_lng = Column(Float)
    location_name = Column(String(255))
    created_by = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    updated_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)


class CameraNode(Base):
    __tablename__ = "camera_nodes"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    node_id = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    location_name = Column(String(255))
    location_lat = Column(Float, nullable=False)
    location_lng = Column(Float, nullable=False)
    institution = Column(Enum(InstitutionType), nullable=False)
    tls_cert_hash = Column(String(64))
    last_heartbeat = Column(TIMESTAMPTZ)
    active = Column(Boolean, nullable=False, default=True)
    revoked = Column(Boolean, nullable=False, default=False)
    revoked_at = Column(TIMESTAMPTZ)
    firmware_version = Column(String(20))
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    intelligence_event_id = Column(PGUUID(as_uuid=True), ForeignKey("intelligence_events.id"), nullable=False)
    suspect_id = Column(PGUUID(as_uuid=True), ForeignKey("suspects.id"))
    priority = Column(Enum(AlertPriority), nullable=False, default=AlertPriority.HIGH)
    classification = Column(Enum(ClearanceLevel), nullable=False, default=ClearanceLevel.TOP_SECRET)
    source_tag = Column(Enum(SourceTag), nullable=False)
    title = Column(Text, nullable=False)
    message = Column(Text, nullable=False)
    target_institutions = Column(ARRAY(Enum(InstitutionType)))
    acknowledged = Column(Boolean, nullable=False, default=False)
    acknowledged_by = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    acknowledged_at = Column(TIMESTAMPTZ)
    expires_at = Column(TIMESTAMPTZ)
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    event_type = Column(String(100), nullable=False)
    actor_id = Column(PGUUID(as_uuid=True))
    actor_role = Column(Enum(UserRole))
    actor_institution = Column(Enum(InstitutionType))
    target_type = Column(String(100))
    target_id = Column(PGUUID(as_uuid=True))
    action = Column(String(100), nullable=False)
    before_state = Column(JSONB)
    after_state = Column(JSONB)
    ip_address = Column(INET)
    device_id = Column(String(255))
    justification = Column(Text)
    classification = Column(Enum(ClearanceLevel))
    session_id = Column(PGUUID(as_uuid=True))
    event_timestamp = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)


class SiemEvent(Base):
    __tablename__ = "siem_events"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    rule_id = Column(String(100), nullable=False)
    severity = Column(String(20), nullable=False)
    actor_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    actor_institution = Column(Enum(InstitutionType))
    description = Column(Text, nullable=False)
    raw_data = Column(JSONB)
    auto_actioned = Column(Boolean, nullable=False, default=False)
    action_taken = Column(Text)
    reviewed = Column(Boolean, nullable=False, default=False)
    reviewed_by = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    reviewed_at = Column(TIMESTAMPTZ)
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)


class AccessRevocation(Base):
    __tablename__ = "access_revocations"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    scope = Column(Enum(RevocationScope), nullable=False)
    target_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    target_role = Column(Enum(UserRole))
    target_institution = Column(Enum(InstitutionType))
    target_service = Column(String(100))
    target_node_id = Column(String(50))
    target_partner_id = Column(PGUUID(as_uuid=True))
    revoked_by = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    reason = Column(Text, nullable=False)
    siem_event_id = Column(PGUUID(as_uuid=True), ForeignKey("siem_events.id"))
    active = Column(Boolean, nullable=False, default=True)
    reinstated_by = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    reinstated_at = Column(TIMESTAMPTZ)
    created_at = Column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)


# ---- DB Engine ----

engine = create_async_engine(settings.DATABASE_URL, echo=settings.ENVIRONMENT == "development")
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
