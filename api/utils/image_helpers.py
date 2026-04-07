"""
ClinicAI — Image Helper Utilities
Shared base64/PIL/OpenCV conversion functions used across all modules.
"""

import base64
import io
import numpy as np
import cv2
from PIL import Image


def b64_to_image(b64: str) -> Image.Image:
    """Convert base64 string to PIL RGBA Image."""
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
    """Convert OpenCV BGR image to base64 string."""
    _, buf = cv2.imencode(fmt, img)
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def cv2_to_pil(img: np.ndarray) -> Image.Image:
    """Convert OpenCV BGR to PIL RGB."""
    return Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))


def pil_to_cv2(img: Image.Image) -> np.ndarray:
    """Convert PIL RGB to OpenCV BGR."""
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)
