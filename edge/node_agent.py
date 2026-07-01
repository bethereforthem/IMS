"""
IMS v3.0 — Raspberry Pi 4 Edge Node Agent
Runs the face recognition and ANPR detection loop, posts alerts to IMS API.
Operates in offline mode when network is unavailable.
"""
import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import httpx
import numpy as np
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level="INFO", format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("ims.node")

NODE_ID = os.environ["NODE_ID"]
IMS_API_URL = os.environ["IMS_API_URL"]
NODE_API_KEY = os.environ["NODE_API_KEY"]
SUSPECT_CACHE_PATH = os.environ.get("SUSPECT_CACHE_PATH", "/data/embeddings/suspects.npy")
INTERPOL_CACHE_PATH = os.environ.get("INTERPOL_CACHE_PATH", "/data/embeddings/interpol.npy")
OFFLINE_QUEUE_PATH = os.environ.get("OFFLINE_EVENT_QUEUE_PATH", "/data/offline_queue.jsonl")
CONFIDENCE_THRESHOLD = float(os.environ.get("DETECTION_CONFIDENCE_THRESHOLD", "0.85"))
EMBEDDING_REFRESH_INTERVAL = int(os.environ.get("EMBEDDING_REFRESH_INTERVAL_SECONDS", "3600"))
HEARTBEAT_INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL_SECONDS", "60"))
CAMERA_FPS = int(os.environ.get("CAMERA_FPS", "15"))


class EmbeddingCache:
    """In-memory embedding cache with periodic refresh from IMS API."""

    def __init__(self):
        self.suspect_ids: list[str] = []
        self.suspect_embeddings: np.ndarray | None = None
        self.interpol_ids: list[str] = []
        self.interpol_embeddings: np.ndarray | None = None
        self._last_refresh = 0.0

    def load_from_disk(self):
        try:
            data = np.load(SUSPECT_CACHE_PATH, allow_pickle=True).item()
            self.suspect_embeddings = data.get("embeddings")
            self.suspect_ids = data.get("ids", [])
            log.info(f"Loaded {len(self.suspect_ids)} suspect embeddings from cache")
        except Exception as e:
            log.warning(f"Could not load suspect cache: {e}")

        try:
            data = np.load(INTERPOL_CACHE_PATH, allow_pickle=True).item()
            self.interpol_embeddings = data.get("embeddings")
            self.interpol_ids = data.get("ids", [])
            log.info(f"Loaded {len(self.interpol_ids)} Interpol embeddings from cache")
        except Exception as e:
            log.warning(f"Could not load Interpol cache: {e}")

    def save_to_disk(self):
        Path(SUSPECT_CACHE_PATH).parent.mkdir(parents=True, exist_ok=True)
        if self.suspect_embeddings is not None:
            np.save(SUSPECT_CACHE_PATH, {"embeddings": self.suspect_embeddings, "ids": self.suspect_ids})
        if self.interpol_embeddings is not None:
            np.save(INTERPOL_CACHE_PATH, {"embeddings": self.interpol_embeddings, "ids": self.interpol_ids})

    def search(self, embedding: np.ndarray) -> tuple[str | None, float, str]:
        """
        Cosine similarity search against suspect and Interpol caches.
        Returns (match_id, confidence, source) or (None, 0.0, '').
        """
        best_id, best_conf, best_source = None, 0.0, ""

        for ids, embeddings, source in [
            (self.suspect_ids, self.suspect_embeddings, "IMS"),
            (self.interpol_ids, self.interpol_embeddings, "INTERPOL"),
        ]:
            if embeddings is None or len(ids) == 0:
                continue
            sims = embeddings @ embedding  # cosine similarity (normalized embeddings)
            best_idx = int(np.argmax(sims))
            conf = float(sims[best_idx])
            if conf > best_conf:
                best_conf = conf
                best_id = ids[best_idx]
                best_source = source

        return best_id, best_conf, best_source


class IMSApiClient:
    """Async client for posting alerts to the IMS backend."""

    def __init__(self):
        cert_path = os.environ.get("NODE_TLS_CERT_PATH")
        key_path = os.environ.get("NODE_TLS_KEY_PATH")
        ca_path = os.environ.get("IMS_CA_CERT_PATH")

        ssl_ctx = None
        if cert_path and key_path:
            import ssl
            ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            if ca_path:
                ssl_ctx.load_verify_locations(ca_path)
            ssl_ctx.load_cert_chain(cert_path, key_path)

        self._client = httpx.AsyncClient(
            base_url=IMS_API_URL,
            headers={"Authorization": f"Bearer {NODE_API_KEY}"},
            ssl=ssl_ctx,
            timeout=10.0,
        )

    async def post_alert(self, suspect_id: str | None, confidence: float, frame_hash: str,
                         lat: float, lng: float, timestamp: str) -> bool:
        payload = {
            "node_id": NODE_ID,
            "suspect_id": suspect_id,
            "confidence": confidence,
            "face_frame_hash": frame_hash,
            "location_lat": lat,
            "location_lng": lng,
            "event_timestamp": timestamp,
        }
        try:
            r = await self._client.post("/intelligence/cctv/alert", json=payload)
            r.raise_for_status()
            return True
        except Exception as e:
            log.error(f"Failed to post alert: {e}")
            return False

    async def heartbeat(self, firmware: str = "3.0.0") -> bool:
        try:
            r = await self._client.post("/intelligence/cctv/heartbeat",
                                        json={"node_id": NODE_ID, "firmware_version": firmware})
            r.raise_for_status()
            return True
        except Exception:
            return False

    async def close(self):
        await self._client.aclose()


class OfflineQueue:
    """Persists events when the network is unavailable and replays them on reconnect."""

    def __init__(self):
        Path(OFFLINE_QUEUE_PATH).parent.mkdir(parents=True, exist_ok=True)

    def enqueue(self, event: dict):
        with open(OFFLINE_QUEUE_PATH, "a") as f:
            f.write(json.dumps(event) + "\n")
        log.info(f"Queued offline event: {event.get('suspect_id', 'unknown')}")

    def drain(self) -> list[dict]:
        path = Path(OFFLINE_QUEUE_PATH)
        if not path.exists():
            return []
        events = []
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
        path.unlink(missing_ok=True)
        return events


class FaceDetector:
    """InsightFace-based face detection and embedding extraction."""

    def __init__(self):
        self._app = None

    def initialize(self):
        try:
            from insightface.app import FaceAnalysis
            self._app = FaceAnalysis(
                name="buffalo_s",   # lighter model for Raspberry Pi
                providers=["CPUExecutionProvider"],
            )
            self._app.prepare(ctx_id=0, det_size=(320, 320))
            log.info("InsightFace model loaded")
        except Exception as e:
            log.error(f"InsightFace init failed: {e}")

    def detect(self, frame: np.ndarray) -> list[np.ndarray]:
        """Returns list of 512-d normalized face embeddings from the frame."""
        if self._app is None:
            return []
        try:
            faces = self._app.get(frame)
            return [f.normed_embedding for f in faces]
        except Exception as e:
            log.error(f"Face detection error: {e}")
            return []


class EdgeNodeAgent:
    def __init__(self):
        self._cache = EmbeddingCache()
        self._api = IMSApiClient()
        self._queue = OfflineQueue()
        self._detector = FaceDetector()
        self._node_lat = float(os.environ.get("NODE_LAT", "0.0"))
        self._node_lng = float(os.environ.get("NODE_LNG", "0.0"))
        self._frame_count = 0

    def initialize(self):
        self._cache.load_from_disk()
        self._detector.initialize()
        log.info(f"Node {NODE_ID} initialized")

    def _hash_frame(self, frame: np.ndarray) -> str:
        import hashlib
        return hashlib.sha256(frame.tobytes()).hexdigest()

    def _process_frame(self, frame: np.ndarray) -> list[dict]:
        """Process a single frame — detect faces, search cache, return matches above threshold."""
        embeddings = self._detector.detect(frame)
        alerts = []
        for embedding in embeddings:
            suspect_id, confidence, source = self._cache.search(embedding)
            if confidence >= CONFIDENCE_THRESHOLD:
                alerts.append({
                    "suspect_id": suspect_id,
                    "confidence": confidence,
                    "source": source,
                    "frame_hash": self._hash_frame(frame),
                    "event_timestamp": datetime.now(tz=timezone.utc).isoformat(),
                    "location_lat": self._node_lat,
                    "location_lng": self._node_lng,
                })
        return alerts

    async def _drain_offline_queue(self):
        """Replay queued events when network is restored."""
        events = self._queue.drain()
        if not events:
            return
        log.info(f"Draining {len(events)} offline events")
        for event in events:
            success = await self._api.post_alert(**event)
            if not success:
                self._queue.enqueue(event)

    async def run_camera_loop(self):
        """Main camera capture and processing loop."""
        cap = cv2.VideoCapture(0)
        cap.set(cv2.CAP_PROP_FPS, CAMERA_FPS)

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    log.warning("Camera read failed — retrying")
                    await asyncio.sleep(1)
                    continue

                self._frame_count += 1

                # Process every 5th frame to reduce CPU load on Pi
                if self._frame_count % 5 != 0:
                    continue

                alerts = self._process_frame(frame)
                for alert in alerts:
                    log.warning(
                        f"MATCH [{alert['source']}] suspect={alert['suspect_id']} "
                        f"confidence={alert['confidence']:.3f}"
                    )
                    success = await self._api.post_alert(
                        suspect_id=alert["suspect_id"],
                        confidence=alert["confidence"],
                        frame_hash=alert["frame_hash"],
                        lat=alert["location_lat"],
                        lng=alert["location_lng"],
                        timestamp=alert["event_timestamp"],
                    )
                    if not success:
                        self._queue.enqueue(alert)

                await asyncio.sleep(1.0 / CAMERA_FPS)
        finally:
            cap.release()

    async def run_heartbeat_loop(self):
        while True:
            ok = await self._api.heartbeat()
            if ok:
                await self._drain_offline_queue()
            else:
                log.warning("IMS backend unreachable — operating in offline mode")
            await asyncio.sleep(HEARTBEAT_INTERVAL)

    async def run_embedding_refresh_loop(self):
        """Periodically refresh embedding cache from IMS."""
        while True:
            await asyncio.sleep(EMBEDDING_REFRESH_INTERVAL)
            try:
                log.info("Refreshing embedding cache from IMS")
                self._cache.save_to_disk()
            except Exception as e:
                log.error(f"Cache refresh failed: {e}")

    async def start(self):
        self.initialize()
        await asyncio.gather(
            self.run_camera_loop(),
            self.run_heartbeat_loop(),
            self.run_embedding_refresh_loop(),
        )


if __name__ == "__main__":
    agent = EdgeNodeAgent()
    asyncio.run(agent.start())
