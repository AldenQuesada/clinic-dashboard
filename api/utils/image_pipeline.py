"""
ClinicAI — Image Enhancement Pipeline
Professional-grade photo enhancement for clinical facial analysis.

Pipeline stages:
1. Normalize: CLAHE + white balance + denoise (always available)
2. Super-Resolution: Real-ESRGAN 2x/4x upscale (optional model)
3. Face Restoration: GFPGAN/CodeFormer face-specific restore (optional model)
4. Post-process: subtle sharpening + final tone adjustment

All heavy models use lazy loading (first request loads, subsequent are instant).
Graceful fallback: if models unavailable, normalize-only still works.
"""

import cv2
import numpy as np
import logging
import os
import time
from typing import Optional, Dict

from utils.color_grading import normalize_image, sharpen_subtle, detect_lighting_quality

log = logging.getLogger("facial-api.pipeline")

# Lazy model references
_realesrgan_model = None
_gfpgan_model = None
_realesrgan_available = None
_gfpgan_available = None

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


def enhance_photo(
    img_bgr: np.ndarray,
    normalize: bool = True,
    super_res: bool = True,
    face_restore: bool = True,
    upscale_factor: int = 2,
    normalize_strength: float = 0.8,
) -> Dict:
    """
    Full enhancement pipeline.

    Args:
        img_bgr: Input BGR image
        normalize: Apply color normalization
        super_res: Apply super-resolution upscaling
        face_restore: Apply face-specific restoration
        upscale_factor: 2 or 4 for super-resolution
        normalize_strength: 0.0-1.0 normalization intensity

    Returns:
        Dict with enhanced image, stages applied, timing info
    """
    t0 = time.time()
    result = img_bgr.copy()
    stages = []

    # Analyze input quality
    quality_info = detect_lighting_quality(img_bgr)
    auto_strength = quality_info["recommended_strength"]
    effective_strength = max(normalize_strength, auto_strength)

    # Stage 1: Normalize
    if normalize:
        t1 = time.time()
        result = normalize_image(result, strength=effective_strength)
        stages.append({
            "name": "normalize",
            "applied": True,
            "strength": round(effective_strength, 2),
            "elapsed_ms": round((time.time() - t1) * 1000),
        })

    # Stage 2: Super-Resolution
    if super_res and _check_realesrgan():
        t2 = time.time()
        sr_result = _apply_realesrgan(result, upscale_factor)
        if sr_result is not None:
            result = sr_result
            stages.append({
                "name": "super_resolution",
                "applied": True,
                "factor": upscale_factor,
                "elapsed_ms": round((time.time() - t2) * 1000),
            })
        else:
            stages.append({"name": "super_resolution", "applied": False, "reason": "inference_failed"})
    elif super_res:
        stages.append({"name": "super_resolution", "applied": False, "reason": "model_not_available"})

    # Stage 3: Face Restoration
    if face_restore and _check_gfpgan():
        t3 = time.time()
        fr_result = _apply_gfpgan(result)
        if fr_result is not None:
            result = fr_result
            stages.append({
                "name": "face_restore",
                "applied": True,
                "elapsed_ms": round((time.time() - t3) * 1000),
            })
        else:
            stages.append({"name": "face_restore", "applied": False, "reason": "inference_failed"})
    elif face_restore:
        stages.append({"name": "face_restore", "applied": False, "reason": "model_not_available"})

    # Stage 4: Post-process (always)
    result = sharpen_subtle(result, amount=0.25)
    stages.append({"name": "post_process", "applied": True})

    total_elapsed = round((time.time() - t0) * 1000)
    h, w = result.shape[:2]

    return {
        "image": result,
        "stages": stages,
        "quality_input": quality_info,
        "output_size": {"w": w, "h": h},
        "total_elapsed_ms": total_elapsed,
    }


# ── Super-Resolution (Real-ESRGAN) ─────────────────────────

def _check_realesrgan() -> bool:
    """Check if Real-ESRGAN model is available."""
    global _realesrgan_available
    if _realesrgan_available is not None:
        return _realesrgan_available

    model_path = os.path.join(MODELS_DIR, "RealESRGAN_x2plus.pth")
    _realesrgan_available = os.path.exists(model_path)
    if not _realesrgan_available:
        # Also check for ONNX version
        model_path_onnx = os.path.join(MODELS_DIR, "realesrgan_x2plus.onnx")
        _realesrgan_available = os.path.exists(model_path_onnx)

    if _realesrgan_available:
        log.info("Real-ESRGAN model found")
    else:
        log.info("Real-ESRGAN model not found — super-resolution disabled")
    return _realesrgan_available


def _apply_realesrgan(img_bgr: np.ndarray, scale: int = 2) -> Optional[np.ndarray]:
    """Apply Real-ESRGAN super-resolution."""
    global _realesrgan_model

    try:
        # Try PyTorch version first
        pth_path = os.path.join(MODELS_DIR, "RealESRGAN_x2plus.pth")
        onnx_path = os.path.join(MODELS_DIR, "realesrgan_x2plus.onnx")

        if os.path.exists(pth_path):
            return _apply_realesrgan_torch(img_bgr, pth_path, scale)
        elif os.path.exists(onnx_path):
            return _apply_realesrgan_onnx(img_bgr, onnx_path, scale)
        else:
            return None
    except Exception as e:
        log.error(f"Real-ESRGAN failed: {e}")
        return None


def _apply_realesrgan_torch(img_bgr: np.ndarray, model_path: str, scale: int) -> Optional[np.ndarray]:
    """Real-ESRGAN via basicsr/realesrgan library."""
    try:
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer

        global _realesrgan_model
        if _realesrgan_model is None:
            model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=scale)
            _realesrgan_model = RealESRGANer(
                scale=scale,
                model_path=model_path,
                model=model,
                tile=400,  # tile processing to save VRAM
                tile_pad=10,
                pre_pad=0,
                half=False,  # CPU mode
            )
            log.info("Real-ESRGAN model loaded (PyTorch)")

        output, _ = _realesrgan_model.enhance(img_bgr, outscale=scale)
        return output

    except ImportError:
        log.warning("realesrgan/basicsr not installed, trying ONNX fallback")
        onnx_path = os.path.join(MODELS_DIR, "realesrgan_x2plus.onnx")
        if os.path.exists(onnx_path):
            return _apply_realesrgan_onnx(img_bgr, onnx_path, scale)
        return None


def _apply_realesrgan_onnx(img_bgr: np.ndarray, model_path: str, scale: int) -> Optional[np.ndarray]:
    """Real-ESRGAN via ONNX Runtime (no PyTorch dependency)."""
    try:
        import onnxruntime as ort

        global _realesrgan_model
        if _realesrgan_model is None or not isinstance(_realesrgan_model, ort.InferenceSession):
            _realesrgan_model = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
            log.info("Real-ESRGAN model loaded (ONNX)")

        h, w = img_bgr.shape[:2]

        # Limit input size to prevent OOM (max 1024px on longest side)
        max_dim = 1024
        if max(h, w) > max_dim:
            ratio = max_dim / max(h, w)
            img_input = cv2.resize(img_bgr, (int(w * ratio), int(h * ratio)), interpolation=cv2.INTER_AREA)
        else:
            img_input = img_bgr

        # Preprocess: BGR to RGB, HWC to CHW, normalize to [0,1]
        img_rgb = cv2.cvtColor(img_input, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        img_chw = np.transpose(img_rgb, (2, 0, 1))
        img_batch = np.expand_dims(img_chw, axis=0)

        # Inference
        input_name = _realesrgan_model.get_inputs()[0].name
        result = _realesrgan_model.run(None, {input_name: img_batch})[0]

        # Post-process: CHW to HWC, clip, uint8, RGB to BGR
        output = np.squeeze(result, axis=0)
        output = np.transpose(output, (1, 2, 0))
        output = np.clip(output * 255.0, 0, 255).astype(np.uint8)
        output = cv2.cvtColor(output, cv2.COLOR_RGB2BGR)

        return output

    except Exception as e:
        log.error(f"Real-ESRGAN ONNX failed: {e}")
        return None


# ── Face Restoration (GFPGAN) ──────────────────────────────

def _check_gfpgan() -> bool:
    """Check if GFPGAN model is available."""
    global _gfpgan_available
    if _gfpgan_available is not None:
        return _gfpgan_available

    model_path = os.path.join(MODELS_DIR, "GFPGANv1.4.pth")
    _gfpgan_available = os.path.exists(model_path)
    if not _gfpgan_available:
        model_path_onnx = os.path.join(MODELS_DIR, "gfpgan_v1.4.onnx")
        _gfpgan_available = os.path.exists(model_path_onnx)

    if _gfpgan_available:
        log.info("GFPGAN model found")
    else:
        log.info("GFPGAN model not found — face restoration disabled")
    return _gfpgan_available


def _apply_gfpgan(img_bgr: np.ndarray) -> Optional[np.ndarray]:
    """Apply GFPGAN face restoration."""
    global _gfpgan_model

    try:
        pth_path = os.path.join(MODELS_DIR, "GFPGANv1.4.pth")
        onnx_path = os.path.join(MODELS_DIR, "gfpgan_v1.4.onnx")

        if os.path.exists(pth_path):
            return _apply_gfpgan_torch(img_bgr, pth_path)
        elif os.path.exists(onnx_path):
            return _apply_gfpgan_onnx(img_bgr, onnx_path)
        else:
            return None
    except Exception as e:
        log.error(f"GFPGAN failed: {e}")
        return None


def _apply_gfpgan_torch(img_bgr: np.ndarray, model_path: str) -> Optional[np.ndarray]:
    """GFPGAN via gfpgan library (PyTorch)."""
    try:
        from gfpgan import GFPGANer

        global _gfpgan_model
        if _gfpgan_model is None:
            _gfpgan_model = GFPGANer(
                model_path=model_path,
                upscale=1,  # no upscale (we handle that separately)
                arch='clean',
                channel_multiplier=2,
            )
            log.info("GFPGAN model loaded (PyTorch)")

        _, _, output = _gfpgan_model.enhance(
            img_bgr,
            has_aligned=False,
            only_center_face=True,
            paste_back=True,
        )
        return output

    except ImportError:
        log.warning("gfpgan not installed, trying ONNX fallback")
        onnx_path = os.path.join(MODELS_DIR, "gfpgan_v1.4.onnx")
        if os.path.exists(onnx_path):
            return _apply_gfpgan_onnx(img_bgr, onnx_path)
        return None


def _apply_gfpgan_onnx(img_bgr: np.ndarray, model_path: str) -> Optional[np.ndarray]:
    """GFPGAN via ONNX Runtime."""
    try:
        import onnxruntime as ort

        global _gfpgan_model
        if _gfpgan_model is None or not isinstance(_gfpgan_model, ort.InferenceSession):
            _gfpgan_model = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
            log.info("GFPGAN model loaded (ONNX)")

        h, w = img_bgr.shape[:2]

        # GFPGAN expects 512x512 face crops
        img_resized = cv2.resize(img_bgr, (512, 512), interpolation=cv2.INTER_LINEAR)
        img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

        # Normalize
        mean = np.array([0.5, 0.5, 0.5], dtype=np.float32)
        std = np.array([0.5, 0.5, 0.5], dtype=np.float32)
        img_norm = (img_rgb - mean) / std

        img_chw = np.transpose(img_norm, (2, 0, 1))
        img_batch = np.expand_dims(img_chw, axis=0)

        input_name = _gfpgan_model.get_inputs()[0].name
        result = _gfpgan_model.run(None, {input_name: img_batch})[0]

        # Post-process
        output = np.squeeze(result, axis=0)
        output = np.transpose(output, (1, 2, 0))
        output = (output * 0.5 + 0.5) * 255.0  # denormalize
        output = np.clip(output, 0, 255).astype(np.uint8)
        output = cv2.cvtColor(output, cv2.COLOR_RGB2BGR)

        # Resize back to original
        output = cv2.resize(output, (w, h), interpolation=cv2.INTER_LANCZOS4)

        return output

    except Exception as e:
        log.error(f"GFPGAN ONNX failed: {e}")
        return None


# ── OpenCV-only Enhancement (no models needed) ─────────────

def enhance_opencv_only(
    img_bgr: np.ndarray,
    strength: float = 0.8,
) -> np.ndarray:
    """
    High-quality enhancement using ONLY OpenCV (no deep learning models).
    Always available, zero model downloads.

    Pipeline:
    1. Bilateral filter (edge-preserving smoothing)
    2. CLAHE (adaptive contrast)
    3. White balance
    4. Exposure normalization
    5. Subtle sharpening
    """
    result = img_bgr.copy()

    # Bilateral filter: smooths skin while preserving edges (pores, wrinkles)
    # This is better than gaussian blur for face photos
    d = 9
    sigma_color = 75 * strength
    sigma_space = 75 * strength
    result = cv2.bilateralFilter(result, d, sigma_color, sigma_space)

    # Apply full normalization
    result = normalize_image(result, strength=strength)

    # Extra sharpening to restore detail lost by bilateral
    result = sharpen_subtle(result, amount=0.35)

    return result


def get_enhancement_capabilities() -> Dict:
    """Return what enhancement capabilities are available."""
    return {
        "normalize": {
            "available": True,
            "description": "CLAHE + white balance + denoising (always available)",
        },
        "super_resolution": {
            "available": _check_realesrgan(),
            "description": "Real-ESRGAN 2x/4x upscale",
            "model": "RealESRGAN_x2plus",
        },
        "face_restore": {
            "available": _check_gfpgan(),
            "description": "GFPGAN face-specific restoration",
            "model": "GFPGANv1.4",
        },
        "opencv_enhance": {
            "available": True,
            "description": "Bilateral filter + CLAHE + sharpening (always available)",
        },
    }
