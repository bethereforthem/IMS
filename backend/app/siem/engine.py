"""
SIEM Engine — real-time event processing daemon.
Runs as a separate process (Dockerfile.siem) and processes audit events,
applies detection rules, and triggers automated responses.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import redis.asyncio as aioredis
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.database import (
    AsyncSessionLocal, AuditLog, SiemEvent, User, UserSession,
    CameraNode, IntelligenceEvent, NidVerification,
)
from app.siem.rules import (
    BulkEnumerationRule, OffHoursAccessRule, GeographicAnomalyRule,
    LocationOveraccessRule, MFAFailureLockoutRule, NIDScanSpikeRule,
    InterpolMatchUnactionedRule, CameraNodeOfflineRule, SiemTrigger,
)

logging.basicConfig(level=settings.LOG_LEVEL)
log = logging.getLogger("ims.siem")


class SIEMEngine:
    """
    Polling-based SIEM engine that runs rule checks on a schedule.
    In production, replace with Supabase Realtime subscriptions for true real-time.
    """

    def __init__(self):
        self.redis: aioredis.Redis | None = None
        self._rules = {
            "bulk_enum": BulkEnumerationRule(),
            "off_hours": OffHoursAccessRule(),
            "geo_anomaly": GeographicAnomalyRule(),
            "location_over": LocationOveraccessRule(),
            "mfa_lockout": MFAFailureLockoutRule(),
            "nid_spike": NIDScanSpikeRule(),
            "interpol_unactioned": InterpolMatchUnactionedRule(),
            "camera_offline": CameraNodeOfflineRule(),
        }

    async def start(self):
        self.redis = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        log.info("SIEM engine started")
        await asyncio.gather(
            self._run_periodic(self._check_bulk_enumeration, interval=60),
            self._run_periodic(self._check_nid_scan_spike, interval=300),
            self._run_periodic(self._check_location_overaccess, interval=120),
            self._run_periodic(self._check_interpol_unactioned, interval=300),
            self._run_periodic(self._check_camera_nodes_offline, interval=60),
        )

    async def _run_periodic(self, fn, interval: int):
        while True:
            try:
                await fn()
            except Exception as e:
                log.error(f"SIEM rule error in {fn.__name__}: {e}")
            await asyncio.sleep(interval)

    async def handle_login_event(self, user_id: str, login_hour: int, country: str):
        """Called synchronously from auth login handler."""
        triggers = []

        t = self._rules["off_hours"].evaluate(
            user_id, login_hour,
            settings.SIEM_OFF_HOURS_START, settings.SIEM_OFF_HOURS_END
        )
        if t:
            triggers.append(t)

        t = self._rules["geo_anomaly"].evaluate(user_id, country)
        if t:
            triggers.append(t)

        for trigger in triggers:
            await self._process_trigger(trigger)

    async def handle_mfa_failure(self, user_id: str, failure_count: int):
        t = self._rules["mfa_lockout"].evaluate(user_id, failure_count)
        if t:
            await self._process_trigger(t)

    async def _check_bulk_enumeration(self):
        async with AsyncSessionLocal() as db:
            window_start = datetime.now(tz=timezone.utc) - timedelta(
                seconds=settings.SIEM_BULK_QUERY_WINDOW_SECONDS
            )
            result = await db.execute(
                select(AuditLog.actor_id, func.count().label("cnt"))
                .where(
                    AuditLog.event_type == "DATA_READ",
                    AuditLog.target_type == "suspect_list",
                    AuditLog.event_timestamp >= window_start,
                    AuditLog.actor_id.isnot(None),
                )
                .group_by(AuditLog.actor_id)
                .having(func.count() > settings.SIEM_BULK_QUERY_LIMIT)
            )
            for row in result:
                trigger = self._rules["bulk_enum"].evaluate(
                    str(row.actor_id), row.cnt,
                    settings.SIEM_BULK_QUERY_WINDOW_SECONDS,
                    settings.SIEM_BULK_QUERY_LIMIT,
                )
                if trigger:
                    await self._process_trigger(trigger, db)
            await db.commit()

    async def _check_nid_scan_spike(self):
        async with AsyncSessionLocal() as db:
            today_start = datetime.now(tz=timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            result = await db.execute(
                select(NidVerification.officer_id, func.count().label("cnt"))
                .where(NidVerification.verified_at >= today_start)
                .group_by(NidVerification.officer_id)
                .having(func.count() > settings.SIEM_NID_DAILY_SCAN_LIMIT)
            )
            for row in result:
                trigger = self._rules["nid_spike"].evaluate(
                    str(row.officer_id), row.cnt, settings.SIEM_NID_DAILY_SCAN_LIMIT
                )
                if trigger:
                    await self._process_trigger(trigger, db)
            await db.commit()

    async def _check_location_overaccess(self):
        async with AsyncSessionLocal() as db:
            window_start = datetime.now(tz=timezone.utc) - timedelta(
                seconds=settings.SIEM_LOCATION_OVERACCESS_WINDOW_SECONDS
            )
            result = await db.execute(
                select(AuditLog.actor_id, func.count().label("cnt"))
                .where(
                    AuditLog.event_type.in_(["LOCATION_ACCESS", "LOCATION_RECORD_READ"]),
                    AuditLog.event_timestamp >= window_start,
                    AuditLog.actor_id.isnot(None),
                )
                .group_by(AuditLog.actor_id)
                .having(func.count() > settings.SIEM_LOCATION_OVERACCESS_LIMIT)
            )
            for row in result:
                trigger = self._rules["location_over"].evaluate(
                    str(row.actor_id), row.cnt,
                    settings.SIEM_LOCATION_OVERACCESS_LIMIT,
                    settings.SIEM_LOCATION_OVERACCESS_WINDOW_SECONDS,
                )
                if trigger:
                    await self._process_trigger(trigger, db)
            await db.commit()

    async def _check_interpol_unactioned(self):
        async with AsyncSessionLocal() as db:
            cutoff = datetime.now(tz=timezone.utc) - timedelta(
                seconds=settings.SIEM_INTERPOL_REVIEW_WINDOW_SECONDS
            )
            result = await db.execute(
                select(IntelligenceEvent).where(
                    IntelligenceEvent.source_tag.in_(["INTERPOL_FEED", "FACE_SCAN"]),
                    IntelligenceEvent.criminal_record_found == True,
                    IntelligenceEvent.event_timestamp <= cutoff,
                ).limit(50)
            )
            for event in result.scalars().all():
                trigger = self._rules["interpol_unactioned"].evaluate(
                    str(event.id), event.event_timestamp,
                    settings.SIEM_INTERPOL_REVIEW_WINDOW_SECONDS,
                )
                if trigger:
                    await self._process_trigger(trigger, db)
            await db.commit()

    async def _check_camera_nodes_offline(self):
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(CameraNode).where(CameraNode.active == True, CameraNode.revoked == False)
            )
            for node in result.scalars().all():
                trigger = self._rules["camera_offline"].evaluate(
                    node.node_id, node.last_heartbeat,
                    settings.SIEM_CAMERA_OFFLINE_THRESHOLD_MINUTES,
                )
                if trigger:
                    await self._process_trigger(trigger, db)
            await db.commit()

    async def _process_trigger(self, trigger: SiemTrigger, db: AsyncSession | None = None):
        """Record SIEM event and execute automated response."""
        close_db = db is None
        if db is None:
            db = AsyncSessionLocal()

        try:
            log.warning(f"SIEM TRIGGER [{trigger.severity}] {trigger.rule_id}: {trigger.description}")

            siem_event = SiemEvent(
                rule_id=trigger.rule_id,
                severity=trigger.severity,
                actor_id=UUID(trigger.actor_id) if trigger.actor_id else None,
                actor_institution=trigger.actor_institution,
                description=trigger.description,
                raw_data=trigger.raw_data,
                auto_actioned=trigger.auto_action is not None,
                action_taken=trigger.auto_action,
            )
            db.add(siem_event)

            if trigger.auto_action == "LOCK_USER" and trigger.actor_id:
                await db.execute(
                    update(User).where(User.id == UUID(trigger.actor_id)).values(locked=True)
                )
                log.warning(f"SIEM AUTO-ACTION: Locked user {trigger.actor_id}")

            elif trigger.auto_action == "KILL_SESSION" and trigger.actor_id:
                await db.execute(
                    update(UserSession)
                    .where(UserSession.user_id == UUID(trigger.actor_id), UserSession.revoked == False)
                    .values(revoked=True, revoked_at=datetime.now(tz=timezone.utc))
                )
                log.warning(f"SIEM AUTO-ACTION: Killed all sessions for {trigger.actor_id}")

            elif trigger.auto_action == "NISS_ALERT":
                if self.redis:
                    await self.redis.publish("ims:niss:alerts", trigger.description)

            await db.commit()
        except Exception as e:
            log.error(f"Failed to process SIEM trigger: {e}")
            await db.rollback()
        finally:
            if close_db:
                await db.close()


siem_engine = SIEMEngine()


if __name__ == "__main__":
    asyncio.run(siem_engine.start())
