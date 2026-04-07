FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV + MediaPipe + image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download rembg model (avoids first-request delay)
RUN python -c "from rembg import new_session; new_session('u2net')" || true

# Copy application code
COPY main.py .
COPY collagen_engine.py .
COPY protocol_engine.py .
COPY utils/ ./utils/
COPY engines/ ./engines/
COPY routers/ ./routers/

# Copy models (face_landmarker.task = 3.6MB, optional ONNX models)
COPY models/ ./models/

EXPOSE 8000

# Single worker (models loaded in-process, lazy-loaded on first request)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
