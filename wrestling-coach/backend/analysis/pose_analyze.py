"""
Pose Analysis Module for Wrestling Coach
Uses MediaPipe Pose to analyze wrestling technique from video.
Now with target tracking and cropped pose analysis.
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
    Returns angle in degrees.
    """
    ba = np.array([a[0] - b[0], a[1] - b[1]])
    bc = np.array([c[0] - b[0], c[1] - b[1]])
    
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    cosine = np.clip(cosine, -1.0, 1.0)
    angle = np.degrees(np.arccos(cosine))
    
    return angle


def get_landmark_coords(landmarks, idx: int, min_visibility: float = 0.5) -> Optional[tuple]:
    """Get (x, y) coordinates for a landmark if visible."""
    lm = landmarks.landmark[idx]
    if lm.visibility < min_visibility:
        return None
    return (lm.x, lm.y)


def analyze_frame_landmarks(landmarks, timestamp: float = 0.0) -> FrameMetrics:
    """
    Analyze a single frame's pose landmarks.
    Returns comprehensive metrics.
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
    
    # 3. Hands drop (wrists below shoulders)
    if left_shoulder and right_shoulder and left_wrist and right_wrist:
        shoulder_y = (left_shoulder[1] + right_shoulder[1]) / 2
        wrist_y = (left_wrist[1] + right_wrist[1]) / 2
        metrics.hands_drop = wrist_y - shoulder_y  # Positive = below
    
    # 4. Back lean angle (angle of spine from vertical)
    if left_shoulder and right_shoulder and left_hip and right_hip:
        # Mid shoulder and mid hip
        mid_shoulder = ((left_shoulder[0] + right_shoulder[0]) / 2, 
                        (left_shoulder[1] + right_shoulder[1]) / 2)
        mid_hip = ((left_hip[0] + right_hip[0]) / 2,
                   (left_hip[1] + right_hip[1]) / 2)
        
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
        # Positive = head forward of hips
        metrics.head_position = nose[0] - hip_center_x
    
    return metrics


def compute_aggregate_metrics(frame_metrics: List[FrameMetrics]) -> Dict:
    """
    Compute aggregate statistics from frame-by-frame metrics.
    Returns comprehensive dict with averages, percentages, min/max values.
    """
    if not frame_metrics:
        return {}
    
    # Helper to aggregate a metric
    def aggregate(values: List[float]) -> Dict:
        if not values:
            return {"avg": None, "min": None, "max": None, "count": 0}
        return {
            "avg": round(sum(values) / len(values), 2),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
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
    
    # Calculate percentages of frames exceeding thresholds
    pct_knee_high = (len([k for k in knee_angles if k > KNEE_ANGLE_THRESHOLD]) / len(knee_angles) * 100) if knee_angles else 0
    pct_stance_narrow = (len([s for s in stance_widths if s < STANCE_WIDTH_THRESHOLD]) / len(stance_widths) * 100) if stance_widths else 0
    pct_hands_dropped = (len([h for h in hands_drops if h > HANDS_DROP_THRESHOLD]) / len(hands_drops) * 100) if hands_drops else 0
    pct_back_lean = (len([b for b in back_leans if b > 25]) / len(back_leans) * 100) if back_leans else 0  # >25 degrees from vertical
    
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
            "knee_variance": round(np.var(knee_angles), 2) if len(knee_angles) > 1 else 0,
            "stance_variance": round(np.var(stance_widths), 4) if len(stance_widths) > 1 else 0
        }
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
                        "timestamp": round(start_time, 2),
                        "duration": round(end_time - start_time, 2),
                        "metric": metric_name,
                        "value": round(avg_value, 2),
                        "message": message_template.format(value=round(avg_value, 1))
                    })
                current_run = []
        
        # Check final run
        if len(current_run) >= min_frames:
            start_time = current_run[0][0]
            end_time = current_run[-1][0]
            avg_value = sum(v for _, v in current_run) / len(current_run)
            runs.append({
                "timestamp": round(start_time, 2),
                "duration": round(end_time - start_time, 2),
                "metric": metric_name,
                "value": round(avg_value, 2),
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


def generate_rich_pointers(metrics: Dict, timeline: List[Dict]) -> List[Dict]:
    """
    Generate rich coaching pointers based on aggregated metrics.
    Returns ranked list of issues with evidence, timing, and fixes.
    """
    pointers = []
    
    # Severity weights for ranking
    SEVERITY_WEIGHTS = {
        "knee_angle": 0.25,
        "stance_width": 0.20,
        "hands_drop": 0.20,
        "back_lean": 0.15,
        "elbow_flare": 0.10,
        "head_position": 0.05,
        "stability": 0.05
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
            # Find timing from timeline
            knee_events = [e for e in timeline if e["metric"] == "knee_angle"]
            timestamps = [str(e["timestamp"]) + "s" for e in knee_events[:3]]
            when = f"Occurred at: {', '.join(timestamps)}" if timestamps else "Throughout the clip"
            
            pointers.append({
                "title": "Get Lower",
                "why": f"Your average knee angle is {avg_angle:.1f}° (threshold: {KNEE_ANGLE_THRESHOLD}°), indicating you're standing too upright in {pct_bad:.0f}% of frames.",
                "fix": "Bend your knees more to lower your center of gravity. Aim for a knee angle around 120-140° for optimal wrestling stance.",
                "evidence": f"Avg: {avg_angle:.1f}°, Worst: {worst:.1f}°, Bad frames: {pct_bad:.0f}%",
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
                "evidence": f"Avg: {avg_width:.3f}, Narrowest: {narrowest:.3f}, Bad frames: {pct_bad:.0f}%",
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
                "why": f"Your hands are dropping {avg_drop:.3f} units below shoulder level in {pct_bad:.0f}% of frames, leaving you vulnerable.",
                "fix": "Keep your hands up at chest/shoulder level. Active hands help with grip fighting, shot defense, and quick attacks.",
                "evidence": f"Avg drop: {avg_drop:.3f}, Worst: {worst_drop:.3f}, Bad frames: {pct_bad:.0f}%",
                "when": when,
                "score": impact_score(pct_bad, "hands_drop", worst_drop - HANDS_DROP_THRESHOLD if worst_drop > HANDS_DROP_THRESHOLD else 0)
            })
    
    # 4. Back lean analysis
    back = metrics.get("back_lean_angle", {})
    if back.get("avg") is not None:
        pct_bad = back.get("pct_excessive", 0)
        avg_lean = back.get("avg", 0)
        worst_lean = back.get("max", avg_lean)
        
        if pct_bad > 25 or avg_lean > 20:
            lean_events = [e for e in timeline if e["metric"] == "back_lean"]
            timestamps = [str(e["timestamp"]) + "s" for e in lean_events[:3]]
            when = f"Occurred at: {', '.join(timestamps)}" if timestamps else "Throughout the clip"
            
            pointers.append({
                "title": "Watch Your Posture",
                "why": f"Your torso is leaning {avg_lean:.1f}° from vertical on average, with {pct_bad:.0f}% of frames showing excessive lean.",
                "fix": "Keep your back more upright while bending at the knees and hips. Excessive forward lean telegraphs your moves and weakens your base.",
                "evidence": f"Avg lean: {avg_lean:.1f}°, Worst: {worst_lean:.1f}°, Bad frames: {pct_bad:.0f}%",
                "when": when,
                "score": impact_score(pct_bad, "back_lean", worst_lean - 20 if worst_lean > 20 else 0)
            })
    
    # 5. Hip height analysis
    hip = metrics.get("hip_height_ratio", {})
    if hip.get("avg") is not None:
        avg_ratio = hip.get("avg", 0)
        
        if avg_ratio < 0.35:  # Hips too high = too upright
            pointers.append({
                "title": "Drop Your Hips",
                "why": f"Your hip-to-shoulder ratio ({avg_ratio:.2f}) indicates you're staying too upright.",
                "fix": "Sink your hips lower to create a stronger athletic base. Think 'sit in a chair' while keeping chest up.",
                "evidence": f"Avg ratio: {avg_ratio:.2f}",
                "when": "Throughout the clip",
                "score": impact_score(60, "knee_angle", 0.35 - avg_ratio)
            })
    
    # 6. Elbow/arm position
    elbow = metrics.get("elbow_flare", {})
    if elbow.get("avg") is not None:
        avg_flare = elbow.get("avg", 0)
        
        if avg_flare > ELBOW_FLARE_THRESHOLD:
            pointers.append({
                "title": "Tighten Your Arms",
                "why": f"Your arms are flaring out ({avg_flare:.3f}) away from your body, reducing control.",
                "fix": "Keep your elbows closer to your body for stronger hand fighting and better defensive positioning.",
                "evidence": f"Avg flare: {avg_flare:.3f}, Threshold: {ELBOW_FLARE_THRESHOLD:.3f}",
                "when": "Throughout the clip",
                "score": impact_score(50, "elbow_flare", avg_flare - ELBOW_FLARE_THRESHOLD)
            })
    
    # 7. Head position
    head = metrics.get("head_position", {})
    if head.get("avg") is not None:
        avg_head = head.get("avg", 0)
        
        if abs(avg_head) > HEAD_FORWARD_THRESHOLD:
            direction = "forward" if avg_head > 0 else "back"
            pointers.append({
                "title": "Center Your Head",
                "why": f"Your head is positioned too far {direction} ({abs(avg_head):.3f}), affecting balance.",
                "fix": "Keep your head centered over your hips. Look at your opponent's hips, not their feet or face.",
                "evidence": f"Avg offset: {avg_head:.3f}",
                "when": "Throughout the clip",
                "score": impact_score(40, "head_position", abs(avg_head) - HEAD_FORWARD_THRESHOLD)
            })
    
    # 8. Motion stability
    stability = metrics.get("motion_stability", {})
    knee_var = stability.get("knee_variance", 0)
    stance_var = stability.get("stance_variance", 0)
    
    if knee_var > 100 or stance_var > 0.005:
        pointers.append({
            "title": "Improve Stability",
            "why": f"Your stance shows high variability (knee variance: {knee_var:.1f}, stance variance: {stance_var:.4f}), indicating inconsistent positioning.",
            "fix": "Practice holding your stance steady. Good wrestlers maintain consistent positioning while moving. Drill stance work.",
            "evidence": f"Knee variance: {knee_var:.1f}, Stance variance: {stance_var:.4f}",
            "when": "Throughout the clip",
            "score": impact_score(30, "stability", knee_var / 100)
        })
    
    # Sort by impact score (highest first) and take top 8
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
    
    return pointers[:8]


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
    
    # Detect timeline events
    timeline = detect_timeline_events(frame_metrics_list, fps)
    
    # Generate rich pointers
    pointers = generate_rich_pointers(aggregate_metrics, timeline)
    
    return {
        "pointers": pointers,
        "metrics": aggregate_metrics,
        "timeline": timeline
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
