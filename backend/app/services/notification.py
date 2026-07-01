"""
Notification dispatcher — real-time alert delivery via Supabase Realtime / Redis pub-sub.
"""
import json
import logging
from typing import Any

import redis.asyncio as aioredis

from app.config import settings

log = logging.getLogger("ims.notification")


class NotificationService:
    _redis: aioredis.Redis | None = None

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        return self._redis

    async def push_alert(self, alert: Any, actor: Any):
        """Publish alert to the Redis channel consumed by WebSocket connections."""
        redis = await self._get_redis()
        payload = {
            "type": "ALERT",
            "alert_id": str(alert.id) if alert.id else None,
            "priority": str(alert.priority),
            "classification": str(alert.classification),
            "source_tag": str(alert.source_tag),
            "title": alert.title,
            "message": alert.message,
            "target_institutions": [str(i) for i in (alert.target_institutions or [])],
        }
        try:
            await redis.publish("ims:alerts:realtime", json.dumps(payload))
            for institution in (alert.target_institutions or []):
                await redis.publish(f"ims:alerts:{institution}", json.dumps(payload))
        except Exception as e:
            log.error(f"Failed to publish alert: {e}")

    async def push_cctv_alert(self, alert: Any, node: Any):
        """CCTV-specific alert with node metadata."""
        redis = await self._get_redis()
        payload = {
            "type": "CCTV_ALERT",
            "alert_id": str(alert.id) if alert.id else None,
            "node_id": node.node_id,
            "node_location": node.location_name,
            "priority": str(alert.priority),
            "message": alert.message,
        }
        try:
            await redis.publish("ims:cctv:alerts", json.dumps(payload))
        except Exception as e:
            log.error(f"Failed to publish CCTV alert: {e}")

    async def notify_interpol_match(self, event_id, matches: list, actor: Any):
        """NISS-only channel for Interpol matches — highest urgency."""
        redis = await self._get_redis()
        payload = {
            "type": "INTERPOL_MATCH",
            "event_id": str(event_id),
            "matches": matches,
            "actor_institution": actor.institution,
        }
        try:
            await redis.publish("ims:niss:interpol", json.dumps(payload))
            log.critical(f"INTERPOL MATCH: event={event_id}")
        except Exception as e:
            log.error(f"Failed to notify NISS of Interpol match: {e}")

    async def send_sms(self, phone: str, message: str):
        """SMS fallback for critical alerts (when officers are offline)."""
        if not settings.SMS_GATEWAY_URL:
            return
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    settings.SMS_GATEWAY_URL,
                    json={"phone": phone, "message": message},
                    headers={"Authorization": f"Bearer {settings.SMS_API_KEY}"},
                    timeout=5.0,
                )
        except Exception as e:
            log.error(f"SMS send failed: {e}")


notification_service = NotificationService()
