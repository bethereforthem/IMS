"""
ANPR (Automatic Number Plate Recognition) — EasyOCR-based license plate detection.
Runs alongside the face recognition loop on border/road nodes.
"""
import logging

import cv2
import numpy as np

log = logging.getLogger("ims.anpr")


class ANPRDetector:
    def __init__(self, region: str = "RW"):
        self._reader = None
        self._region = region

    def initialize(self):
        try:
            import easyocr
            self._reader = easyocr.Reader(["en"], gpu=False)
            log.info("ANPR / EasyOCR reader initialized")
        except ImportError:
            log.warning("EasyOCR not available — ANPR disabled")

    def detect_plate(self, frame: np.ndarray) -> list[dict]:
        """
        Detect license plates in the frame.
        Returns list of {'plate': str, 'confidence': float, 'bbox': list}
        """
        if self._reader is None:
            return []

        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            results = self._reader.readtext(gray)

            plates = []
            for (bbox, text, conf) in results:
                cleaned = text.strip().upper().replace(" ", "")
                # Rwanda plates: RAA 001 A format
                if _looks_like_plate(cleaned) and conf > 0.7:
                    plates.append({
                        "plate": cleaned,
                        "confidence": conf,
                        "bbox": bbox,
                        "region": self._region,
                    })
            return plates
        except Exception as e:
            log.error(f"ANPR detection error: {e}")
            return []


def _looks_like_plate(text: str) -> bool:
    """Heuristic filter for Rwanda plate numbers (R + 2-3 letters + digits + letter)."""
    import re
    return bool(re.match(r"^R[A-Z]{2,3}\d{3}[A-Z]$", text))
