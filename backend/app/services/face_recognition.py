"""
Face Recognition Service — identifies faces against IMS, NIDA, and Interpol databases.
Uses InsightFace (ArcFace) for 512-d embedding extraction.
"""
import logging
from io import BytesIO
from typing import Optional

import numpy as np

from app.config import settings

log = logging.getLogger("ims.face")


class FaceRecognitionService:
    """
    Three-source identification pipeline:
    1. IMS internal suspect embeddings (pgvector cosine search)
    2. Rwanda NIDA — photo match only, no criminal data
    3. Interpol Red Notices
    Runs all three in parallel.
    """

    _model = None

    def _get_model(self):
        if self._model is None:
            try:
                from insightface.app import FaceAnalysis
                self._model = FaceAnalysis(
                    name="buffalo_l",
                    providers=["CPUExecutionProvider"],
                )
                self._model.prepare(ctx_id=0, det_size=(640, 640))
            except ImportError:
                log.warning("InsightFace not available — face recognition disabled")
                self._model = None
        return self._model

    def extract_embedding(self, image_bytes: bytes) -> Optional[np.ndarray]:
        """Extract ArcFace 512-d embedding from image bytes."""
        try:
            import cv2
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            model = self._get_model()
            if model is None:
                return None
            faces = model.get(img)
            if not faces:
                return None
            return faces[0].normed_embedding   # 512-d unit vector
        except Exception as e:
            log.error(f"Embedding extraction failed: {e}")
            return None

    async def identify(self, image_bytes: bytes) -> list[dict]:
        """
        Run three-source identification pipeline.
        Returns list of matches sorted by confidence descending.
        """
        import asyncio

        embedding = self.extract_embedding(image_bytes)
        if embedding is None:
            return []

        ims_task = asyncio.create_task(self._search_ims(embedding))
        nida_task = asyncio.create_task(self._search_nida(embedding, image_bytes))
        interpol_task = asyncio.create_task(self._search_interpol(embedding))

        ims_matches, nida_matches, interpol_matches = await asyncio.gather(
            ims_task, nida_task, interpol_task, return_exceptions=True
        )

        results = []
        for source, matches in [("IMS", ims_matches), ("NIDA", nida_matches), ("INTERPOL", interpol_matches)]:
            if isinstance(matches, Exception):
                log.error(f"Face search error in {source}: {matches}")
                continue
            results.extend(matches)

        # Sort by confidence descending, filter below minimum threshold
        results = [m for m in results if m["confidence"] >= settings.FACE_MATCH_THRESHOLD_POSSIBLE]
        results.sort(key=lambda m: m["confidence"], reverse=True)
        return results

    async def _search_ims(self, embedding: np.ndarray) -> list[dict]:
        """pgvector cosine similarity search against suspect embeddings."""
        from sqlalchemy import text
        from app.models.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                text(
                    "SELECT id, first_name, last_name, status, "
                    "1 - (face_embedding <=> :emb::vector) AS confidence "
                    "FROM suspects "
                    "WHERE face_embedding IS NOT NULL "
                    "ORDER BY face_embedding <=> :emb::vector "
                    "LIMIT 5"
                ),
                {"emb": embedding.tolist()},
            )
            rows = result.fetchall()

        matches = []
        for row in rows:
            confidence = float(row.confidence)
            if confidence >= settings.FACE_MATCH_THRESHOLD_POSSIBLE:
                matches.append({
                    "source": "IMS",
                    "suspect_id": row.id,
                    "name": f"{row.first_name or ''} {row.last_name or ''}".strip(),
                    "status": str(row.status),
                    "confidence": confidence,
                    "criminal_record": True,
                })
        return matches

    async def _search_nida(self, embedding: np.ndarray, image_bytes: bytes) -> list[dict]:
        """
        NIDA returns a photo for NID scans. For face-scan only, we submit the embedding
        to NIDA's face search endpoint (if available) — identity only, no criminal data.
        """
        return []   # Stub — NIDA face search requires separate MOU agreement

    async def _search_interpol(self, embedding: np.ndarray) -> list[dict]:
        """Search locally cached Interpol Red Notice face embeddings."""
        from sqlalchemy import text
        from app.models.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                text(
                    "SELECT file_number, subject_name, charges, issuing_country, "
                    "1 - (face_embedding <=> :emb::vector) AS confidence "
                    "FROM interpol_notices "
                    "WHERE face_embedding IS NOT NULL AND active = TRUE "
                    "ORDER BY face_embedding <=> :emb::vector "
                    "LIMIT 3"
                ),
                {"emb": embedding.tolist()},
            )
            rows = result.fetchall()

        matches = []
        for row in rows:
            confidence = float(row.confidence)
            if confidence >= settings.FACE_MATCH_THRESHOLD_PROBABLE:
                matches.append({
                    "source": "INTERPOL",
                    "interpol_file_no": row.file_number,
                    "name": row.subject_name,
                    "confidence": confidence,
                    "criminal_record": True,
                    "charges": row.charges,
                    "issuing_country": row.issuing_country,
                })
        return matches

    async def store_suspect_embedding(self, suspect_id, embedding: np.ndarray):
        """Update suspect's face embedding in the database."""
        from sqlalchemy import text
        from app.models.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            await db.execute(
                text("UPDATE suspects SET face_embedding = :emb::vector WHERE id = :id"),
                {"emb": embedding.tolist(), "id": str(suspect_id)},
            )
            await db.commit()


face_recognition_service = FaceRecognitionService()
