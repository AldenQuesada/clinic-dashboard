"""
ClinicAI — Facial Analysis API v2.0
FastAPI backend for face processing: background removal, landmarks, skin analysis,
image enhancement, face scanning, and treatment simulation.

Architecture:
  main.py         — Core endpoints (BG removal, landmarks, skin, zones, collagen, protocol)
  routers/        — Feature-specific routers (enhance, scanner, skin_v2, simulate)
  engines/        — Business logic engines (collagen, protocol, landmark, skin, warp)
  utils/          — Shared utilities (image helpers, color grading, face parsing, pipeline)
  models/         — Pre-trained model weights (lazy-loaded)
"""

import time
import logging
from typing import Optional

import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from utils.image_helpers import b64_to_image, b64_to_cv2, image_to_b64, cv2_to_b64

# Lazy imports (heavy models loaded on first use)
_rembg_session = None
_mp_face_mesh = None

app = FastAPI(
    title="ClinicAI Facial API",
    version="2.0.0",
    docs_url="/docs",
    description="Professional facial analysis, enhancement, and treatment planning API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("facial-api")

# ── Register Routers ────────────────────────────────────────
from routers.enhance import router as enhance_router
from routers.scanner import router as scanner_router
from routers.skin_v2 import router as skin_v2_router
from routers.simulate import router as simulate_router
app.include_router(enhance_router)
app.include_router(scanner_router)
app.include_router(skin_v2_router)
app.include_router(simulate_router)


# ── Models ───────────────────────────────────────────────────

class PhotoRequest(BaseModel):
    photo_base64: str
    lead_id: Optional[str] = None

class LandmarkRequest(BaseModel):
    photo_base64: str

class AnalyzeRequest(BaseModel):
    photo_base64: str
    zones: Optional[list] = []


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

        # Auto-crop to face with generous margin (forehead + chin space)
        final_np = np.array(final)
        final_bgr = cv2.cvtColor(final_np, cv2.COLOR_RGB2BGR)

        face_cascade = get_face_cascade()
        gray = cv2.cvtColor(final_bgr, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
        if len(faces) > 0:
            fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            ih, iw = final_bgr.shape[:2]
            # Face crop: generous hair, chin, ears visible
            margin_top = int(fh * 0.6)
            margin_bottom = int(fh * 0.25)
            margin_side = int(fw * 0.2)
            x1 = max(0, fx - margin_side)
            y1 = max(0, fy - margin_top)
            x2 = min(iw, fx + fw + margin_side)
            y2 = min(ih, fy + fh + margin_bottom)
            final_bgr = final_bgr[y1:y2, x1:x2]
            log.info(f"Auto-cropped to face: ({x1},{y1})-({x2},{y2}) from {iw}x{ih}")

        # Remove excess black border — trim rows/cols that are mostly black
        gray_trim = cv2.cvtColor(final_bgr, cv2.COLOR_BGR2GRAY)
        # Use higher threshold (25) and require at least 15% of row/col to be non-black
        row_content = np.mean(gray_trim > 25, axis=1)  # % of non-black pixels per row
        col_content = np.mean(gray_trim > 25, axis=0)  # % of non-black pixels per col
        rows = row_content > 0.15  # row has content if >15% is non-black
        cols = col_content > 0.15
        if np.any(rows) and np.any(cols):
            rmin, rmax = np.where(rows)[0][[0, -1]]
            cmin, cmax = np.where(cols)[0][[0, -1]]
            pad = 8
            rmin = max(0, rmin - pad)
            rmax = min(final_bgr.shape[0], rmax + pad)
            cmin = max(0, cmin - pad)
            cmax = min(final_bgr.shape[1], cmax + pad)
            final_bgr = final_bgr[rmin:rmax, cmin:cmax]
            log.info(f"Trimmed black border: {cmax-cmin}x{rmax-rmin}")

        # Subtle unsharp mask — restore detail without creating artifacts
        gaussian = cv2.GaussianBlur(final_bgr, (0, 0), 1.5)
        sharpened = cv2.addWeighted(final_bgr, 1.2, gaussian, -0.2, 0)

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

def get_face_cascade():
    """OpenCV Haar cascade for face detection (works on all Python versions)."""
    return cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')


def get_eye_cascade():
    return cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')


@app.post("/landmarks")
async def detect_landmarks(req: LandmarkRequest):
    """Detect face and estimate key points using OpenCV Haar cascades."""
    t0 = time.time()
    try:
        img_cv = b64_to_cv2(req.photo_base64)
        h, w = img_cv.shape[:2]
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

        face_cascade = get_face_cascade()
        eye_cascade = get_eye_cascade()

        faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
        if len(faces) == 0:
            return {"success": False, "error": "No face detected"}

        # Use largest face
        fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])

        # Detect eyes within face region
        face_roi = gray[fy:fy+fh, fx:fx+fw]
        eyes = eye_cascade.detectMultiScale(face_roi, 1.1, 5, minSize=(20, 20))

        # Estimate key points from face bounding box + eyes
        # Normalize to 0-1 range
        key_points = {
            "forehead": {"x": round((fx + fw/2) / w, 4), "y": round(fy / h, 4)},
            "chin": {"x": round((fx + fw/2) / w, 4), "y": round((fy + fh) / h, 4)},
            "nose_tip": {"x": round((fx + fw/2) / w, 4), "y": round((fy + fh * 0.65) / h, 4)},
            "nose_bridge": {"x": round((fx + fw/2) / w, 4), "y": round((fy + fh * 0.45) / h, 4)},
            "upper_lip": {"x": round((fx + fw/2) / w, 4), "y": round((fy + fh * 0.78) / h, 4)},
            "lower_lip": {"x": round((fx + fw/2) / w, 4), "y": round((fy + fh * 0.85) / h, 4)},
        }

        if len(eyes) >= 2:
            eyes_sorted = sorted(eyes, key=lambda e: e[0])
            le = eyes_sorted[0]
            re = eyes_sorted[-1]
            key_points["left_eye_outer"] = {"x": round((fx + le[0]) / w, 4), "y": round((fy + le[1] + le[3]/2) / h, 4)}
            key_points["right_eye_outer"] = {"x": round((fx + re[0] + re[2]) / w, 4), "y": round((fy + re[1] + re[3]/2) / h, 4)}

        # Calculate facial thirds from face bounding box
        # Hairline ~ top of face box, brow ~ 33% down, nose base ~ 62%, chin ~ bottom
        forehead_y = fy / h
        brow_y = (fy + fh * 0.33) / h
        nose_base_y = (fy + fh * 0.62) / h
        chin_y = (fy + fh) / h

        total = chin_y - forehead_y
        thirds = {
            "superior": round((brow_y - forehead_y) / total * 100, 1) if total > 0 else 33,
            "medio": round((nose_base_y - brow_y) / total * 100, 1) if total > 0 else 33,
            "inferior": round((chin_y - nose_base_y) / total * 100, 1) if total > 0 else 33,
        }

        # Ricketts estimate from nose tip to chin
        nose_x = key_points["nose_tip"]["x"]
        nose_y_pt = key_points["nose_tip"]["y"]
        chin_x = key_points["chin"]["x"]
        chin_y_pt = key_points["chin"]["y"]

        ricketts = {
            "nose_point": {"x": nose_x, "y": nose_y_pt},
            "chin_point": {"x": chin_x, "y": chin_y_pt},
            "assessment": "estimated",
        }

        elapsed = round(time.time() - t0, 2)
        log.info(f"Face detected in {elapsed}s | {w}x{h} | face: ({fx},{fy},{fw},{fh}) | thirds: {thirds}")

        return {
            "success": True,
            "landmark_count": len(eyes) + 6,  # eyes + estimated points
            "landmarks": [],  # No 468-point mesh without MediaPipe
            "key_points": key_points,
            "thirds": thirds,
            "ricketts": ricketts,
            "face_rect": {"x": int(fx), "y": int(fy), "w": int(fw), "h": int(fh)},
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
    """Auto-detect treatment zones using OpenCV face/eye detection + skin analysis."""
    t0 = time.time()
    try:
        img_cv = b64_to_cv2(req.photo_base64)
        h, w = img_cv.shape[:2]
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        lab = cv2.cvtColor(img_cv, cv2.COLOR_BGR2LAB)

        face_cascade = get_face_cascade()
        eye_cascade = get_eye_cascade()

        faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
        if len(faces) == 0:
            return {"success": False, "error": "No face detected"}

        fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
        zones = []

        # Olheira: dark circles under eyes
        eyes = eye_cascade.detectMultiScale(gray[fy:fy+fh, fx:fx+fw], 1.1, 5, minSize=(20, 20))
        for ex, ey, ew, eh in eyes[:2]:
            # Below each eye
            under_y = fy + ey + eh + 5
            under_x = fx + ex + ew // 2
            if under_y + 15 < h:
                roi = lab[under_y:under_y+15, max(0,under_x-15):under_x+15]
                if roi.size > 0:
                    darkness = float(np.mean(roi[:,:,0]))
                    if darkness < 160:
                        zones.append({
                            "zone": "olheira",
                            "severity": round(max(0, (160 - darkness) / 60), 2),
                            "center": {"x": round(under_x / w, 4), "y": round(under_y / h, 4)},
                        })

        # Sulco nasogeniano: wrinkle detection beside nose
        nose_x = fx + fw // 2
        nose_y = fy + int(fh * 0.65)
        for dx_off in [-int(fw*0.2), int(fw*0.2)]:
            sx = nose_x + dx_off
            if 0 < sx < w and 0 < nose_y < h:
                roi = gray[max(0,nose_y-10):nose_y+10, max(0,sx-8):sx+8]
                if roi.size > 0:
                    edges = cv2.Canny(roi, 50, 150)
                    density = float(np.sum(edges > 0) / max(1, edges.size))
                    if density > 0.12:
                        zones.append({
                            "zone": "sulco",
                            "severity": round(min(1, density / 0.25), 2),
                            "center": {"x": round(sx / w, 4), "y": round(nose_y / h, 4)},
                        })

        # Temporal: always suggest (common treatment area)
        for side, x_off in [("esquerdo", -0.35), ("direito", 0.35)]:
            zones.append({
                "zone": "temporal",
                "side": side,
                "severity": 0.5,
                "center": {"x": round((fx + fw/2 + fw*x_off) / w, 4), "y": round((fy + fh*0.2) / h, 4)},
            })

        # Glabela: wrinkle detection between brows
        gx = fx + fw // 2
        gy = fy + int(fh * 0.28)
        if 0 < gy < h and 0 < gx < w:
            roi = gray[max(0,gy-12):gy+12, max(0,gx-18):gx+18]
            if roi.size > 0:
                lines = cv2.Canny(roi, 40, 120)
                density = float(np.sum(lines > 0) / max(1, lines.size))
                if density > 0.1:
                    zones.append({
                        "zone": "glabela",
                        "severity": round(min(1, density / 0.25), 2),
                        "center": {"x": round(gx / w, 4), "y": round(gy / h, 4)},
                    })

        # Mandibula: always suggest
        zones.append({
            "zone": "mandibula",
            "severity": 0.4,
            "center": {"x": round((fx + fw/2) / w, 4), "y": round((fy + fh*0.95) / h, 4)},
        })

        # Mento
        zones.append({
            "zone": "mento",
            "severity": 0.3,
            "center": {"x": round((fx + fw/2) / w, 4), "y": round((fy + fh) / h, 4)},
        })

        elapsed = round(time.time() - t0, 2)
        log.info(f"Auto-zones: {len(zones)} zones in {elapsed}s")

        return {
            "success": True,
            "zones": zones,
            "zone_count": len(zones),
            "elapsed_s": elapsed,
        }
    except Exception as e:
        log.error(f"Auto-zone detection failed: {e}")
        raise HTTPException(500, detail=str(e))


# ── Collagen Assessment ──────────────────────────────────────

@app.post("/collagen-score")
async def collagen_assessment(req: PhotoRequest):
    """Assess collagen loss grade (I-IV) with detailed skin analysis."""
    t0 = time.time()
    try:
        from collagen_engine import assess_collagen

        img_cv = b64_to_cv2(req.photo_base64)
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        h, w = img_cv.shape[:2]

        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))

        if len(faces) == 0:
            return {"success": False, "error": "No face detected"}

        face_rect = tuple(int(v) for v in max(faces, key=lambda f: f[2] * f[3]))
        result = assess_collagen(img_cv, face_rect)

        elapsed = round(time.time() - t0, 2)
        result['success'] = True
        result['elapsed_s'] = elapsed

        log.info(f"Collagen assessment in {elapsed}s | grade={result['grade']} ({result['grade_name']}) | index={result['collagen_index']}")
        return result
    except Exception as e:
        log.error(f"Collagen assessment failed: {e}")
        raise HTTPException(500, detail=str(e))


# ── Protocol Recommendation ──────────────────────────────────

class ProtocolRequest(BaseModel):
    photo_base64: str
    complaint: Optional[str] = ''
    lead_name: Optional[str] = 'Paciente'


@app.post("/recommend-protocol")
async def recommend(req: ProtocolRequest):
    """AI-powered treatment protocol recommendation based on facial analysis."""
    t0 = time.time()
    try:
        from protocol_engine import recommend_protocol

        img_cv = b64_to_cv2(req.photo_base64)
        result = recommend_protocol(img_cv, req.complaint or '')

        if result is None:
            return {"success": False, "error": "No face detected"}

        elapsed = round(time.time() - t0, 2)
        result['elapsed_s'] = elapsed
        result['success'] = True
        result['lead_name'] = req.lead_name

        log.info(
            f"Protocol recommended in {elapsed}s | "
            f"class={result['classification']} | "
            f"AH={result['totals']['ah_ml']}mL | "
            f"Botox={result['totals']['botox_units']}U | "
            f"Bio={result['totals']['bio_sessions']} sessions"
        )

        return result
    except Exception as e:
        log.error(f"Protocol recommendation failed: {e}")
        raise HTTPException(500, detail=str(e))


# ── Health Check ─────────────────────────────────────────────

@app.get("/health")
async def health():
    from utils.image_pipeline import get_enhancement_capabilities
    caps = get_enhancement_capabilities()
    return {
        "status": "ok",
        "service": "ClinicAI Facial API",
        "version": "2.0.0",
        "models": {
            "rembg": _rembg_session is not None,
            "mediapipe": _mp_face_mesh is not None,
            "super_resolution": caps["super_resolution"]["available"],
            "face_restore": caps["face_restore"]["available"],
        },
    }


@app.get("/")
async def root():
    return {
        "message": "ClinicAI Facial API v2.0",
        "docs": "/docs",
        "endpoints": {
            "core": ["/remove-bg", "/landmarks", "/analyze-skin", "/auto-zones", "/collagen-score", "/recommend-protocol"],
            "enhance": ["/enhance/normalize", "/enhance/full", "/enhance/segment-skin", "/enhance/quality", "/enhance/capabilities"],
            "scanner": ["/scanner/scan-face", "/scanner/measure", "/scanner/classify-face", "/scanner/zone-centers"],
            "skin_v2": ["/skin/analyze", "/skin/heatmap", "/skin/zone-report"],
            "simulate": ["/simulate/preview", "/simulate/compare"],
        },
    }
