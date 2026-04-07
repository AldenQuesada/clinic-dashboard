"""
ClinicAI — Skin Analysis v2 Router
Professional dermatological skin analysis with heatmaps and zone scores.

Endpoints:
  POST /skin/analyze       — Full analysis with heatmaps + zone scores + skin age
  POST /skin/heatmap       — Single metric heatmap only
  POST /skin/zone-report   — Zone-level report (no heatmaps, lighter)
"""

import time
import logging
from typing import Optional, List

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from utils.image_helpers import b64_to_cv2
from utils.face_parsing import segment_skin
from engines.skin_engine import analyze_skin_v2

log = logging.getLogger("facial-api.skin-v2")
router = APIRouter(prefix="/skin", tags=["Skin Analysis v2"])


# ── Request Models ──────────────────────────────────────────

class SkinAnalyzeRequest(BaseModel):
    photo_base64: str
    generate_heatmaps: bool = Field(default=True, description="Generate heatmap overlays (adds ~200ms)")
    metrics: Optional[List[str]] = Field(
        default=None,
        description="Specific metrics to analyze. None = all. Options: wrinkles, spots, pores, redness, pigmentation, firmness"
    )

class HeatmapRequest(BaseModel):
    photo_base64: str
    metric: str = Field(description="wrinkles, spots, pores, redness, pigmentation, or firmness")

class ZoneReportRequest(BaseModel):
    photo_base64: str


# ── Endpoints ───────────────────────────────────────────────

@router.post("/analyze")
async def analyze_skin_full(req: SkinAnalyzeRequest):
    """
    Full skin analysis: global scores + zone scores + heatmaps + skin age.

    Pipeline:
    1. Detect face + segment skin (auto)
    2. Detect 478 landmarks for zone centers (if available)
    3. Run all 6 skin metrics
    4. Generate heatmaps (optional)
    5. Estimate biological skin age
    """
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        h, w = img.shape[:2]

        # Step 1: Segment skin
        import cv2
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
        face_rect = tuple(max(faces, key=lambda f: f[2] * f[3])) if len(faces) > 0 else None

        skin_mask = segment_skin(img, face_rect=face_rect)

        # Fallback: if skin mask is empty or None, use full image
        if skin_mask is None or np.sum(skin_mask > 0) < 100:
            log.warning("Skin mask empty, using full image as fallback")
            skin_mask = np.ones((h, w), dtype=np.uint8) * 255
            # If we have face_rect, at least restrict to face area
            if face_rect:
                skin_mask = np.zeros((h, w), dtype=np.uint8)
                fx, fy, fw, fh = face_rect
                skin_mask[fy:fy+fh, fx:fx+fw] = 255

        # Step 2: Try to get zone centers from scanner
        zone_centers = None
        try:
            from engines.landmark_engine import scan_face
            scan_result = scan_face(img)
            if scan_result:
                zone_centers = scan_result.get("zone_centers")
        except Exception as e:
            log.warning(f"Landmark detection failed for zone scoring, continuing without: {e}")

        # Step 3: Run analysis
        result = analyze_skin_v2(
            img,
            skin_mask=skin_mask,
            zone_centers=zone_centers,
            generate_heatmaps=req.generate_heatmaps,
        )

        elapsed = round(time.time() - t0, 2)

        response = {
            "success": True,
            "scores": result["scores"],
            "zone_scores": result["zone_scores"],
            "skin_age": result["skin_age"],
            "skin_coverage": result["skin_coverage"],
            "face_detected": face_rect is not None,
            "zone_count": len(result["zone_scores"]),
            "size": {"w": w, "h": h},
            "elapsed_s": elapsed,
        }

        if req.generate_heatmaps:
            response["heatmaps"] = result["heatmaps"]

        log.info(
            f"Skin v2 analyzed in {elapsed}s | {w}x{h} | "
            f"overall={result['scores']['overall']} | "
            f"skin_age={result['skin_age']['estimated_age']} | "
            f"zones={len(result['zone_scores'])}"
        )

        return response
    except Exception as e:
        log.error(f"Skin v2 analysis failed: {e}")
        raise HTTPException(500, detail=str(e))


@router.post("/heatmap")
async def single_heatmap(req: HeatmapRequest):
    """Generate a single metric heatmap overlay."""
    valid_metrics = {"wrinkles", "spots", "pores", "redness", "pigmentation", "firmness"}
    if req.metric not in valid_metrics:
        raise HTTPException(400, detail=f"Invalid metric. Choose from: {', '.join(valid_metrics)}")

    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        h, w = img.shape[:2]

        import cv2
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
        face_rect = tuple(max(faces, key=lambda f: f[2] * f[3])) if len(faces) > 0 else None

        skin_mask = segment_skin(img, face_rect=face_rect)

        result = analyze_skin_v2(img, skin_mask=skin_mask, generate_heatmaps=True)

        elapsed = round(time.time() - t0, 2)

        return {
            "success": True,
            "metric": req.metric,
            "heatmap_b64": result["heatmaps"].get(req.metric, ""),
            "score": result["scores"].get(req.metric, 0),
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Heatmap generation failed: {e}")
        raise HTTPException(500, detail=str(e))


@router.post("/zone-report")
async def zone_report(req: ZoneReportRequest):
    """
    Zone-level skin report without heatmaps (lighter response).
    Includes per-zone scores for all 6 metrics + skin age.
    """
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)

        import cv2
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
        face_rect = tuple(max(faces, key=lambda f: f[2] * f[3])) if len(faces) > 0 else None

        skin_mask = segment_skin(img, face_rect=face_rect)

        zone_centers = None
        try:
            from engines.landmark_engine import scan_face
            scan_result = scan_face(img)
            if scan_result:
                zone_centers = scan_result.get("zone_centers")
        except Exception:
            pass

        result = analyze_skin_v2(img, skin_mask=skin_mask, zone_centers=zone_centers, generate_heatmaps=False)

        elapsed = round(time.time() - t0, 2)

        return {
            "success": True,
            "scores": result["scores"],
            "zone_scores": result["zone_scores"],
            "skin_age": result["skin_age"],
            "zone_count": len(result["zone_scores"]),
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Zone report failed: {e}")
        raise HTTPException(500, detail=str(e))
