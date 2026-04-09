"""
Texture Enhancement Engine -- Layer 2 of Hybrid Simulation
Per-zone skin quality improvements using OpenCV only.

Pipeline:
1. Dark Circle Reduction (olheira zones)
2. Wrinkle Reduction (sulco, marionete, frontal, glabela zones)
3. Pore Refinement (global skin)
4. Skin Smoothing (global skin)
5. Color Correction (LAB glow + warmth)
6. Expression Guard (SSIM > 0.92)
"""

import cv2
import numpy as np
import logging
import time
from typing import Dict, List, Optional, Tuple

log = logging.getLogger("facial-api.texture-engine")


# -- Clinical Limits (hard-coded, never exceeded) --

CLINICAL_LIMITS = {
    "sulco_reduction": 0.40,
    "olheira_lighten": 0.30,
    "texture_preserve": 0.80,
    "lip_volume": 0.10,
    "color_shift_dL": 5,
    "color_shift_da": 3,
    "ssim_min": 0.92,
}

# Zones that receive each treatment step
OLHEIRA_ZONES = {"olheira_esq", "olheira_dir"}
WRINKLE_ZONES = {
    "sulco_esq", "sulco_dir",
    "marionete_esq", "marionete_dir",
    "testa", "glabela",
    "pes_galinha_esq", "pes_galinha_dir",
}


def enhance_texture(
    img_bgr: np.ndarray,
    skin_mask: np.ndarray,
    zone_centers: Dict[str, Dict[str, float]],
    intensity: float = 0.7,
    calibration: Optional[Dict[str, float]] = None,
) -> np.ndarray:
    """
    Per-zone texture enhancement pipeline.

    Args:
        img_bgr: Input BGR image (uint8).
        skin_mask: Binary mask where 255 = skin.
        zone_centers: Dict of zone_name -> {"x": 0-1, "y": 0-1}.
        intensity: Overall intensity 0.0-1.0.
        calibration: Optional dict of step_name -> scale factor from calibration profile.

    Returns:
        Enhanced BGR image (uint8), same dimensions as input.
    """
    t0 = time.time()
    h, w = img_bgr.shape[:2]
    result = img_bgr.copy()

    # Ensure mask matches image dimensions
    if skin_mask.shape[:2] != (h, w):
        skin_mask = cv2.resize(skin_mask, (w, h), interpolation=cv2.INTER_NEAREST)

    def _scale(step_name: str, base: float) -> float:
        """Apply calibration scaling to a base value."""
        if calibration is not None:
            return base * calibration.get(step_name, 1.0)
        return base

    # -- Step 1: Dark Circle Reduction --
    t1 = time.time()
    for zone_name in OLHEIRA_ZONES:
        center = zone_centers.get(zone_name)
        if center is None:
            continue
        eff = _scale("dark_circles", intensity * CLINICAL_LIMITS["olheira_lighten"])
        result = _reduce_dark_circles(result, center, w, h, eff, skin_mask)
    log.info(f"Step 1 (dark circles) completed in {time.time() - t1:.2f}s")

    # -- Step 2: Wrinkle Reduction --
    t2 = time.time()
    for zone_name in WRINKLE_ZONES:
        center = zone_centers.get(zone_name)
        if center is None:
            continue
        eff = _scale("wrinkles", intensity * CLINICAL_LIMITS["sulco_reduction"])
        result = _reduce_wrinkles(result, center, w, h, eff, skin_mask)
    log.info(f"Step 2 (wrinkle reduction) completed in {time.time() - t2:.2f}s")

    # -- Step 3: Pore Refinement --
    t3 = time.time()
    eff_pore = _scale("pores", intensity * 0.20)
    result = _refine_pores(result, skin_mask, eff_pore)
    log.info(f"Step 3 (pore refinement) completed in {time.time() - t3:.2f}s")

    # -- Step 4: Skin Smoothing --
    t4 = time.time()
    eff_smooth = _scale("smoothing", intensity)
    result = _smooth_skin(result, skin_mask, eff_smooth)
    log.info(f"Step 4 (skin smoothing) completed in {time.time() - t4:.2f}s")

    # -- Step 5: Color Correction --
    t5 = time.time()
    eff_color = _scale("color", intensity)
    result = _correct_color(result, skin_mask, eff_color)
    log.info(f"Step 5 (color correction) completed in {time.time() - t5:.2f}s")

    # -- Step 6: Expression Guard --
    t6 = time.time()
    result = _expression_guard(img_bgr, result, CLINICAL_LIMITS["ssim_min"])
    log.info(f"Step 6 (expression guard) completed in {time.time() - t6:.2f}s")

    log.info(f"Texture enhancement total: {time.time() - t0:.2f}s")
    return result


# -- Step Implementations --

def _extract_roi(
    img: np.ndarray,
    center: Dict[str, float],
    w: int, h: int,
    radius_frac: float = 0.06,
) -> Tuple[int, int, int, int, Optional[np.ndarray]]:
    """
    Extract ROI coordinates and Gaussian falloff mask around a zone center.

    Args:
        img: Source image.
        center: {"x": 0-1, "y": 0-1} normalized center.
        w: Image width.
        h: Image height.
        radius_frac: Radius as fraction of min(w, h).

    Returns:
        (x1, y1, x2, y2, falloff_3ch) or (0,0,0,0, None) if ROI is too small.
    """
    cx = int(center["x"] * w)
    cy = int(center["y"] * h)
    radius = int(min(w, h) * radius_frac)

    x1 = max(0, cx - radius)
    y1 = max(0, cy - radius)
    x2 = min(w, cx + radius)
    y2 = min(h, cy + radius)

    if x2 - x1 < 5 or y2 - y1 < 5:
        return 0, 0, 0, 0, None

    rh, rw = y2 - y1, x2 - x1
    y_coords, x_coords = np.mgrid[0:rh, 0:rw]
    cx_local = cx - x1
    cy_local = cy - y1
    dist = np.sqrt((x_coords - cx_local) ** 2 + (y_coords - cy_local) ** 2).astype(np.float32)
    falloff = np.exp(-dist ** 2 / (2 * (radius * 0.5) ** 2))
    falloff = np.clip(falloff, 0, 1)
    falloff_3ch = np.stack([falloff] * 3, axis=-1)

    return x1, y1, x2, y2, falloff_3ch


def _reduce_dark_circles(
    img: np.ndarray,
    center: Dict[str, float],
    w: int, h: int,
    strength: float,
    skin_mask: np.ndarray,
) -> np.ndarray:
    """
    Dark circle reduction: brighten L channel, reduce purple b*, bilateral smooth.

    Args:
        img: BGR image (uint8).
        center: Zone center (normalized).
        w: Image width.
        h: Image height.
        strength: Effective intensity (already scaled).
        skin_mask: Binary skin mask.

    Returns:
        Modified BGR image.
    """
    if strength < 0.01:
        return img

    x1, y1, x2, y2, falloff_3ch = _extract_roi(img, center, w, h, radius_frac=0.04)
    if falloff_3ch is None:
        return img

    roi = img[y1:y2, x1:x2].copy()
    roi_mask = skin_mask[y1:y2, x1:x2]

    # Convert ROI to LAB
    lab = cv2.cvtColor(roi, cv2.COLOR_BGR2LAB).astype(np.float32)

    # Increase L by 30% * strength (brightness)
    lighten = 30.0 * strength
    lab[:, :, 0] = np.clip(lab[:, :, 0] + lighten, 0, 255)

    # Reduce negative b* (purple/blue tint) -- b* < 128 means blue
    b_ch = lab[:, :, 2]
    purple_mask = b_ch < 128
    b_ch[purple_mask] = np.clip(b_ch[purple_mask] + lighten * 0.5, 0, 255)

    corrected = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

    # Bilateral filter for smooth blending
    corrected = cv2.bilateralFilter(corrected, 5, 40, 40)

    # Blend with Gaussian falloff, only on skin
    mask_3ch = np.stack([roi_mask / 255.0] * 3, axis=-1).astype(np.float32)
    blend_mask = falloff_3ch * mask_3ch * strength

    blended = roi.astype(np.float32) * (1 - blend_mask) + corrected.astype(np.float32) * blend_mask
    img[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)

    return img


def _reduce_wrinkles(
    img: np.ndarray,
    center: Dict[str, float],
    w: int, h: int,
    strength: float,
    skin_mask: np.ndarray,
) -> np.ndarray:
    """
    Wrinkle reduction: Gabor detection -> inpaint -> blend.

    Args:
        img: BGR image (uint8).
        center: Zone center (normalized).
        w: Image width.
        h: Image height.
        strength: Effective intensity (already scaled).
        skin_mask: Binary skin mask.

    Returns:
        Modified BGR image.
    """
    if strength < 0.01:
        return img

    x1, y1, x2, y2, falloff_3ch = _extract_roi(img, center, w, h, radius_frac=0.06)
    if falloff_3ch is None:
        return img

    roi = img[y1:y2, x1:x2].copy()
    roi_mask = skin_mask[y1:y2, x1:x2]
    gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    # Gabor filter bank to detect wrinkle-like structures
    wrinkle_map = np.zeros_like(gray_roi, dtype=np.float32)
    for theta in [0, np.pi / 4, np.pi / 2, 3 * np.pi / 4]:
        kernel = cv2.getGaborKernel(
            ksize=(11, 11), sigma=2.0, theta=theta,
            lambd=6.0, gamma=0.5, psi=0,
        )
        filtered = cv2.filter2D(gray_roi, cv2.CV_32F, kernel)
        wrinkle_map += np.abs(filtered)

    # Threshold to get wrinkle mask
    if wrinkle_map.max() > 0:
        wrinkle_norm = (wrinkle_map / wrinkle_map.max() * 255).astype(np.uint8)
    else:
        return img

    _, wrinkle_binary = cv2.threshold(wrinkle_norm, 120, 255, cv2.THRESH_BINARY)
    wrinkle_binary = cv2.bitwise_and(wrinkle_binary, roi_mask)

    # Inpaint wrinkle regions
    inpainted = cv2.inpaint(roi, wrinkle_binary, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

    # Blend at 40% * strength with Gaussian falloff
    blend_factor = 0.40 * strength
    mask_3ch = np.stack([roi_mask / 255.0] * 3, axis=-1).astype(np.float32)
    blend_mask = falloff_3ch * mask_3ch * blend_factor

    blended = roi.astype(np.float32) * (1 - blend_mask) + inpainted.astype(np.float32) * blend_mask
    img[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)

    return img


def _refine_pores(
    img: np.ndarray,
    skin_mask: np.ndarray,
    strength: float,
) -> np.ndarray:
    """
    Pore refinement: high-pass detection -> selective bilateral -> blend.

    Args:
        img: BGR image (uint8).
        skin_mask: Binary skin mask.
        strength: Effective intensity.

    Returns:
        Modified BGR image.
    """
    if strength < 0.01:
        return img

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # High-pass filter to detect pores (small dark dots)
    blur = cv2.GaussianBlur(gray, (15, 15), 3)
    high_pass = cv2.subtract(blur, gray)  # inverted: pore areas are bright

    # Threshold pore regions
    _, pore_mask = cv2.threshold(high_pass, 15, 255, cv2.THRESH_BINARY)
    pore_mask = cv2.bitwise_and(pore_mask, skin_mask)

    # Selective bilateral on pore regions
    smoothed = cv2.bilateralFilter(img, 7, 45, 45)

    # Blend only where pores detected
    pore_3ch = np.stack([pore_mask / 255.0] * 3, axis=-1).astype(np.float32) * strength
    result = img.astype(np.float32) * (1 - pore_3ch) + smoothed.astype(np.float32) * pore_3ch

    return np.clip(result, 0, 255).astype(np.uint8)


def _smooth_skin(
    img: np.ndarray,
    skin_mask: np.ndarray,
    strength: float,
) -> np.ndarray:
    """
    Skin smoothing: bilateral filter + detail preservation at 80%.

    Args:
        img: BGR image (uint8).
        skin_mask: Binary skin mask.
        strength: Effective intensity.

    Returns:
        Modified BGR image.
    """
    if strength < 0.01:
        return img

    detail_preserve = CLINICAL_LIMITS["texture_preserve"]

    # Bilateral filter
    smoothed = cv2.bilateralFilter(img, 9, 55, 55)

    # Extract detail layer
    detail = cv2.subtract(img, smoothed)

    # Reconstruct: smooth base + detail_preserve fraction of detail
    reconstructed = cv2.add(
        smoothed,
        (detail.astype(np.float32) * detail_preserve).astype(np.uint8),
    )

    # Apply only on skin region
    mask_3ch = np.stack([skin_mask / 255.0] * 3, axis=-1).astype(np.float32)
    blend_factor = mask_3ch * strength * 0.5  # conservative blending

    result = img.astype(np.float32) * (1 - blend_factor) + reconstructed.astype(np.float32) * blend_factor

    return np.clip(result, 0, 255).astype(np.uint8)


def _correct_color(
    img: np.ndarray,
    skin_mask: np.ndarray,
    strength: float,
) -> np.ndarray:
    """
    Color correction in LAB: subtle glow (L+) and warmth (a+).

    Args:
        img: BGR image (uint8).
        skin_mask: Binary skin mask.
        strength: Effective intensity.

    Returns:
        Modified BGR image.
    """
    if strength < 0.01:
        return img

    max_dL = CLINICAL_LIMITS["color_shift_dL"]
    max_da = CLINICAL_LIMITS["color_shift_da"]

    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)

    # Apply shifts only on skin pixels
    skin_float = skin_mask.astype(np.float32) / 255.0

    dL = min(3.0 * strength, max_dL)
    da = min(1.5 * strength, max_da)

    lab[:, :, 0] += dL * skin_float  # glow
    lab[:, :, 1] += da * skin_float  # warmth

    lab[:, :, 0] = np.clip(lab[:, :, 0], 0, 255)
    lab[:, :, 1] = np.clip(lab[:, :, 1], 0, 255)

    corrected = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

    # Blend back to preserve non-skin regions perfectly
    mask_3ch = np.stack([skin_float] * 3, axis=-1)
    result = img.astype(np.float32) * (1 - mask_3ch) + corrected.astype(np.float32) * mask_3ch

    return np.clip(result, 0, 255).astype(np.uint8)


def _expression_guard(
    original: np.ndarray,
    enhanced: np.ndarray,
    ssim_min: float,
) -> np.ndarray:
    """
    Expression guard: if SSIM between original and enhanced drops below threshold,
    reduce enhancement by blending back toward original.

    Args:
        original: Original BGR image (uint8).
        enhanced: Enhanced BGR image (uint8).
        ssim_min: Minimum acceptable SSIM.

    Returns:
        Guarded BGR image (uint8).
    """
    try:
        gray_orig = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
        gray_enh = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)

        # Compute SSIM manually (avoids skimage dependency)
        ssim_val = _compute_ssim(gray_orig, gray_enh)
        log.info(f"Expression guard SSIM: {ssim_val:.4f} (min: {ssim_min})")

        if ssim_val >= ssim_min:
            return enhanced

        # Blend back toward original to raise SSIM
        # Iteratively increase original weight until SSIM is acceptable
        for alpha in [0.3, 0.5, 0.7, 0.9]:
            blended = cv2.addWeighted(enhanced, 1 - alpha, original, alpha, 0)
            new_ssim = _compute_ssim(gray_orig, cv2.cvtColor(blended, cv2.COLOR_BGR2GRAY))
            if new_ssim >= ssim_min:
                log.info(f"Expression guard corrected: alpha={alpha}, SSIM {ssim_val:.4f} -> {new_ssim:.4f}")
                return blended

        log.warning(f"Expression guard: could not reach SSIM {ssim_min}, returning 90% original blend")
        return cv2.addWeighted(enhanced, 0.1, original, 0.9, 0)

    except Exception as e:
        log.warning(f"Expression guard failed: {e}, returning enhanced as-is")
        return enhanced


def _compute_ssim(img1: np.ndarray, img2: np.ndarray) -> float:
    """
    Compute SSIM between two grayscale images (simplified, no skimage needed).

    Args:
        img1: First grayscale image (uint8).
        img2: Second grayscale image (uint8).

    Returns:
        SSIM value between 0 and 1.
    """
    C1 = (0.01 * 255) ** 2
    C2 = (0.03 * 255) ** 2

    img1 = img1.astype(np.float64)
    img2 = img2.astype(np.float64)

    mu1 = cv2.GaussianBlur(img1, (11, 11), 1.5)
    mu2 = cv2.GaussianBlur(img2, (11, 11), 1.5)

    mu1_sq = mu1 ** 2
    mu2_sq = mu2 ** 2
    mu1_mu2 = mu1 * mu2

    sigma1_sq = cv2.GaussianBlur(img1 ** 2, (11, 11), 1.5) - mu1_sq
    sigma2_sq = cv2.GaussianBlur(img2 ** 2, (11, 11), 1.5) - mu2_sq
    sigma12 = cv2.GaussianBlur(img1 * img2, (11, 11), 1.5) - mu1_mu2

    ssim_map = ((2 * mu1_mu2 + C1) * (2 * sigma12 + C2)) / \
               ((mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2))

    return float(np.mean(ssim_map))
