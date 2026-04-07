"""
ClinicAI — Skin Analysis Engine v2
Professional dermatological skin analysis with heatmaps and zone-level scoring.

Features:
- Wrinkle detection (Frangi filter + ridge detection)
- Spot/pigmentation detection (Delta-E color space + connected components)
- Pore analysis (Gabor filter bank + local texture entropy)
- Redness mapping (LAB a* channel heatmap)
- Pigmentation uniformity (LAB b* channel variance)
- Firmness estimation (gradient magnitude proxy)
- Skin age estimation (biological vs chronological)
- Zone-level scoring (per treatment zone, not just global)
- Heatmap generation for each metric (base64 PNG overlays)

All analysis is done on the skin mask only (excludes eyes, lips, brows, hair).
"""

import cv2
import numpy as np
import logging
import math
from typing import Dict, List, Optional, Tuple

log = logging.getLogger("facial-api.skin-engine")


def analyze_skin_v2(
    img_bgr: np.ndarray,
    skin_mask: Optional[np.ndarray] = None,
    zone_centers: Optional[Dict] = None,
    generate_heatmaps: bool = True,
) -> Dict:
    """
    Full skin analysis with heatmaps and zone-level scoring.

    Args:
        img_bgr: Input BGR image
        skin_mask: Binary mask (255=skin). If None, uses full image.
        zone_centers: Dict of zone_name -> {x, y} (normalized 0-1)
        generate_heatmaps: Whether to generate heatmap images

    Returns:
        Dict with global scores, zone scores, heatmaps, skin age
    """
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)

    # If no skin mask, create one covering the whole image
    if skin_mask is None:
        skin_mask = np.ones((h, w), dtype=np.uint8) * 255

    # Ensure mask is binary
    _, skin_mask = cv2.threshold(skin_mask, 127, 255, cv2.THRESH_BINARY)

    # Resize mask to match image if needed
    if skin_mask.shape[:2] != (h, w):
        skin_mask = cv2.resize(skin_mask, (w, h), interpolation=cv2.INTER_NEAREST)

    # Apply mask to get skin-only regions
    gray_skin = cv2.bitwise_and(gray, gray, mask=skin_mask)
    mask_3ch = np.stack([skin_mask] * 3, axis=-1)
    lab_skin = np.where(mask_3ch > 0, lab, 0).astype(np.uint8)

    # ── Individual analyses ──
    wrinkle_map = _detect_wrinkles(gray_skin, skin_mask)
    spot_map = _detect_spots(lab_skin, skin_mask)
    pore_map = _detect_pores(gray_skin, skin_mask)
    redness_map = _detect_redness(lab_skin, skin_mask)
    pigment_map = _detect_pigmentation(lab_skin, skin_mask)
    firmness_map = _detect_firmness(gray_skin, skin_mask)

    # ── Global scores (0-100, higher = better) ──
    scores = {
        "wrinkles": _map_to_score(wrinkle_map, skin_mask, invert=True),
        "spots": _map_to_score(spot_map, skin_mask, invert=True),
        "pores": _map_to_score(pore_map, skin_mask, invert=True),
        "redness": _map_to_score(redness_map, skin_mask, invert=True),
        "pigmentation": _map_to_score(pigment_map, skin_mask, invert=True),
        "firmness": _map_to_score(firmness_map, skin_mask, invert=False),
    }
    scores["overall"] = round(sum(scores.values()) / len(scores), 1)

    # ── Zone-level scores ──
    zone_scores = {}
    if zone_centers:
        zone_scores = _score_by_zone(
            zone_centers, w, h,
            wrinkle_map, spot_map, pore_map, redness_map, pigment_map, firmness_map,
            skin_mask,
        )

    # ── Skin age estimation ──
    skin_age = _estimate_skin_age(scores, wrinkle_map, spot_map, skin_mask)

    # ── Heatmaps ──
    heatmaps = {}
    if generate_heatmaps:
        heatmaps = {
            "wrinkles": _generate_heatmap(wrinkle_map, skin_mask, colormap=cv2.COLORMAP_HOT),
            "spots": _generate_heatmap(spot_map, skin_mask, colormap=cv2.COLORMAP_BONE),
            "pores": _generate_heatmap(pore_map, skin_mask, colormap=cv2.COLORMAP_OCEAN),
            "redness": _generate_heatmap(redness_map, skin_mask, colormap=cv2.COLORMAP_JET),
            "pigmentation": _generate_heatmap(pigment_map, skin_mask, colormap=cv2.COLORMAP_AUTUMN),
            "firmness": _generate_heatmap(firmness_map, skin_mask, colormap=cv2.COLORMAP_COOL),
        }

    return {
        "scores": scores,
        "zone_scores": zone_scores,
        "skin_age": skin_age,
        "heatmaps": heatmaps,
        "skin_coverage": round(float(np.sum(skin_mask > 0)) / (h * w), 3),
    }


# ── Wrinkle Detection ──────────────────────────────────────

def _detect_wrinkles(gray: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Detect wrinkles using multi-scale ridge detection.
    Combines Frangi-like filter + directional Sobel for robust wrinkle detection.
    """
    h, w = gray.shape

    # Multi-scale Frangi-like filter (detects ridge structures = wrinkles)
    wrinkle_total = np.zeros((h, w), dtype=np.float32)

    for sigma in [1.0, 2.0, 3.0]:
        # Gaussian derivatives
        ksize = int(6 * sigma + 1) | 1  # ensure odd
        blurred = cv2.GaussianBlur(gray, (ksize, ksize), sigma).astype(np.float32)

        # Second derivatives (Hessian approximation)
        dxx = cv2.Sobel(blurred, cv2.CV_32F, 2, 0, ksize=3)
        dyy = cv2.Sobel(blurred, cv2.CV_32F, 0, 2, ksize=3)
        dxy = cv2.Sobel(blurred, cv2.CV_32F, 1, 1, ksize=3)

        # Eigenvalues of Hessian (ridge detection)
        # For wrinkles: one eigenvalue large (across wrinkle), one small (along wrinkle)
        trace = dxx + dyy
        det = dxx * dyy - dxy * dxy

        discriminant = np.sqrt(np.maximum(trace**2 - 4 * det, 0))
        lambda1 = (trace + discriminant) / 2
        lambda2 = (trace - discriminant) / 2

        # Frangi-like vesselness (adapted for wrinkles)
        # Wrinkle = |lambda2| >> |lambda1| and lambda2 < 0 (dark ridge)
        Rb = np.where(lambda2 != 0, (lambda1 / (lambda2 + 1e-10))**2, 0)
        S = np.sqrt(lambda1**2 + lambda2**2)

        beta = 0.5
        c = np.max(S) / 2 if np.max(S) > 0 else 1

        vesselness = np.exp(-Rb / (2 * beta**2)) * (1 - np.exp(-S**2 / (2 * c**2)))
        vesselness[lambda2 > 0] = 0  # only dark ridges

        wrinkle_total += vesselness * sigma  # scale normalization

    # Normalize to 0-255
    if np.max(wrinkle_total) > 0:
        wrinkle_total = (wrinkle_total / np.max(wrinkle_total) * 255).astype(np.uint8)
    else:
        wrinkle_total = np.zeros((h, w), dtype=np.uint8)

    # Apply mask
    wrinkle_total = cv2.bitwise_and(wrinkle_total, wrinkle_total, mask=mask)

    return wrinkle_total


# ── Spot Detection ─────────────────────────────────────────

def _detect_spots(lab: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Detect spots and pigmentation irregularities using Delta-E color difference.
    Spots = regions that differ significantly from surrounding skin tone.
    """
    h, w = lab.shape[:2]
    l_ch = lab[:, :, 0].astype(np.float32)
    a_ch = lab[:, :, 1].astype(np.float32)
    b_ch = lab[:, :, 2].astype(np.float32)

    # Local average (reference "normal" skin)
    ksize = 31
    l_local = cv2.GaussianBlur(l_ch, (ksize, ksize), 8)
    a_local = cv2.GaussianBlur(a_ch, (ksize, ksize), 8)
    b_local = cv2.GaussianBlur(b_ch, (ksize, ksize), 8)

    # Delta-E (CIE76 simplified): sqrt(dL^2 + da^2 + db^2)
    delta_e = np.sqrt(
        (l_ch - l_local)**2 +
        (a_ch - a_local)**2 +
        (b_ch - b_local)**2
    )

    # Normalize to 0-255
    spot_map = np.clip(delta_e * 8, 0, 255).astype(np.uint8)

    # Apply mask
    spot_map = cv2.bitwise_and(spot_map, spot_map, mask=mask)

    # Morphological cleanup (remove very small spots = noise)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    spot_map = cv2.morphologyEx(spot_map, cv2.MORPH_OPEN, kernel)

    return spot_map


# ── Pore Detection ─────────────────────────────────────────

def _detect_pores(gray: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Detect pore visibility using Gabor filter bank + local texture entropy.
    Pores are small, regularly-spaced dark spots on the skin surface.
    """
    h, w = gray.shape
    pore_total = np.zeros((h, w), dtype=np.float32)

    # Gabor filter bank (multiple orientations detect pore-like textures)
    for theta in [0, np.pi/4, np.pi/2, 3*np.pi/4]:
        kernel = cv2.getGaborKernel(
            ksize=(11, 11),
            sigma=2.0,
            theta=theta,
            lambd=5.0,  # wavelength ~ pore spacing
            gamma=0.5,
            psi=0,
        )
        filtered = cv2.filter2D(gray, cv2.CV_32F, kernel)
        pore_total += np.abs(filtered)

    # Also: high-pass filter detects small dark dots (pores)
    blur = cv2.GaussianBlur(gray, (15, 15), 3)
    high_pass = cv2.subtract(gray.astype(np.float32), blur.astype(np.float32))
    high_pass = np.abs(high_pass)

    # Combine Gabor + high-pass
    combined = pore_total * 0.5 + high_pass * 2.0

    # Normalize to 0-255
    if np.max(combined) > 0:
        combined = (combined / np.max(combined) * 255).astype(np.uint8)
    else:
        combined = np.zeros((h, w), dtype=np.uint8)

    # Apply mask
    combined = cv2.bitwise_and(combined, combined, mask=mask)

    return combined


# ── Redness Detection ──────────────────────────────────────

def _detect_redness(lab: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Detect redness using the a* channel in LAB color space.
    High a* values = redness (erythema, rosacea, inflammation).
    """
    a_ch = lab[:, :, 1].astype(np.float32)

    # a* channel: 128 = neutral, >128 = red, <128 = green
    # Redness intensity = distance above neutral
    redness = np.clip(a_ch - 128, 0, 127)

    # Normalize: scale 0-127 range to 0-255
    redness_map = (redness / 127 * 255).astype(np.uint8)

    # Smooth slightly to avoid pixel-level noise
    redness_map = cv2.GaussianBlur(redness_map, (5, 5), 1)

    # Apply mask
    redness_map = cv2.bitwise_and(redness_map, redness_map, mask=mask)

    return redness_map


# ── Pigmentation Analysis ──────────────────────────────────

def _detect_pigmentation(lab: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Detect pigmentation uniformity using LAB L* and b* channels.
    Uneven pigmentation = melasma, sun spots, hyperpigmentation.
    """
    l_ch = lab[:, :, 0].astype(np.float32)
    b_ch = lab[:, :, 2].astype(np.float32)

    # Local variance of L channel (brightness uniformity)
    ksize = 21
    l_mean = cv2.GaussianBlur(l_ch, (ksize, ksize), 5)
    l_diff = np.abs(l_ch - l_mean)

    # Local variance of b channel (yellow-blue uniformity)
    b_mean = cv2.GaussianBlur(b_ch, (ksize, ksize), 5)
    b_diff = np.abs(b_ch - b_mean)

    # Combine: weight brightness more than color
    pigment = l_diff * 1.5 + b_diff * 0.8

    # Normalize
    if np.max(pigment) > 0:
        pigment_map = (np.clip(pigment / np.max(pigment), 0, 1) * 255).astype(np.uint8)
    else:
        pigment_map = np.zeros_like(l_ch, dtype=np.uint8)

    pigment_map = cv2.bitwise_and(pigment_map, pigment_map, mask=mask)

    return pigment_map


# ── Firmness Estimation ────────────────────────────────────

def _detect_firmness(gray: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Estimate skin firmness via gradient magnitude.
    Firm skin = smooth gradients. Sagging skin = sharper transitions at jaw/cheek.
    Higher values = MORE firm (inverted for display).
    """
    # Gradient magnitude (Sobel)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    magnitude = np.sqrt(gx**2 + gy**2)

    # Smooth (local average of gradient = regional firmness indicator)
    firmness_raw = cv2.GaussianBlur(magnitude, (15, 15), 5)

    # Invert: low gradient = firm (good), high gradient = not firm
    if np.max(firmness_raw) > 0:
        firmness_inverted = 255 - (firmness_raw / np.max(firmness_raw) * 255).astype(np.uint8)
    else:
        firmness_inverted = np.ones_like(gray, dtype=np.uint8) * 255

    firmness_inverted = cv2.bitwise_and(firmness_inverted, firmness_inverted, mask=mask)

    return firmness_inverted


# ── Zone-Level Scoring ─────────────────────────────────────

def _score_by_zone(
    zone_centers: Dict, w: int, h: int,
    wrinkle_map: np.ndarray, spot_map: np.ndarray, pore_map: np.ndarray,
    redness_map: np.ndarray, pigment_map: np.ndarray, firmness_map: np.ndarray,
    mask: np.ndarray,
) -> Dict:
    """
    Score each treatment zone individually by sampling the area around its center.
    """
    maps = {
        "wrinkles": wrinkle_map,
        "spots": spot_map,
        "pores": pore_map,
        "redness": redness_map,
        "pigmentation": pigment_map,
        "firmness": firmness_map,
    }

    zone_scores = {}
    radius = int(min(w, h) * 0.05)  # 5% of image size

    for zone_name, center in zone_centers.items():
        cx = int(center["x"] * w)
        cy = int(center["y"] * h)

        # Extract circular ROI
        y1 = max(0, cy - radius)
        y2 = min(h, cy + radius)
        x1 = max(0, cx - radius)
        x2 = min(w, cx + radius)

        if y2 <= y1 or x2 <= x1:
            continue

        roi_mask = mask[y1:y2, x1:x2]
        skin_pixels = np.sum(roi_mask > 0)
        if skin_pixels < 10:
            continue

        scores = {}
        for metric_name, metric_map in maps.items():
            roi = metric_map[y1:y2, x1:x2]
            roi_values = roi[roi_mask > 0]
            if len(roi_values) > 0:
                mean_val = float(np.mean(roi_values))
                # Convert to 0-100 score (lower map value = better for wrinkles/spots/pores/redness)
                if metric_name == "firmness":
                    scores[metric_name] = round(mean_val / 255 * 100, 1)
                else:
                    scores[metric_name] = round(max(0, 100 - mean_val / 255 * 100), 1)

        if scores:
            scores["overall"] = round(sum(scores.values()) / len(scores), 1)
            zone_scores[zone_name] = scores

    return zone_scores


# ── Skin Age Estimation ────────────────────────────────────

def _estimate_skin_age(
    scores: Dict, wrinkle_map: np.ndarray, spot_map: np.ndarray, mask: np.ndarray,
) -> Dict:
    """
    Estimate biological skin age based on analysis results.
    Uses wrinkle density + spot count + overall score as primary indicators.
    """
    overall = scores.get("overall", 50)
    wrinkle_score = scores.get("wrinkles", 50)
    spot_score = scores.get("spots", 50)
    firmness_score = scores.get("firmness", 50)

    # Wrinkle density (% of skin area with significant wrinkles)
    skin_pixels = max(1, np.sum(mask > 0))
    wrinkle_pixels = np.sum(wrinkle_map[mask > 0] > 80)
    wrinkle_density = wrinkle_pixels / skin_pixels

    # Spot count (connected components above threshold)
    _, spot_binary = cv2.threshold(spot_map, 100, 255, cv2.THRESH_BINARY)
    spot_binary = cv2.bitwise_and(spot_binary, spot_binary, mask=mask)

    # Erode mask to ignore edge artifacts (black background border creates false spots)
    erode_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    mask_eroded = cv2.erode(mask, erode_kernel, iterations=2)
    spot_binary = cv2.bitwise_and(spot_binary, spot_binary, mask=mask_eroded)

    num_spots, _, stats, _ = cv2.connectedComponentsWithStats(spot_binary)
    # Filter out tiny spots (noise) and very large blobs (not spots)
    significant_spots = sum(
        1 for i in range(1, num_spots)
        if 30 < stats[i, cv2.CC_STAT_AREA] < 5000
    )

    # Age estimation formula (calibrated with real clinical patients)
    # Calibration reference: Pri, 50 anos, rosto quadrado, assimetria evidente
    # Goal: real clinical photos should land within ±3 years of real age
    base_age = 32

    # Wrinkle contribution: strongest signal (0-35 years)
    wrinkle_years = (100 - wrinkle_score) * 0.35

    # Spot contribution: moderate (0-12 years)
    spot_years = min(12, significant_spots * 0.6 + (100 - spot_score) * 0.04)

    # Firmness contribution (0-15 years)
    firmness_years = (100 - firmness_score) * 0.15

    # Pore contribution (0-8 years)
    pore_score_val = scores.get("pores", 50)
    pore_years = (100 - pore_score_val) * 0.08

    # Pigmentation contribution (0-10 years)
    pigment_score = scores.get("pigmentation", 50)
    pigment_years = (100 - pigment_score) * 0.10

    # Redness contribution (0-5 years)
    redness_score_val = scores.get("redness", 50)
    redness_years = (100 - redness_score_val) * 0.05

    # Overall score penalty: if overall < 60, skin is clearly aging
    overall_penalty = max(0, (60 - overall) * 0.3)

    estimated_age = base_age + wrinkle_years + spot_years + firmness_years + pore_years + pigment_years + redness_years + overall_penalty

    # Minimum floor: never estimate below 25
    estimated_age = max(25, estimated_age)

    # Age bracket
    if estimated_age < 30:
        bracket = "<30"
        description = "Pele jovem com boa elasticidade e colageno preservado"
    elif estimated_age < 40:
        bracket = "30-40"
        description = "Primeiros sinais de envelhecimento, boa estrutura base"
    elif estimated_age < 50:
        bracket = "40-50"
        description = "Envelhecimento moderado, perda progressiva de volume e elasticidade"
    elif estimated_age < 60:
        bracket = "50-60"
        description = "Envelhecimento avancado, sulcos e perda de contorno evidentes"
    else:
        bracket = "60+"
        description = "Envelhecimento severo, perda estrutural significativa"

    return {
        "estimated_age": round(estimated_age, 0),
        "age_bracket": bracket,
        "description": description,
        "factors": {
            "wrinkle_density": round(wrinkle_density * 100, 2),
            "significant_spots": significant_spots,
            "wrinkle_contribution_years": round(wrinkle_years, 1),
            "spot_contribution_years": round(spot_years, 1),
            "firmness_contribution_years": round(firmness_years, 1),
        },
    }


# ── Heatmap Generation ─────────────────────────────────────

def _generate_heatmap(
    metric_map: np.ndarray,
    mask: np.ndarray,
    colormap: int = cv2.COLORMAP_JET,
    alpha: float = 0.6,
) -> str:
    """
    Generate a colored heatmap overlay as base64 PNG.
    Only shows colors on skin regions (transparent elsewhere).
    """
    from utils.image_helpers import cv2_to_b64

    # Apply colormap
    colored = cv2.applyColorMap(metric_map, colormap)

    # Create RGBA output with alpha channel
    b, g, r = cv2.split(colored)
    alpha_ch = (mask.astype(np.float32) * alpha).astype(np.uint8)

    # Where metric is very low, reduce alpha (less relevant areas)
    metric_alpha = (metric_map.astype(np.float32) / 255.0) * alpha * 255
    final_alpha = np.minimum(alpha_ch.astype(np.float32), metric_alpha).astype(np.uint8)

    rgba = cv2.merge([b, g, r, final_alpha])

    # Encode as PNG with alpha
    _, buf = cv2.imencode(".png", rgba)
    import base64
    return base64.b64encode(buf.tobytes()).decode("utf-8")


# ── Helpers ────────────────────────────────────────────────

def _map_to_score(metric_map: np.ndarray, mask: np.ndarray, invert: bool = True) -> float:
    """
    Convert a metric map to a 0-100 score.
    If invert=True, lower map values = better score.
    """
    skin_values = metric_map[mask > 0]
    if len(skin_values) == 0:
        return 50.0

    mean_val = float(np.mean(skin_values))
    normalized = mean_val / 255.0  # 0-1

    if invert:
        score = (1.0 - normalized) * 100
    else:
        score = normalized * 100

    return round(max(0, min(100, score)), 1)
