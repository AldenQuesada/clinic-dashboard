"""
ClinicAI — Scanner Router
Professional facial scanning endpoints using MediaPipe 478-point Face Mesh.

Endpoints:
  POST /scanner/scan-face     — Full 478-landmark scan + all metrics
  POST /scanner/measure       — Golden ratio + proportional measurements only
  POST /scanner/classify-face — Face shape + age bracket classification
  POST /scanner/zone-centers  — Auto-detect treatment zone centers
"""

import time
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from utils.image_helpers import b64_to_cv2
from engines.landmark_engine import scan_face

log = logging.getLogger("facial-api.scanner")
router = APIRouter(prefix="/scanner", tags=["Scanner"])


# ── Request Models ──────────────────────────────────────────

class ScanRequest(BaseModel):
    photo_base64: str
    include_landmarks: bool = Field(default=True, description="Include full 478-point mesh in response")
    include_measurements: bool = Field(default=True, description="Include golden ratio measurements")

class MeasureRequest(BaseModel):
    photo_base64: str

class ClassifyRequest(BaseModel):
    photo_base64: str

class ZoneCentersRequest(BaseModel):
    photo_base64: str


# ── Endpoints ───────────────────────────────────────────────

@router.post("/scan-face")
async def scan_face_endpoint(req: ScanRequest):
    """
    Full face scan: 478 3D landmarks + thirds + Ricketts + symmetry + shape + pose.
    This is the primary endpoint that replaces /landmarks.
    """
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        h, w = img.shape[:2]

        result = scan_face(img)
        if result is None:
            return {"success": False, "error": "Nenhum rosto detectado na imagem"}

        # Optionally strip heavy data
        if not req.include_landmarks:
            result["landmarks"] = []
            result["landmark_count_note"] = "Landmarks omitted (include_landmarks=false)"

        if not req.include_measurements:
            result.pop("measurements", None)

        elapsed = round(time.time() - t0, 2)
        result["success"] = True
        result["elapsed_s"] = elapsed

        log.info(
            f"Face scanned in {elapsed}s | {w}x{h} | "
            f"{result['landmark_count']} landmarks | "
            f"shape={result['shape']['shape']} | "
            f"symmetry={result['symmetry']['overall']}% | "
            f"pose={result['pose'].get('angle_description', 'unknown')}"
        )

        return result
    except Exception as e:
        log.error(f"Face scan failed: {e}")
        raise HTTPException(500, detail=str(e))


@router.post("/measure")
async def measure_face(req: MeasureRequest):
    """
    Measure facial proportions and golden ratio adherence.
    Lighter endpoint — returns only measurements + thirds.
    """
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        result = scan_face(img)
        if result is None:
            return {"success": False, "error": "Nenhum rosto detectado"}

        elapsed = round(time.time() - t0, 2)

        return {
            "success": True,
            "thirds": result["thirds"],
            "measurements": result["measurements"],
            "symmetry": result["symmetry"],
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Measurement failed: {e}")
        raise HTTPException(500, detail=str(e))


@router.post("/classify-face")
async def classify_face(req: ClassifyRequest):
    """
    Classify face shape (oval/redondo/quadrado/etc) and estimate characteristics.
    """
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        result = scan_face(img)
        if result is None:
            return {"success": False, "error": "Nenhum rosto detectado"}

        elapsed = round(time.time() - t0, 2)

        return {
            "success": True,
            "shape": result["shape"],
            "symmetry": result["symmetry"],
            "pose": result["pose"],
            "thirds": result["thirds"],
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Classification failed: {e}")
        raise HTTPException(500, detail=str(e))


@router.post("/zone-centers")
async def zone_centers(req: ZoneCentersRequest):
    """
    Auto-detect treatment zone centers from facial landmarks.
    Returns normalized (0-1) coordinates for each of the 20+ zones.
    Replaces the old /auto-zones endpoint with much higher accuracy.
    """
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        result = scan_face(img)
        if result is None:
            return {"success": False, "error": "Nenhum rosto detectado"}

        elapsed = round(time.time() - t0, 2)

        return {
            "success": True,
            "zone_centers": result["zone_centers"],
            "zone_count": len(result["zone_centers"]),
            "face_rect": result["face_rect"],
            "pose": result["pose"],
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Zone center detection failed: {e}")
        raise HTTPException(500, detail=str(e))
