"""
ClinicAI — Color Grading & Image Normalization
Professional clinical photo standardization pipeline.

Features:
- CLAHE adaptive histogram equalization (preserves skin tones)
- Auto white balance (gray world + reference patches)
- Denoising (non-local means — best quality, preserves detail)
- Exposure normalization
- Skin tone preservation during all operations
"""

import cv2
import numpy as np
import logging

log = logging.getLogger("facial-api.color-grading")


def normalize_image(img_bgr: np.ndarray, strength: float = 1.0) -> np.ndarray:
    """
    Full normalization pipeline for clinical photos.

    Args:
        img_bgr: Input BGR image
        strength: 0.0-1.0, how aggressive the normalization is

    Returns:
        Normalized BGR image
    """
    result = img_bgr.copy()

    # Step 1: Denoise (preserve detail, remove sensor noise)
    result = denoise(result, strength=strength)

    # Step 2: White balance
    result = auto_white_balance(result, strength=strength)

    # Step 3: CLAHE on luminance only (preserve color)
    result = apply_clahe(result, clip_limit=2.0 * strength, tile_size=8)

    # Step 4: Exposure normalization
    result = normalize_exposure(result, target_brightness=145, strength=strength)

    return result


def denoise(img_bgr: np.ndarray, strength: float = 1.0) -> np.ndarray:
    """
    Non-local means denoising — best quality denoiser available in OpenCV.
    Preserves edges and fine detail (pores, texture) while removing noise.
    """
    # Filter strength scales with user preference
    h = max(3, int(7 * strength))  # luminance filter strength
    h_color = max(3, int(7 * strength))  # color filter strength

    # fastNlMeansDenoisingColored: slower but highest quality
    # Positional args: src, dst, h, hColor, templateWindowSize, searchWindowSize
    denoised = cv2.fastNlMeansDenoisingColored(
        img_bgr, None, h, h_color, 7, 21
    )

    return denoised


def auto_white_balance(img_bgr: np.ndarray, strength: float = 1.0) -> np.ndarray:
    """
    Gray World white balance with skin-tone preservation.
    Corrects color casts from artificial lighting without making skin look unnatural.
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    l_ch, a_ch, b_ch = cv2.split(lab)

    # Gray world assumption: average of a,b channels should be ~128
    a_mean = np.mean(a_ch)
    b_mean = np.mean(b_ch)

    # Shift a,b channels toward neutral, scaled by strength
    a_shift = (128.0 - a_mean) * strength * 0.7  # 0.7 = preserve skin warmth
    b_shift = (128.0 - b_mean) * strength * 0.5  # 0.5 = less aggressive on yellow/blue

    a_ch = np.clip(a_ch + a_shift, 0, 255)
    b_ch = np.clip(b_ch + b_shift, 0, 255)

    corrected = cv2.merge([l_ch, a_ch, b_ch]).astype(np.uint8)
    return cv2.cvtColor(corrected, cv2.COLOR_LAB2BGR)


def apply_clahe(
    img_bgr: np.ndarray,
    clip_limit: float = 2.0,
    tile_size: int = 8,
) -> np.ndarray:
    """
    CLAHE (Contrast Limited Adaptive Histogram Equalization).
    Applied ONLY to the L channel in LAB space — preserves color perfectly.

    This is the gold standard for medical/clinical image enhancement.
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)

    clahe = cv2.createCLAHE(
        clipLimit=clip_limit,
        tileGridSize=(tile_size, tile_size),
    )
    l_enhanced = clahe.apply(l_ch)

    enhanced = cv2.merge([l_enhanced, a_ch, b_ch])
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)


def normalize_exposure(
    img_bgr: np.ndarray,
    target_brightness: float = 145.0,
    strength: float = 1.0,
) -> np.ndarray:
    """
    Normalize overall exposure to a target brightness level.
    Clinical photos should have consistent, slightly bright exposure.
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    l_ch = lab[:, :, 0]

    current_brightness = np.mean(l_ch)
    if current_brightness < 10:  # nearly black image, skip
        return img_bgr

    # Calculate adjustment factor
    ratio = target_brightness / max(1.0, current_brightness)

    # Limit adjustment range to avoid blowout
    ratio = np.clip(ratio, 0.7, 1.5)

    # Blend with original based on strength
    effective_ratio = 1.0 + (ratio - 1.0) * strength

    lab[:, :, 0] = np.clip(l_ch * effective_ratio, 0, 255)
    normalized = lab.astype(np.uint8)

    return cv2.cvtColor(normalized, cv2.COLOR_LAB2BGR)


def sharpen_subtle(img_bgr: np.ndarray, amount: float = 0.3) -> np.ndarray:
    """
    Subtle unsharp mask — restores detail after denoising without artifacts.
    """
    gaussian = cv2.GaussianBlur(img_bgr, (0, 0), 2.0)
    sharpened = cv2.addWeighted(img_bgr, 1.0 + amount, gaussian, -amount, 0)
    return sharpened


def detect_lighting_quality(img_bgr: np.ndarray) -> dict:
    """
    Analyze lighting quality of the photo.
    Returns metrics that help decide enhancement intensity.
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l_ch = lab[:, :, 0].astype(float)
    a_ch = lab[:, :, 1].astype(float)
    b_ch = lab[:, :, 2].astype(float)

    h, w = l_ch.shape

    # Overall brightness
    brightness = float(np.mean(l_ch))

    # Contrast (standard deviation of luminance)
    contrast = float(np.std(l_ch))

    # Color cast detection
    a_bias = float(np.mean(a_ch) - 128)  # positive = reddish, negative = greenish
    b_bias = float(np.mean(b_ch) - 128)  # positive = yellowish, negative = bluish

    # Evenness: compare left vs right half brightness
    left_brightness = float(np.mean(l_ch[:, :w//2]))
    right_brightness = float(np.mean(l_ch[:, w//2:]))
    evenness = 1.0 - min(1.0, abs(left_brightness - right_brightness) / max(1, brightness))

    # Shadow ratio (% of pixels below threshold)
    shadow_ratio = float(np.sum(l_ch < 50) / (h * w))

    # Highlight ratio (% of blown out pixels)
    highlight_ratio = float(np.sum(l_ch > 240) / (h * w))

    # Quality score (0-100)
    quality = 100.0
    if brightness < 80 or brightness > 200:
        quality -= 20
    if contrast < 20 or contrast > 80:
        quality -= 15
    if abs(a_bias) > 10 or abs(b_bias) > 15:
        quality -= 15  # color cast
    if evenness < 0.85:
        quality -= 15  # uneven lighting
    if shadow_ratio > 0.3:
        quality -= 10
    if highlight_ratio > 0.1:
        quality -= 10

    return {
        "brightness": round(brightness, 1),
        "contrast": round(contrast, 1),
        "color_cast": {
            "a_bias": round(a_bias, 1),
            "b_bias": round(b_bias, 1),
            "description": _describe_cast(a_bias, b_bias),
        },
        "evenness": round(evenness, 3),
        "shadow_ratio": round(shadow_ratio, 3),
        "highlight_ratio": round(highlight_ratio, 3),
        "quality_score": round(max(0, quality), 1),
        "recommended_strength": round(min(1.0, max(0.3, (100 - quality) / 60)), 2),
    }


def _describe_cast(a_bias: float, b_bias: float) -> str:
    """Human-readable color cast description."""
    parts = []
    if a_bias > 8:
        parts.append("avermelhado")
    elif a_bias < -8:
        parts.append("esverdeado")
    if b_bias > 10:
        parts.append("amarelado")
    elif b_bias < -10:
        parts.append("azulado")
    return " + ".join(parts) if parts else "neutro"
