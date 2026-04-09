"""
Calibration Engine -- Extract transformation profile from reference before/after pair.
The doctor uploads a REAL result pair, system learns the transformation style.

Profiles are stored as JSON files in api/data/profiles/.
"""

import cv2
import numpy as np
import logging
import json
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

log = logging.getLogger("facial-api.calibration-engine")

PROFILES_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "profiles")

# Zone groups for displacement analysis
ZONE_GROUPS = {
    "temporal_esq": [54],
    "temporal_dir": [284],
    "zigoma_lat_esq": [93],
    "zigoma_lat_dir": [323],
    "zigoma_ant_esq": [234],
    "zigoma_ant_dir": [454],
    "olheira_esq": [133, 145],
    "olheira_dir": [362, 374],
    "sulco_esq": [129, 61],
    "sulco_dir": [358, 291],
    "marionete_esq": [61, 172],
    "marionete_dir": [291, 397],
    "mandibula_esq": [172],
    "mandibula_dir": [397],
    "mento": [152],
    "labio": [13, 17],
    "nariz": [1],
    "testa": [10, 9],
    "glabela": [9],
}


def extract_profile(
    before_bgr: np.ndarray,
    after_bgr: np.ndarray,
    landmarks_before: Optional[np.ndarray] = None,
    landmarks_after: Optional[np.ndarray] = None,
) -> Dict:
    """
    Extract a calibration profile from a real before/after pair.

    Steps:
    1. Run landmark detection on both if not provided
    2. Align after to before using affine transform (eye centers + nose tip)
    3. Per-zone displacement analysis (normalized to face width)
    4. Skin quality delta (wrinkles, spots, pores via skin engine)
    5. Color shift (mean LAB values on skin regions)
    6. Texture preservation ratio (Laplacian variance ratio)
    7. Build and return profile dict

    Args:
        before_bgr: Before treatment photo (BGR, uint8).
        after_bgr: After treatment photo (BGR, uint8).
        landmarks_before: Optional 478x3 landmarks for before image (normalized 0-1).
        landmarks_after: Optional 478x3 landmarks for after image (normalized 0-1).

    Returns:
        Profile dict with zone displacements, skin deltas, color shift, etc.
    """
    t0 = time.time()

    # Step 1: Detect landmarks if not provided
    t1 = time.time()
    if landmarks_before is None:
        landmarks_before = _detect_landmarks(before_bgr)
    if landmarks_after is None:
        landmarks_after = _detect_landmarks(after_bgr)

    if landmarks_before is None or landmarks_after is None:
        raise ValueError("Could not detect face landmarks in one or both images")
    log.info(f"Step 1 (landmark detection) completed in {time.time() - t1:.2f}s")

    h_b, w_b = before_bgr.shape[:2]
    h_a, w_a = after_bgr.shape[:2]

    # Step 2: Align after to before using affine transform
    t2 = time.time()
    after_aligned = _align_images(before_bgr, after_bgr, landmarks_before, landmarks_after)
    # Re-detect landmarks on aligned image for accurate comparison
    landmarks_after_aligned = _detect_landmarks(after_aligned)
    if landmarks_after_aligned is None:
        landmarks_after_aligned = landmarks_after
    log.info(f"Step 2 (alignment) completed in {time.time() - t2:.2f}s")

    # Face width for normalization
    face_width = abs(landmarks_before[234, 0] - landmarks_before[454, 0])
    if face_width < 0.01:
        face_width = 0.3  # fallback

    # Step 3: Per-zone displacement analysis
    t3 = time.time()
    zone_displacements = _analyze_zone_displacements(
        landmarks_before, landmarks_after_aligned, face_width
    )
    log.info(f"Step 3 (displacement analysis) completed in {time.time() - t3:.2f}s")

    # Step 4: Skin quality delta
    t4 = time.time()
    skin_deltas = _analyze_skin_deltas(before_bgr, after_aligned)
    log.info(f"Step 4 (skin quality delta) completed in {time.time() - t4:.2f}s")

    # Step 5: Color shift
    t5 = time.time()
    color_shift = _analyze_color_shift(before_bgr, after_aligned)
    log.info(f"Step 5 (color shift) completed in {time.time() - t5:.2f}s")

    # Step 6: Texture preservation ratio
    t6 = time.time()
    texture_preservation = _analyze_texture_preservation(before_bgr, after_aligned)
    log.info(f"Step 6 (texture preservation) completed in {time.time() - t6:.2f}s")

    # Step 7: Build profile
    overall_intensity = _estimate_overall_intensity(zone_displacements, skin_deltas)
    warp_scale = _compute_warp_scale(zone_displacements)
    texture_scale = _compute_texture_scale(skin_deltas, color_shift)

    profile = {
        "id": str(uuid.uuid4()),
        "name": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "zone_displacements": zone_displacements,
        "skin_deltas": skin_deltas,
        "color_shift": color_shift,
        "texture_preservation": round(texture_preservation, 3),
        "overall_intensity": round(overall_intensity, 3),
        "warp_scale": warp_scale,
        "texture_scale": texture_scale,
        "source": {
            "before_size": {"w": w_b, "h": h_b},
            "after_size": {"w": w_a, "h": h_a},
            "face_width_normalized": round(float(face_width), 4),
        },
    }

    log.info(f"Profile extraction total: {time.time() - t0:.2f}s")
    return profile


def save_profile(profile: Dict, name: Optional[str] = None) -> str:
    """
    Save a calibration profile to disk.

    Args:
        profile: Profile dict from extract_profile().
        name: Optional human-readable name for the profile.

    Returns:
        Profile ID string.
    """
    os.makedirs(PROFILES_DIR, exist_ok=True)

    if name is not None:
        profile["name"] = name

    profile_id = profile.get("id", str(uuid.uuid4()))
    filepath = os.path.join(PROFILES_DIR, f"{profile_id}.json")

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(profile, f, indent=2, ensure_ascii=False)
        log.info(f"Profile saved: {filepath}")
    except Exception as e:
        log.error(f"Failed to save profile: {e}")
        raise

    return profile_id


def load_profile(profile_id: str) -> Dict:
    """
    Load a calibration profile from disk.

    Args:
        profile_id: Profile UUID string.

    Returns:
        Profile dict.

    Raises:
        FileNotFoundError: If profile does not exist.
    """
    filepath = os.path.join(PROFILES_DIR, f"{profile_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Profile not found: {profile_id}")

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log.error(f"Failed to load profile {profile_id}: {e}")
        raise


def list_profiles() -> List[Dict]:
    """
    List all saved calibration profiles with metadata.

    Returns:
        List of dicts with id, name, created_at, overall_intensity.
    """
    os.makedirs(PROFILES_DIR, exist_ok=True)
    profiles = []

    try:
        for filename in os.listdir(PROFILES_DIR):
            if not filename.endswith(".json"):
                continue
            filepath = os.path.join(PROFILES_DIR, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                profiles.append({
                    "id": data.get("id", filename.replace(".json", "")),
                    "name": data.get("name"),
                    "created_at": data.get("created_at"),
                    "overall_intensity": data.get("overall_intensity"),
                    "texture_preservation": data.get("texture_preservation"),
                })
            except Exception as e:
                log.warning(f"Could not read profile {filename}: {e}")
    except Exception as e:
        log.error(f"Failed to list profiles: {e}")

    return sorted(profiles, key=lambda p: p.get("created_at", ""), reverse=True)


def delete_profile(profile_id: str) -> bool:
    """
    Delete a calibration profile.

    Args:
        profile_id: Profile UUID string.

    Returns:
        True if deleted, False if not found.
    """
    filepath = os.path.join(PROFILES_DIR, f"{profile_id}.json")
    if not os.path.exists(filepath):
        return False

    try:
        os.remove(filepath)
        log.info(f"Profile deleted: {profile_id}")
        return True
    except Exception as e:
        log.error(f"Failed to delete profile {profile_id}: {e}")
        return False


# -- Internal Analysis Functions --

def _detect_landmarks(img_bgr: np.ndarray) -> Optional[np.ndarray]:
    """
    Detect 478 face landmarks using landmark engine.

    Args:
        img_bgr: BGR image.

    Returns:
        Nx3 numpy array of normalized landmarks, or None if detection fails.
    """
    try:
        from engines.landmark_engine import scan_face
        result = scan_face(img_bgr)
        if result is None:
            return None
        landmarks_list = result["landmarks"]
        return np.array([[lm["x"], lm["y"], lm["z"]] for lm in landmarks_list])
    except Exception as e:
        log.warning(f"Landmark detection failed: {e}")
        return None


def _align_images(
    before_bgr: np.ndarray,
    after_bgr: np.ndarray,
    lm_before: np.ndarray,
    lm_after: np.ndarray,
) -> np.ndarray:
    """
    Align after image to before image using affine transform on 3 points:
    left eye center, right eye center, nose tip.

    Args:
        before_bgr: Before image.
        after_bgr: After image.
        lm_before: 478x3 landmarks of before.
        lm_after: 478x3 landmarks of after.

    Returns:
        Aligned after image (same size as before).
    """
    h_b, w_b = before_bgr.shape[:2]
    h_a, w_a = after_bgr.shape[:2]

    # 3 anchor points: left eye center (idx 33), right eye center (idx 263), nose tip (idx 1)
    anchor_indices = [33, 263, 1]

    src_pts = np.array([
        [lm_after[idx, 0] * w_a, lm_after[idx, 1] * h_a]
        for idx in anchor_indices
    ], dtype=np.float32)

    dst_pts = np.array([
        [lm_before[idx, 0] * w_b, lm_before[idx, 1] * h_b]
        for idx in anchor_indices
    ], dtype=np.float32)

    M = cv2.getAffineTransform(src_pts, dst_pts)
    aligned = cv2.warpAffine(after_bgr, M, (w_b, h_b), borderMode=cv2.BORDER_REFLECT)

    return aligned


def _analyze_zone_displacements(
    lm_before: np.ndarray,
    lm_after: np.ndarray,
    face_width: float,
) -> Dict:
    """
    Compute average landmark displacement per zone, normalized to face width.

    Args:
        lm_before: 478x3 before landmarks (normalized).
        lm_after: 478x3 after landmarks (normalized).
        face_width: Face width in normalized coordinates for scaling.

    Returns:
        Dict of zone_name -> {"dx", "dy", "mag"}.
    """
    displacements = {}

    for zone_name, indices in ZONE_GROUPS.items():
        dx_sum = 0.0
        dy_sum = 0.0
        count = 0

        for idx in indices:
            if idx >= len(lm_before) or idx >= len(lm_after):
                continue
            dx_sum += lm_after[idx, 0] - lm_before[idx, 0]
            dy_sum += lm_after[idx, 1] - lm_before[idx, 1]
            count += 1

        if count == 0:
            continue

        dx = dx_sum / count / face_width
        dy = dy_sum / count / face_width
        mag = float(np.sqrt(dx ** 2 + dy ** 2))

        displacements[zone_name] = {
            "dx": round(float(dx), 4),
            "dy": round(float(dy), 4),
            "mag": round(mag, 4),
        }

    return displacements


def _analyze_skin_deltas(
    before_bgr: np.ndarray,
    after_bgr: np.ndarray,
) -> Dict:
    """
    Run skin analysis on both images and compute score deltas.

    Args:
        before_bgr: Before image.
        after_bgr: After image.

    Returns:
        Dict of metric -> delta (positive = improvement).
    """
    try:
        from engines.skin_engine import analyze_skin_v2
        from utils.face_parsing import segment_skin

        mask_before = segment_skin(before_bgr)
        mask_after = segment_skin(after_bgr)

        scores_before = analyze_skin_v2(before_bgr, mask_before, generate_heatmaps=False)
        scores_after = analyze_skin_v2(after_bgr, mask_after, generate_heatmaps=False)

        sb = scores_before.get("scores", {})
        sa = scores_after.get("scores", {})

        deltas = {}
        for metric in ["wrinkles", "spots", "pores", "redness", "pigmentation", "firmness"]:
            before_val = sb.get(metric, 50)
            after_val = sa.get(metric, 50)
            deltas[metric] = round(after_val - before_val, 1)

        return deltas

    except Exception as e:
        log.warning(f"Skin delta analysis failed: {e}")
        return {}


def _analyze_color_shift(
    before_bgr: np.ndarray,
    after_bgr: np.ndarray,
) -> Dict:
    """
    Compute mean LAB color shift on skin regions.

    Args:
        before_bgr: Before image.
        after_bgr: After image.

    Returns:
        Dict with dL, da, db.
    """
    try:
        from utils.face_parsing import segment_skin

        mask = segment_skin(before_bgr)

        lab_before = cv2.cvtColor(before_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
        lab_after = cv2.cvtColor(after_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)

        skin_pixels = mask > 127

        if np.sum(skin_pixels) < 100:
            return {"dL": 0.0, "da": 0.0, "db": 0.0}

        dL = float(np.mean(lab_after[skin_pixels, 0]) - np.mean(lab_before[skin_pixels, 0]))
        da = float(np.mean(lab_after[skin_pixels, 1]) - np.mean(lab_before[skin_pixels, 1]))
        db = float(np.mean(lab_after[skin_pixels, 2]) - np.mean(lab_before[skin_pixels, 2]))

        return {
            "dL": round(dL, 2),
            "da": round(da, 2),
            "db": round(db, 2),
        }

    except Exception as e:
        log.warning(f"Color shift analysis failed: {e}")
        return {"dL": 0.0, "da": 0.0, "db": 0.0}


def _analyze_texture_preservation(
    before_bgr: np.ndarray,
    after_bgr: np.ndarray,
) -> float:
    """
    Compute texture preservation ratio via Laplacian variance.
    Ratio > 1 means after has more texture detail; < 1 means some detail lost.

    Args:
        before_bgr: Before image.
        after_bgr: After image.

    Returns:
        Texture preservation ratio (0.0-2.0 typical range).
    """
    try:
        gray_before = cv2.cvtColor(before_bgr, cv2.COLOR_BGR2GRAY)
        gray_after = cv2.cvtColor(after_bgr, cv2.COLOR_BGR2GRAY)

        lap_before = cv2.Laplacian(gray_before, cv2.CV_64F)
        lap_after = cv2.Laplacian(gray_after, cv2.CV_64F)

        var_before = float(np.var(lap_before))
        var_after = float(np.var(lap_after))

        if var_before < 1e-6:
            return 1.0

        return var_after / var_before

    except Exception as e:
        log.warning(f"Texture preservation analysis failed: {e}")
        return 1.0


def _estimate_overall_intensity(
    displacements: Dict,
    skin_deltas: Dict,
) -> float:
    """
    Estimate the overall transformation intensity from displacement and skin data.

    Args:
        displacements: Zone displacement dict.
        skin_deltas: Skin quality delta dict.

    Returns:
        Estimated intensity 0.0-1.0.
    """
    # Average displacement magnitude
    mags = [d["mag"] for d in displacements.values() if "mag" in d]
    avg_mag = np.mean(mags) if mags else 0.0

    # Average skin improvement (normalize: 20 points improvement = intensity 1.0)
    deltas = [abs(v) for v in skin_deltas.values() if isinstance(v, (int, float))]
    avg_delta = np.mean(deltas) if deltas else 0.0

    # Combine: displacement contributes 60%, skin delta 40%
    intensity = min(1.0, avg_mag * 15.0 * 0.6 + avg_delta / 20.0 * 0.4)

    return float(intensity)


def _compute_warp_scale(displacements: Dict) -> Dict:
    """
    Derive per-zone warp scale from displacements.
    Higher displacement magnitude -> higher warp scale.

    Args:
        displacements: Zone displacement dict.

    Returns:
        Dict of zone_group -> scale factor.
    """
    scales = {}
    zone_groups = {
        "temporal": ["temporal_esq", "temporal_dir"],
        "zigoma": ["zigoma_lat_esq", "zigoma_lat_dir", "zigoma_ant_esq", "zigoma_ant_dir"],
        "mandibula": ["mandibula_esq", "mandibula_dir"],
        "mento": ["mento"],
        "labio": ["labio"],
        "nariz": ["nariz"],
    }

    for group_name, zone_names in zone_groups.items():
        mags = []
        for zn in zone_names:
            d = displacements.get(zn)
            if d and "mag" in d:
                mags.append(d["mag"])
        if mags:
            # Scale: 0.02 displacement = 1.0 scale
            avg_mag = float(np.mean(mags))
            scales[group_name] = round(min(2.0, max(0.1, avg_mag / 0.02)), 2)
        else:
            scales[group_name] = 1.0

    return scales


def _compute_texture_scale(skin_deltas: Dict, color_shift: Dict) -> Dict:
    """
    Derive per-step texture scale from skin quality deltas.

    Args:
        skin_deltas: Skin quality delta dict.
        color_shift: Color shift dict.

    Returns:
        Dict of step_name -> scale factor.
    """
    scales = {}

    # Dark circles: if spots/pigmentation improved significantly
    spot_delta = abs(skin_deltas.get("spots", 0))
    pigment_delta = abs(skin_deltas.get("pigmentation", 0))
    scales["dark_circles"] = round(min(2.0, max(0.3, (spot_delta + pigment_delta) / 20.0)), 2)

    # Wrinkles: direct from wrinkle delta
    wrinkle_delta = abs(skin_deltas.get("wrinkles", 0))
    scales["wrinkles"] = round(min(2.0, max(0.3, wrinkle_delta / 15.0)), 2)

    # Smoothing: from pores and firmness
    pore_delta = abs(skin_deltas.get("pores", 0))
    firmness_delta = abs(skin_deltas.get("firmness", 0))
    scales["smoothing"] = round(min(2.0, max(0.3, (pore_delta + firmness_delta) / 25.0)), 2)

    # Pores
    scales["pores"] = round(min(2.0, max(0.3, pore_delta / 15.0)), 2)

    # Color: from color shift magnitude
    dL = abs(color_shift.get("dL", 0))
    da = abs(color_shift.get("da", 0))
    scales["color"] = round(min(2.0, max(0.3, (dL + da) / 8.0)), 2)

    return scales
