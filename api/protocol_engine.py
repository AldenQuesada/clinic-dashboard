"""
ClinicAI — Protocol Recommendation Engine
Trained on 11 real facial harmonization cases.

Analyzes a patient photo via OpenCV and recommends:
- Patient classification (A-H)
- Zone-by-zone treatment with mL/U doses
- Products (AH, Botox, Bioestimulador)
- Total mL, total units, estimated sessions
"""

import cv2
import numpy as np
from typing import Dict, List, Optional


# ── Zone Severity Detection ──────────────────────────────────

def analyze_face_zones(img_bgr: np.ndarray, face_rect: tuple) -> Dict:
    """Analyze each facial zone for severity (0=none, 1=leve, 2=moderado, 3=severo)."""
    fx, fy, fw, fh = face_rect
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)

    zones = {}

    # ── Olheira (dark circles under eyes)
    eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
    face_roi = gray[fy:fy+fh, fx:fx+fw]
    eyes = eye_cascade.detectMultiScale(face_roi, 1.1, 5, minSize=(20, 20))

    olheira_severity = 0
    if len(eyes) >= 1:
        for ex, ey, ew, eh in eyes[:2]:
            under_y = fy + ey + eh + 3
            under_x = fx + ex + ew // 2
            if under_y + 12 < h:
                roi = lab[under_y:under_y+12, max(0,under_x-12):under_x+12]
                if roi.size > 0:
                    darkness = float(np.mean(roi[:,:,0]))
                    if darkness < 120:
                        olheira_severity = max(olheira_severity, 3)
                    elif darkness < 140:
                        olheira_severity = max(olheira_severity, 2)
                    elif darkness < 160:
                        olheira_severity = max(olheira_severity, 1)
    zones['olheira'] = olheira_severity

    # ── Sulco nasogeniano (nasolabial fold)
    nose_x = fx + fw // 2
    nose_y = fy + int(fh * 0.65)
    sulco_severity = 0
    for dx_off in [-int(fw*0.18), int(fw*0.18)]:
        sx = nose_x + dx_off
        if 0 < sx < w and 0 < nose_y < h:
            roi = gray[max(0,nose_y-10):nose_y+10, max(0,sx-8):sx+8]
            if roi.size > 0:
                edges = cv2.Canny(roi, 50, 150)
                density = float(np.sum(edges > 0) / max(1, edges.size))
                if density > 0.15:
                    sulco_severity = max(sulco_severity, 3)
                elif density > 0.10:
                    sulco_severity = max(sulco_severity, 2)
                elif density > 0.06:
                    sulco_severity = max(sulco_severity, 1)
    zones['sulco'] = sulco_severity

    # ── Marionete (corners of mouth)
    mouth_y = fy + int(fh * 0.78)
    marionete_severity = 0
    for dx_off in [-int(fw*0.2), int(fw*0.2)]:
        mx = nose_x + dx_off
        my = mouth_y + int(fh * 0.05)
        if 0 < mx < w and 0 < my < h:
            roi = gray[max(0,my-8):my+8, max(0,mx-8):mx+8]
            if roi.size > 0:
                edges = cv2.Canny(roi, 40, 130)
                density = float(np.sum(edges > 0) / max(1, edges.size))
                if density > 0.12:
                    marionete_severity = max(marionete_severity, 2)
                elif density > 0.06:
                    marionete_severity = max(marionete_severity, 1)
    zones['marionete'] = marionete_severity

    # ── Rugas frontais (forehead wrinkles)
    forehead_y = fy + int(fh * 0.05)
    forehead_h = int(fh * 0.2)
    forehead_roi = gray[forehead_y:forehead_y+forehead_h, fx+int(fw*0.2):fx+int(fw*0.8)]
    rugas_severity = 0
    if forehead_roi.size > 0:
        h_edges = cv2.Sobel(forehead_roi, cv2.CV_64F, 0, 1, ksize=3)
        h_density = float(np.mean(np.abs(h_edges)))
        if h_density > 18:
            rugas_severity = 3
        elif h_density > 10:
            rugas_severity = 2
        elif h_density > 5:
            rugas_severity = 1
    zones['rugas_frontais'] = rugas_severity

    # ── Glabela (between brows)
    gx = fx + fw // 2
    gy = fy + int(fh * 0.28)
    glabela_severity = 0
    if 0 < gy < h and 0 < gx < w:
        roi = gray[max(0,gy-10):gy+10, max(0,gx-15):gx+15]
        if roi.size > 0:
            v_edges = cv2.Sobel(roi, cv2.CV_64F, 1, 0, ksize=3)
            v_density = float(np.mean(np.abs(v_edges)))
            if v_density > 15:
                glabela_severity = 3
            elif v_density > 8:
                glabela_severity = 2
            elif v_density > 4:
                glabela_severity = 1
    zones['glabela'] = glabela_severity

    # ── Volume loss detection (skin texture uniformity = proxy for age/volume)
    face_lab = lab[fy:fy+fh, fx:fx+fw]
    skin_std = float(np.std(face_lab[:,:,0])) if face_lab.size > 0 else 20.0
    skin_mean = float(np.mean(face_lab[:,:,0])) if face_lab.size > 0 else 140.0

    # Overall texture roughness (high = more wrinkles/pores = older)
    face_gray = gray[fy:fy+fh, fx:fx+fw]
    texture_var = float(cv2.Laplacian(face_gray, cv2.CV_64F).var()) if face_gray.size > 0 else 0

    # Boost severity if skin is rough (older skin)
    age_boost = 0
    if texture_var > 500:
        age_boost = 2
    elif texture_var > 200:
        age_boost = 1

    # Apply age boost to volume-related zones
    if age_boost > 0:
        zones['olheira'] = min(3, zones.get('olheira', 0) + age_boost)
        zones['sulco'] = min(3, max(zones.get('sulco', 0), age_boost))
        zones['marionete'] = min(3, max(zones.get('marionete', 0), age_boost - 1))

    # Temporal (estimate from face width ratio — wider face = less temporal loss)
    face_ratio = float(fw) / max(1, float(fh))
    temporal_severity = 0
    if face_ratio < 0.65:
        temporal_severity = 2  # narrow = likely temporal loss
    elif face_ratio < 0.72:
        temporal_severity = 1
    zones['temporal'] = temporal_severity

    # Zigoma (cheek volume — estimate from midface brightness/shadow)
    mid_y = fy + int(fh * 0.4)
    for side_name, x_off in [('left', -0.25), ('right', 0.25)]:
        zx = int(nose_x + fw * x_off)
        if 0 < zx < w and 0 < mid_y < h:
            roi = lab[max(0,mid_y-10):mid_y+10, max(0,zx-10):zx+10]
            if roi.size > 0:
                brightness = float(np.mean(roi[:,:,0]))
                shadow = skin_mean - brightness
                if shadow > 25:
                    zones['zigoma'] = max(zones.get('zigoma', 0), 3)
                elif shadow > 15:
                    zones['zigoma'] = max(zones.get('zigoma', 0), 2)
                elif shadow > 8:
                    zones['zigoma'] = max(zones.get('zigoma', 0), 1)
    if 'zigoma' not in zones:
        zones['zigoma'] = 0

    # Mandibula (jawline definition — estimate from lower face contrast)
    jaw_y = fy + int(fh * 0.85)
    jaw_roi = gray[jaw_y:min(h, jaw_y+int(fh*0.15)), fx:fx+fw]
    mandibula_severity = 1  # default: always some benefit
    if jaw_roi.size > 0:
        edges = cv2.Canny(jaw_roi, 30, 100)
        jaw_definition = float(np.sum(edges > 0) / max(1, edges.size))
        if jaw_definition < 0.05:
            mandibula_severity = 3  # no definition
        elif jaw_definition < 0.1:
            mandibula_severity = 2
        elif jaw_definition < 0.15:
            mandibula_severity = 1
        else:
            mandibula_severity = 0  # good definition
    zones['mandibula'] = mandibula_severity

    # Mento (chin projection — estimate from face proportions)
    lower_third = (fy + fh) - (fy + int(fh * 0.62))
    total_face = fh
    lower_ratio = lower_third / max(1, total_face)
    mento_severity = 0
    if lower_ratio < 0.34:
        mento_severity = 3  # very short = retruded
    elif lower_ratio < 0.37:
        mento_severity = 2
    elif lower_ratio < 0.39:
        mento_severity = 1
    zones['mento'] = mento_severity

    # Labio (estimate — thin lips = high contrast between lip and skin)
    lip_y = fy + int(fh * 0.78)
    lip_roi = gray[max(0,lip_y-5):lip_y+5, fx+int(fw*0.3):fx+int(fw*0.7)]
    labio_severity = 1  # default: most benefit from lip treatment
    if lip_roi.size > 0:
        lip_contrast = float(np.std(lip_roi))
        if lip_contrast < 10:
            labio_severity = 2  # very thin
        elif lip_contrast < 18:
            labio_severity = 1
        else:
            labio_severity = 0  # already has volume
    zones['labio'] = labio_severity

    # Baseline: texture-based minimum severities
    # Higher texture = older skin = more zones need treatment
    if texture_var > 50:  # any visible texture = at least some treatment
        zones['temporal'] = max(zones.get('temporal', 0), 1)
        zones['labio'] = max(zones.get('labio', 0), 1)
    if texture_var > 100:
        zones['sulco'] = max(zones.get('sulco', 0), 1)
        zones['zigoma'] = max(zones.get('zigoma', 0), 1)
    if texture_var > 200:
        zones['marionete'] = max(zones.get('marionete', 0), 1)
        zones['temporal'] = max(zones.get('temporal', 0), 2)

    # Metadata for classification
    zones['_skin_std'] = round(skin_std, 1)
    zones['_skin_mean'] = round(skin_mean, 1)
    zones['_face_ratio'] = round(face_ratio, 3)
    zones['_texture_var'] = round(texture_var, 1)
    zones['_age_boost'] = age_boost

    return zones


# ── Age Estimation (rough) ───────────────────────────────────

def estimate_age_bracket(zones: Dict) -> str:
    """Estimate age bracket from zone severities + texture."""
    wrinkle_score = zones.get('rugas_frontais', 0) + zones.get('glabela', 0)
    volume_score = zones.get('sulco', 0) + zones.get('marionete', 0) + zones.get('olheira', 0)
    structure_score = zones.get('mandibula', 0) + zones.get('mento', 0) + zones.get('zigoma', 0)
    texture_var = zones.get('_texture_var', 0)
    age_boost = zones.get('_age_boost', 0)

    total = wrinkle_score + volume_score + structure_score

    # Texture variance is a strong age signal
    if texture_var > 300 or (wrinkle_score >= 4 and volume_score >= 4):
        return '50+'
    elif texture_var > 120 or (wrinkle_score >= 2 and volume_score >= 2) or (age_boost >= 2):
        return '40-50'
    elif texture_var > 50 or volume_score >= 2 or total >= 5 or age_boost >= 1:
        return '30-40'
    else:
        return '<30'


# ── Classification ───────────────────────────────────────────

def classify_patient(zones: Dict, age: str, complaint: str = '') -> str:
    """Classify patient into protocol type."""
    complaint_lower = complaint.lower() if complaint else ''

    total_severity = sum(v for k, v in zones.items() if not k.startswith('_'))

    if age == '50+' or total_severity >= 18:
        return 'H'  # Extremo
    elif age == '40-50' and total_severity >= 12:
        return 'F'  # Rejuv. intensivo
    elif 'simetri' in complaint_lower or 'assimetri' in complaint_lower:
        return 'E'  # Correcao completa
    elif 'sexy' in complaint_lower or 'mulher' in complaint_lower or 'angul' in complaint_lower:
        return 'D'  # Definicao
    elif age in ['40-50', '30-40'] and total_severity >= 8:
        return 'B'  # Rejuvenescimento
    elif zones.get('_face_ratio', 0.7) > 0.78:
        return 'G'  # Biotipo cheio
    elif zones.get('mento', 0) >= 2 and zones.get('mandibula', 0) >= 2:
        return 'A'  # Estrutural
    elif total_severity <= 5:
        return 'C'  # Minimalista
    else:
        return 'B'  # Default: rejuvenescimento


# ── Protocol Generation ──────────────────────────────────────

# Dose table: severity → mL per zone
DOSE_TABLE = {
    'temporal':   {0: 0, 1: 1.0, 2: 2.0, 3: 3.0},   # bilateral
    'zigoma':     {0: 0, 1: 1.0, 2: 1.5, 3: 2.5},   # bilateral (lat+ant)
    'olheira':    {0: 0, 1: 0, 2: 0.5, 3: 1.0},      # bilateral
    'sulco':      {0: 0, 1: 0.5, 2: 1.0, 3: 1.5},    # bilateral
    'marionete':  {0: 0, 1: 0.5, 2: 1.0, 3: 1.0},    # bilateral
    'mandibula':  {0: 0, 1: 2.0, 2: 4.0, 3: 5.0},    # bilateral
    'mento':      {0: 0, 1: 0.5, 2: 1.0, 3: 2.0},
    'labio':      {0: 0, 1: 0.5, 2: 1.0, 3: 1.0},
}

# Botox dose table (units)
BOTOX_TABLE = {
    'glabela':        {0: 0, 1: 0, 2: 15, 3: 25},
    'rugas_frontais': {0: 0, 1: 0, 2: 12, 3: 20},
}

CLASSIFICATION_NAMES = {
    'A': 'Estrutural',
    'B': 'Rejuvenescimento',
    'C': 'Minimalista',
    'D': 'Definicao / Angulacao',
    'E': 'Correcao Completa',
    'F': 'Rejuvenescimento Intensivo',
    'G': 'Estruturacao (Biotipo Cheio)',
    'H': 'Restauracao Extrema',
}


def generate_protocol(zones: Dict, classification: str, age: str) -> Dict:
    """Generate full treatment protocol from zone analysis."""

    protocol = []
    total_ml = 0
    total_botox = 0

    # AH treatments
    for zone, dose_map in DOSE_TABLE.items():
        severity = zones.get(zone, 0)
        dose = dose_map.get(min(severity, 3), 0)

        # Classification modifiers
        if classification == 'C':  # Minimalista: reduce all by 50%
            dose = round(dose * 0.5, 1)
        elif classification == 'H':  # Extremo: increase by 30%
            dose = round(dose * 1.3, 1)
        elif classification == 'D':  # Definicao: boost mandibula/mento
            if zone in ('mandibula', 'mento', 'temporal'):
                dose = max(dose, 1.0)

        if dose > 0:
            product = 'Acido Hialuronico'
            if zone == 'mandibula' and classification in ('G', 'H'):
                product = 'AH + Reestruturador'

            protocol.append({
                'zone': zone,
                'dose': dose,
                'unit': 'mL',
                'product': product,
                'severity': severity,
                'bilateral': zone in ('temporal', 'zigoma', 'olheira', 'sulco', 'marionete', 'mandibula'),
            })
            total_ml += dose

    # Botox treatments
    for zone, dose_map in BOTOX_TABLE.items():
        severity = zones.get(zone, 0)
        dose = dose_map.get(min(severity, 3), 0)

        if age in ('40-50', '50+') and severity >= 1:
            dose = max(dose, 10)  # minimum botox for aging patients

        if dose > 0:
            protocol.append({
                'zone': zone,
                'dose': dose,
                'unit': 'U',
                'product': 'Toxina Botulinica',
                'severity': severity,
                'bilateral': False,
            })
            total_botox += dose

    # Bioestimulador recommendation
    bio_sessions = 0
    if age == '50+':
        bio_sessions = 4
    elif age == '40-50':
        bio_sessions = 2
    elif classification in ('G', 'H'):
        bio_sessions = 3

    # Sort by dose (highest first)
    protocol.sort(key=lambda x: x['dose'], reverse=True)

    # Build assessment text
    severity_total = sum(v for k, v in zones.items() if not k.startswith('_'))
    if severity_total >= 15:
        assessment = "Face com multiplos sinais de envelhecimento e perda de volume. Protocolo completo recomendado com AH, toxina e bioestimulador para restauracao facial integral."
    elif severity_total >= 10:
        assessment = "Perda moderada de volume e definicao facial. Protocolo de rejuvenescimento com foco em sustentacao e contorno."
    elif severity_total >= 5:
        assessment = "Queixas pontuais com boa estrutura base. Protocolo focado nas areas de maior impacto visual."
    else:
        assessment = "Boa estrutura facial. Pequenos ajustes para harmonizacao e refinamento."

    return {
        'classification': classification,
        'classification_name': CLASSIFICATION_NAMES.get(classification, classification),
        'age_bracket': age,
        'assessment': assessment,
        'protocol': protocol,
        'totals': {
            'ah_ml': round(total_ml, 1),
            'botox_units': total_botox,
            'bio_sessions': bio_sessions,
        },
        'zone_severities': {k: v for k, v in zones.items() if not k.startswith('_')},
    }


# ── Main Entry Point ─────────────────────────────────────────

def recommend_protocol(img_bgr: np.ndarray, complaint: str = '') -> Optional[Dict]:
    """Full pipeline: detect face → analyze zones → classify → generate protocol."""
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))

    if len(faces) == 0:
        return None

    face_rect = tuple(max(faces, key=lambda f: f[2] * f[3]))

    zones = analyze_face_zones(img_bgr, face_rect)
    age = estimate_age_bracket(zones)
    classification = classify_patient(zones, age, complaint)
    protocol = generate_protocol(zones, classification, age)

    protocol['face_rect'] = {
        'x': int(face_rect[0]), 'y': int(face_rect[1]),
        'w': int(face_rect[2]), 'h': int(face_rect[3]),
    }
    protocol['image_size'] = {'w': w, 'h': h}

    return protocol
