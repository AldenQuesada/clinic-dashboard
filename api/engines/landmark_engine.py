"""
ClinicAI — Landmark Engine
Professional facial landmark detection using MediaPipe Face Mesh (478 3D points).

Capabilities:
- 478-point 3D face mesh with z-depth
- Facial thirds calculation (trichion/glabela/subnasal/mento)
- Ricketts E-line analysis
- Golden ratio measurements
- Facial symmetry analysis (%)
- Face shape classification (oval/round/square/heart/oblong/diamond)
- Head pose estimation (yaw/pitch/roll)
- Auto zone center detection for 20 anatomical zones
"""

import cv2
import numpy as np
import logging
import math
import os
from typing import Dict, List, Optional, Tuple

log = logging.getLogger("facial-api.landmark-engine")

# Lazy-loaded MediaPipe FaceLandmarker
_face_landmarker = None
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


# ── MediaPipe Landmark Indices ─────────────────────────────

# Key anatomical points (MediaPipe 478 mesh)
LANDMARKS = {
    # Face contour
    "forehead_top": 10,
    "chin": 152,
    "left_cheek": 234,
    "right_cheek": 454,

    # Eyes
    "left_eye_inner": 133,
    "left_eye_outer": 33,
    "left_eye_top": 159,
    "left_eye_bottom": 145,
    "right_eye_inner": 362,
    "right_eye_outer": 263,
    "right_eye_top": 386,
    "right_eye_bottom": 374,

    # Eyebrows
    "left_brow_inner": 107,
    "left_brow_outer": 70,
    "left_brow_top": 105,
    "right_brow_inner": 336,
    "right_brow_outer": 300,
    "right_brow_top": 334,

    # Nose
    "nose_tip": 1,
    "nose_bridge": 6,
    "nose_left": 129,
    "nose_right": 358,
    "nose_base": 2,

    # Lips
    "upper_lip_top": 13,
    "upper_lip_bottom": 14,
    "lower_lip_top": 14,
    "lower_lip_bottom": 17,
    "lip_left": 61,
    "lip_right": 291,

    # Jaw
    "jaw_left": 172,
    "jaw_right": 397,
    "jaw_left_angle": 172,   # true gonial angle (lowest lateral point of jaw)
    "jaw_right_angle": 397,  # true gonial angle (lowest lateral point of jaw)

    # Temples
    "left_temple": 54,
    "right_temple": 284,

    # Glabela
    "glabela": 9,

    # Zygomatic (cheekbones)
    "left_zygomatic": 93,
    "right_zygomatic": 323,
}

# Face oval contour indices for shape analysis
FACE_OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

# Zone center mapping — which landmarks define each treatment zone center
ZONE_LANDMARKS = {
    "temporal_esq": ["left_temple"],
    "temporal_dir": ["right_temple"],
    "glabela": ["glabela"],
    "zigoma_lat_esq": ["left_zygomatic"],
    "zigoma_lat_dir": ["right_zygomatic"],
    "zigoma_ant_esq": ["left_cheek"],
    "zigoma_ant_dir": ["right_cheek"],
    "olheira_esq": ["left_eye_inner", "left_eye_bottom"],
    "olheira_dir": ["right_eye_inner", "right_eye_bottom"],
    "sulco_esq": ["nose_left", "lip_left"],
    "sulco_dir": ["nose_right", "lip_right"],
    "marionete_esq": ["lip_left", "jaw_left"],
    "marionete_dir": ["lip_right", "jaw_right"],
    "mandibula_esq": ["jaw_left_angle", "jaw_left"],
    "mandibula_dir": ["jaw_right_angle", "jaw_right"],
    "mento": ["chin"],
    "labio": ["upper_lip_top", "lower_lip_bottom"],
    "nariz": ["nose_tip"],
    "testa": ["forehead_top", "glabela"],
    "pes_galinha_esq": ["left_eye_outer"],
    "pes_galinha_dir": ["right_eye_outer"],
}


def get_face_landmarker():
    """Lazy-load MediaPipe FaceLandmarker (tasks API — works on all Python versions)."""
    global _face_landmarker
    if _face_landmarker is None:
        import mediapipe as mp

        model_path = os.path.join(MODELS_DIR, "face_landmarker.task")
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Face landmarker model not found at {model_path}. "
                "Download from: https://storage.googleapis.com/mediapipe-models/"
                "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
            )

        base_options = mp.tasks.BaseOptions(model_asset_path=model_path)
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=True,
        )
        _face_landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
        log.info("MediaPipe FaceLandmarker loaded (478 landmarks, tasks API)")
    return _face_landmarker


def scan_face(img_bgr: np.ndarray) -> Optional[Dict]:
    """
    Full face scan: 478 landmarks + metrics + measurements.

    Returns:
        Dict with landmarks, key_points, thirds, ricketts, pose, symmetry, shape,
        zone_centers, measurements, face_rect
    """
    import mediapipe as mp

    h, w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    # Convert to MediaPipe Image
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)

    landmarker = get_face_landmarker()
    results = landmarker.detect(mp_image)

    if not results.face_landmarks or len(results.face_landmarks) == 0:
        log.warning("No face detected by MediaPipe")
        return None

    face = results.face_landmarks[0]

    # Extract all landmarks as numpy array (normalized 0-1)
    landmarks = np.array([[lm.x, lm.y, lm.z] for lm in face])

    # Build key points dict (pixel coordinates)
    key_points = {}
    for name, idx in LANDMARKS.items():
        lm = landmarks[idx]
        key_points[name] = {
            "x": round(float(lm[0]), 4),
            "y": round(float(lm[1]), 4),
            "z": round(float(lm[2]), 4),
            "px": int(lm[0] * w),
            "py": int(lm[1] * h),
        }

    # Face bounding box from landmarks
    xs = landmarks[:, 0] * w
    ys = landmarks[:, 1] * h
    fx, fy = int(np.min(xs)), int(np.min(ys))
    fw, fh = int(np.max(xs) - fx), int(np.max(ys) - fy)

    # Facial thirds
    thirds = _calculate_thirds(key_points)

    # Ricketts E-line
    ricketts = _calculate_ricketts(key_points)

    # Head pose
    pose = _estimate_pose(landmarks, w, h)

    # Symmetry
    symmetry = _calculate_symmetry(key_points)

    # Face shape
    shape = _classify_face_shape(landmarks, w, h)

    # Zone centers
    zone_centers = _get_zone_centers(key_points)

    # Measurements
    measurements = _calculate_measurements(key_points, w, h)

    # Landmarks as serializable list (only x,y for frontend — z is depth)
    landmarks_list = [
        {"x": round(float(lm[0]), 5), "y": round(float(lm[1]), 5), "z": round(float(lm[2]), 5)}
        for lm in landmarks
    ]

    return {
        "landmark_count": len(landmarks),
        "landmarks": landmarks_list,
        "key_points": key_points,
        "thirds": thirds,
        "ricketts": ricketts,
        "pose": pose,
        "symmetry": symmetry,
        "shape": shape,
        "zone_centers": zone_centers,
        "measurements": measurements,
        "face_rect": {"x": fx, "y": fy, "w": fw, "h": fh},
        "image_size": {"w": w, "h": h},
    }


# ── Facial Thirds ──────────────────────────────────────────

def _calculate_thirds(kp: Dict) -> Dict:
    """
    Calculate facial thirds from landmarks.
    Superior: trichion (hairline) to glabela
    Medio: glabela to subnasal
    Inferior: subnasal to mento
    """
    # Use forehead_top as trichion approximation
    trichion_y = kp["forehead_top"]["y"]
    glabela_y = kp["glabela"]["y"]
    subnasal_y = kp["nose_base"]["y"]
    mento_y = kp["chin"]["y"]

    total = mento_y - trichion_y
    if total <= 0:
        return {"superior": 33.3, "medio": 33.3, "inferior": 33.3, "balanced": True}

    superior = (glabela_y - trichion_y) / total * 100
    medio = (subnasal_y - glabela_y) / total * 100
    inferior = (mento_y - subnasal_y) / total * 100

    # Ideal: each third ~33%. Balanced if all within 28-38%
    balanced = all(28 <= t <= 38 for t in [superior, medio, inferior])

    return {
        "superior": round(superior, 1),
        "medio": round(medio, 1),
        "inferior": round(inferior, 1),
        "balanced": balanced,
        "points": {
            "trichion": {"x": kp["forehead_top"]["x"], "y": trichion_y},
            "glabela": {"x": kp["glabela"]["x"], "y": glabela_y},
            "subnasal": {"x": kp["nose_base"]["x"], "y": subnasal_y},
            "mento": {"x": kp["chin"]["x"], "y": mento_y},
        },
    }


# ── Ricketts E-Line ────────────────────────────────────────

def _calculate_ricketts(kp: Dict) -> Dict:
    """
    Ricketts E-line: straight line from nose tip to chin.
    Ideal: upper lip 4mm behind, lower lip 2mm behind the line.
    """
    nose = kp["nose_tip"]
    chin = kp["chin"]

    # E-line vector
    dx = chin["x"] - nose["x"]
    dy = chin["y"] - nose["y"]
    line_len = math.sqrt(dx**2 + dy**2)

    if line_len < 0.01:
        return {"assessment": "insufficient_data"}

    # Normal vector (perpendicular to E-line, pointing outward)
    nx = -dy / line_len
    ny = dx / line_len

    # Distance from upper lip to E-line
    ul = kp["upper_lip_top"]
    ul_vec_x = ul["x"] - nose["x"]
    ul_vec_y = ul["y"] - nose["y"]
    upper_lip_dist = ul_vec_x * nx + ul_vec_y * ny

    # Distance from lower lip to E-line
    ll = kp["lower_lip_bottom"]
    ll_vec_x = ll["x"] - nose["x"]
    ll_vec_y = ll["y"] - nose["y"]
    lower_lip_dist = ll_vec_x * nx + ll_vec_y * ny

    # Angle of E-line
    angle = math.degrees(math.atan2(dy, dx))

    # Assessment
    if upper_lip_dist < -0.02 and lower_lip_dist < -0.01:
        assessment = "perfil_retruido"
    elif upper_lip_dist > 0.01 and lower_lip_dist > 0.01:
        assessment = "perfil_protruido"
    else:
        assessment = "perfil_equilibrado"

    return {
        "nose_point": {"x": nose["x"], "y": nose["y"]},
        "chin_point": {"x": chin["x"], "y": chin["y"]},
        "upper_lip_distance": round(upper_lip_dist, 4),
        "lower_lip_distance": round(lower_lip_dist, 4),
        "angle": round(angle, 1),
        "assessment": assessment,
    }


# ── Head Pose ──────────────────────────────────────────────

def _estimate_pose(landmarks: np.ndarray, w: int, h: int) -> Dict:
    """
    Estimate head pose (yaw, pitch, roll) from 3D landmarks.
    Uses solvePnP with 6 key facial points.
    """
    # 3D model points (generic face model, normalized)
    model_points = np.array([
        [0.0, 0.0, 0.0],           # nose tip
        [0.0, -63.6, -12.5],       # chin
        [-43.3, 32.7, -26.0],      # left eye outer
        [43.3, 32.7, -26.0],       # right eye outer
        [-28.9, -28.9, -24.1],     # left mouth corner
        [28.9, -28.9, -24.1],      # right mouth corner
    ], dtype=np.float64)

    # 2D image points from landmarks
    indices = [1, 152, 33, 263, 61, 291]  # nose, chin, l_eye, r_eye, l_mouth, r_mouth
    image_points = np.array([
        [landmarks[idx][0] * w, landmarks[idx][1] * h]
        for idx in indices
    ], dtype=np.float64)

    # Camera matrix (approximate from image dimensions)
    focal_length = w
    center = (w / 2, h / 2)
    camera_matrix = np.array([
        [focal_length, 0, center[0]],
        [0, focal_length, center[1]],
        [0, 0, 1],
    ], dtype=np.float64)

    dist_coeffs = np.zeros((4, 1))

    try:
        success, rotation_vec, translation_vec = cv2.solvePnP(
            model_points, image_points, camera_matrix, dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )

        if not success:
            return {"yaw": 0, "pitch": 0, "roll": 0, "estimated": False}

        rotation_mat, _ = cv2.Rodrigues(rotation_vec)

        # Build 3x4 projection matrix manually (avoids hconcat compatibility issues)
        proj_mat = np.hstack([rotation_mat, translation_vec])
        _, _, _, _, _, _, euler_angles = cv2.decomposeProjectionMatrix(proj_mat)

        yaw = float(euler_angles[1][0])
        pitch = float(euler_angles[0][0])
        roll = float(euler_angles[2][0])

        # Determine face angle description
        if abs(yaw) < 8:
            angle_desc = "frontal"
        elif abs(yaw) < 25:
            angle_desc = "45_graus"
        else:
            angle_desc = "lateral"

        return {
            "yaw": round(yaw, 1),
            "pitch": round(pitch, 1),
            "roll": round(roll, 1),
            "angle_description": angle_desc,
            "estimated": True,
        }
    except Exception as e:
        log.warning(f"Pose estimation failed: {e}")
        return {"yaw": 0, "pitch": 0, "roll": 0, "estimated": False}


# ── Symmetry Analysis ──────────────────────────────────────

def _calculate_symmetry(kp: Dict) -> Dict:
    """
    Calculate facial symmetry by comparing left/right landmark pairs.
    Returns overall % and per-feature breakdown.
    """
    # Midline reference (nose bridge to chin)
    mid_x = (kp["nose_bridge"]["x"] + kp["chin"]["x"]) / 2

    pairs = {
        "olhos": ("left_eye_inner", "right_eye_inner"),
        "sobrancelhas": ("left_brow_inner", "right_brow_inner"),
        "zigoma": ("left_zygomatic", "right_zygomatic"),
        "mandibula": ("jaw_left_angle", "jaw_right_angle"),
        "temporas": ("left_temple", "right_temple"),
        "boca": ("lip_left", "lip_right"),
    }

    scores = {}
    for name, (left_key, right_key) in pairs.items():
        left = kp[left_key]
        right = kp[right_key]

        # Distance from midline
        left_dist = abs(left["x"] - mid_x)
        right_dist = abs(right["x"] - mid_x)

        # Height comparison
        y_diff = abs(left["y"] - right["y"])

        # Symmetry = 1 - normalized difference
        # Calibrated: real faces with visible asymmetry should score 60-75%
        if max(left_dist, right_dist) > 0:
            x_sym = 1.0 - abs(left_dist - right_dist) / max(left_dist, right_dist) * 2.5
        else:
            x_sym = 1.0

        y_sym = max(0, 1.0 - y_diff * 30)  # strong penalty for height differences

        # Also measure z-depth asymmetry if available
        z_sym = 1.0
        if "z" in left and "z" in right:
            z_diff = abs(left["z"] - right["z"])
            z_sym = max(0, 1.0 - z_diff * 15)

        score = (x_sym * 0.4 + y_sym * 0.35 + z_sym * 0.25) * 100
        scores[name] = round(max(0, min(100, score)), 1)

    overall = round(sum(scores.values()) / len(scores), 1)

    return {
        "overall": overall,
        "features": scores,
        "midline_x": round(mid_x, 4),
        "assessment": "simetrico" if overall >= 85 else "leve_assimetria" if overall >= 70 else "assimetria_notavel",
    }


# ── Face Shape Classification ──────────────────────────────

def _classify_face_shape(landmarks: np.ndarray, w: int, h: int) -> Dict:
    """
    Classify face shape based on proportional measurements.
    Types: oval, redondo, quadrado, coracão, oblongo, diamante
    """
    # Get contour points
    contour = landmarks[FACE_OVAL]
    contour_px = contour[:, :2] * np.array([w, h])

    # Key measurements
    forehead_width = _landmark_dist(landmarks, 54, 284) * w    # temple to temple
    cheekbone_width = _landmark_dist(landmarks, 93, 323) * w   # zygomatic
    jaw_width = _landmark_dist(landmarks, 172, 397) * w        # jaw angles
    face_length = _landmark_dist(landmarks, 10, 152) * h       # top to chin

    # Ratios
    if face_length < 1:
        face_length = 1
    width_to_length = cheekbone_width / face_length
    forehead_to_jaw = forehead_width / max(1, jaw_width)
    cheek_to_jaw = cheekbone_width / max(1, jaw_width)

    # Classification logic
    if width_to_length > 0.85:
        shape = "redondo"
        description = "Rosto redondo — largura e altura similares"
    elif width_to_length < 0.6:
        shape = "oblongo"
        description = "Rosto oblongo — significativamente mais longo que largo"
    elif cheek_to_jaw > 1.15 and forehead_to_jaw > 1.1:
        shape = "diamante"
        description = "Rosto diamante — zigoma mais largo, testa e mandibula estreitas"
    elif forehead_to_jaw > 1.2:
        shape = "coracao"
        description = "Rosto coracao — testa larga, mandibula estreita"
    elif abs(forehead_to_jaw - 1.0) < 0.1 and width_to_length > 0.72:
        shape = "quadrado"
        description = "Rosto quadrado — testa, zigoma e mandibula alinhados"
    else:
        shape = "oval"
        description = "Rosto oval — proporcoes equilibradas, zigoma levemente mais largo"

    return {
        "shape": shape,
        "description": description,
        "measurements": {
            "forehead_width_px": round(forehead_width, 1),
            "cheekbone_width_px": round(cheekbone_width, 1),
            "jaw_width_px": round(jaw_width, 1),
            "face_length_px": round(face_length, 1),
        },
        "ratios": {
            "width_to_length": round(width_to_length, 3),
            "forehead_to_jaw": round(forehead_to_jaw, 3),
            "cheek_to_jaw": round(cheek_to_jaw, 3),
        },
    }


# ── Measurements ───────────────────────────────────────────

def _calculate_measurements(kp: Dict, w: int, h: int) -> Dict:
    """
    Calculate facial proportional measurements and golden ratio adherence.
    """
    # Interpupillary distance
    ipd = _kp_dist(kp, "left_eye_inner", "right_eye_inner") * w

    # Nose width
    nose_width = _kp_dist(kp, "nose_left", "nose_right") * w

    # Mouth width
    mouth_width = _kp_dist(kp, "lip_left", "lip_right") * w

    # Face width at cheekbones
    face_width = _kp_dist(kp, "left_zygomatic", "right_zygomatic") * w

    # Face height
    face_height = _kp_dist(kp, "forehead_top", "chin") * h

    # Golden ratio checks (phi = 1.618)
    phi = 1.618
    golden_ratios = {}

    # Face height / face width (ideal ~1.618)
    if face_width > 0:
        ratio_h_w = face_height / face_width
        golden_ratios["face_height_width"] = {
            "value": round(ratio_h_w, 3),
            "ideal": phi,
            "deviation": round(abs(ratio_h_w - phi) / phi * 100, 1),
        }

    # Face width / IPD (ideal ~1.618)
    if ipd > 0:
        ratio_w_ipd = face_width / ipd
        golden_ratios["face_width_ipd"] = {
            "value": round(ratio_w_ipd, 3),
            "ideal": phi,
            "deviation": round(abs(ratio_w_ipd - phi) / phi * 100, 1),
        }

    # Nose width / mouth width (ideal ~0.618 or 1/phi)
    if mouth_width > 0:
        ratio_nose_mouth = nose_width / mouth_width
        golden_ratios["nose_mouth"] = {
            "value": round(ratio_nose_mouth, 3),
            "ideal": round(1 / phi, 3),
            "deviation": round(abs(ratio_nose_mouth - 1/phi) / (1/phi) * 100, 1),
        }

    # Overall golden ratio score (0-100)
    deviations = [r["deviation"] for r in golden_ratios.values()]
    golden_score = max(0, 100 - sum(deviations) / max(1, len(deviations)))

    return {
        "interpupillary_distance_px": round(ipd, 1),
        "nose_width_px": round(nose_width, 1),
        "mouth_width_px": round(mouth_width, 1),
        "face_width_px": round(face_width, 1),
        "face_height_px": round(face_height, 1),
        "golden_ratios": golden_ratios,
        "golden_ratio_score": round(golden_score, 1),
    }


# ── Zone Centers ───────────────────────────────────────────

def _get_zone_centers(kp: Dict) -> Dict:
    """
    Get center coordinates for each treatment zone based on landmarks.
    Returns normalized (0-1) coordinates for each zone.
    """
    centers = {}
    for zone, landmark_names in ZONE_LANDMARKS.items():
        points = [kp[name] for name in landmark_names if name in kp]
        if not points:
            continue

        avg_x = sum(p["x"] for p in points) / len(points)
        avg_y = sum(p["y"] for p in points) / len(points)

        # Adjust some zones that need offset from landmark center
        if "olheira" in zone:
            avg_y += 0.015  # slightly below eye
        elif "sulco" in zone:
            avg_x = avg_x * 1.0  # keep as is
            avg_y = (points[0]["y"] + points[1]["y"]) / 2  # between nose and mouth
        elif "marionete" in zone:
            avg_y = (points[0]["y"] + points[1]["y"]) / 2 + 0.01

        centers[zone] = {
            "x": round(avg_x, 4),
            "y": round(avg_y, 4),
        }

    return centers


# ── Helpers ────────────────────────────────────────────────

def _landmark_dist(landmarks: np.ndarray, i: int, j: int) -> float:
    """Euclidean distance between two landmarks (normalized coords)."""
    return float(np.sqrt(
        (landmarks[i][0] - landmarks[j][0])**2 +
        (landmarks[i][1] - landmarks[j][1])**2
    ))


def _kp_dist(kp: Dict, a: str, b: str) -> float:
    """Distance between two key points (normalized coords)."""
    return math.sqrt(
        (kp[a]["x"] - kp[b]["x"])**2 +
        (kp[a]["y"] - kp[b]["y"])**2
    )
