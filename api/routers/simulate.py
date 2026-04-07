"""
ClinicAI — Simulation Router
Deterministic facial treatment simulation. Zero external API cost.

Endpoints:
  POST /simulate/preview     — Generate simulated result photo
  POST /simulate/compare     — Generate before/after side-by-side
"""

import time
import logging
from typing import Optional, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from utils.image_helpers import b64_to_cv2, cv2_to_b64
from engines.warp_engine import simulate

log = logging.getLogger("facial-api.simulate")
router = APIRouter(prefix="/simulate", tags=["Simulation"])


# ── Request Models ──────────────────────────────────────────

class ZoneInput(BaseModel):
    zone: str = Field(description="Zone ID (e.g., mandibula_esq, olheira_dir, sulco_esq)")
    severity: int = Field(default=2, ge=0, le=3, description="Severity 0-3")
    treatment: str = Field(default="AH", description="Treatment type: AH, Botox, Bio, Laser")

class SimulateRequest(BaseModel):
    photo_base64: str
    zones: List[ZoneInput]
    intensity: float = Field(default=0.7, ge=0.0, le=1.0, description="Simulation intensity")
    use_scanner: bool = Field(default=True, description="Use 478-landmark scanner for precise zone centers")

class CompareRequest(BaseModel):
    photo_base64: str
    zones: List[ZoneInput]
    intensity: float = Field(default=0.7, ge=0.0, le=1.0)
    layout: str = Field(default="side_by_side", description="side_by_side or vertical")


# ── Endpoints ───────────────────────────────────────────────

@router.post("/preview")
async def simulate_preview(req: SimulateRequest):
    """
    Generate a simulated treatment result photo.

    Pipeline:
    1. Detect 478 landmarks for precise zone centers (optional)
    2. Apply zone-specific transformations (inflate, smooth, lighten, contour)
    3. Apply subtle global glow
    4. Return simulated photo as base64 PNG

    Deterministic: same input = same output. <3s.
    """
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        h, w = img.shape[:2]

        # Get zone centers
        zone_centers = None
        if req.use_scanner:
            try:
                from engines.landmark_engine import scan_face
                scan_result = scan_face(img)
                if scan_result:
                    zone_centers = scan_result.get("zone_centers")
            except Exception as e:
                log.warning(f"Scanner failed, using fallback zone centers: {e}")

        # Convert zones to dicts
        zones_list = [z.model_dump() for z in req.zones]

        # Run simulation
        simulated = simulate(
            img,
            zones=zones_list,
            zone_centers=zone_centers,
            intensity=req.intensity,
        )

        b64_result = cv2_to_b64(simulated, ".png")
        elapsed = round(time.time() - t0, 2)

        zone_names = [z.zone for z in req.zones]
        log.info(
            f"Simulation in {elapsed}s | {w}x{h} | "
            f"{len(req.zones)} zones: {', '.join(zone_names)} | "
            f"intensity={req.intensity} | scanner={'yes' if zone_centers else 'fallback'}"
        )

        return {
            "success": True,
            "image_b64": b64_result,
            "zones_applied": len(req.zones),
            "zone_names": zone_names,
            "intensity": req.intensity,
            "scanner_used": zone_centers is not None,
            "size": {"w": w, "h": h},
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Simulation failed: {e}")
        raise HTTPException(500, detail=str(e))


@router.post("/compare")
async def simulate_compare(req: CompareRequest):
    """
    Generate before/after comparison image.
    Returns a single image with original and simulated side by side.
    """
    t0 = time.time()
    try:
        import cv2
        img = b64_to_cv2(req.photo_base64)
        h, w = img.shape[:2]

        # Get zone centers
        zone_centers = None
        try:
            from engines.landmark_engine import scan_face
            scan_result = scan_face(img)
            if scan_result:
                zone_centers = scan_result.get("zone_centers")
        except Exception:
            pass

        zones_list = [z.model_dump() for z in req.zones]
        simulated = simulate(img, zones=zones_list, zone_centers=zone_centers, intensity=req.intensity)

        # Create comparison image
        if req.layout == "vertical":
            # Stack vertically
            # Add labels
            before_labeled = _add_label(img, "ANTES", (10, 30))
            after_labeled = _add_label(simulated, "DEPOIS", (10, 30))
            comparison = cv2.vconcat([before_labeled, after_labeled])
        else:
            # Side by side (default)
            before_labeled = _add_label(img, "ANTES", (10, 30))
            after_labeled = _add_label(simulated, "DEPOIS", (10, 30))
            comparison = cv2.hconcat([before_labeled, after_labeled])

        b64_result = cv2_to_b64(comparison, ".png")
        elapsed = round(time.time() - t0, 2)

        ch, cw = comparison.shape[:2]

        return {
            "success": True,
            "image_b64": b64_result,
            "layout": req.layout,
            "comparison_size": {"w": cw, "h": ch},
            "zones_applied": len(req.zones),
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Comparison failed: {e}")
        raise HTTPException(500, detail=str(e))


def _add_label(img: np.ndarray, text: str, position: tuple) -> np.ndarray:
    """Add text label to image with background."""
    import cv2
    result = img.copy()

    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.8
    thickness = 2
    color = (255, 255, 255)
    bg_color = (30, 30, 30)

    (tw, th), baseline = cv2.getTextSize(text, font, font_scale, thickness)
    x, y = position

    # Background rectangle
    cv2.rectangle(result, (x - 5, y - th - 5), (x + tw + 5, y + baseline + 5), bg_color, -1)
    # Text
    cv2.putText(result, text, (x, y), font, font_scale, color, thickness)

    return result
