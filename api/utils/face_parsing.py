"""
ClinicAI — Face Parsing & Skin Segmentation
Multi-strategy skin segmentation with graceful fallback.

Strategy priority:
1. BiSeNet face parsing model (best quality — 19 classes)
2. MediaPipe face mesh convex hull (good — needs landmarks)
3. OpenCV color-space segmentation (baseline — always available)

All strategies return a binary mask where 255 = skin.
"""

import cv2
import numpy as np
import logging
import os
from typing import Optional, Tuple

log = logging.getLogger("facial-api.face-parsing")

# Lazy-loaded BiSeNet model
_bisenet_model = None
_bisenet_available = None


def segment_skin(
    img_bgr: np.ndarray,
    face_rect: Optional[Tuple[int, int, int, int]] = None,
    landmarks_478: Optional[np.ndarray] = None,
    strategy: str = "auto",
) -> np.ndarray:
    """
    Segment skin from a face image.

    Args:
        img_bgr: Input BGR image
        face_rect: (x, y, w, h) face bounding box
        landmarks_478: MediaPipe 478 landmarks as Nx3 array (optional)
        strategy: "auto", "bisenet", "mediapipe", "color"

    Returns:
        Binary mask (uint8) where 255 = skin, 0 = non-skin
    """
    if strategy == "auto":
        # Try best available
        if _check_bisenet_available():
            return _segment_bisenet(img_bgr)
        elif landmarks_478 is not None:
            return _segment_mediapipe(img_bgr, landmarks_478)
        else:
            return _segment_color(img_bgr, face_rect)
    elif strategy == "bisenet":
        return _segment_bisenet(img_bgr)
    elif strategy == "mediapipe":
        if landmarks_478 is None:
            log.warning("MediaPipe strategy requested but no landmarks provided, falling back to color")
            return _segment_color(img_bgr, face_rect)
        return _segment_mediapipe(img_bgr, landmarks_478)
    else:
        return _segment_color(img_bgr, face_rect)


def _check_bisenet_available() -> bool:
    """Check if BiSeNet ONNX model is available."""
    global _bisenet_available
    if _bisenet_available is not None:
        return _bisenet_available

    model_path = os.path.join(os.path.dirname(__file__), "..", "models", "bisenet_face.onnx")
    _bisenet_available = os.path.exists(model_path)
    if _bisenet_available:
        log.info(f"BiSeNet model found at {model_path}")
    else:
        log.info("BiSeNet model not found, using color-based segmentation")
    return _bisenet_available


def _segment_bisenet(img_bgr: np.ndarray) -> np.ndarray:
    """
    BiSeNet face parsing — 19-class semantic segmentation.
    Classes: 0=bg, 1=skin, 2=l_brow, 3=r_brow, 4=l_eye, 5=r_eye,
             6=eye_g, 7=l_ear, 8=r_ear, 9=ear_r, 10=nose,
             11=mouth, 12=u_lip, 13=l_lip, 14=neck, 15=necklace,
             16=cloth, 17=hair, 18=hat
    """
    global _bisenet_model

    try:
        import onnxruntime as ort

        if _bisenet_model is None:
            model_path = os.path.join(os.path.dirname(__file__), "..", "models", "bisenet_face.onnx")
            _bisenet_model = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
            log.info("BiSeNet ONNX model loaded")

        # Preprocess: resize to 512x512, normalize
        h, w = img_bgr.shape[:2]
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        img_resized = cv2.resize(img_rgb, (512, 512), interpolation=cv2.INTER_LINEAR)

        # Normalize to [0, 1] then standard ImageNet normalization
        img_float = img_resized.astype(np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        img_norm = (img_float - mean) / std

        # CHW format, add batch dimension
        img_chw = np.transpose(img_norm, (2, 0, 1))
        img_batch = np.expand_dims(img_chw, axis=0)

        # Inference
        input_name = _bisenet_model.get_inputs()[0].name
        result = _bisenet_model.run(None, {input_name: img_batch})
        parsing = np.argmax(result[0][0], axis=0)  # (512, 512)

        # Skin classes: 1 (skin), 10 (nose)
        # Exclude: eyes, brows, lips, hair, ears, clothing
        skin_classes = {1, 10, 14}  # skin, nose, neck
        mask_512 = np.zeros((512, 512), dtype=np.uint8)
        for cls in skin_classes:
            mask_512[parsing == cls] = 255

        # Resize back to original
        mask = cv2.resize(mask_512, (w, h), interpolation=cv2.INTER_NEAREST)

        # Smooth edges
        mask = cv2.GaussianBlur(mask, (5, 5), 1)
        _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)

        # Morphological cleanup
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)

        return mask

    except Exception as e:
        log.error(f"BiSeNet segmentation failed: {e}, falling back to color")
        return _segment_color(img_bgr, None)


def _segment_mediapipe(img_bgr: np.ndarray, landmarks: np.ndarray) -> np.ndarray:
    """
    Use MediaPipe 478 landmarks to create a face skin mask.
    Creates convex hull from face contour landmarks, then excludes
    eye regions, mouth, and eyebrows.
    """
    h, w = img_bgr.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    # Face oval indices (MediaPipe face mesh)
    face_oval_indices = [
        10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
        397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
        172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
    ]

    # Scale landmarks to pixel coordinates
    pts = landmarks[:, :2].copy()
    pts[:, 0] *= w
    pts[:, 1] *= h
    pts = pts.astype(np.int32)

    # Draw face oval
    oval_pts = pts[face_oval_indices]
    cv2.fillConvexPoly(mask, oval_pts, 255)

    # Exclude eyes
    left_eye_indices = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
    right_eye_indices = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]

    for eye_indices in [left_eye_indices, right_eye_indices]:
        eye_pts = pts[eye_indices]
        # Expand eye region slightly
        center = np.mean(eye_pts, axis=0).astype(np.int32)
        expanded = ((eye_pts - center) * 1.3 + center).astype(np.int32)
        cv2.fillPoly(mask, [expanded], 0)

    # Exclude mouth
    mouth_indices = [
        61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
        409, 270, 269, 267, 0, 37, 39, 40, 185,
    ]
    mouth_pts = pts[mouth_indices]
    cv2.fillPoly(mask, [mouth_pts], 0)

    # Exclude eyebrows
    left_brow = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
    right_brow = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
    for brow_indices in [left_brow, right_brow]:
        brow_pts = pts[brow_indices]
        center = np.mean(brow_pts, axis=0).astype(np.int32)
        expanded = ((brow_pts - center) * 1.2 + center).astype(np.int32)
        cv2.fillPoly(mask, [expanded], 0)

    # Smooth
    mask = cv2.GaussianBlur(mask, (7, 7), 2)
    _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)

    return mask


def _segment_color(
    img_bgr: np.ndarray,
    face_rect: Optional[Tuple[int, int, int, int]] = None,
) -> np.ndarray:
    """
    Color-space skin segmentation — always available, no model needed.
    Uses YCrCb + HSV dual thresholding for robust skin detection.
    """
    h, w = img_bgr.shape[:2]

    # Convert to YCrCb and HSV
    ycrcb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2YCrCb)
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)

    # YCrCb skin range (works for most skin tones)
    lower_ycrcb = np.array([0, 133, 77], dtype=np.uint8)
    upper_ycrcb = np.array([255, 173, 127], dtype=np.uint8)
    mask_ycrcb = cv2.inRange(ycrcb, lower_ycrcb, upper_ycrcb)

    # HSV skin range (complementary)
    lower_hsv = np.array([0, 20, 70], dtype=np.uint8)
    upper_hsv = np.array([20, 255, 255], dtype=np.uint8)
    mask_hsv1 = cv2.inRange(hsv, lower_hsv, upper_hsv)

    # Extended HSV range for darker/lighter skin
    lower_hsv2 = np.array([160, 20, 70], dtype=np.uint8)
    upper_hsv2 = np.array([180, 255, 255], dtype=np.uint8)
    mask_hsv2 = cv2.inRange(hsv, lower_hsv2, upper_hsv2)

    mask_hsv = cv2.bitwise_or(mask_hsv1, mask_hsv2)

    # Combine: require BOTH color spaces to agree (more precise)
    mask = cv2.bitwise_and(mask_ycrcb, mask_hsv)

    # If face_rect provided, restrict to face region + margin
    if face_rect is not None:
        fx, fy, fw, fh = face_rect
        margin = int(max(fw, fh) * 0.15)
        face_mask = np.zeros((h, w), dtype=np.uint8)
        x1 = max(0, fx - margin)
        y1 = max(0, fy - margin)
        x2 = min(w, fx + fw + margin)
        y2 = min(h, fy + fh + margin)
        face_mask[y1:y2, x1:x2] = 255
        mask = cv2.bitwise_and(mask, face_mask)

    # Morphological cleanup — remove noise, fill small holes
    kernel_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    kernel_large = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))

    # Remove small noise
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_small, iterations=2)

    # Fill small holes
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_large, iterations=3)

    # Keep only largest connected component (the face)
    mask = _keep_largest_component(mask)

    # Smooth edges
    mask = cv2.GaussianBlur(mask, (7, 7), 2)
    _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)

    return mask


def _keep_largest_component(mask: np.ndarray) -> np.ndarray:
    """Keep only the largest connected component in a binary mask."""
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num_labels <= 1:
        return mask

    # Find largest component (skip label 0 = background)
    largest_label = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    result = np.zeros_like(mask)
    result[labels == largest_label] = 255
    return result


def get_skin_region_stats(img_bgr: np.ndarray, skin_mask: np.ndarray) -> dict:
    """
    Compute statistics about the skin region.
    Used for adaptive enhancement and quality assessment.
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)

    # Apply mask
    skin_pixels = lab[skin_mask > 127]
    if len(skin_pixels) == 0:
        return {"pixel_count": 0, "coverage": 0.0}

    h, w = img_bgr.shape[:2]
    total_pixels = h * w
    skin_count = len(skin_pixels)

    l_vals = skin_pixels[:, 0].astype(float)
    a_vals = skin_pixels[:, 1].astype(float)
    b_vals = skin_pixels[:, 2].astype(float)

    return {
        "pixel_count": int(skin_count),
        "coverage": round(skin_count / total_pixels, 3),
        "brightness": {
            "mean": round(float(np.mean(l_vals)), 1),
            "std": round(float(np.std(l_vals)), 1),
            "min": round(float(np.min(l_vals)), 1),
            "max": round(float(np.max(l_vals)), 1),
        },
        "tone": {
            "a_mean": round(float(np.mean(a_vals)), 1),  # redness
            "b_mean": round(float(np.mean(b_vals)), 1),  # yellowness
        },
    }
