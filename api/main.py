"""
ClinicAI — Facial Analysis API
FastAPI backend for face processing: background removal, landmarks, skin analysis
"""

import base64
import io
import time
import logging
from typing import Optional

import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Lazy imports (heavy models loaded on first use)
_rembg_session = None
_mp_face_mesh = None

app = FastAPI(
    title="ClinicAI Facial API",
    version="1.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("facial-api")


# ── Models ───────────────────────────────────────────────────

class PhotoRequest(BaseModel):
    photo_base64: str
    lead_id: Optional[str] = None

class LandmarkRequest(BaseModel):
    photo_base64: str

class AnalyzeRequest(BaseModel):
    photo_base64: str
    zones: Optional[list] = []


# ── Helpers ──────────────────────────────────────────────────

def b64_to_image(b64: str) -> Image.Image:
    """Convert base64 string to PIL Image."""
    if "," in b64:
        b64 = b64.split(",")[1]
    data = base64.b64decode(b64)
    return Image.open(io.BytesIO(data)).convert("RGBA")


def b64_to_cv2(b64: str) -> np.ndarray:
    """Convert base64 string to OpenCV BGR image."""
    if "," in b64:
        b64 = b64.split(",")[1]
    data = base64.b64decode(b64)
    arr = np.frombuffer(data, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def image_to_b64(img: Image.Image, fmt: str = "PNG") -> str:
    """Convert PIL Image to base64 string."""
    buf = io.BytesIO()
    img.save(buf, format=fmt, quality=95)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def cv2_to_b64(img: np.ndarray, fmt: str = ".png") -> str:
    """Convert OpenCV image to base64 string."""
    _, buf = cv2.imencode(fmt, img)
    return base64.b64encode(buf.tobytes()).decode("utf-8")


# ── Background Removal ──────────────────────────────────────

def get_rembg_session():
    global _rembg_session
    if _rembg_session is None:
        from rembg import new_session
        log.info("Loading rembg model (first time)...")
        _rembg_session = new_session("u2net")
        log.info("rembg model loaded.")
    return _rembg_session


@app.post("/remove-bg")
async def remove_background(req: PhotoRequest):
    """Remove background from portrait photo, replace with black. High quality."""
    t0 = time.time()
    try:
        from rembg import remove

        img = b64_to_image(req.photo_base64)
        session = get_rembg_session()

        # Remove background with refined alpha matting for hair detail
        result = remove(
            img,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,   # more generous foreground (keeps hair)
            alpha_matting_background_threshold=10,     # strict background (removes more bg)
            alpha_matting_erode_size=10,               # smaller erode = less edge loss
        )

        # Refine alpha mask for clean hair edges
        result_np = np.array(result)
        alpha = result_np[:, :, 3].astype(np.float32)

        # Minimal alpha smoothing (1px only — preserve hair strands)
        alpha_smooth = cv2.GaussianBlur(alpha, (3, 3), 0.5)

        # Boost semi-transparent areas to be more opaque
        alpha_boosted = np.clip(alpha_smooth * 1.4, 0, 255).astype(np.uint8)
        result_np[:, :, 3] = alpha_boosted

        result_refined = Image.fromarray(result_np, "RGBA")

        # Composite onto black background
        black_bg = Image.new("RGBA", result_refined.size, (0, 0, 0, 255))
        composite = Image.alpha_composite(black_bg, result_refined)
        final = composite.convert("RGB")

        # Apply sharpening to restore detail lost in processing
        final_np = np.array(final)
        final_bgr = cv2.cvtColor(final_np, cv2.COLOR_RGB2BGR)

        # Unsharp mask: sharpen without adding noise
        gaussian = cv2.GaussianBlur(final_bgr, (0, 0), 2.0)
        sharpened = cv2.addWeighted(final_bgr, 1.5, gaussian, -0.5, 0)

        # Convert back to PIL
        sharpened_rgb = cv2.cvtColor(sharpened, cv2.COLOR_BGR2RGB)
        final = Image.fromarray(sharpened_rgb)

        # Output as PNG (lossless)
        b64_result = image_to_b64(final, "PNG")

        elapsed = round(time.time() - t0, 2)
        log.info(f"BG removed in {elapsed}s | {img.size[0]}x{img.size[1]} | PNG output")

        return {
            "success": True,
            "image_b64": b64_result,
            "elapsed_s": elapsed,
            "size": list(final.size),
        }
    except Exception as e:
        log.error(f"BG removal failed: {e}")
        raise HTTPException(500, detail=str(e))


# ── Face Landmarks ───────────────────────────────────────────

def get_face_mesh():
    global _mp_face_mesh
    if _mp_face_mesh is None:
        import mediapipe as mp
        log.info("Loading MediaPipe Face Mesh...")
        _mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
        )
        log.info("Face Mesh loaded.")
    return _mp_face_mesh


@app.post("/landmarks")
async def detect_landmarks(req: LandmarkRequest):
    """Detect 468 face landmarks using MediaPipe."""
    t0 = time.time()
    try:
        img_cv = b64_to_cv2(req.photo_base64)
        h, w = img_cv.shape[:2]
        rgb = cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB)

        mesh = get_face_mesh()
        results = mesh.process(rgb)

        if not results.multi_face_landmarks:
            return {"success": False, "error": "No face detected"}

        face = results.multi_face_landmarks[0]
        landmarks = []
        for lm in face.landmark:
            landmarks.append({
                "x": round(lm.x, 5),
                "y": round(lm.y, 5),
                "z": round(lm.z, 5),
            })

        # Key anatomical points
        # Forehead top (10), chin bottom (152), nose tip (1),
        # left eye outer (263), right eye outer (33)
        key_points = {
            "forehead": landmarks[10],
            "chin": landmarks[152],
            "nose_tip": landmarks[1],
            "nose_bridge": landmarks[6],
            "left_eye_outer": landmarks[263],
            "right_eye_outer": landmarks[33],
            "left_ear": landmarks[234],
            "right_ear": landmarks[454],
            "upper_lip": landmarks[13],
            "lower_lip": landmarks[14],
            "left_cheek": landmarks[234],
            "right_cheek": landmarks[454],
        }

        # Calculate facial thirds
        forehead_y = landmarks[10]["y"]
        brow_y = (landmarks[70]["y"] + landmarks[300]["y"]) / 2
        nose_base_y = landmarks[2]["y"]
        chin_y = landmarks[152]["y"]

        total = chin_y - forehead_y
        thirds = {
            "superior": round((brow_y - forehead_y) / total * 100, 1) if total > 0 else 33,
            "medio": round((nose_base_y - brow_y) / total * 100, 1) if total > 0 else 33,
            "inferior": round((chin_y - nose_base_y) / total * 100, 1) if total > 0 else 33,
        }

        # Ricketts line analysis (nose tip to chin, check lip position)
        nose_x, nose_y = landmarks[1]["x"], landmarks[1]["y"]
        chin_x, chin_y_pt = landmarks[152]["x"], landmarks[152]["y"]
        lip_x, lip_y = landmarks[13]["x"], landmarks[13]["y"]

        # Distance of upper lip from Ricketts line
        # Positive = lip in front of line, Negative = lip behind
        dx = chin_x - nose_x
        dy = chin_y_pt - nose_y
        line_len = (dx**2 + dy**2) ** 0.5
        if line_len > 0:
            # Perpendicular distance
            ricketts_dist = ((lip_x - nose_x) * dy - (lip_y - nose_y) * dx) / line_len
        else:
            ricketts_dist = 0

        ricketts = {
            "nose_point": {"x": round(nose_x, 4), "y": round(nose_y, 4)},
            "chin_point": {"x": round(chin_x, 4), "y": round(chin_y_pt, 4)},
            "lip_distance": round(ricketts_dist, 4),
            "assessment": "harmonious" if abs(ricketts_dist) < 0.02 else ("retruded" if ricketts_dist < -0.02 else "protruded"),
        }

        elapsed = round(time.time() - t0, 2)
        log.info(f"Landmarks detected in {elapsed}s | {w}x{h} | thirds: {thirds}")

        return {
            "success": True,
            "landmark_count": len(landmarks),
            "landmarks": landmarks,
            "key_points": key_points,
            "thirds": thirds,
            "ricketts": ricketts,
            "image_size": {"w": w, "h": h},
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Landmark detection failed: {e}")
        raise HTTPException(500, detail=str(e))


# ── Skin Analysis ────────────────────────────────────────────

@app.post("/analyze-skin")
async def analyze_skin(req: AnalyzeRequest):
    """Analyze skin texture, spots, uniformity."""
    t0 = time.time()
    try:
        img_cv = b64_to_cv2(req.photo_base64)
        h, w = img_cv.shape[:2]

        # Convert to different color spaces
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        lab = cv2.cvtColor(img_cv, cv2.COLOR_BGR2LAB)
        hsv = cv2.cvtColor(img_cv, cv2.COLOR_BGR2HSV)

        # Texture analysis (Laplacian variance = sharpness/texture)
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        # Skin uniformity (standard deviation of L channel in LAB)
        l_channel = lab[:, :, 0]
        skin_uniformity = float(np.std(l_channel))

        # Spot detection (dark spots in L channel)
        blur_l = cv2.GaussianBlur(l_channel, (15, 15), 0)
        diff = cv2.absdiff(l_channel, blur_l)
        _, spots_mask = cv2.threshold(diff, 15, 255, cv2.THRESH_BINARY)
        spot_ratio = float(np.sum(spots_mask > 0) / (w * h))

        # Redness analysis (A channel in LAB)
        a_channel = lab[:, :, 1]
        redness = float(np.mean(a_channel))

        # Brightness
        brightness = float(np.mean(l_channel))

        # Pore visibility (high-pass filter)
        blur_gray = cv2.GaussianBlur(gray, (21, 21), 0)
        high_pass = cv2.subtract(gray, blur_gray)
        pore_score = float(np.std(high_pass))

        # Scores (0-100, higher = better)
        texture_score = max(0, min(100, 100 - (laplacian_var / 50)))
        uniformity_score = max(0, min(100, 100 - (skin_uniformity / 0.5)))
        spot_score = max(0, min(100, 100 - (spot_ratio * 1000)))
        redness_score = max(0, min(100, 100 - abs(redness - 128) * 2))
        pore_score_norm = max(0, min(100, 100 - (pore_score * 5)))

        overall = round((texture_score + uniformity_score + spot_score + redness_score + pore_score_norm) / 5, 1)

        elapsed = round(time.time() - t0, 2)
        log.info(f"Skin analysis in {elapsed}s | score: {overall}")

        return {
            "success": True,
            "scores": {
                "overall": overall,
                "texture": round(texture_score, 1),
                "uniformity": round(uniformity_score, 1),
                "spots": round(spot_score, 1),
                "redness": round(redness_score, 1),
                "pores": round(pore_score_norm, 1),
            },
            "raw": {
                "brightness": round(brightness, 1),
                "laplacian_var": round(laplacian_var, 1),
                "skin_std": round(skin_uniformity, 1),
                "spot_ratio": round(spot_ratio, 4),
                "redness_mean": round(redness, 1),
                "pore_std": round(pore_score, 1),
            },
            "image_size": {"w": w, "h": h},
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Skin analysis failed: {e}")
        raise HTTPException(500, detail=str(e))


# ── Auto Zone Detection ──────────────────────────────────────

@app.post("/auto-zones")
async def detect_zones(req: LandmarkRequest):
    """Auto-detect treatment zones based on face landmarks + skin analysis."""
    t0 = time.time()
    try:
        # Get landmarks first
        img_cv = b64_to_cv2(req.photo_base64)
        h, w = img_cv.shape[:2]
        rgb = cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB)

        mesh = get_face_mesh()
        results = mesh.process(rgb)

        if not results.multi_face_landmarks:
            return {"success": False, "error": "No face detected"}

        face = results.multi_face_landmarks[0]
        lm = face.landmark

        # Analyze specific zones
        zones = []

        # Olheira: dark circles under eyes
        # Sample pixels under eyes (landmarks 111, 340 = under eye)
        for side, idx in [("esquerdo", 111), ("direito", 340)]:
            uy, ux = int(lm[idx].y * h), int(lm[idx].x * w)
            if 0 < uy < h and 0 < ux < w:
                roi = img_cv[max(0,uy-10):uy+10, max(0,ux-15):ux+15]
                if roi.size > 0:
                    lab_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2LAB)
                    darkness = float(np.mean(lab_roi[:,:,0]))
                    if darkness < 140:  # dark area detected
                        zones.append({
                            "zone": "olheira",
                            "side": side,
                            "severity": round(max(0, (140 - darkness) / 40), 2),
                            "center": {"x": round(lm[idx].x, 4), "y": round(lm[idx].y, 4)},
                        })

        # Sulco nasogeniano: detect fold lines
        for side, idx in [("esquerdo", 205), ("direito", 425)]:
            sy, sx = int(lm[idx].y * h), int(lm[idx].x * w)
            if 0 < sy < h and 0 < sx < w:
                roi = img_cv[max(0,sy-8):sy+8, max(0,sx-8):sx+8]
                if roi.size > 0:
                    gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                    edges = cv2.Canny(gray_roi, 50, 150)
                    edge_density = float(np.sum(edges > 0) / max(1, edges.size))
                    if edge_density > 0.15:
                        zones.append({
                            "zone": "sulco",
                            "side": side,
                            "severity": round(min(1, edge_density / 0.3), 2),
                            "center": {"x": round(lm[idx].x, 4), "y": round(lm[idx].y, 4)},
                        })

        # Temporal: check volume loss (concavity)
        for side, idx in [("esquerdo", 162), ("direito", 389)]:
            zones.append({
                "zone": "temporal",
                "side": side,
                "severity": 0.5,  # Default medium
                "center": {"x": round(lm[idx].x, 4), "y": round(lm[idx].y, 4)},
            })

        # Glabela: wrinkle detection between brows
        g_y, g_x = int(lm[9].y * h), int(lm[9].x * w)
        if 0 < g_y < h and 0 < g_x < w:
            roi = img_cv[max(0,g_y-12):g_y+12, max(0,g_x-20):g_x+20]
            if roi.size > 0:
                gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                lines = cv2.Canny(gray_roi, 40, 120)
                line_density = float(np.sum(lines > 0) / max(1, lines.size))
                if line_density > 0.1:
                    zones.append({
                        "zone": "glabela",
                        "severity": round(min(1, line_density / 0.25), 2),
                        "center": {"x": round(lm[9].x, 4), "y": round(lm[9].y, 4)},
                    })

        # Mandibula contour
        zones.append({
            "zone": "mandibula",
            "center": {"x": round((lm[172].x + lm[397].x) / 2, 4), "y": round(lm[172].y, 4)},
            "severity": 0.4,
        })

        elapsed = round(time.time() - t0, 2)
        log.info(f"Auto-zones detected in {elapsed}s | {len(zones)} zones")

        return {
            "success": True,
            "zones": zones,
            "zone_count": len(zones),
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Auto-zone detection failed: {e}")
        raise HTTPException(500, detail=str(e))


# ── Health Check ─────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ClinicAI Facial API",
        "version": "1.0.0",
        "models": {
            "rembg": _rembg_session is not None,
            "mediapipe": _mp_face_mesh is not None,
        },
    }


@app.get("/")
async def root():
    return {"message": "ClinicAI Facial API", "docs": "/docs"}
