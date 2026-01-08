"""
Pose Analysis Module for Wrestling Coach
Uses MediaPipe Pose to analyze wrestling technique from video.
"""

import math
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np

# MediaPipe Pose setup
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# Pose landmark indices (from MediaPipe)
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_KNEE = 25
RIGHT_KNEE = 26
LEFT_ANKLE = 27
RIGHT_ANKLE = 28
LEFT_WRIST = 15
RIGHT_WRIST = 16

# Analysis thresholds
KNEE_ANGLE_THRESHOLD = 145  # degrees - "get lower" if avg > this
STANCE_WIDTH_THRESHOLD = 0.18  # normalized - "widen base" if < this
HANDS_DROP_THRESHOLD = 0.10  # normalized - "hands up" if wrists this far below shoulders

# Max frames to analyze (20 seconds at 30fps)
MAX_FRAMES = 600


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


def get_landmark_coords(landmarks, idx: int) -> Optional[tuple]:
    """Get (x, y) coordinates for a landmark if visible."""
    lm = landmarks.landmark[idx]
    if lm.visibility < 0.5:
        return None
    return (lm.x, lm.y)


def analyze_frame(landmarks) -> dict:
    """
    Analyze a single frame's pose landmarks.
    Returns dict with metrics or None values if landmarks not visible.
    """
    result = {
        "knee_angle": None,
        "stance_width": None,
        "hands_drop": None,
    }
    
    # Get relevant landmarks
    left_hip = get_landmark_coords(landmarks, LEFT_HIP)
    right_hip = get_landmark_coords(landmarks, RIGHT_HIP)
    left_knee = get_landmark_coords(landmarks, LEFT_KNEE)
    right_knee = get_landmark_coords(landmarks, RIGHT_KNEE)
    left_ankle = get_landmark_coords(landmarks, LEFT_ANKLE)
    right_ankle = get_landmark_coords(landmarks, RIGHT_ANKLE)
    left_shoulder = get_landmark_coords(landmarks, LEFT_SHOULDER)
    right_shoulder = get_landmark_coords(landmarks, RIGHT_SHOULDER)
    left_wrist = get_landmark_coords(landmarks, LEFT_WRIST)
    right_wrist = get_landmark_coords(landmarks, RIGHT_WRIST)
    
    # Calculate knee angles (average of both knees)
    knee_angles = []
    if left_hip and left_knee and left_ankle:
        knee_angles.append(calculate_angle(left_hip, left_knee, left_ankle))
    if right_hip and right_knee and right_ankle:
        knee_angles.append(calculate_angle(right_hip, right_knee, right_ankle))
    
    if knee_angles:
        result["knee_angle"] = sum(knee_angles) / len(knee_angles)
    
    # Calculate stance width (normalized by hip width for scale invariance)
    if left_ankle and right_ankle and left_hip and right_hip:
        ankle_dist = abs(left_ankle[0] - right_ankle[0])
        hip_dist = abs(left_hip[0] - right_hip[0])
        # Normalize by approximate body scale (use hip-to-hip as reference)
        # We use raw x distance as it's already normalized 0-1 by MediaPipe
        result["stance_width"] = ankle_dist
    
    # Calculate hands drop (how far wrists are below shoulder line, normalized)
    if left_shoulder and right_shoulder and left_wrist and right_wrist:
        shoulder_y = (left_shoulder[1] + right_shoulder[1]) / 2
        wrist_y = (left_wrist[1] + right_wrist[1]) / 2
        # Positive value means wrists are below shoulders (y increases downward)
        result["hands_drop"] = wrist_y - shoulder_y
    
    return result


def generate_pointers(metrics: dict) -> list:
    """
    Generate coaching pointers based on aggregated metrics.
    Uses simple rules engine.
    """
    pointers = []
    
    # Check knee angle - should be low (bent knees)
    if metrics["knee_angle_avg"] is not None and metrics["knee_angle_avg"] > KNEE_ANGLE_THRESHOLD:
        pointers.append({
            "title": "Get Lower",
            "why": f"Your average knee angle is {metrics['knee_angle_avg']:.1f}°, indicating you're standing too upright.",
            "fix": "Bend your knees more to lower your center of gravity. Aim for a knee angle around 120-140°."
        })
    
    # Check stance width - should be wide enough
    if metrics["stance_width_norm_avg"] is not None and metrics["stance_width_norm_avg"] < STANCE_WIDTH_THRESHOLD:
        pointers.append({
            "title": "Widen Your Base",
            "why": f"Your stance width ({metrics['stance_width_norm_avg']:.2f} normalized) is narrow, reducing stability.",
            "fix": "Spread your feet wider, roughly shoulder-width apart or slightly more for better balance."
        })
    
    # Check hand position - should be up
    if metrics["hands_drop_norm_avg"] is not None and metrics["hands_drop_norm_avg"] > HANDS_DROP_THRESHOLD:
        pointers.append({
            "title": "Hands Up",
            "why": f"Your hands are dropping {metrics['hands_drop_norm_avg']:.2f} units below shoulder level.",
            "fix": "Keep your hands up at chest/shoulder level to defend and attack more effectively."
        })
    
    # Fallback if no issues found
    if not pointers:
        pointers.append({
            "title": "Solid Rep",
            "why": "Your positioning looks good based on the analyzed metrics.",
            "fix": "Keep up the good work! Focus on maintaining consistency throughout your practice."
        })
    
    return pointers


def analyze_video(input_path: str, output_path: str) -> dict:
    """
    Main analysis function.
    
    Args:
        input_path: Path to input video file
        output_path: Path to write annotated output video
        
    Returns:
        Dict with pointers, metrics, and analysis stats
        
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
    
    if width == 0 or height == 0:
        cap.release()
        raise ValueError("Invalid video dimensions")
    
    # Setup video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    if not out.isOpened():
        cap.release()
        raise ValueError("Could not create output video writer")
    
    # Aggregation lists for metrics
    knee_angles = []
    stance_widths = []
    hands_drops = []
    frames_analyzed = 0
    
    # Process frames with MediaPipe Pose
    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as pose:
        
        frame_count = 0
        while cap.isOpened() and frame_count < MAX_FRAMES:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            
            # Convert BGR to RGB for MediaPipe
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(rgb_frame)
            
            # Draw pose landmarks on frame
            if results.pose_landmarks:
                mp_drawing.draw_landmarks(
                    frame,
                    results.pose_landmarks,
                    mp_pose.POSE_CONNECTIONS,
                    landmark_drawing_spec=mp_drawing_styles.get_default_pose_landmarks_style()
                )
                
                # Analyze this frame
                frame_metrics = analyze_frame(results.pose_landmarks)
                frames_analyzed += 1
                
                if frame_metrics["knee_angle"] is not None:
                    knee_angles.append(frame_metrics["knee_angle"])
                if frame_metrics["stance_width"] is not None:
                    stance_widths.append(frame_metrics["stance_width"])
                if frame_metrics["hands_drop"] is not None:
                    hands_drops.append(frame_metrics["hands_drop"])
            
            # Write annotated frame
            out.write(frame)
    
    # Cleanup
    cap.release()
    out.release()
    
    # Check if we got any frames
    if frames_analyzed == 0:
        raise ValueError("No pose landmarks detected in video. Ensure a person is visible.")
    
    # Calculate aggregate metrics
    metrics = {
        "knee_angle_avg": round(sum(knee_angles) / len(knee_angles), 2) if knee_angles else None,
        "stance_width_norm_avg": round(sum(stance_widths) / len(stance_widths), 3) if stance_widths else None,
        "hands_drop_norm_avg": round(sum(hands_drops) / len(hands_drops), 3) if hands_drops else None,
        "frames_analyzed": frames_analyzed
    }
    
    # Generate coaching pointers
    pointers = generate_pointers(metrics)
    
    return {
        "pointers": pointers,
        "metrics": metrics
    }
