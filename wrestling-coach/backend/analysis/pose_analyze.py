"""
Pose Analysis Module for Wrestling Coach
Uses MediaPipe Pose to analyze wrestling technique from video.
Now with target tracking, cropped pose analysis, and wrestling event detection.
"""

import math
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass, field
import cv2
import mediapipe as mp
import numpy as np

from .tracking import TargetTracker, expand_box
from .detection import detect_persons, auto_select_target

# MediaPipe Pose setup
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# Pose landmark indices (from MediaPipe)
NOSE = 0
LEFT_EAR = 7
RIGHT_EAR = 8
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_ELBOW = 13
RIGHT_ELBOW = 14
LEFT_WRIST = 15
RIGHT_WRIST = 16
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_KNEE = 25
RIGHT_KNEE = 26
LEFT_ANKLE = 27
RIGHT_ANKLE = 28

# Analysis thresholds
KNEE_ANGLE_THRESHOLD = 145  # degrees - "get lower" if avg > this
STANCE_WIDTH_THRESHOLD = 0.18  # normalized - "widen base" if < this
HANDS_DROP_THRESHOLD = 0.10  # normalized - "hands up" if wrists this far below shoulders
BACK_LEAN_THRESHOLD = 75  # degrees - "don't lean back" if < this
HIP_HEIGHT_RATIO_THRESHOLD = 0.70  # hip_y / shoulder_y ratio - low value = too upright
ELBOW_FLARE_THRESHOLD = 0.15  # normalized distance from centerline
HEAD_FORWARD_THRESHOLD = 0.08  # nose ahead of hips threshold

# Event detection thresholds
LEVEL_CHANGE_HIP_DROP_THRESHOLD = 0.04  # Normalized hip y drop required
LEVEL_CHANGE_KNEE_BEND_INCREASE = 15  # Degrees of additional knee bend
SHOT_FORWARD_VELOCITY_THRESHOLD = 0.03  # Normalized forward movement per frame
SPRAWL_HIP_DROP_THRESHOLD = 0.03  # Hip drop for sprawl
SPRAWL_LEG_EXTENSION_THRESHOLD = 0.05  # Leg extension backwards

# Additional tip thresholds
TORSO_ANGLE_TOO_BENT = 35  # Degrees - torso bent too far forward at waist
HEAD_BEHIND_HIPS_THRESHOLD = -0.04  # Head behind hips is bad for balance
REACHING_THRESHOLD = 0.20  # Hands far ahead without foot movement
LATERAL_MOTION_LOW_THRESHOLD = 0.01  # Low lateral movement variance
STANCE_WOBBLE_THRESHOLD = 0.003  # High variance in stance width

# Backend setting: max seconds to analyze
MAX_SECONDS = 20


@dataclass
class FrameMetrics:
    """Metrics computed for a single frame."""
    knee_angle_left: Optional[float] = None
    knee_angle_right: Optional[float] = None
    knee_angle_avg: Optional[float] = None
    stance_width: Optional[float] = None
    hands_drop: Optional[float] = None
    back_lean_angle: Optional[float] = None
    hip_height_ratio: Optional[float] = None
    elbow_flare_left: Optional[float] = None
    elbow_flare_right: Optional[float] = None
    elbow_flare_avg: Optional[float] = None
    head_position: Optional[float] = None  # nose x relative to hips
    timestamp: float = 0.0
    
    # Additional metrics for event detection and expanded tips
    hip_y_norm: Optional[float] = None  # Normalized hip center y position
    torso_angle: Optional[float] = None  # Angle of torso from vertical (for bent-at-waist detection)
    head_y_relative: Optional[float] = None  # Head y position relative to hips (for head behind hips)
    wrist_forward_dist: Optional[float] = None  # How far wrists extend ahead of shoulders
    ankle_x_left: Optional[float] = None  # Left ankle x position for lateral movement
    ankle_x_right: Optional[float] = None  # Right ankle x position
    ankle_center_x: Optional[float] = None  # Center x position of ankles (for forward velocity)
    shoulder_center_y: Optional[float] = None  # Shoulder center y position
    hip_center_y: Optional[float] = None  # Hip center y position
    
    # Trail leg metrics (for shot analysis)
    rear_knee_angle: Optional[float] = None  # Angle of the rear/trail leg during shot
    lead_knee_angle: Optional[float] = None  # Angle of the lead leg during shot


@dataclass 
class TimelineEvent:
    """A timestamped event when a metric exceeded threshold."""
    timestamp: float
    duration: float
    metric: str
    value: float
    message: str


def calculate_angle(a: tuple, b: tuple, c: tuple) -> float:
    """
    Calculate angle at point b given three points (a, b, c).
    Returns angle in degrees as native Python float.
    """
    ba = np.array([a[0] - b[0], a[1] - b[1]])
    bc = np.array([c[0] - b[0], c[1] - b[1]])
    
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    cosine = np.clip(cosine, -1.0, 1.0)
    angle = np.degrees(np.arccos(cosine))
    
    # Convert numpy float to native Python float
    return float(angle)


def get_landmark_coords(landmarks, idx: int, min_visibility: float = 0.5) -> Optional[tuple]:
    """Get (x, y) coordinates for a landmark if visible."""
    lm = landmarks.landmark[idx]
    if lm.visibility < min_visibility:
        return None
    return (lm.x, lm.y)


def analyze_frame_landmarks(landmarks, timestamp: float = 0.0) -> FrameMetrics:
    """
    Analyze a single frame's pose landmarks.
    Returns comprehensive metrics including event detection data.
    """
    metrics = FrameMetrics(timestamp=timestamp)
    
    # Get all relevant landmarks
    nose = get_landmark_coords(landmarks, NOSE)
    left_ear = get_landmark_coords(landmarks, LEFT_EAR)
    right_ear = get_landmark_coords(landmarks, RIGHT_EAR)
    left_shoulder = get_landmark_coords(landmarks, LEFT_SHOULDER)
    right_shoulder = get_landmark_coords(landmarks, RIGHT_SHOULDER)
    left_elbow = get_landmark_coords(landmarks, LEFT_ELBOW)
    right_elbow = get_landmark_coords(landmarks, RIGHT_ELBOW)
    left_wrist = get_landmark_coords(landmarks, LEFT_WRIST)
    right_wrist = get_landmark_coords(landmarks, RIGHT_WRIST)
    left_hip = get_landmark_coords(landmarks, LEFT_HIP)
    right_hip = get_landmark_coords(landmarks, RIGHT_HIP)
    left_knee = get_landmark_coords(landmarks, LEFT_KNEE)
    right_knee = get_landmark_coords(landmarks, RIGHT_KNEE)
    left_ankle = get_landmark_coords(landmarks, LEFT_ANKLE)
    right_ankle = get_landmark_coords(landmarks, RIGHT_ANKLE)
    
    # 1. Knee angles (individual and average)
    if left_hip and left_knee and left_ankle:
        metrics.knee_angle_left = calculate_angle(left_hip, left_knee, left_ankle)
    if right_hip and right_knee and right_ankle:
        metrics.knee_angle_right = calculate_angle(right_hip, right_knee, right_ankle)
    
    knee_angles = [a for a in [metrics.knee_angle_left, metrics.knee_angle_right] if a is not None]
    if knee_angles:
        metrics.knee_angle_avg = sum(knee_angles) / len(knee_angles)
    
    # 2. Stance width (normalized)
    if left_ankle and right_ankle:
        metrics.stance_width = abs(left_ankle[0] - right_ankle[0])
        metrics.ankle_x_left = left_ankle[0]
        metrics.ankle_x_right = right_ankle[0]
        metrics.ankle_center_x = (left_ankle[0] + right_ankle[0]) / 2
    
    # 3. Hands drop (wrists below shoulders)
    if left_shoulder and right_shoulder and left_wrist and right_wrist:
        shoulder_y = (left_shoulder[1] + right_shoulder[1]) / 2
        wrist_y = (left_wrist[1] + right_wrist[1]) / 2
        metrics.hands_drop = wrist_y - shoulder_y  # Positive = below
        metrics.shoulder_center_y = shoulder_y
        
        # Calculate wrist forward distance (how far hands extend ahead)
        shoulder_center_x = (left_shoulder[0] + right_shoulder[0]) / 2
        wrist_center_x = (left_wrist[0] + right_wrist[0]) / 2
        # Forward is context-dependent; we measure absolute distance from shoulders
        metrics.wrist_forward_dist = abs(wrist_center_x - shoulder_center_x)
    
    # 4. Back lean angle (angle of spine from vertical)
    if left_shoulder and right_shoulder and left_hip and right_hip:
        # Mid shoulder and mid hip
        mid_shoulder = ((left_shoulder[0] + right_shoulder[0]) / 2, 
                        (left_shoulder[1] + right_shoulder[1]) / 2)
        mid_hip = ((left_hip[0] + right_hip[0]) / 2,
                   (left_hip[1] + right_hip[1]) / 2)
        
        # Store hip y for event detection
        metrics.hip_y_norm = mid_hip[1]
        metrics.hip_center_y = mid_hip[1]
        
        # Calculate angle from vertical (straight up would be 90 degrees in our coord system)
        # We compute angle between spine vector and vertical
        spine_vec = (mid_shoulder[0] - mid_hip[0], mid_shoulder[1] - mid_hip[1])
        vertical_vec = (0, -1)  # Pointing up (y decreases)
        
        dot = spine_vec[0] * vertical_vec[0] + spine_vec[1] * vertical_vec[1]
        mag_spine = math.sqrt(spine_vec[0]**2 + spine_vec[1]**2) + 1e-6
        mag_vert = 1.0
        
        cos_angle = dot / (mag_spine * mag_vert)
        cos_angle = max(-1.0, min(1.0, cos_angle))
        angle_from_vertical = math.degrees(math.acos(cos_angle))
        
        # Back lean: 0 = perfectly upright, positive = leaning forward, negative could indicate leaning back
        # Since we want to detect "leaning back too much", we'll track the raw angle
        metrics.back_lean_angle = angle_from_vertical
        
        # Also compute torso angle (different from spine - measures bend at waist)
        # This checks if chest is up vs bent at waist
        metrics.torso_angle = angle_from_vertical
    
    # 5. Hip height ratio (how low are hips relative to shoulders)
    if left_hip and right_hip and left_shoulder and right_shoulder:
        hip_y = (left_hip[1] + right_hip[1]) / 2
        shoulder_y = (left_shoulder[1] + right_shoulder[1]) / 2
        # Higher ratio = hips closer to shoulders (more bent)
        # In normalized coords, y increases downward
        if shoulder_y > 0.01:  # Avoid division by zero
            metrics.hip_height_ratio = (hip_y - shoulder_y) / (1 - shoulder_y + 0.01)
    
    # 6. Elbow flare (how far elbows/wrists are from body centerline)
    if left_shoulder and right_shoulder and left_wrist and right_wrist:
        center_x = (left_shoulder[0] + right_shoulder[0]) / 2
        
        # Distance of wrists from centerline
        metrics.elbow_flare_left = abs(left_wrist[0] - center_x)
        metrics.elbow_flare_right = abs(right_wrist[0] - center_x)
        metrics.elbow_flare_avg = (metrics.elbow_flare_left + metrics.elbow_flare_right) / 2
    
    # 7. Head position (nose relative to hips - is head forward?)
    if nose and left_hip and right_hip:
        hip_center_x = (left_hip[0] + right_hip[0]) / 2
        hip_center_y = (left_hip[1] + right_hip[1]) / 2
        # Positive = head forward of hips
        metrics.head_position = nose[0] - hip_center_x
        # Also track vertical: positive means head above hips (normal), negative means head below/behind
        metrics.head_y_relative = hip_center_y - nose[1]  # Positive = head above hips (good)
    
    # 8. Lead/trail leg angles for shot analysis
    # Determine which leg is forward (lower x value in typical side view, or lower ankle y)
    if metrics.knee_angle_left is not None and metrics.knee_angle_right is not None:
        if left_ankle and right_ankle:
            # The leg with lower ankle y (higher on screen, more forward in lunge) is the lead
            if left_ankle[1] < right_ankle[1]:
                metrics.lead_knee_angle = metrics.knee_angle_left
                metrics.rear_knee_angle = metrics.knee_angle_right
            else:
                metrics.lead_knee_angle = metrics.knee_angle_right
                metrics.rear_knee_angle = metrics.knee_angle_left
    
    return metrics


def compute_aggregate_metrics(frame_metrics: List[FrameMetrics]) -> Dict:
    """
    Compute aggregate statistics from frame-by-frame metrics.
    Returns comprehensive dict with averages, percentages, min/max values.
    """
    if not frame_metrics:
        return {}
    
    # Helper to aggregate a metric - ensures native Python types
    def aggregate(values: List[float]) -> Dict:
        if not values:
            return {"avg": None, "min": None, "max": None, "count": 0}
        return {
            "avg": float(round(sum(values) / len(values), 2)),
            "min": float(round(min(values), 2)),
            "max": float(round(max(values), 2)),
            "count": len(values)
        }
    
    # Extract values
    knee_angles = [m.knee_angle_avg for m in frame_metrics if m.knee_angle_avg is not None]
    stance_widths = [m.stance_width for m in frame_metrics if m.stance_width is not None]
    hands_drops = [m.hands_drop for m in frame_metrics if m.hands_drop is not None]
    back_leans = [m.back_lean_angle for m in frame_metrics if m.back_lean_angle is not None]
    hip_ratios = [m.hip_height_ratio for m in frame_metrics if m.hip_height_ratio is not None]
    elbow_flares = [m.elbow_flare_avg for m in frame_metrics if m.elbow_flare_avg is not None]
    head_positions = [m.head_position for m in frame_metrics if m.head_position is not None]
    
    # Additional metrics for expanded analysis
    torso_angles = [m.torso_angle for m in frame_metrics if m.torso_angle is not None]
    head_y_relatives = [m.head_y_relative for m in frame_metrics if m.head_y_relative is not None]
    wrist_forward_dists = [m.wrist_forward_dist for m in frame_metrics if m.wrist_forward_dist is not None]
    ankle_center_xs = [m.ankle_center_x for m in frame_metrics if m.ankle_center_x is not None]
    rear_knee_angles = [m.rear_knee_angle for m in frame_metrics if m.rear_knee_angle is not None]
    lead_knee_angles = [m.lead_knee_angle for m in frame_metrics if m.lead_knee_angle is not None]
    
    # Calculate percentages of frames exceeding thresholds
    pct_knee_high = (len([k for k in knee_angles if k > KNEE_ANGLE_THRESHOLD]) / len(knee_angles) * 100) if knee_angles else 0
    pct_stance_narrow = (len([s for s in stance_widths if s < STANCE_WIDTH_THRESHOLD]) / len(stance_widths) * 100) if stance_widths else 0
    pct_hands_dropped = (len([h for h in hands_drops if h > HANDS_DROP_THRESHOLD]) / len(hands_drops) * 100) if hands_drops else 0
    pct_back_lean = (len([b for b in back_leans if b > 25]) / len(back_leans) * 100) if back_leans else 0  # >25 degrees from vertical
    
    # New percentages
    pct_torso_bent = (len([t for t in torso_angles if t > TORSO_ANGLE_TOO_BENT]) / len(torso_angles) * 100) if torso_angles else 0
    pct_head_behind = (len([h for h in head_y_relatives if h < HEAD_BEHIND_HIPS_THRESHOLD]) / len(head_y_relatives) * 100) if head_y_relatives else 0
    pct_reaching = (len([w for w in wrist_forward_dists if w > REACHING_THRESHOLD]) / len(wrist_forward_dists) * 100) if wrist_forward_dists else 0
    
    # Calculate lateral motion variance (how much you move side to side)
    # Convert to float to ensure native Python type
    lateral_variance = float(np.var(ankle_center_xs)) if len(ankle_center_xs) > 1 else 0.0
    
    return {
        "knee_angle": {
            **aggregate(knee_angles),
            "threshold": KNEE_ANGLE_THRESHOLD,
            "pct_above_threshold": round(pct_knee_high, 1)
        },
        "stance_width": {
            **aggregate(stance_widths),
            "threshold": STANCE_WIDTH_THRESHOLD,
            "pct_below_threshold": round(pct_stance_narrow, 1)
        },
        "hands_drop": {
            **aggregate(hands_drops),
            "threshold": HANDS_DROP_THRESHOLD,
            "pct_above_threshold": round(pct_hands_dropped, 1)
        },
        "back_lean_angle": {
            **aggregate(back_leans),
            "pct_excessive": round(pct_back_lean, 1)
        },
        "hip_height_ratio": aggregate(hip_ratios),
        "elbow_flare": {
            **aggregate(elbow_flares),
            "threshold": ELBOW_FLARE_THRESHOLD
        },
        "head_position": aggregate(head_positions),
        "frames_analyzed": len(frame_metrics),
        "motion_stability": {
            "knee_variance": round(float(np.var(knee_angles)), 2) if len(knee_angles) > 1 else 0.0,
            "stance_variance": round(float(np.var(stance_widths)), 4) if len(stance_widths) > 1 else 0.0
        },
        # Extended metrics
        "torso_angle": {
            **aggregate(torso_angles),
            "threshold": TORSO_ANGLE_TOO_BENT,
            "pct_too_bent": round(pct_torso_bent, 1)
        },
        "head_y_relative": {
            **aggregate(head_y_relatives),
            "pct_behind_hips": round(pct_head_behind, 1)
        },
        "wrist_forward": {
            **aggregate(wrist_forward_dists),
            "threshold": REACHING_THRESHOLD,
            "pct_reaching": round(pct_reaching, 1)
        },
        "lateral_motion": {
            "variance": round(float(lateral_variance), 6),
            "is_low": bool(lateral_variance < LATERAL_MOTION_LOW_THRESHOLD)
        },
        "trail_leg": aggregate(rear_knee_angles),
        "lead_leg": aggregate(lead_knee_angles)
    }


def detect_timeline_events(
    frame_metrics: List[FrameMetrics],
    fps: float
) -> List[Dict]:
    """
    Detect timeline events where metrics exceeded thresholds for >0.5s.
    Returns list of events with timestamps.
    """
    events = []
    min_duration = 0.5  # seconds
    min_frames = int(min_duration * fps)
    
    # Track consecutive bad frames for each metric
    def detect_runs(values_with_timestamps: List[Tuple[float, float]], 
                    threshold: float, 
                    above: bool,
                    metric_name: str,
                    message_template: str) -> List[Dict]:
        """Detect runs of consecutive frames exceeding threshold."""
        runs = []
        current_run = []
        
        for timestamp, value in values_with_timestamps:
            is_bad = (value > threshold) if above else (value < threshold)
            
            if is_bad:
                current_run.append((timestamp, value))
            else:
                if len(current_run) >= min_frames:
                    start_time = current_run[0][0]
                    end_time = current_run[-1][0]
                    avg_value = sum(v for _, v in current_run) / len(current_run)
                    runs.append({
                        "timestamp": float(round(start_time, 2)),
                        "duration": float(round(end_time - start_time, 2)),
                        "metric": metric_name,
                        "value": float(round(avg_value, 2)),
                        "message": message_template.format(value=round(avg_value, 1))
                    })
                current_run = []
        
        # Check final run
        if len(current_run) >= min_frames:
            start_time = current_run[0][0]
            end_time = current_run[-1][0]
            avg_value = sum(v for _, v in current_run) / len(current_run)
            runs.append({
                "timestamp": float(round(start_time, 2)),
                "duration": float(round(end_time - start_time, 2)),
                "metric": metric_name,
                "value": float(round(avg_value, 2)),
                "message": message_template.format(value=round(avg_value, 1))
            })
        
        return runs
    
    # Extract timestamped values
    knee_vals = [(m.timestamp, m.knee_angle_avg) for m in frame_metrics if m.knee_angle_avg is not None]
    stance_vals = [(m.timestamp, m.stance_width) for m in frame_metrics if m.stance_width is not None]
    hands_vals = [(m.timestamp, m.hands_drop) for m in frame_metrics if m.hands_drop is not None]
    lean_vals = [(m.timestamp, m.back_lean_angle) for m in frame_metrics if m.back_lean_angle is not None]
    
    # Detect events
    events.extend(detect_runs(knee_vals, KNEE_ANGLE_THRESHOLD, True, "knee_angle", 
                              "Standing too upright (avg {value}°)"))
    events.extend(detect_runs(stance_vals, STANCE_WIDTH_THRESHOLD, False, "stance_width",
                              "Narrow stance ({value})"))
    events.extend(detect_runs(hands_vals, HANDS_DROP_THRESHOLD, True, "hands_drop",
                              "Hands dropping ({value})"))
    events.extend(detect_runs(lean_vals, 25, True, "back_lean",
                              "Excessive lean ({value}°)"))
    
    # Sort by timestamp
    events.sort(key=lambda e: e["timestamp"])
    
    return events


def detect_wrestling_events(
    frame_metrics: List[FrameMetrics],
    fps: float
) -> List[Dict]:
    """
    Detect wrestling-specific events like level changes, shot attempts, and sprawls.
    Uses pose metric trends over sliding windows.
    
    Returns:
        List of events: {type, t_start, t_end, confidence, description}
    """
    events = []
    
    if len(frame_metrics) < 5:
        return events
    
    # Window sizes (in frames)
    window_size = max(3, int(fps * 0.2))  # ~0.2 seconds
    
    # Extract time series data
    timestamps = [m.timestamp for m in frame_metrics]
    hip_y_values = [m.hip_y_norm for m in frame_metrics]
    knee_values = [m.knee_angle_avg for m in frame_metrics]
    ankle_x_values = [m.ankle_center_x for m in frame_metrics]
    stance_values = [m.stance_width for m in frame_metrics]
    torso_values = [m.torso_angle for m in frame_metrics]
    
    # Helper: compute derivative (change rate)
    def compute_derivative(values: List, window: int = 3) -> List[float]:
        """Compute rate of change over window."""
        derivatives = [0.0] * len(values)
        for i in range(window, len(values)):
            if values[i] is not None and values[i - window] is not None:
                derivatives[i] = (values[i] - values[i - window]) / window
            else:
                derivatives[i] = 0.0
        return derivatives
    
    # Compute derivatives
    hip_y_deriv = compute_derivative(hip_y_values, window_size)
    knee_deriv = compute_derivative(knee_values, window_size)
    ankle_x_deriv = compute_derivative(ankle_x_values, window_size)  # Forward velocity proxy
    
    # Track event windows to avoid duplicates
    used_frames = set()
    
    # 1. Detect LEVEL_CHANGE events
    # Criteria: rapid hip drop + significant knee bend increase
    for i in range(window_size, len(frame_metrics) - window_size):
        if i in used_frames:
            continue
            
        hip_drop = hip_y_deriv[i] if hip_y_deriv[i] is not None else 0
        knee_change = knee_deriv[i] if knee_deriv[i] is not None else 0
        
        # Hip y increases (drops in image coords) and knee angle decreases (bending)
        is_level_change = (
            hip_drop > LEVEL_CHANGE_HIP_DROP_THRESHOLD and 
            knee_change < -2  # Knee angle decreasing (more bent)
        )
        
        if is_level_change:
            # Find event boundaries
            start_idx = max(0, i - window_size)
            end_idx = min(len(frame_metrics) - 1, i + window_size)
            
            t_start = timestamps[start_idx]
            t_end = timestamps[end_idx]
            
            # Calculate confidence based on magnitude
            hip_magnitude = abs(hip_drop) / LEVEL_CHANGE_HIP_DROP_THRESHOLD
            knee_magnitude = abs(knee_change) / LEVEL_CHANGE_KNEE_BEND_INCREASE if LEVEL_CHANGE_KNEE_BEND_INCREASE else 1
            confidence = min(1.0, (hip_magnitude + knee_magnitude) / 2)
            
            events.append({
                "type": "LEVEL_CHANGE",
                "t_start": float(round(t_start, 2)),
                "t_end": float(round(t_end, 2)),
                "confidence": float(round(confidence, 2)),
                "description": "Level change detected - hip dropped rapidly with knee bend increase"
            })
            
            # Mark frames as used
            for j in range(start_idx, end_idx + 1):
                used_frames.add(j)
    
    # 2. Detect SHOT_ATTEMPT events
    # Criteria: level change + forward drive (ankle x change) + stance narrows
    used_frames_shot = set()
    for i in range(window_size * 2, len(frame_metrics) - window_size):
        if i in used_frames_shot:
            continue
            
        hip_drop = hip_y_deriv[i] if hip_y_deriv[i] is not None else 0
        forward_vel = ankle_x_deriv[i] if ankle_x_deriv[i] is not None else 0
        
        # Check stance narrowing (indicates penetration step)
        stance_now = stance_values[i] if stance_values[i] is not None else 0.2
        stance_before = stance_values[max(0, i - window_size * 2)] if stance_values[max(0, i - window_size * 2)] is not None else 0.2
        stance_change = stance_now - stance_before
        
        # Check torso angle change (leans forward during shot)
        torso_now = torso_values[i] if torso_values[i] is not None else 0
        torso_before = torso_values[max(0, i - window_size)] if torso_values[max(0, i - window_size)] is not None else 0
        torso_increase = torso_now - torso_before
        
        is_shot = (
            hip_drop > LEVEL_CHANGE_HIP_DROP_THRESHOLD * 0.8 and  # Level change component
            abs(forward_vel) > SHOT_FORWARD_VELOCITY_THRESHOLD and  # Forward drive
            (stance_change < -0.02 or torso_increase > 5)  # Either stance narrows or torso leans
        )
        
        if is_shot:
            start_idx = max(0, i - window_size * 2)
            end_idx = min(len(frame_metrics) - 1, i + window_size)
            
            t_start = timestamps[start_idx]
            t_end = timestamps[end_idx]
            
            # Confidence based on multiple factors
            confidence = min(1.0, (
                abs(hip_drop) / LEVEL_CHANGE_HIP_DROP_THRESHOLD * 0.4 +
                abs(forward_vel) / SHOT_FORWARD_VELOCITY_THRESHOLD * 0.3 +
                0.3  # Base confidence
            ))
            
            events.append({
                "type": "SHOT_ATTEMPT",
                "t_start": float(round(t_start, 2)),
                "t_end": float(round(t_end, 2)),
                "confidence": float(round(confidence, 2)),
                "description": "Shot attempt detected - level change with forward penetration"
            })
            
            for j in range(start_idx, end_idx + 1):
                used_frames_shot.add(j)
    
    # 3. Detect SPRAWL_DEFENSE events
    # Criteria: hip drop + backward leg extension / wide stance + torso stays up or leans back
    used_frames_sprawl = set()
    for i in range(window_size, len(frame_metrics) - window_size):
        if i in used_frames_sprawl:
            continue
            
        hip_drop = hip_y_deriv[i] if hip_y_deriv[i] is not None else 0
        
        # Check stance widening (spreading legs for sprawl)
        stance_now = stance_values[i] if stance_values[i] is not None else 0.2
        stance_before = stance_values[max(0, i - window_size)] if stance_values[max(0, i - window_size)] is not None else 0.2
        stance_widening = stance_now - stance_before
        
        # Check for backward movement or stable position (not forward like a shot)
        forward_vel = ankle_x_deriv[i] if ankle_x_deriv[i] is not None else 0
        
        # Torso should stay relatively upright or lean back slightly
        torso_now = torso_values[i] if torso_values[i] is not None else 0
        
        is_sprawl = (
            hip_drop > SPRAWL_HIP_DROP_THRESHOLD and  # Hips dropping
            stance_widening > 0.03 and  # Legs spreading
            forward_vel < SHOT_FORWARD_VELOCITY_THRESHOLD * 0.5  # Not driving forward
        )
        
        if is_sprawl:
            start_idx = max(0, i - window_size)
            end_idx = min(len(frame_metrics) - 1, i + window_size)
            
            t_start = timestamps[start_idx]
            t_end = timestamps[end_idx]
            
            confidence = min(1.0, (
                abs(hip_drop) / SPRAWL_HIP_DROP_THRESHOLD * 0.4 +
                stance_widening / 0.05 * 0.3 +
                0.3
            ))
            
            events.append({
                "type": "SPRAWL_DEFENSE",
                "t_start": float(round(t_start, 2)),
                "t_end": float(round(t_end, 2)),
                "confidence": float(round(confidence, 2)),
                "description": "Sprawl defense detected - hip drop with leg extension"
            })
            
            for j in range(start_idx, end_idx + 1):
                used_frames_sprawl.add(j)
    
    # Sort by timestamp and remove very low confidence events
    events = [e for e in events if e["confidence"] >= 0.3]
    events.sort(key=lambda e: e["t_start"])
    
    return events


def generate_rich_pointers(metrics: Dict, timeline: List[Dict], wrestling_events: List[Dict] = None) -> List[Dict]:
    """
    Generate rich coaching pointers based on aggregated metrics.
    Returns ranked list of issues with evidence, timing, and fixes.
    Now generates up to ~10-12 tips covering stance, motion, entries, shot mechanics, and defense.
    """
    pointers = []
    wrestling_events = wrestling_events or []
    
    # Severity weights for ranking
    SEVERITY_WEIGHTS = {
        "knee_angle": 0.25,
        "stance_width": 0.20,
        "hands_drop": 0.20,
        "back_lean": 0.15,
        "elbow_flare": 0.10,
        "head_position": 0.08,
        "stability": 0.05,
        "posture": 0.15,
        "reaching": 0.12,
        "motion": 0.10,
        "trail_leg": 0.12,
        "balance": 0.08
    }
    
    # Helper to calculate impact score
    def impact_score(pct_bad: float, severity_key: str, worst_deviation: float = 0) -> float:
        return (pct_bad / 100 * SEVERITY_WEIGHTS.get(severity_key, 0.1)) + (worst_deviation * 0.001)
    
    # 1. Knee angle analysis
    knee = metrics.get("knee_angle", {})
    if knee.get("avg") is not None:
        pct_bad = knee.get("pct_above_threshold", 0)
        avg_angle = knee.get("avg", 0)
        worst = knee.get("max", avg_angle)
        
        if pct_bad > 20 or avg_angle > KNEE_ANGLE_THRESHOLD:
            knee_events = [e for e in timeline if e["metric"] == "knee_angle"]
            timestamps = [str(e["timestamp"]) + "s" for e in knee_events[:3]]
            when = f"Occurred at: {', '.join(timestamps)}" if timestamps else "Throughout the clip"
            
            pointers.append({
                "title": "Get Lower",
                "why": f"Your average knee angle is {avg_angle:.1f}° (threshold: {KNEE_ANGLE_THRESHOLD}°), indicating you're standing too upright in {pct_bad:.0f}% of frames.",
                "fix": "Bend your knees more to lower your center of gravity. Aim for a knee angle around 120-140° for optimal wrestling stance.",
                "evidence": f"Avg knee angle {avg_angle:.1f}°, worst {worst:.1f}°, {pct_bad:.0f}% frames too high",
                "when": when,
                "score": impact_score(pct_bad, "knee_angle", worst - KNEE_ANGLE_THRESHOLD if worst > KNEE_ANGLE_THRESHOLD else 0)
            })
    
    # 2. Stance width analysis
    stance = metrics.get("stance_width", {})
    if stance.get("avg") is not None:
        pct_bad = stance.get("pct_below_threshold", 0)
        avg_width = stance.get("avg", 0)
        narrowest = stance.get("min", avg_width)
        
        if pct_bad > 20 or avg_width < STANCE_WIDTH_THRESHOLD:
            stance_events = [e for e in timeline if e["metric"] == "stance_width"]
            timestamps = [str(e["timestamp"]) + "s" for e in stance_events[:3]]
            when = f"Occurred at: {', '.join(timestamps)}" if timestamps else "Throughout the clip"
            
            pointers.append({
                "title": "Widen Your Base",
                "why": f"Your stance width ({avg_width:.3f} normalized) is narrow in {pct_bad:.0f}% of frames, reducing stability and mobility.",
                "fix": "Spread your feet wider, roughly shoulder-width apart or slightly more. A wider base improves balance and takedown defense.",
                "evidence": f"Avg stance width {avg_width:.3f}, narrowest {narrowest:.3f}, {pct_bad:.0f}% too narrow",
                "when": when,
                "score": impact_score(pct_bad, "stance_width", STANCE_WIDTH_THRESHOLD - narrowest if narrowest < STANCE_WIDTH_THRESHOLD else 0)
            })
    
    # 3. Hand position analysis
    hands = metrics.get("hands_drop", {})
    if hands.get("avg") is not None:
        pct_bad = hands.get("pct_above_threshold", 0)
        avg_drop = hands.get("avg", 0)
        worst_drop = hands.get("max", avg_drop)
        
        if pct_bad > 15 or avg_drop > HANDS_DROP_THRESHOLD:
            hands_events = [e for e in timeline if e["metric"] == "hands_drop"]
            timestamps = [str(e["timestamp"]) + "s" for e in hands_events[:3]]
            when = f"Occurred at: {', '.join(timestamps)}" if timestamps else "Throughout the clip"
            
            pointers.append({
                "title": "Keep Hands Up",
                "why": f"Your hands are dropping {avg_drop:.3f} units below shoulder level in {pct_bad:.0f}% of frames, leaving you vulnerable to attacks.",
                "fix": "Keep your hands up at chest/shoulder level. Active hands help with grip fighting, shot defense, and quick attacks.",
                "evidence": f"Hands drop {avg_drop:.3f}, worst {worst_drop:.3f}, {pct_bad:.0f}% dropped",
                "when": when,
                "score": impact_score(pct_bad, "hands_drop", worst_drop - HANDS_DROP_THRESHOLD if worst_drop > HANDS_DROP_THRESHOLD else 0)
            })
    
    # 4. Posture / Back angle analysis (bent at waist vs chest up)
    torso = metrics.get("torso_angle", {})
    if torso.get("avg") is not None:
        pct_bent = torso.get("pct_too_bent", 0)
        avg_torso = torso.get("avg", 0)
        worst_torso = torso.get("max", avg_torso)
        
        if pct_bent > 20 or avg_torso > TORSO_ANGLE_TOO_BENT:
            pointers.append({
                "title": "Chest Up, Don't Bend at Waist",
                "why": f"Your torso angle averages {avg_torso:.1f}° forward lean, with {pct_bent:.0f}% of frames showing excessive waist bending instead of knee bending.",
                "fix": "Keep your chest up and proud. Lower your level by bending your knees and hips, not by hunching your back. A straight spine maintains power.",
                "evidence": f"Avg torso angle {avg_torso:.1f}°, worst {worst_torso:.1f}°, {pct_bent:.0f}% too bent",
                "when": "Throughout the clip",
                "score": impact_score(pct_bent, "posture", avg_torso - TORSO_ANGLE_TOO_BENT if avg_torso > TORSO_ANGLE_TOO_BENT else 0)
            })
    
    # 5. Head position (vertical - head behind hips)
    head_y = metrics.get("head_y_relative", {})
    if head_y.get("avg") is not None:
        pct_behind = head_y.get("pct_behind_hips", 0)
        avg_head_y = head_y.get("avg", 0)
        
        if pct_behind > 15 or avg_head_y < HEAD_BEHIND_HIPS_THRESHOLD:
            pointers.append({
                "title": "Head Position - Stay Forward",
                "why": f"Your head is dropping behind your hips in {pct_behind:.0f}% of frames (avg relative position: {avg_head_y:.3f}), hurting your balance and reaction time.",
                "fix": "Keep your head up and slightly forward over your hips. Your head leads your body - if it's behind, you're off balance and slow to react.",
                "evidence": f"Head y-relative {avg_head_y:.3f}, {pct_behind:.0f}% behind hips",
                "when": "Throughout the clip",
                "score": impact_score(pct_behind, "head_position", abs(avg_head_y) if avg_head_y < 0 else 0)
            })
    
    # 6. Reaching / Entry distance (hands extend far without foot movement)
    wrist_fwd = metrics.get("wrist_forward", {})
    lateral = metrics.get("lateral_motion", {})
    if wrist_fwd.get("avg") is not None:
        pct_reaching = wrist_fwd.get("pct_reaching", 0)
        avg_reach = wrist_fwd.get("avg", 0)
        worst_reach = wrist_fwd.get("max", avg_reach)
        lateral_var = lateral.get("variance", 0) if lateral else 0
        
        # Reaching is bad when hands go far but feet aren't moving (low lateral variance)
        if pct_reaching > 15 or (avg_reach > REACHING_THRESHOLD * 0.8 and lateral_var < LATERAL_MOTION_LOW_THRESHOLD):
            pointers.append({
                "title": "Don't Reach - Close the Distance",
                "why": f"Your hands are extending {avg_reach:.3f} units ahead of your shoulders with limited foot movement, indicating reaching instead of proper entries.",
                "fix": "Close the distance with your feet FIRST, then attack. Reaching makes you off-balance and easy to counter. Step into range before extending your arms.",
                "evidence": f"Avg reach {avg_reach:.3f}, {pct_reaching:.0f}% overextended, lateral variance {lateral_var:.5f}",
                "when": "Throughout the clip",
                "score": impact_score(pct_reaching, "reaching", avg_reach - REACHING_THRESHOLD if avg_reach > REACHING_THRESHOLD else 0)
            })
    
    # 7. Circle/Motion analysis (low lateral movement variance)
    if lateral and lateral.get("variance") is not None:
        lateral_var = lateral.get("variance", 0)
        is_low = lateral.get("is_low", False)
        
        if is_low or lateral_var < LATERAL_MOTION_LOW_THRESHOLD:
            pointers.append({
                "title": "Circle More - Stay Active",
                "why": f"Your lateral movement variance is very low ({lateral_var:.5f}), indicating you're standing relatively still instead of circling and creating angles.",
                "fix": "Keep moving! Circle left, circle right, change angles constantly. A moving target is harder to hit, and motion creates openings for your attacks.",
                "evidence": f"Lateral variance {lateral_var:.5f}, threshold {LATERAL_MOTION_LOW_THRESHOLD}",
                "when": "Throughout the clip",
                "score": impact_score(70, "motion", LATERAL_MOTION_LOW_THRESHOLD - lateral_var if lateral_var < LATERAL_MOTION_LOW_THRESHOLD else 0)
            })
    
    # 8. Trail leg recovery during shot attempts
    trail = metrics.get("trail_leg", {})
    shot_events = [e for e in wrestling_events if e["type"] == "SHOT_ATTEMPT"]
    if trail.get("avg") is not None and shot_events:
        avg_trail = trail.get("avg", 0)
        # During a shot, trail leg should be relatively straight (higher angle) for drive
        if avg_trail < 130:  # Trail leg too bent during shot
            shot_times = [f"{e['t_start']:.2f}s" for e in shot_events[:2]]
            pointers.append({
                "title": "Drive Through - Trail Leg",
                "why": f"During your shot attempts, your trail leg angle averaged {avg_trail:.1f}°, which is too bent for maximum drive and penetration.",
                "fix": "On your shot, push off your trail leg and keep it relatively straight to drive through your opponent. Think 'push off' not 'fall forward'.",
                "evidence": f"Avg trail leg angle {avg_trail:.1f}°, shots at {', '.join(shot_times)}",
                "when": f"During shots: {', '.join(shot_times)}" if shot_times else "Shot attempts",
                "score": impact_score(60, "trail_leg", 130 - avg_trail)
            })
    
    # 9. Balance/stability (high variance in stance width = wobble)
    stance_var = metrics.get("motion_stability", {}).get("stance_variance", 0)
    if stance_var > STANCE_WOBBLE_THRESHOLD:
        pointers.append({
            "title": "Improve Balance - Stop Wobbling",
            "why": f"Your stance width variance is high ({stance_var:.4f}), indicating unstable positioning and weight shifting problems.",
            "fix": "Focus on keeping your weight centered over your base. Practice moving while maintaining consistent foot spacing. Drill shadow wrestling with attention to balance.",
            "evidence": f"Stance variance {stance_var:.4f}, threshold {STANCE_WOBBLE_THRESHOLD}",
            "when": "Throughout the clip",
            "score": impact_score(55, "balance", stance_var - STANCE_WOBBLE_THRESHOLD)
        })
    
    # 10. Knee variance / consistency
    knee_var = metrics.get("motion_stability", {}).get("knee_variance", 0)
    if knee_var > 100:
        pointers.append({
            "title": "Maintain Consistent Level",
            "why": f"Your knee angle variance is {knee_var:.1f}, showing inconsistent level throughout the clip. You're popping up and down too much.",
            "fix": "Stay in your stance! Bouncing up and down wastes energy and creates openings. Maintain a consistent athletic position.",
            "evidence": f"Knee angle variance {knee_var:.1f}",
            "when": "Throughout the clip",
            "score": impact_score(45, "stability", knee_var / 200)
        })
    
    # 11. Hip height analysis
    hip = metrics.get("hip_height_ratio", {})
    if hip.get("avg") is not None:
        avg_ratio = hip.get("avg", 0)
        
        if avg_ratio < 0.35:
            pointers.append({
                "title": "Drop Your Hips",
                "why": f"Your hip-to-shoulder ratio ({avg_ratio:.2f}) indicates you're staying too upright with hips too high.",
                "fix": "Sink your hips lower to create a stronger athletic base. Think 'sit in a chair' while keeping your chest up.",
                "evidence": f"Hip height ratio {avg_ratio:.2f}",
                "when": "Throughout the clip",
                "score": impact_score(50, "knee_angle", 0.35 - avg_ratio)
            })
    
    # 12. Elbow/arm position
    elbow = metrics.get("elbow_flare", {})
    if elbow.get("avg") is not None:
        avg_flare = elbow.get("avg", 0)
        
        if avg_flare > ELBOW_FLARE_THRESHOLD:
            pointers.append({
                "title": "Tighten Your Arms",
                "why": f"Your arms are flaring out ({avg_flare:.3f} from centerline), reducing your ability to control ties and defend.",
                "fix": "Keep your elbows closer to your body. Tight elbows = stronger hand fighting and better inside position.",
                "evidence": f"Avg elbow flare {avg_flare:.3f}, threshold {ELBOW_FLARE_THRESHOLD}",
                "when": "Throughout the clip",
                "score": impact_score(40, "elbow_flare", avg_flare - ELBOW_FLARE_THRESHOLD)
            })
    
    # 13. Head position (horizontal)
    head = metrics.get("head_position", {})
    if head.get("avg") is not None:
        avg_head = head.get("avg", 0)
        
        if abs(avg_head) > HEAD_FORWARD_THRESHOLD:
            direction = "forward" if avg_head > 0 else "back"
            pointers.append({
                "title": "Center Your Head",
                "why": f"Your head is positioned too far {direction} ({abs(avg_head):.3f}), throwing off your balance.",
                "fix": "Keep your head centered over your hips. Look at your opponent's hips, not their feet or face. Head position drives balance.",
                "evidence": f"Head offset {avg_head:.3f}",
                "when": "Throughout the clip",
                "score": impact_score(35, "head_position", abs(avg_head) - HEAD_FORWARD_THRESHOLD)
            })
    
    # 14. Add event-based tips if wrestling events were detected
    level_changes = [e for e in wrestling_events if e["type"] == "LEVEL_CHANGE"]
    sprawls = [e for e in wrestling_events if e["type"] == "SPRAWL_DEFENSE"]
    
    if level_changes:
        lc_times = [f"{e['t_start']:.2f}s" for e in level_changes[:3]]
        avg_conf = sum(e["confidence"] for e in level_changes) / len(level_changes)
        
        pointers.append({
            "title": "Level Change Timing",
            "why": f"Detected {len(level_changes)} level change(s) at {', '.join(lc_times)} with average confidence {avg_conf:.0%}. Level changes are key to successful shots.",
            "fix": "Set up your level changes with motion and hand fighting. Don't telegraph - change levels while moving laterally for better angles.",
            "evidence": f"{len(level_changes)} level changes, confidence {avg_conf:.0%}",
            "when": f"At: {', '.join(lc_times)}",
            "score": impact_score(30, "motion", 0)
        })
    
    if sprawls:
        sp_times = [f"{e['t_start']:.2f}s" for e in sprawls[:3]]
        pointers.append({
            "title": "Sprawl Technique",
            "why": f"Detected {len(sprawls)} sprawl defense action(s). Good defensive awareness, but check if your hips are getting low enough.",
            "fix": "On your sprawl, throw your hips back hard and spread your legs wide. Head up, hips down, circle away to recover position.",
            "evidence": f"{len(sprawls)} sprawls detected",
            "when": f"At: {', '.join(sp_times)}",
            "score": impact_score(25, "stability", 0)
        })
    
    # Sort by impact score (highest first)
    pointers.sort(key=lambda p: p.get("score", 0), reverse=True)
    
    # Remove internal score from output
    for p in pointers:
        if "score" in p:
            del p["score"]
    
    # Ensure at least some feedback
    if not pointers:
        pointers.append({
            "title": "Solid Technique",
            "why": "Your positioning looks good based on the analyzed metrics. No major issues detected.",
            "fix": "Keep up the good work! Focus on maintaining consistency and refining your technique.",
            "evidence": f"Analyzed {metrics.get('frames_analyzed', 0)} frames",
            "when": "N/A"
        })
    
    # Return top 10 tips when possible (was 8)
    return pointers[:10]


def generate_coach_speech(
    metrics: Dict, 
    pointers: List[Dict], 
    wrestling_events: List[Dict],
    duration_analyzed: float
) -> str:
    """
    Generate a coach's speech summary (minimum 8 sentences).
    References:
    - At least 3 tips by title
    - At least 2 metric numbers
    - At least 1-2 detected events with timestamps (or notes absence)
    
    Does NOT claim takedowns/points unless explicitly detected.
    """
    speech_parts = []
    
    # Get key metrics for reference
    knee_avg = metrics.get("knee_angle", {}).get("avg")
    stance_avg = metrics.get("stance_width", {}).get("avg")
    hands_drop_avg = metrics.get("hands_drop", {}).get("avg")
    torso_avg = metrics.get("torso_angle", {}).get("avg")
    frames_analyzed = metrics.get("frames_analyzed", 0)
    lateral_var = metrics.get("lateral_motion", {}).get("variance", 0)
    
    # Get event counts
    level_changes = [e for e in wrestling_events if e["type"] == "LEVEL_CHANGE"]
    shot_attempts = [e for e in wrestling_events if e["type"] == "SHOT_ATTEMPT"]
    sprawls = [e for e in wrestling_events if e["type"] == "SPRAWL_DEFENSE"]
    
    # Collect top tip titles (first 5)
    top_tips = [p["title"] for p in pointers[:5]] if pointers else []
    
    # Opening sentence
    if pointers and len(pointers) >= 3:
        speech_parts.append(
            f"Overall, I analyzed {frames_analyzed} frames (about {duration_analyzed:.1f} seconds) of your wrestling, and there are some clear areas to work on."
        )
    else:
        speech_parts.append(
            f"I reviewed {frames_analyzed} frames of your footage, and your fundamentals look solid with just a few adjustments needed."
        )
    
    # Reference top tips (at least 3)
    if len(top_tips) >= 1:
        speech_parts.append(
            f"Your biggest focus area should be '{top_tips[0]}' - this came up repeatedly throughout the clip."
        )
    
    if len(top_tips) >= 2:
        speech_parts.append(
            f"I also noticed issues with '{top_tips[1]}' that are limiting your effectiveness and making you vulnerable."
        )
    
    if len(top_tips) >= 3:
        speech_parts.append(
            f"Additionally, work on '{top_tips[2]}' to round out your positioning."
        )
    
    # Reference specific metric numbers (at least 2)
    metric_sentences = []
    if knee_avg is not None:
        if knee_avg > KNEE_ANGLE_THRESHOLD:
            metric_sentences.append(
                f"Your average knee angle of {knee_avg:.1f}° tells me you're standing too tall - aim for 120-140° to get into a proper athletic stance."
            )
        else:
            metric_sentences.append(
                f"Your knee angle averaging {knee_avg:.1f}° shows decent level, keep working to maintain that consistently."
            )
    
    if hands_drop_avg is not None and hands_drop_avg > HANDS_DROP_THRESHOLD:
        metric_sentences.append(
            f"I measured your hands dropping an average of {hands_drop_avg:.3f} units below your shoulders - that's leaving you open to attacks."
        )
    elif stance_avg is not None:
        if stance_avg < STANCE_WIDTH_THRESHOLD:
            metric_sentences.append(
                f"Your stance width is only {stance_avg:.3f} normalized - you need to spread out more for better balance and mobility."
            )
        else:
            metric_sentences.append(
                f"Your stance width at {stance_avg:.3f} is in a reasonable range, but keep it consistent."
            )
    
    if torso_avg is not None and torso_avg > TORSO_ANGLE_TOO_BENT:
        metric_sentences.append(
            f"Your torso angle of {torso_avg:.1f}° shows you're bending at the waist too much instead of the knees."
        )
    
    # Add at least 2 metric sentences
    speech_parts.extend(metric_sentences[:2])
    if len(metric_sentences) < 2:
        # Add a general metric reference
        speech_parts.append(
            f"The data shows your lateral movement variance at {lateral_var:.5f} - you need to move and circle more to create angles."
        )
    
    # Reference detected events with timestamps (or note absence)
    if shot_attempts:
        shot = shot_attempts[0]
        speech_parts.append(
            f"I detected what looks like a shot attempt around the {shot['t_start']:.2f} second mark with {shot['confidence']:.0%} confidence - make sure you're setting that up with motion and level changes first."
        )
    elif level_changes:
        lc = level_changes[0]
        speech_parts.append(
            f"Around {lc['t_start']:.2f} seconds, I picked up a level change ({lc['confidence']:.0%} confidence) - that's the foundation for good shots, just make sure you're not telegraphing it."
        )
    else:
        speech_parts.append(
            "I didn't detect any clear shot attempts or level changes in this clip - if you were working on offense, make sure your level changes are distinct enough for me to pick up, or focus on set-up first."
        )
    
    if sprawls:
        sp = sprawls[0]
        speech_parts.append(
            f"There was defensive action around {sp['t_start']:.2f}s that looked like a sprawl - good awareness, but remember to throw your hips back hard and circle away."
        )
    elif not shot_attempts and not level_changes:
        speech_parts.append(
            "Without clear offensive or defensive events detected, this looked more like neutral positioning work - that's fine, but mix in some live entries in your next session."
        )
    
    # Closing motivational sentence referencing tips
    if len(top_tips) >= 4:
        speech_parts.append(
            f"Before your next practice, drill '{top_tips[0]}' and '{top_tips[1]}' in front of a mirror, then work '{top_tips[3] if len(top_tips) > 3 else top_tips[2]}' with a partner."
        )
    elif len(top_tips) >= 2:
        speech_parts.append(
            f"Focus your drilling on '{top_tips[0]}' and '{top_tips[1]}' - nail those and the other issues will start to correct themselves."
        )
    else:
        speech_parts.append(
            "Keep filming yourself and comparing - you're building good habits, just stay consistent with the fundamentals."
        )
    
    # Final encouragement
    speech_parts.append(
        "Remember, small improvements in stance and positioning compound over time - keep grinding and upload another clip when you've worked on these points."
    )
    
    # Ensure we have at least 8 sentences
    while len(speech_parts) < 8:
        speech_parts.append(
            "Stay patient with the process - technique beats athleticism in the long run, and you're investing in the right areas."
        )
    
    return " ".join(speech_parts)


def map_landmarks_to_frame(
    landmarks,
    roi_x: int,
    roi_y: int,
    roi_w: int,
    roi_h: int,
    frame_width: int,
    frame_height: int
):
    """
    Map ROI-relative landmarks back to full-frame coordinates.
    Modifies landmarks in-place.
    """
    for landmark in landmarks.landmark:
        # Convert from ROI normalized coords to absolute coords
        abs_x = roi_x + landmark.x * roi_w
        abs_y = roi_y + landmark.y * roi_h
        
        # Convert back to normalized coords for full frame
        landmark.x = abs_x / frame_width
        landmark.y = abs_y / frame_height


def draw_target_box(frame: np.ndarray, box: Dict, tracking_ok: bool = True):
    """Draw the target bounding box on the frame."""
    x, y, w, h = box["x"], box["y"], box["w"], box["h"]
    color = (0, 255, 0) if tracking_ok else (0, 165, 255)  # Green if OK, orange if lost
    cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
    
    # Add label
    label = "TARGET" if tracking_ok else "REACQUIRING"
    cv2.putText(frame, label, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 
                0.6, color, 2)


def analyze_video(
    input_path: str,
    output_path: str,
    target_box: Optional[Dict] = None,
    t_start: float = 0.0
) -> dict:
    """
    Main analysis function with target tracking.
    
    Args:
        input_path: Path to input video file
        output_path: Path to write annotated output video
        target_box: Optional pre-selected target bounding box (x, y, w, h)
        t_start: Start timestamp in seconds (default 0.0)
        
    Returns:
        Dict with pointers, metrics, timeline, and analysis stats
        
    Raises:
        ValueError: If video cannot be opened or has no frames
    """
    # Open video
    cap = cv2.VideoCapture(input_path)
    
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {input_path}")
    
    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    
    if width == 0 or height == 0:
        cap.release()
        raise ValueError("Invalid video dimensions")
    
    # Clamp t_start to valid range
    t_start = max(0, min(t_start, duration))
    
    # Calculate frame range for analysis
    start_frame = int(t_start * fps)
    max_end_time = min(t_start + MAX_SECONDS, duration)
    max_frames_to_process = int((max_end_time - t_start) * fps)
    
    # Setup video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    if not out.isOpened():
        cap.release()
        raise ValueError("Could not create output video writer")
    
    # Seek to start frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    
    # Read first frame for target selection
    ret, first_frame = cap.read()
    if not ret:
        cap.release()
        out.release()
        raise ValueError(f"Could not read frame at t={t_start}s")
    
    # Initialize target tracker
    if target_box is None:
        # Auto-select target on the frame at t_start
        detections = detect_persons(first_frame)
        target_box = auto_select_target(detections, width, height)
        
        if target_box is None:
            cap.release()
            out.release()
            raise ValueError("No person detected in video at the specified start time. Ensure a person is visible.")
    
    # Validate target box
    target_box["x"] = max(0, min(target_box["x"], width - 10))
    target_box["y"] = max(0, min(target_box["y"], height - 10))
    target_box["w"] = max(10, min(target_box["w"], width - target_box["x"]))
    target_box["h"] = max(10, min(target_box["h"], height - target_box["y"]))
    
    tracker = TargetTracker(target_box, first_frame)
    
    # Aggregation for metrics
    frame_metrics_list: List[FrameMetrics] = []
    
    # Reset to start position for processing
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    
    # Process frames with MediaPipe Pose
    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as pose:
        
        frame_count = 0
        while cap.isOpened() and frame_count < max_frames_to_process:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Calculate timestamp relative to video start (not t_start)
            timestamp = t_start + (frame_count / fps)
            frame_count += 1
            
            # Update tracker
            if frame_count == 1:
                tracking_ok = True
                current_box = tracker.get_current_box()
            else:
                tracking_ok, current_box = tracker.update(frame)
            
            # Draw target box on frame
            draw_target_box(frame, current_box, tracking_ok)
            
            # Expand box for cropping (20% padding)
            expanded_box = expand_box(current_box, width, height, padding_ratio=0.2)
            
            # Crop ROI
            roi_x, roi_y = expanded_box["x"], expanded_box["y"]
            roi_w, roi_h = expanded_box["w"], expanded_box["h"]
            roi = frame[roi_y:roi_y+roi_h, roi_x:roi_x+roi_w]
            
            if roi.size == 0:
                # Invalid crop, skip pose analysis
                out.write(frame)
                continue
            
            # Convert ROI to RGB for MediaPipe
            roi_rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
            results = pose.process(roi_rgb)
            
            # Process landmarks if detected
            if results.pose_landmarks:
                # Map landmarks back to full frame coordinates
                map_landmarks_to_frame(
                    results.pose_landmarks,
                    roi_x, roi_y, roi_w, roi_h,
                    width, height
                )
                
                # Draw pose landmarks on full frame
                mp_drawing.draw_landmarks(
                    frame,
                    results.pose_landmarks,
                    mp_pose.POSE_CONNECTIONS,
                    landmark_drawing_spec=mp_drawing_styles.get_default_pose_landmarks_style()
                )
                
                # Analyze this frame
                frame_metrics = analyze_frame_landmarks(results.pose_landmarks, timestamp)
                frame_metrics_list.append(frame_metrics)
            
            # Write annotated frame
            out.write(frame)
    
    # Cleanup
    cap.release()
    out.release()
    
    # Check if we got any analyzed frames
    if not frame_metrics_list:
        raise ValueError("No pose landmarks detected in video. Ensure a person is visible.")
    
    # Compute aggregate metrics
    aggregate_metrics = compute_aggregate_metrics(frame_metrics_list)
    
    # Detect timeline events (threshold-based)
    timeline = detect_timeline_events(frame_metrics_list, fps)
    
    # Detect wrestling-specific events (level changes, shots, sprawls)
    wrestling_events = detect_wrestling_events(frame_metrics_list, fps)
    
    # Generate rich pointers with wrestling events
    pointers = generate_rich_pointers(aggregate_metrics, timeline, wrestling_events)
    
    # Calculate duration analyzed
    duration_analyzed = frame_count / fps if fps > 0 else 0
    
    # Generate coach's speech
    coach_speech = generate_coach_speech(
        aggregate_metrics, 
        pointers, 
        wrestling_events,
        duration_analyzed
    )
    
    return {
        "pointers": pointers,
        "metrics": aggregate_metrics,
        "timeline": timeline,
        "events": wrestling_events,
        "coach_speech": coach_speech
    }


def extract_first_frame(video_path: str) -> Tuple[np.ndarray, int, int]:
    """
    Extract the first frame from a video file.
    
    Returns:
        Tuple of (frame_bgr, width, height)
        
    Raises:
        ValueError if video cannot be opened
    """
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")
    
    ret, frame = cap.read()
    cap.release()
    
    if not ret:
        raise ValueError("Could not read first frame from video")
    
    height, width = frame.shape[:2]
    return frame, width, height
