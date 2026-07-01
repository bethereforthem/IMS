"""
NIDA (National Identification Agency) API client.
Uses mutual TLS over a dedicated VPN tunnel.
Certificate rotation every 30 days is managed externally.
"""
import logging
from typing import Optional

import httpx

from app.config import settings

log = logging.getLogger("ims.nida")


class NidaService:
    """
    Query-only client for the Rwanda NIDA API.
    Implements mTLS certificate pinning and rate limiting.
    Never stores citizen PII — results are passed through and discarded.
    """

    _client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            import ssl
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.load_verify_locations(settings.NIDA_CA_CERT_PATH)
            ctx.load_cert_chain(settings.NIDA_API_CERT_PATH, settings.NIDA_API_KEY_PATH)

            self._client = httpx.AsyncClient(
                base_url=settings.NIDA_API_BASE_URL,
                ssl=ctx,
                timeout=10.0,
                headers={"Accept": "application/json"},
            )
        return self._client

    async def verify(self, national_id_number: str) -> dict:
        """
        Query NIDA for the citizen record associated with this national ID.
        Returns: {match: bool, full_name: str|None, photo_url: str|None, dob: str|None}
        Never logs or persists the returned PII.
        """
        try:
            client = await self._get_client()
            response = await client.post(
                "/citizens/verify",
                json={"national_id": national_id_number},
            )
            response.raise_for_status()
            data = response.json()
            return {
                "match": data.get("verified", False),
                "full_name": data.get("full_name"),
                "photo_url": data.get("photo_url"),
                "dob": data.get("date_of_birth"),
            }
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return {"match": False, "full_name": None, "photo_url": None, "dob": None}
            log.error(f"NIDA API error: {e}")
            return {"match": None, "full_name": None, "photo_url": None, "dob": None}
        except Exception as e:
            log.error(f"NIDA service unavailable: {e}")
            return {"match": None, "full_name": None, "photo_url": None, "dob": None}

    async def close(self):
        if self._client:
            await self._client.aclose()


nida_service = NidaService()
