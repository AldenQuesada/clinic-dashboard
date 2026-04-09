"""
Hybrid Simulation Engine -- Orchestrator for Warp + Texture + Calibration.
Generates realistic DEPOIS photos from ANTES photos.

Pipeline:
1. Resize to working resolution (max 1500px)
2. Landmark detection -> zone_centers
3. Skin segmentation -> skin_mask
4. Load calibration profile (optional)
5. Layer 1: Warp Engine (geometric transformations)
6. Layer 2: Texture Engine (skin quality enhancement)
7. Final seamless blend on skin region
8. Resize back to original dimensions
9. Encode as base64 PNG
10. Return result dict
"""

import cv2
import numpy as np
import logging
import time
from typing import Dict, List, Optional

log = logging.getLogger("facial-api.hybrid-engine")

MAX_WORKING_RES = 1500


def simulate_hybrid(
    img_bgr: np.ndarray,
    zones: List[Dict],
    intensity: float = 0.7,
    profile_id: Optional[str] = None,
    use_warp: bool = True,
    use_texture: bool = True,
) -> Dict:
    """
    Full hybrid simulation: warp + texture + optional calibration.

    Args:
        img_bgr: Input BGR image (uint8).
        zones: List of {"zone": str, "severity": 0-3, "treatment": str}.
        intensity: Overall intensity 0.0-1.0.
        profile_id: Optional calibration profile ID to apply.
        use_warp: Whether to apply warp (Layer 1).
        use_texture: Whether to apply texture enhancement (Layer 2).

    Returns:
        Dict with success, image_b64, layers_applied, elapsed_s.
    """
    t0 = time.time()
    layers_applied = []

    try:
        h_orig, w_orig = img_bgr.shape[:2]

        # Step 1: Resize to working resolution
        t1 = time.time()
        working, scale_factor = _resize_to_working(img_bgr, MAX_WORKING_RES)
        h_w, w_w = working.shape[:2]
        log.info(f"Step 1 (resize) completed in {time.time() - t1:.2f}s | {w_orig}x{h_orig} -> {w_w}x{h_w}")

        # Step 2: Landmark detection
        t2 = time.time()
        zone_centers = _detect_zone_centers(working)
        log.info(f"Step 2 (landmarks) completed in {time.time() - t2:.2f}s | centers: {len(zone_centers)}")

        # Step 3: Skin segmentation
        t3 = time.time()
        skin_mask = _segment_skin(working)
        log.info(f"Step 3 (skin segmentation) completed in {time.time() - t3:.2f}s")

        # Step 4: Load calibration profile
        t4 = time.time()
        calibration = None
        warp_calibration = None
        texture_calibration = None
        if profile_id:
            calibration = _load_calibration(profile_id)
            if calibration:
                warp_calibration = calibration.get("warp_scale", {})
                texture_calibration = calibration.get("texture_scale", {})
                # Override intensity with profile's overall intensity if available
                profile_intensity = calibration.get("overall_intensity")
                if profile_intensity is not None:
                    intensity = float(profile_intensity)
                    log.info(f"Using calibration intensity: {intensity}")
        log.info(f"Step 4 (calibration) completed in {time.time() - t4:.2f}s | profile: {'loaded' if calibration else 'none'}")

        result = working.copy()

        # Step 5: Layer 1 -- Warp Engine
        if use_warp and zones:
            t5 = time.time()
            result = _apply_warp_layer(result, zones, zone_centers, intensity, warp_calibration)
            layers_applied.append("warp")
            log.info(f"Step 5 (warp) completed in {time.time() - t5:.2f}s")

        # Step 6: Layer 2 -- Texture Engine
        if use_texture:
            t6 = time.time()
            result = _apply_texture_layer(result, skin_mask, zone_centers, intensity, texture_calibration)
            layers_applied.append("texture")
            log.info(f"Step 6 (texture) completed in {time.time() - t6:.2f}s")

        # Step 7: Final seamless blend
        t7 = time.time()
        result = _final_blend(working, result, skin_mask)
        log.info(f"Step 7 (final blend) completed in {time.time() - t7:.2f}s")

        # Step 8: Resize back to original
        t8 = time.time()
        if scale_factor != 1.0:
            result = cv2.resize(result, (w_orig, h_orig), interpolation=cv2.INTER_LANCZOS4)
        log.info(f"Step 8 (resize back) completed in {time.time() - t8:.2f}s")

        # Step 9: Encode as base64 PNG
        t9 = time.time()
        from utils.image_helpers import cv2_to_b64
        image_b64 = cv2_to_b64(result, ".png")
        log.info(f"Step 9 (encode) completed in {time.time() - t9:.2f}s")

        elapsed = round(time.time() - t0, 2)
        log.info(
            f"Hybrid simulation total: {elapsed}s | "
            f"layers: {', '.join(layers_applied)} | "
            f"zones: {len(zones)} | intensity: {intensity} | "
            f"profile: {profile_id or 'none'}"
        )

        return {
            "success": True,
            "image_b64": image_b64,
            "layers_applied": layers_applied,
            "zones_count": len(zones),
            "intensity": intensity,
            "profile_id": profile_id,
            "size": {"w": w_orig, "h": h_orig},
            "elapsed_s": elapsed,
        }

    except Exception as e:
        elapsed = round(time.time() - t0, 2)
        log.error(f"Hybrid simulation failed after {elapsed}s: {e}")
        return {
            "success": False,
            "error": str(e),
            "layers_applied": layers_applied,
            "elapsed_s": elapsed,
        }


# -- Internal Pipeline Steps --

def _resize_to_working(
    img: np.ndarray,
    max_dim: int,
) -> tuple:
    """
    Resize image so that the largest dimension is at most max_dim.

    Args:
        img: Input BGR image.
        max_dim: Maximum working dimension.

    Returns:
        (resized_image, scale_factor).
    """
    h, w = img.shape[:2]
    largest = max(h, w)

    if largest <= max_dim:
        return img.copy(), 1.0

    scale = max_dim / largest
    new_w = int(w * scale)
    new_h = int(h * scale)
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    return resized, scale


def _detect_zone_centers(img_bgr: np.ndarray) -> Dict[str, Dict[str, float]]:
    """
    Detect zone centers using landmark engine, with fallback to warp engine estimation.

    Args:
        img_bgr: Working resolution BGR image.

    Returns:
        Dict of zone_name -> {"x": 0-1, "y": 0-1}.
    """
    try:
        from engines.landmark_engine import scan_face
        scan_result = scan_face(img_bgr)
        if scan_result and scan_result.get("zone_centers"):
            return scan_result["zone_centers"]
    except Exception as e:
        log.warning(f"Landmark-based zone detection failed: {e}")

    # Fallback: use warp engine's estimation
    try:
        from engines.warp_engine import _estimate_zone_centers
        return _estimate_zone_centers(img_bgr)
    except Exception as e:
        log.warning(f"Fallback zone estimation also failed: {e}")
        return {}


def _segment_skin(img_bgr: np.ndarray) -> np.ndarray:
    """
    Segment skin using face_parsing module.

    Args:
        img_bgr: Working resolution BGR image.

    Returns:
        Binary mask (uint8) where 255 = skin.
    """
    try:
        from utils.face_parsing import segment_skin
        return segment_skin(img_bgr)
    except Exception as e:
        log.warning(f"Skin segmentation failed: {e}, using full-image mask")
        h, w = img_bgr.shape[:2]
        return np.ones((h, w), dtype=np.uint8) * 255


def _load_calibration(profile_id: str) -> Optional[Dict]:
    """
    Load a calibration profile by ID.

    Args:
        profile_id: Profile UUID string.

    Returns:
        Profile dict or None if not found.
    """
    try:
        from engines.calibration_engine import load_profile
        return load_profile(profile_id)
    except FileNotFoundError:
        log.warning(f"Calibration profile not found: {profile_id}")
        return None
    except Exception as e:
        log.warning(f"Failed to load calibration profile {profile_id}: {e}")
        return None


def _apply_warp_layer(
    img: np.ndarray,
    zones: List[Dict],
    zone_centers: Dict,
    intensity: float,
    warp_calibration: Optional[Dict] = None,
) -> np.ndarray:
    """
    Apply Layer 1: geometric warp transformations.

    Args:
        img: Working resolution BGR image.
        zones: Zone list with severity and treatment.
        zone_centers: Zone center coordinates.
        intensity: Overall intensity.
        warp_calibration: Optional per-zone-group scale factors.

    Returns:
        Warped BGR image.
    """
    from engines.warp_engine import simulate as warp_simulate, ZONE_TRANSFORMS

    # If calibration provided, adjust intensity per zone
    if warp_calibration:
        adjusted_zones = []
        for z in zones:
            zone_name = z.get("zone", "")
            # Find matching warp group
            scale = 1.0
            for group, group_zones in {
                "temporal": ["temporal_esq", "temporal_dir"],
                "zigoma": ["zigoma_lat_esq", "zigoma_lat_dir", "zigoma_ant_esq", "zigoma_ant_dir"],
                "mandibula": ["mandibula_esq", "mandibula_dir"],
                "mento": ["mento"],
                "labio": ["labio"],
                "nariz": ["nariz"],
            }.items():
                if zone_name in group_zones:
                    scale = warp_calibration.get(group, 1.0)
                    break

            adjusted = dict(z)
            adjusted["severity"] = min(3, max(0, int(z.get("severity", 2) * scale)))
            adjusted_zones.append(adjusted)
        zones = adjusted_zones

    return warp_simulate(img, zones, zone_centers=zone_centers, intensity=intensity)


def _apply_texture_layer(
    img: np.ndarray,
    skin_mask: np.ndarray,
    zone_centers: Dict,
    intensity: float,
    texture_calibration: Optional[Dict] = None,
) -> np.ndarray:
    """
    Apply Layer 2: texture enhancement.

    Args:
        img: Working resolution BGR image (after warp).
        skin_mask: Binary skin mask.
        zone_centers: Zone center coordinates.
        intensity: Overall intensity.
        texture_calibration: Optional per-step scale factors.

    Returns:
        Texture-enhanced BGR image.
    """
    from engines.texture_engine import enhance_texture

    return enhance_texture(
        img,
        skin_mask=skin_mask,
        zone_centers=zone_centers,
        intensity=intensity,
        calibration=texture_calibration,
    )


def _final_blend(
    original: np.ndarray,
    enhanced: np.ndarray,
    skin_mask: np.ndarray,
) -> np.ndarray:
    """
    Final seamless blend: apply enhanced result only on skin regions,
    preserving non-skin areas (hair, eyes, background) perfectly.

    Uses cv2.seamlessClone when possible, falls back to alpha blend.

    Args:
        original: Original working-res image.
        enhanced: Enhanced working-res image.
        skin_mask: Binary skin mask.

    Returns:
        Final blended BGR image.
    """
    h, w = original.shape[:2]

    # Erode mask slightly to avoid edge artifacts
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    blend_mask = cv2.erode(skin_mask, kernel, iterations=1)

    # Smooth mask edges for natural transition
    blend_mask = cv2.GaussianBlur(blend_mask, (11, 11), 3)

    try:
        # Try seamlessClone for best results
        # Find center of mask for seamlessClone
        moments = cv2.moments(blend_mask)
        if moments["m00"] > 0:
            cx = int(moments["m10"] / moments["m00"])
            cy = int(moments["m01"] / moments["m00"])

            # seamlessClone needs binary mask
            _, clone_mask = cv2.threshold(blend_mask, 127, 255, cv2.THRESH_BINARY)

            # Ensure mask has enough pixels
            if np.sum(clone_mask > 0) > 100:
                result = cv2.seamlessClone(
                    enhanced, original, clone_mask,
                    (cx, cy), cv2.NORMAL_CLONE,
                )
                return result
    except Exception as e:
        log.warning(f"seamlessClone failed, using alpha blend: {e}")

    # Fallback: alpha blend with smooth mask
    mask_float = blend_mask.astype(np.float32) / 255.0
    mask_3ch = np.stack([mask_float] * 3, axis=-1)

    result = original.astype(np.float32) * (1 - mask_3ch) + enhanced.astype(np.float32) * mask_3ch
    return np.clip(result, 0, 255).astype(np.uint8)
