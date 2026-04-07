"""
ClinicAI — Warp Engine (Facial Simulation)
Deterministic facial transformation simulation using mesh warping.

Simulates treatment results by applying geometric transformations per zone:
- Volume addition: local inflation (zigoma, temporal, labio, mento)
- Contour definition: mesh warp toward ideal jawline
- Wrinkle reduction: local smooth + inpaint
- Dark circle reduction: color correction in olheira region
- Skin tightening: subtle upward warp (lifting vector)

Zero cost per call. Deterministic. <3s on a 2000x3000 photo.
No GPT, no DALL-E, no external API.
"""

import cv2
import numpy as np
import logging
import math
from typing import Dict, List, Optional, Tuple

log = logging.getLogger("facial-api.warp-engine")


# ── Zone Transformation Definitions ────────────────────────

# Each zone has: warp direction, warp magnitude, smoothing, color correction
ZONE_TRANSFORMS = {
    "temporal_esq": {
        "type": "inflate",
        "direction": (0.4, -0.3),   # outward + up (lifting vector)
        "magnitude": 1.5,
        "smooth": 0.1,
    },
    "temporal_dir": {
        "type": "inflate",
        "direction": (-0.4, -0.3),
        "magnitude": 1.5,
        "smooth": 0.1,
    },
    "zigoma_lat_esq": {
        "type": "inflate",
        "direction": (0.5, -0.15),   # outward + slightly up
        "magnitude": 1.8,
        "smooth": 0.0,
    },
    "zigoma_lat_dir": {
        "type": "inflate",
        "direction": (-0.5, -0.15),
        "magnitude": 1.8,
        "smooth": 0.0,
    },
    "zigoma_ant_esq": {
        "type": "inflate",
        "direction": (0.25, -0.35),   # forward + up
        "magnitude": 1.4,
        "smooth": 0.0,
    },
    "zigoma_ant_dir": {
        "type": "inflate",
        "direction": (-0.25, -0.35),
        "magnitude": 1.4,
        "smooth": 0.0,
    },
    "olheira_esq": {
        "type": "lighten",
        "direction": (0, 0),
        "magnitude": 0.8,
        "smooth": 0.3,
        "lighten_amount": 25,
    },
    "olheira_dir": {
        "type": "lighten",
        "direction": (0, 0),
        "magnitude": 0.8,
        "smooth": 0.3,
        "lighten_amount": 25,
    },
    "sulco_esq": {
        "type": "smooth",
        "direction": (0.12, -0.12),
        "magnitude": 1.0,
        "smooth": 0.85,
    },
    "sulco_dir": {
        "type": "smooth",
        "direction": (-0.12, -0.12),
        "magnitude": 1.0,
        "smooth": 0.85,
    },
    "marionete_esq": {
        "type": "smooth",
        "direction": (0.08, -0.18),
        "magnitude": 0.8,
        "smooth": 0.8,
    },
    "marionete_dir": {
        "type": "smooth",
        "direction": (-0.08, -0.18),
        "magnitude": 0.8,
        "smooth": 0.8,
    },
    "mandibula_esq": {
        "type": "contour",
        "direction": (0.3, -0.35),   # define jawline: outward + up
        "magnitude": 2.0,
        "smooth": 0.15,
    },
    "mandibula_dir": {
        "type": "contour",
        "direction": (-0.3, -0.35),
        "magnitude": 2.0,
        "smooth": 0.15,
    },
    "mento": {
        "type": "inflate",
        "direction": (0, 0.2),     # project chin forward/down
        "magnitude": 1.4,
        "smooth": 0.0,
    },
    "labio": {
        "type": "inflate",
        "direction": (0, -0.08),    # volume + projection
        "magnitude": 1.2,
        "smooth": 0.1,
    },
    "nariz": {
        "type": "contour",
        "direction": (0, -0.1),     # subtle refinement
        "magnitude": 0.5,
        "smooth": 0.2,
    },
    "testa": {
        "type": "smooth",
        "direction": (0, 0),
        "magnitude": 0.3,
        "smooth": 0.8,
    },
    "glabela": {
        "type": "smooth",
        "direction": (0, 0),
        "magnitude": 0.3,
        "smooth": 0.9,
    },
    "pes_galinha_esq": {
        "type": "smooth",
        "direction": (0, 0),
        "magnitude": 0.3,
        "smooth": 0.8,
    },
    "pes_galinha_dir": {
        "type": "smooth",
        "direction": (0, 0),
        "magnitude": 0.3,
        "smooth": 0.8,
    },
}


def simulate(
    img_bgr: np.ndarray,
    zones: List[Dict],
    zone_centers: Optional[Dict] = None,
    intensity: float = 0.7,
) -> np.ndarray:
    """
    Simulate treatment results on a face photo.

    Args:
        img_bgr: Input BGR image
        zones: List of {zone: str, severity: 0-3, treatment: str}
        zone_centers: Dict of zone_name -> {x, y} (normalized 0-1). Auto-detected if None.
        intensity: 0.0-1.0 overall simulation intensity

    Returns:
        Simulated BGR image
    """
    h, w = img_bgr.shape[:2]
    result = img_bgr.copy().astype(np.float32)

    # Get zone centers if not provided
    if zone_centers is None:
        zone_centers = _estimate_zone_centers(img_bgr)

    for zone_info in zones:
        zone_name = zone_info.get("zone", "")
        severity = zone_info.get("severity", 1)
        treatment = zone_info.get("treatment", "AH")

        if zone_name not in ZONE_TRANSFORMS:
            continue

        center = zone_centers.get(zone_name)
        if center is None:
            continue

        transform = ZONE_TRANSFORMS[zone_name]
        cx = int(center["x"] * w)
        cy = int(center["y"] * h)

        # Scale effect by severity and intensity
        effect_strength = severity / 3.0 * intensity

        if transform["type"] == "inflate":
            result = _apply_inflate(result, cx, cy, w, h, transform, effect_strength)
        elif transform["type"] == "smooth":
            result = _apply_smooth(result, cx, cy, w, h, transform, effect_strength)
        elif transform["type"] == "lighten":
            result = _apply_lighten(result, cx, cy, w, h, transform, effect_strength)
        elif transform["type"] == "contour":
            result = _apply_contour(result, cx, cy, w, h, transform, effect_strength)

    # Final: subtle global enhancement (simulates "glowing" post-treatment skin)
    result = _apply_glow(result, intensity * 0.3)

    return np.clip(result, 0, 255).astype(np.uint8)


# ── Transformation Functions ───────────────────────────────

def _apply_inflate(
    img: np.ndarray, cx: int, cy: int, w: int, h: int,
    transform: Dict, strength: float,
) -> np.ndarray:
    """
    Simulate volume addition (AH injection) via radial displacement.
    Pushes pixels outward from center, creating a "fuller" appearance.
    """
    radius = int(min(w, h) * 0.07 * transform["magnitude"])
    if radius < 5:
        return img

    dx_dir, dy_dir = transform["direction"]
    max_displacement = radius * 0.22 * strength

    # Create displacement map
    y_coords, x_coords = np.mgrid[0:h, 0:w]
    x_coords = x_coords.astype(np.float32)
    y_coords = y_coords.astype(np.float32)

    # Distance from center
    dist_x = x_coords - cx
    dist_y = y_coords - cy
    dist = np.sqrt(dist_x**2 + dist_y**2)

    # Gaussian falloff
    falloff = np.exp(-dist**2 / (2 * (radius * 0.6)**2))
    falloff[dist > radius] = 0

    # Displacement: push outward + directional bias
    if dist.max() > 0:
        # Radial component
        safe_dist = np.where(dist > 0, dist, 1)
        norm_x = np.where(dist > 0, dist_x / safe_dist, 0)
        norm_y = np.where(dist > 0, dist_y / safe_dist, 0)

        # Combined radial + directional
        disp_x = (norm_x * 0.3 + dx_dir) * falloff * max_displacement
        disp_y = (norm_y * 0.3 + dy_dir) * falloff * max_displacement

        # Apply warp via remap
        map_x = x_coords - disp_x
        map_y = y_coords - disp_y

        result = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        return result

    return img


def _apply_smooth(
    img: np.ndarray, cx: int, cy: int, w: int, h: int,
    transform: Dict, strength: float,
) -> np.ndarray:
    """
    Simulate wrinkle reduction via localized bilateral smoothing.
    Multi-pass for deeper wrinkles. Preserves skin tone.
    """
    radius = int(min(w, h) * 0.06 * transform["magnitude"])
    if radius < 5:
        return img

    smooth_strength = transform.get("smooth", 0.5) * strength

    # Create ROI
    x1 = max(0, cx - radius)
    y1 = max(0, cy - radius)
    x2 = min(w, cx + radius)
    y2 = min(h, cy + radius)

    roi = img[y1:y2, x1:x2].copy()
    roi_uint8 = np.clip(roi, 0, 255).astype(np.uint8)

    # Multi-pass bilateral filter for deeper smoothing
    d = max(7, int(17 * smooth_strength))
    sigma = 85 * smooth_strength
    smoothed = roi_uint8.copy()
    passes = max(1, int(2 * smooth_strength))
    for _ in range(passes):
        smoothed = cv2.bilateralFilter(smoothed, d, sigma, sigma)
    smoothed = smoothed.astype(np.float32)

    # Blend with Gaussian falloff mask
    rh, rw = roi.shape[:2]
    cy_local = cy - y1
    cx_local = cx - x1
    y_coords, x_coords = np.mgrid[0:rh, 0:rw]
    dist = np.sqrt((x_coords - cx_local)**2 + (y_coords - cy_local)**2)
    falloff = np.exp(-dist**2 / (2 * (radius * 0.5)**2))
    falloff = np.clip(falloff * smooth_strength, 0, 1)
    falloff_3ch = np.stack([falloff] * 3, axis=-1)

    blended = roi * (1 - falloff_3ch) + smoothed * falloff_3ch
    img[y1:y2, x1:x2] = blended

    return img


def _apply_lighten(
    img: np.ndarray, cx: int, cy: int, w: int, h: int,
    transform: Dict, strength: float,
) -> np.ndarray:
    """
    Simulate dark circle reduction via color correction.
    Increases brightness + reduces blue/purple tint in LAB space.
    """
    radius = int(min(w, h) * 0.04 * transform["magnitude"])
    if radius < 3:
        return img

    lighten_amount = transform.get("lighten_amount", 20) * strength

    x1 = max(0, cx - radius)
    y1 = max(0, cy - radius)
    x2 = min(w, cx + radius)
    y2 = min(h, cy + radius)

    roi = img[y1:y2, x1:x2].copy()
    roi_uint8 = np.clip(roi, 0, 255).astype(np.uint8)

    # Convert ROI to LAB
    lab = cv2.cvtColor(roi_uint8, cv2.COLOR_BGR2LAB).astype(np.float32)

    # Increase L (brightness)
    lab[:, :, 0] = np.clip(lab[:, :, 0] + lighten_amount, 0, 255)

    # Reduce b* negative values (blue/purple tint of dark circles)
    b_ch = lab[:, :, 2]
    b_ch[b_ch < 128] = np.clip(b_ch[b_ch < 128] + lighten_amount * 0.3, 0, 255)

    # Also slight bilateral smooth
    corrected = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
    corrected_smooth = cv2.bilateralFilter(
        np.clip(corrected, 0, 255).astype(np.uint8), 5, 40, 40
    ).astype(np.float32)

    # Gaussian falloff
    rh, rw = roi.shape[:2]
    y_coords, x_coords = np.mgrid[0:rh, 0:rw]
    dist = np.sqrt((x_coords - (cx - x1))**2 + (y_coords - (cy - y1))**2)
    falloff = np.exp(-dist**2 / (2 * (radius * 0.5)**2))
    falloff = np.clip(falloff * strength, 0, 1)
    falloff_3ch = np.stack([falloff] * 3, axis=-1)

    blended = roi * (1 - falloff_3ch) + corrected_smooth * falloff_3ch
    img[y1:y2, x1:x2] = blended

    return img


def _apply_contour(
    img: np.ndarray, cx: int, cy: int, w: int, h: int,
    transform: Dict, strength: float,
) -> np.ndarray:
    """
    Simulate contour definition (mandibula, nariz) via directional warp.
    Pushes tissue in a specific direction to create sharper definition.
    """
    radius = int(min(w, h) * 0.07 * transform["magnitude"])
    if radius < 5:
        return img

    dx_dir, dy_dir = transform["direction"]
    max_displacement = radius * 0.18 * strength

    y_coords, x_coords = np.mgrid[0:h, 0:w]
    x_coords = x_coords.astype(np.float32)
    y_coords = y_coords.astype(np.float32)

    dist_x = x_coords - cx
    dist_y = y_coords - cy
    dist = np.sqrt(dist_x**2 + dist_y**2)

    # Tighter falloff for contour (more localized)
    falloff = np.exp(-dist**2 / (2 * (radius * 0.4)**2))
    falloff[dist > radius] = 0

    # Directional displacement only
    disp_x = dx_dir * falloff * max_displacement
    disp_y = dy_dir * falloff * max_displacement

    map_x = x_coords - disp_x
    map_y = y_coords - disp_y

    result = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return result


def _apply_glow(img: np.ndarray, strength: float) -> np.ndarray:
    """
    Subtle skin glow effect — simulates "healthy post-treatment" appearance.
    Soft light overlay + slight warmth.
    """
    if strength < 0.05:
        return img

    img_uint8 = np.clip(img, 0, 255).astype(np.uint8)

    # Soft light: slight brightness boost
    lab = cv2.cvtColor(img_uint8, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab[:, :, 0] = np.clip(lab[:, :, 0] + 5 * strength, 0, 255)  # brightness
    lab[:, :, 1] = np.clip(lab[:, :, 1] + 1 * strength, 0, 255)  # tiny warmth

    glowed = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)

    # Subtle Gaussian glow
    blurred = cv2.GaussianBlur(img_uint8, (0, 0), 15).astype(np.float32)
    result = img * (1 - strength * 0.2) + blurred * (strength * 0.1) + glowed * (strength * 0.1)

    return result


# ── Fallback Zone Center Estimation ────────────────────────

def _estimate_zone_centers(img_bgr: np.ndarray) -> Dict:
    """
    Estimate zone centers without MediaPipe (fallback using face detection).
    Less accurate but always available.
    """
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))

    if len(faces) == 0:
        # Default positions (normalized, based on average face proportions)
        return _default_zone_centers()

    fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    cx_face = (fx + fw / 2) / w
    cy_face = (fy + fh / 2) / h
    fw_n = fw / w
    fh_n = fh / h

    return {
        "temporal_esq": {"x": cx_face - fw_n * 0.45, "y": cy_face - fh_n * 0.3},
        "temporal_dir": {"x": cx_face + fw_n * 0.45, "y": cy_face - fh_n * 0.3},
        "zigoma_lat_esq": {"x": cx_face - fw_n * 0.4, "y": cy_face - fh_n * 0.05},
        "zigoma_lat_dir": {"x": cx_face + fw_n * 0.4, "y": cy_face - fh_n * 0.05},
        "zigoma_ant_esq": {"x": cx_face - fw_n * 0.25, "y": cy_face - fh_n * 0.1},
        "zigoma_ant_dir": {"x": cx_face + fw_n * 0.25, "y": cy_face - fh_n * 0.1},
        "olheira_esq": {"x": cx_face - fw_n * 0.18, "y": cy_face - fh_n * 0.12},
        "olheira_dir": {"x": cx_face + fw_n * 0.18, "y": cy_face - fh_n * 0.12},
        "sulco_esq": {"x": cx_face - fw_n * 0.18, "y": cy_face + fh_n * 0.15},
        "sulco_dir": {"x": cx_face + fw_n * 0.18, "y": cy_face + fh_n * 0.15},
        "marionete_esq": {"x": cx_face - fw_n * 0.2, "y": cy_face + fh_n * 0.28},
        "marionete_dir": {"x": cx_face + fw_n * 0.2, "y": cy_face + fh_n * 0.28},
        "mandibula_esq": {"x": cx_face - fw_n * 0.35, "y": cy_face + fh_n * 0.35},
        "mandibula_dir": {"x": cx_face + fw_n * 0.35, "y": cy_face + fh_n * 0.35},
        "mento": {"x": cx_face, "y": cy_face + fh_n * 0.48},
        "labio": {"x": cx_face, "y": cy_face + fh_n * 0.22},
        "nariz": {"x": cx_face, "y": cy_face + fh_n * 0.05},
        "testa": {"x": cx_face, "y": cy_face - fh_n * 0.38},
        "glabela": {"x": cx_face, "y": cy_face - fh_n * 0.22},
        "pes_galinha_esq": {"x": cx_face - fw_n * 0.38, "y": cy_face - fh_n * 0.1},
        "pes_galinha_dir": {"x": cx_face + fw_n * 0.38, "y": cy_face - fh_n * 0.1},
    }


def _default_zone_centers() -> Dict:
    """Default zone centers for a centered face (last resort fallback)."""
    return {
        "temporal_esq": {"x": 0.25, "y": 0.25},
        "temporal_dir": {"x": 0.75, "y": 0.25},
        "zigoma_lat_esq": {"x": 0.22, "y": 0.42},
        "zigoma_lat_dir": {"x": 0.78, "y": 0.42},
        "olheira_esq": {"x": 0.38, "y": 0.38},
        "olheira_dir": {"x": 0.62, "y": 0.38},
        "sulco_esq": {"x": 0.37, "y": 0.58},
        "sulco_dir": {"x": 0.63, "y": 0.58},
        "mandibula_esq": {"x": 0.28, "y": 0.78},
        "mandibula_dir": {"x": 0.72, "y": 0.78},
        "mento": {"x": 0.5, "y": 0.88},
        "labio": {"x": 0.5, "y": 0.65},
        "nariz": {"x": 0.5, "y": 0.52},
        "testa": {"x": 0.5, "y": 0.18},
        "glabela": {"x": 0.5, "y": 0.28},
    }
