"""
ClinicAI — Enhancement Router
Endpoints for image normalization, enhancement, and skin segmentation.

Endpoints:
  POST /enhance/normalize    — Color correction + CLAHE + denoise
  POST /enhance/full         — Full pipeline (normalize + super-res + face restore)
  POST /enhance/segment-skin — Skin mask segmentation
  POST /enhance/quality      — Analyze photo lighting quality
  GET  /enhance/capabilities — What enhancement models are available
"""

import time
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from utils.image_helpers import b64_to_cv2, cv2_to_b64
from utils.color_grading import normalize_image, detect_lighting_quality
from utils.image_pipeline import enhance_photo, enhance_opencv_only, get_enhancement_capabilities
from utils.face_parsing import segment_skin, get_skin_region_stats
from utils.super_resolution import enhance_full_pipeline, super_resolve, face_restore

log = logging.getLogger("facial-api.enhance")
router = APIRouter(prefix="/enhance", tags=["Enhancement"])


# ── Request Models ──────────────────────────────────────────

class NormalizeRequest(BaseModel):
    photo_base64: str
    strength: float = Field(default=0.8, ge=0.0, le=1.0, description="Normalization intensity")

class EnhanceRequest(BaseModel):
    photo_base64: str
    normalize: bool = True
    super_resolution: bool = True
    face_restore: bool = True
    upscale_factor: int = Field(default=2, ge=1, le=4)
    normalize_strength: float = Field(default=0.8, ge=0.0, le=1.0)

class SegmentRequest(BaseModel):
    photo_base64: str
    strategy: str = Field(default="auto", description="auto, bisenet, mediapipe, color")
    return_stats: bool = Field(default=True, description="Include skin region statistics")

class QualityRequest(BaseModel):
    photo_base64: str


# ── Endpoints ───────────────────────────────────────────────

@router.post("/normalize")
async def normalize_photo(req: NormalizeRequest):
    """
    Normalize photo: CLAHE + white balance + denoising.
    Always available, no model downloads needed.
    Fast (~200ms for 2000x3000 photo).
    """
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        h, w = img.shape[:2]

        # Get input quality
        quality_before = detect_lighting_quality(img)

        # Apply normalization
        result = normalize_image(img, strength=req.strength)

        # Get output quality
        quality_after = detect_lighting_quality(result)

        b64_result = cv2_to_b64(result, ".png")
        elapsed = round(time.time() - t0, 2)

        log.info(
            f"Normalized in {elapsed}s | {w}x{h} | "
            f"quality: {quality_before['quality_score']} → {quality_after['quality_score']}"
        )

        return {
            "success": True,
            "image_b64": b64_result,
            "quality_before": quality_before,
            "quality_after": quality_after,
            "size": {"w": w, "h": h},
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Normalization failed: {e}")
        raise HTTPException(500, detail=str(e))


@router.post("/full")
async def full_enhance(req: EnhanceRequest):
    """
    Full enhancement pipeline: normalize + super-resolution + face restoration.
    Graceful degradation: if models unavailable, applies what it can.
    """
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        h_in, w_in = img.shape[:2]

        result = enhance_photo(
            img,
            normalize=req.normalize,
            super_res=req.super_resolution,
            face_restore=req.face_restore,
            upscale_factor=req.upscale_factor,
            normalize_strength=req.normalize_strength,
        )

        enhanced_img = result["image"]
        h_out, w_out = enhanced_img.shape[:2]
        b64_result = cv2_to_b64(enhanced_img, ".png")

        elapsed = round(time.time() - t0, 2)
        stages_applied = [s["name"] for s in result["stages"] if s.get("applied")]

        log.info(
            f"Enhanced in {elapsed}s | {w_in}x{h_in} → {w_out}x{h_out} | "
            f"stages: {', '.join(stages_applied)}"
        )

        return {
            "success": True,
            "image_b64": b64_result,
            "input_size": {"w": w_in, "h": h_in},
            "output_size": {"w": w_out, "h": h_out},
            "stages": result["stages"],
            "quality_input": result["quality_input"],
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Enhancement failed: {e}")
        raise HTTPException(500, detail=str(e))


@router.post("/segment-skin")
async def segment_skin_endpoint(req: SegmentRequest):
    """
    Segment skin from face photo. Returns binary mask (base64 PNG).

    Strategies:
    - auto: best available (BiSeNet > color-space)
    - bisenet: 19-class face parsing model
    - color: YCrCb+HSV dual thresholding (always available)
    """
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        h, w = img.shape[:2]

        # Detect face for color-space fallback
        face_cascade = __import__("cv2").CascadeClassifier(
            __import__("cv2").data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        gray = __import__("cv2").cvtColor(img, __import__("cv2").COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
        face_rect = tuple(max(faces, key=lambda f: f[2] * f[3])) if len(faces) > 0 else None

        # Segment
        mask = segment_skin(img, face_rect=face_rect, strategy=req.strategy)
        mask_b64 = cv2_to_b64(mask, ".png")

        # Strategy actually used
        strategy_used = req.strategy
        if req.strategy == "auto":
            strategy_used = "bisenet" if __import__("utils.face_parsing", fromlist=["_check_bisenet_available"])._check_bisenet_available() else "color"

        result = {
            "success": True,
            "mask_b64": mask_b64,
            "strategy": strategy_used,
            "size": {"w": w, "h": h},
            "face_detected": face_rect is not None,
        }

        if req.return_stats:
            stats = get_skin_region_stats(img, mask)
            result["skin_stats"] = stats

        elapsed = round(time.time() - t0, 2)
        result["elapsed_s"] = elapsed

        coverage = result.get("skin_stats", {}).get("coverage", 0)
        log.info(f"Skin segmented in {elapsed}s | {w}x{h} | strategy={strategy_used} | coverage={coverage}")

        return result
    except Exception as e:
        log.error(f"Skin segmentation failed: {e}")
        raise HTTPException(500, detail=str(e))


class PremiumRequest(BaseModel):
    photo_base64: str


@router.post("/premium")
async def premium_enhance(req: PremiumRequest):
    """
    Premium enhancement: normalize + face restore + super-resolution.
    Best possible quality — uses EDSR super-res + bilateral detail recovery.
    """
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        h, w = img.shape[:2]

        result = enhance_full_pipeline(img)
        enhanced = result["image"]
        rh, rw = enhanced.shape[:2]

        b64_result = cv2_to_b64(enhanced, ".png")
        elapsed = round(time.time() - t0, 2)

        log.info(
            f"Premium enhance in {elapsed}s | {w}x{h} -> {rw}x{rh} | "
            f"stages: {[s['name'] for s in result['stages']]}"
        )

        return {
            "success": True,
            "image_b64": b64_result,
            "input_size": result["input_size"],
            "output_size": result["output_size"],
            "stages": result["stages"],
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Premium enhance failed: {e}")
        raise HTTPException(500, detail=str(e))


@router.post("/quality")
async def analyze_quality(req: QualityRequest):
    """Analyze photo lighting/color quality and return recommendations."""
    t0 = time.time()
    try:
        img = b64_to_cv2(req.photo_base64)
        h, w = img.shape[:2]

        quality = detect_lighting_quality(img)
        elapsed = round(time.time() - t0, 2)

        quality["size"] = {"w": w, "h": h}
        quality["elapsed_s"] = elapsed
        quality["success"] = True

        # Human-readable recommendations
        recommendations = []
        if quality["brightness"] < 100:
            recommendations.append("Foto escura — normalizacao vai corrigir exposicao")
        elif quality["brightness"] > 190:
            recommendations.append("Foto superexposta — normalizacao vai equilibrar")
        if quality["color_cast"]["description"] != "neutro":
            recommendations.append(f"Color cast {quality['color_cast']['description']} detectado — white balance vai corrigir")
        if quality["evenness"] < 0.85:
            recommendations.append("Iluminacao desigual — CLAHE vai equalizar")
        if quality["shadow_ratio"] > 0.2:
            recommendations.append("Sombras fortes — denoise + CLAHE vao melhorar")

        quality["recommendations"] = recommendations

        log.info(f"Quality analyzed in {elapsed}s | score={quality['quality_score']}")

        return quality
    except Exception as e:
        log.error(f"Quality analysis failed: {e}")
        raise HTTPException(500, detail=str(e))


@router.get("/capabilities")
async def capabilities():
    """Return available enhancement capabilities and model status."""
    caps = get_enhancement_capabilities()
    caps["success"] = True
    return caps
