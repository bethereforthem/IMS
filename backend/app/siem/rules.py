"""
SIEM detection rules — each rule is a dataclass with an evaluate() method.
Rules return a SiemTrigger when fired, or None when the condition is not met.
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional


@dataclass
class SiemTrigger:
    rule_id: str
    severity: str           # LOW | MEDIUM | HIGH | CRITICAL
    actor_id: Optional[str]
    actor_institution: Optional[str]
    description: str
    raw_data: dict
    auto_action: Optional[str] = None   # "LOCK_USER" | "RATE_LIMIT" | "KILL_SESSION" | "NISS_ALERT"


class BulkEnumerationRule:
    """Rule: >50 suspect queries in 10 minutes by a single user."""
    rule_id = "BULK_ENUMERATION"
    severity = "HIGH"

    def evaluate(self, actor_id: str, query_count: int, window_seconds: int, limit: int) -> Optional[SiemTrigger]:
        if query_count > limit:
            return SiemTrigger(
                rule_id=self.rule_id,
                severity=self.severity,
                actor_id=actor_id,
                actor_institution=None,
                description=f"User {actor_id} performed {query_count} suspect queries in {window_seconds}s (limit: {limit})",
                raw_data={"query_count": query_count, "window_seconds": window_seconds, "limit": limit},
                auto_action="RATE_LIMIT",
            )
        return None


class OffHoursAccessRule:
    """Rule: Login between 22:00–05:00 local time."""
    rule_id = "OFF_HOURS_ACCESS"
    severity = "MEDIUM"

    def evaluate(self, actor_id: str, login_hour: int, off_start: int, off_end: int) -> Optional[SiemTrigger]:
        is_off_hours = (login_hour >= off_start) or (login_hour < off_end)
        if is_off_hours:
            return SiemTrigger(
                rule_id=self.rule_id,
                severity=self.severity,
                actor_id=actor_id,
                actor_institution=None,
                description=f"Off-hours login at hour {login_hour:02d}:xx (restricted: {off_start}:00–{off_end}:00)",
                raw_data={"login_hour": login_hour, "off_start": off_start, "off_end": off_end},
                auto_action="NISS_ALERT",
            )
        return None


class GeographicAnomalyRule:
    """Rule: Login from unexpected country."""
    rule_id = "GEOGRAPHIC_ANOMALY"
    severity = "CRITICAL"

    def evaluate(self, actor_id: str, login_country: str, expected_country: str = "RW") -> Optional[SiemTrigger]:
        if login_country and login_country != expected_country:
            return SiemTrigger(
                rule_id=self.rule_id,
                severity=self.severity,
                actor_id=actor_id,
                actor_institution=None,
                description=f"Login from unexpected country: {login_country} (expected: {expected_country})",
                raw_data={"login_country": login_country, "expected": expected_country},
                auto_action="KILL_SESSION",
            )
        return None


class LocationOveraccessRule:
    """Rule: >20 location record reads in 1 hour by one user."""
    rule_id = "LOCATION_OVERACCESS"
    severity = "HIGH"

    def evaluate(self, actor_id: str, read_count: int, limit: int, window_seconds: int) -> Optional[SiemTrigger]:
        if read_count > limit:
            return SiemTrigger(
                rule_id=self.rule_id,
                severity=self.severity,
                actor_id=actor_id,
                actor_institution=None,
                description=f"User {actor_id} accessed {read_count} location records in {window_seconds}s (limit: {limit})",
                raw_data={"read_count": read_count, "limit": limit},
                auto_action="NISS_ALERT",
            )
        return None


class MFAFailureLockoutRule:
    """Rule: 3 consecutive MFA failures → account lockout."""
    rule_id = "MFA_FAILURE_LOCKOUT"
    severity = "HIGH"

    def evaluate(self, actor_id: str, failure_count: int) -> Optional[SiemTrigger]:
        if failure_count >= 3:
            return SiemTrigger(
                rule_id=self.rule_id,
                severity=self.severity,
                actor_id=actor_id,
                actor_institution=None,
                description=f"Account {actor_id} locked after {failure_count} consecutive MFA failures",
                raw_data={"failure_count": failure_count},
                auto_action="LOCK_USER",
            )
        return None


class NIDScanSpikeRule:
    """Rule: >100 NID queries per officer per day."""
    rule_id = "NID_SCAN_SPIKE"
    severity = "MEDIUM"

    def evaluate(self, actor_id: str, daily_count: int, limit: int) -> Optional[SiemTrigger]:
        if daily_count > limit:
            return SiemTrigger(
                rule_id=self.rule_id,
                severity=self.severity,
                actor_id=actor_id,
                actor_institution=None,
                description=f"Officer {actor_id} performed {daily_count} NID queries today (limit: {limit})",
                raw_data={"daily_count": daily_count, "limit": limit},
                auto_action="NISS_ALERT",
            )
        return None


class InterpolMatchUnactionedRule:
    """Rule: Confirmed Interpol match not reviewed within 2 hours → NISS escalation."""
    rule_id = "INTERPOL_MATCH_UNACTIONED"
    severity = "CRITICAL"

    def evaluate(self, event_id: str, created_at: datetime, window_seconds: int) -> Optional[SiemTrigger]:
        age = (datetime.now(tz=timezone.utc) - created_at).total_seconds()
        if age > window_seconds:
            return SiemTrigger(
                rule_id=self.rule_id,
                severity=self.severity,
                actor_id=None,
                actor_institution=None,
                description=f"Interpol match event {event_id} unreviewed for {int(age)}s (threshold: {window_seconds}s)",
                raw_data={"event_id": event_id, "age_seconds": int(age)},
                auto_action="NISS_ALERT",
            )
        return None


class CameraNodeOfflineRule:
    """Rule: Camera node offline >15 minutes during operating hours."""
    rule_id = "CAMERA_NODE_OFFLINE"
    severity = "MEDIUM"

    def evaluate(self, node_id: str, last_heartbeat: Optional[datetime], threshold_minutes: int) -> Optional[SiemTrigger]:
        if not last_heartbeat:
            return SiemTrigger(
                rule_id=self.rule_id,
                severity=self.severity,
                actor_id=None,
                actor_institution=None,
                description=f"Camera node {node_id} has never reported a heartbeat",
                raw_data={"node_id": node_id},
                auto_action="NISS_ALERT",
            )
        offline_minutes = (datetime.now(tz=timezone.utc) - last_heartbeat).total_seconds() / 60
        if offline_minutes > threshold_minutes:
            return SiemTrigger(
                rule_id=self.rule_id,
                severity=self.severity,
                actor_id=None,
                actor_institution=None,
                description=f"Camera node {node_id} offline for {offline_minutes:.1f} minutes (threshold: {threshold_minutes})",
                raw_data={"node_id": node_id, "offline_minutes": offline_minutes},
                auto_action="NISS_ALERT",
            )
        return None


# Registry of all rules
ALL_RULES = [
    BulkEnumerationRule(),
    OffHoursAccessRule(),
    GeographicAnomalyRule(),
    LocationOveraccessRule(),
    MFAFailureLockoutRule(),
    NIDScanSpikeRule(),
    InterpolMatchUnactionedRule(),
    CameraNodeOfflineRule(),
]
