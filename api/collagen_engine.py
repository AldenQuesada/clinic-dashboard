"""
ClinicAI — Collagen Loss Assessment Engine
Analyzes facial skin for collagen loss indicators via OpenCV.

Grading system:
  Grade I   (Leve)     — Linhas finas visiveis apenas em movimento
  Grade II  (Moderado) — Rugas visiveis em repouso, perda leve de elasticidade
  Grade III (Avancado)  — Sulcos profundos, flacidez visivel, perda de contorno
  Grade IV  (Severo)   — Flacidez acentuada, ptose facial, perda estrutural

Treatment strategy per grade:
  I   → Bioestimulador preventivo + skincare
  II  → Bioestimulador + AH pontual + Botox preventivo
  III → Bioestimulador intensivo + AH estrutural + Botox + Laser
  IV  → Protocolo maximo: Bio + AH + Botox + Fios + Laser + Cirurgico
"""

import cv2
import numpy as np
from typing import Dict, Optional


def assess_collagen(img_bgr: np.ndarray, face_rect: tuple) -> Dict:
    """Full collagen assessment from a face image."""
    fx, fy, fw, fh = face_rect
    h, w = img_bgr.shape[:2]

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)

    face_gray = gray[fy:fy+fh, fx:fx+fw]
    face_lab = lab[fy:fy+fh, fx:fx+fw]

    scores = {}

    # ── 1. Texture Analysis (Laplacian variance = skin smoothness)
    texture_var = float(cv2.Laplacian(face_gray, cv2.CV_64F).var())
    # Lower = smoother skin = more collagen. Higher = rougher = less collagen
    scores['texture'] = {
        'value': round(texture_var, 1),
        'score': _grade_value(texture_var, 30, 80, 200, 400),
        'label': 'Textura da Pele',
    }

    # ── 2. Elasticity (skin uniformity in L channel)
    l_channel = face_lab[:,:,0].astype(float)
    skin_std = float(np.std(l_channel))
    scores['elasticity'] = {
        'value': round(skin_std, 1),
        'score': _grade_value(skin_std, 10, 18, 28, 40),
        'label': 'Elasticidade',
    }

    # ── 3. Wrinkle Density (horizontal + vertical edge detection)
    # Forehead wrinkles
    forehead = face_gray[0:int(fh*0.25), int(fw*0.15):int(fw*0.85)]
    if forehead.size > 0:
        h_sobel = cv2.Sobel(forehead, cv2.CV_64F, 0, 1, ksize=3)
        wrinkle_forehead = float(np.mean(np.abs(h_sobel)))
    else:
        wrinkle_forehead = 0

    # Periorbital wrinkles (crow's feet)
    left_eye_area = face_gray[int(fh*0.25):int(fh*0.45), 0:int(fw*0.3)]
    right_eye_area = face_gray[int(fh*0.25):int(fh*0.45), int(fw*0.7):fw]
    periorbital = 0
    for eye_area in [left_eye_area, right_eye_area]:
        if eye_area.size > 0:
            edges = cv2.Canny(eye_area, 30, 100)
            periorbital = max(periorbital, float(np.sum(edges > 0) / max(1, edges.size)))

    # Nasolabial area
    nasolabial = face_gray[int(fh*0.5):int(fh*0.75), int(fw*0.15):int(fw*0.85)]
    if nasolabial.size > 0:
        nl_edges = cv2.Canny(nasolabial, 40, 120)
        nl_density = float(np.sum(nl_edges > 0) / max(1, nl_edges.size))
    else:
        nl_density = 0

    wrinkle_total = wrinkle_forehead + periorbital * 100 + nl_density * 100
    scores['wrinkles'] = {
        'value': round(wrinkle_total, 1),
        'score': _grade_value(wrinkle_total, 5, 15, 30, 60),
        'details': {
            'forehead': round(wrinkle_forehead, 1),
            'periorbital': round(periorbital * 100, 1),
            'nasolabial': round(nl_density * 100, 1),
        },
        'label': 'Rugas e Linhas',
    }

    # ── 4. Volume Loss (shadow analysis — deeper shadows = more loss)
    # Compare cheek brightness to forehead (reference)
    forehead_brightness = float(np.mean(l_channel[0:int(fh*0.2), int(fw*0.2):int(fw*0.8)]))
    cheek_left = float(np.mean(l_channel[int(fh*0.35):int(fh*0.55), 0:int(fw*0.35)]))
    cheek_right = float(np.mean(l_channel[int(fh*0.35):int(fh*0.55), int(fw*0.65):fw]))
    cheek_avg = (cheek_left + cheek_right) / 2
    shadow_depth = max(0, forehead_brightness - cheek_avg)

    scores['volume_loss'] = {
        'value': round(shadow_depth, 1),
        'score': _grade_value(shadow_depth, 3, 8, 15, 25),
        'label': 'Perda de Volume',
    }

    # ── 5. Skin Firmness (jaw definition = proxy for firmness)
    jaw_area = face_gray[int(fh*0.8):fh, :]
    if jaw_area.size > 0:
        jaw_edges = cv2.Canny(jaw_area, 20, 80)
        jaw_definition = float(np.sum(jaw_edges > 0) / max(1, jaw_edges.size))
    else:
        jaw_definition = 0.1

    # Lower definition = more flaccid
    firmness_score = 1.0 - min(1.0, jaw_definition * 5)
    scores['firmness'] = {
        'value': round(firmness_score * 100, 1),
        'score': _grade_value(firmness_score * 100, 20, 40, 60, 80),
        'label': 'Firmeza Facial',
    }

    # ── 6. Pore Visibility
    blur = cv2.GaussianBlur(face_gray, (21, 21), 0)
    high_pass = cv2.subtract(face_gray, blur)
    pore_score = float(np.std(high_pass))
    scores['pores'] = {
        'value': round(pore_score, 1),
        'score': _grade_value(pore_score, 3, 6, 10, 15),
        'label': 'Visibilidade dos Poros',
    }

    # ── Overall Grade
    all_grades = [s['score'] for s in scores.values() if isinstance(s, dict) and 'score' in s]
    avg_grade = sum(all_grades) / max(1, len(all_grades))

    if avg_grade >= 3.5:
        grade = 'IV'
        grade_name = 'Severo'
        grade_color = '#EF4444'
    elif avg_grade >= 2.5:
        grade = 'III'
        grade_name = 'Avancado'
        grade_color = '#F59E0B'
    elif avg_grade >= 1.5:
        grade = 'II'
        grade_name = 'Moderado'
        grade_color = '#3B82F6'
    else:
        grade = 'I'
        grade_name = 'Leve'
        grade_color = '#10B981'

    # ── Treatment Strategy
    strategies = {
        'I': {
            'title': 'Prevencao e Manutencao',
            'products': ['Bioestimulador preventivo (Sculptra 1 sessao/ano)', 'Skincare anti-aging (retinol + vitamina C)', 'Protetor solar diario'],
            'total_sessions': 1,
            'priority': 'baixa',
        },
        'II': {
            'title': 'Estimulacao e Pontuacao',
            'products': ['Bioestimulador (Sculptra 2 sessoes)', 'AH pontual em sulcos leves (2-4mL)', 'Botox preventivo (20-30U)', 'Laser fracionado 1 sessao'],
            'total_sessions': 3,
            'priority': 'media',
        },
        'III': {
            'title': 'Reestruturacao Intensiva',
            'products': ['Bioestimulador intensivo (Sculptra 3-4 sessoes)', 'AH estrutural full face (10-16mL)', 'Botox completo (30-50U)', 'Laser fracionado 2-3 sessoes', 'Fios de PDO (opicional)'],
            'total_sessions': 6,
            'priority': 'alta',
        },
        'IV': {
            'title': 'Restauracao Completa',
            'products': ['Bioestimulador intensivo (Sculptra 4-6 sessoes)', 'AH maximo full face (16-22mL)', 'Botox completo (40-60U)', 'Laser fracionado 3-4 sessoes', 'Fios de PDO tensor', 'Avaliacao cirurgica (lifting)'],
            'total_sessions': 10,
            'priority': 'urgente',
        },
    }

    return {
        'grade': grade,
        'grade_name': grade_name,
        'grade_color': grade_color,
        'grade_score': round(avg_grade, 2),
        'scores': scores,
        'strategy': strategies[grade],
        'collagen_index': round(max(0, 100 - avg_grade * 25), 1),  # 100=perfeito, 0=perda total
    }


def _grade_value(val: float, t1: float, t2: float, t3: float, t4: float) -> int:
    """Grade a value: 0=excellent, 1=leve, 2=moderado, 3=avancado, 4=severo."""
    if val < t1:
        return 0
    elif val < t2:
        return 1
    elif val < t3:
        return 2
    elif val < t4:
        return 3
    else:
        return 4
