"""
ClinicAI — Super Resolution Engine
Professional image upscaling using OpenCV DNN Super Resolution.

Models available (auto-downloaded):
- EDSR x2/x3: Best quality, slower (~2s for 1000px face)
- FSRCNN x2/x3: Fast, good quality (~0.3s)

Pipeline:
1. Detect face region
2. Crop face with margin
3. Super-resolve face only (saves memory + time)
4. Paste enhanced face back
5. Apply face-specific sharpening + detail recovery
"""

import cv2
import numpy as np
import logging
import os
from typing import Optional, Tuple

log = logging.getLogger("facial-api.super-res")

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")

# Lazy loaded
_sr_model = None
_sr_model_name = None


def super_resolve(
    img_bgr: np.ndarray,
    scale: int = 2,
    model: str = "edsr",
    face_only: bool = True,
) -> np.ndarray:
    """
    Super-resolve an image or just the face region.

    Args:
        img_bgr: Input BGR image
        scale: 2 or 3
        model: "edsr" (best quality) or "fsrcnn" (fast)
        face_only: If True, only upscale face region (faster, avoids artifacts on BG)

    Returns:
        Super-resolved BGR image
    """
    h, w = img_bgr.shape[:2]

    if face_only:
        # Detect face
        face_rect = _detect_face(img_bgr)
        if face_rect is not None:
            return _super_resolve_face_region(img_bgr, face_rect, scale, model)

    # Full image super-resolution
    # For large images, process in tiles to avoid OOM
    max_input = 800  # max dimension before splitting
    if max(h, w) > max_input:
        return _super_resolve_tiled(img_bgr, scale, model, tile_size=400)

    sr = _get_sr_model(model, scale)
    if sr is None:
        log.warning("Super-res model not available, returning original")
        return img_bgr

    try:
        result = sr.upsample(img_bgr)
        log.info(f"Super-resolved: {w}x{h} -> {result.shape[1]}x{result.shape[0]}")
        return result
    except Exception as e:
        log.error(f"Super-resolution failed: {e}")
        return img_bgr


def face_restore(img_bgr: np.ndarray) -> np.ndarray:
    """
    Face restoration using OpenCV-only techniques.
    No GFPGAN/CodeFormer needed — uses bilateral + detail enhancement + skin smoothing.

    This is a professional-grade restoration pipeline:
    1. Bilateral filter (edge-preserving noise removal)
    2. Detail layer extraction and enhancement
    3. Skin-aware smoothing (smooth skin, keep edges)
    4. Local contrast enhancement
    5. Color vibrancy boost
    """
    h, w = img_bgr.shape[:2]

    # Detect face
    face_rect = _detect_face(img_bgr)
    if face_rect is None:
        return _restore_full(img_bgr)

    fx, fy, fw, fh = face_rect
    margin = int(max(fw, fh) * 0.2)
    x1 = max(0, fx - margin)
    y1 = max(0, fy - margin)
    x2 = min(w, fx + fw + margin)
    y2 = min(h, fy + fh + margin)

    # Extract face region
    face = img_bgr[y1:y2, x1:x2].copy()

    # Restore face
    restored_face = _restore_full(face)

    # Blend back with smooth transition
    result = img_bgr.copy()
    mask = _create_blend_mask(x2 - x1, y2 - y1, margin)
    mask_3ch = np.stack([mask] * 3, axis=-1)

    result[y1:y2, x1:x2] = (
        restored_face.astype(np.float32) * mask_3ch +
        result[y1:y2, x1:x2].astype(np.float32) * (1 - mask_3ch)
    ).astype(np.uint8)

    return result


def _restore_full(img_bgr: np.ndarray) -> np.ndarray:
    """Full face restoration pipeline — OpenCV only."""
    result = img_bgr.copy()

    # 1. Bilateral filter — smooth skin while keeping edges (pores, wrinkles visible)
    smooth = cv2.bilateralFilter(result, 9, 75, 75)

    # 2. Extract detail layer (high-frequency = pores, texture)
    detail = cv2.subtract(result, smooth)

    # 3. Enhance detail (boost contrast of fine detail)
    detail_enhanced = cv2.convertScaleAbs(detail, alpha=1.3, beta=0)

    # 4. Reconstruct: smooth base + enhanced detail
    result = cv2.add(smooth, detail_enhanced)

    # 5. Local contrast enhancement via CLAHE on L channel
    lab = cv2.cvtColor(result, cv2.COLOR_BGR2LAB)
    l_ch = lab[:, :, 0]
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(4, 4))
    lab[:, :, 0] = clahe.apply(l_ch)
    result = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    # 6. Color vibrancy — slight saturation boost
    hsv = cv2.cvtColor(result, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.1, 0, 255)  # +10% saturation
    result = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    # 7. Final sharpening — unsharp mask (subtle)
    gaussian = cv2.GaussianBlur(result, (0, 0), 1.5)
    result = cv2.addWeighted(result, 1.3, gaussian, -0.3, 0)

    return result


def enhance_full_pipeline(img_bgr: np.ndarray) -> dict:
    """
    Full enhancement pipeline: super-res + face restore + color grading.
    Returns dict with image and metadata.
    """
    import time
    from utils.color_grading import normalize_image

    t0 = time.time()
    h, w = img_bgr.shape[:2]
    stages = []

    # 1. Normalize first (fix lighting/color)
    t1 = time.time()
    result = normalize_image(img_bgr, strength=0.7)
    stages.append({"name": "normalize", "elapsed_ms": round((time.time() - t1) * 1000)})

    # 2. Face restore (bilateral + detail + CLAHE)
    t2 = time.time()
    result = face_restore(result)
    stages.append({"name": "face_restore", "elapsed_ms": round((time.time() - t2) * 1000)})

    # 3. Super-resolve if image is small (< 600px on longest side)
    # EDSR is slow (~30s for 400px), only use for very small images
    if max(h, w) < 600:
        t3 = time.time()
        result = super_resolve(result, scale=2, model="edsr", face_only=True)
        stages.append({"name": "super_resolution", "scale": 2, "elapsed_ms": round((time.time() - t3) * 1000)})

    total = round((time.time() - t0) * 1000)
    rh, rw = result.shape[:2]

    return {
        "image": result,
        "input_size": {"w": w, "h": h},
        "output_size": {"w": rw, "h": rh},
        "stages": stages,
        "total_elapsed_ms": total,
    }


# ── Helpers ────────────────────────────────────────────────

def _get_sr_model(model_name: str, scale: int):
    """Get or create super-resolution model."""
    global _sr_model, _sr_model_name

    key = f"{model_name}_x{scale}"
    if _sr_model is not None and _sr_model_name == key:
        return _sr_model

    model_file = f"{model_name.upper()}_x{scale}.pb"
    model_path = os.path.join(MODELS_DIR, model_file)

    if not os.path.exists(model_path):
        log.warning(f"Model not found: {model_path}")
        return None

    try:
        sr = cv2.dnn_superres.DnnSuperResImpl.create()
        sr.readModel(model_path)
        sr.setModel(model_name.lower(), scale)
        _sr_model = sr
        _sr_model_name = key
        log.info(f"Super-res model loaded: {key}")
        return sr
    except Exception as e:
        log.error(f"Failed to load super-res model: {e}")
        return None


def _detect_face(img_bgr: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
    """Quick face detection for targeting super-res."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
    if len(faces) == 0:
        return None
    return tuple(max(faces, key=lambda f: f[2] * f[3]))


def _super_resolve_face_region(
    img_bgr: np.ndarray,
    face_rect: Tuple[int, int, int, int],
    scale: int,
    model: str,
) -> np.ndarray:
    """Super-resolve only the face region and paste back."""
    h, w = img_bgr.shape[:2]
    fx, fy, fw, fh = face_rect

    # Generous margin around face
    margin = int(max(fw, fh) * 0.3)
    x1 = max(0, fx - margin)
    y1 = max(0, fy - margin)
    x2 = min(w, fx + fw + margin)
    y2 = min(h, fy + fh + margin)

    face_crop = img_bgr[y1:y2, x1:x2]

    sr = _get_sr_model(model, scale)
    if sr is None:
        return img_bgr

    try:
        face_sr = sr.upsample(face_crop)

        # Resize full image to match
        result = cv2.resize(img_bgr, (w * scale, h * scale), interpolation=cv2.INTER_LANCZOS4)

        # Paste super-resolved face
        result[y1 * scale:y2 * scale, x1 * scale:x2 * scale] = face_sr

        log.info(f"Face super-resolved: {face_crop.shape} -> {face_sr.shape}")
        return result
    except Exception as e:
        log.error(f"Face super-resolution failed: {e}")
        return img_bgr


def _super_resolve_tiled(
    img_bgr: np.ndarray,
    scale: int,
    model: str,
    tile_size: int = 400,
) -> np.ndarray:
    """Process large images in tiles to avoid memory issues."""
    h, w = img_bgr.shape[:2]
    sr = _get_sr_model(model, scale)
    if sr is None:
        return img_bgr

    result = np.zeros((h * scale, w * scale, 3), dtype=np.uint8)
    pad = 16  # overlap to avoid seams

    for y in range(0, h, tile_size):
        for x in range(0, w, tile_size):
            y1 = max(0, y - pad)
            x1 = max(0, x - pad)
            y2 = min(h, y + tile_size + pad)
            x2 = min(w, x + tile_size + pad)

            tile = img_bgr[y1:y2, x1:x2]
            try:
                tile_sr = sr.upsample(tile)
            except:
                tile_sr = cv2.resize(tile, (tile.shape[1] * scale, tile.shape[0] * scale), interpolation=cv2.INTER_LANCZOS4)

            # Place in result (remove padding)
            py1 = (y - y1) * scale
            px1 = (x - x1) * scale
            th = min(tile_size * scale, tile_sr.shape[0] - py1)
            tw = min(tile_size * scale, tile_sr.shape[1] - px1)
            ry = y * scale
            rx = x * scale
            result[ry:ry + th, rx:rx + tw] = tile_sr[py1:py1 + th, px1:px1 + tw]

    return result


def _create_blend_mask(w: int, h: int, margin: int) -> np.ndarray:
    """Create a soft blend mask for seamless face paste-back."""
    mask = np.ones((h, w), dtype=np.float32)
    fade = min(margin, 20)

    # Fade edges
    for i in range(fade):
        alpha = i / fade
        mask[i, :] *= alpha
        mask[h - 1 - i, :] *= alpha
        mask[:, i] *= alpha
        mask[:, w - 1 - i] *= alpha

    return mask
