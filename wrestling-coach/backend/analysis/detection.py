"""
Person Detection Module for Wrestling Coach
Uses YOLOv8 for detecting persons in video frames.
"""

from typing import List, Dict, Optional, Tuple
import numpy as np

# Import YOLO from ultralytics
from ultralytics import YOLO


# Global model instance (lazy loaded)
_yolo_model: Optional[YOLO] = None


def get_yolo_model() -> YOLO:
    """
    Get or create the YOLO model instance.
    Uses YOLOv8n (nano) for speed on CPU.
    """
    global _yolo_model
    if _yolo_model is None:
        # Use YOLOv8n (nano) model - small, fast, works well on CPU
        _yolo_model = YOLO("yolov8n.pt")
    return _yolo_model


def detect_persons(
    frame: np.ndarray,
    confidence_threshold: float = 0.5
) -> List[Dict]:
    """
    Detect persons in a single frame using YOLOv8.
    
    Args:
        frame: BGR image as numpy array
        confidence_threshold: Minimum confidence for detection
        
    Returns:
        List of detected person bounding boxes:
        [{"id": 0, "x": int, "y": int, "w": int, "h": int, "score": float}, ...]
    """
    model = get_yolo_model()
    
    # Run inference
    # Class 0 is 'person' in COCO dataset
    results = model(frame, classes=[0], verbose=False)
    
    detections = []
    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
            
        for i, box in enumerate(boxes):
            conf = float(box.conf[0])
            if conf < confidence_threshold:
                continue
                
            # Get bounding box coordinates (x1, y1, x2, y2)
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            
            detections.append({
                "id": len(detections),
                "x": int(x1),
                "y": int(y1),
                "w": int(x2 - x1),
                "h": int(y2 - y1),
                "score": round(conf, 3)
            })
    
    return detections


def auto_select_target(
    detections: List[Dict],
    frame_width: int,
    frame_height: int
) -> Optional[Dict]:
    """
    Automatically select the target person from detections.
    Uses heuristic: largest bbox weighted by closeness to center.
    
    Formula: score = area_normalized * 0.6 + center_proximity * 0.4
    
    Args:
        detections: List of detected bounding boxes
        frame_width: Width of the frame
        frame_height: Height of the frame
        
    Returns:
        Selected detection dict or None if no detections
    """
    if not detections:
        return None
        
    if len(detections) == 1:
        return detections[0]
    
    frame_center_x = frame_width / 2
    frame_center_y = frame_height / 2
    max_area = frame_width * frame_height
    max_distance = np.sqrt(frame_center_x**2 + frame_center_y**2)
    
    best_detection = None
    best_score = -1
    
    for det in detections:
        # Calculate area score (normalized)
        area = det["w"] * det["h"]
        area_score = area / max_area
        
        # Calculate center proximity score
        bbox_center_x = det["x"] + det["w"] / 2
        bbox_center_y = det["y"] + det["h"] / 2
        distance = np.sqrt(
            (bbox_center_x - frame_center_x)**2 + 
            (bbox_center_y - frame_center_y)**2
        )
        proximity_score = 1 - (distance / max_distance)
        
        # Combined score
        combined_score = area_score * 0.6 + proximity_score * 0.4
        
        if combined_score > best_score:
            best_score = combined_score
            best_detection = det
    
    return best_detection


def calculate_iou(box1: Dict, box2: Dict) -> float:
    """
    Calculate Intersection over Union (IoU) between two bounding boxes.
    
    Args:
        box1: Dict with x, y, w, h keys
        box2: Dict with x, y, w, h keys
        
    Returns:
        IoU value between 0 and 1
    """
    # Convert to (x1, y1, x2, y2) format
    x1_1, y1_1 = box1["x"], box1["y"]
    x2_1, y2_1 = x1_1 + box1["w"], y1_1 + box1["h"]
    
    x1_2, y1_2 = box2["x"], box2["y"]
    x2_2, y2_2 = x1_2 + box2["w"], y1_2 + box2["h"]
    
    # Calculate intersection
    inter_x1 = max(x1_1, x1_2)
    inter_y1 = max(y1_1, y1_2)
    inter_x2 = min(x2_1, x2_2)
    inter_y2 = min(y2_1, y2_2)
    
    inter_width = max(0, inter_x2 - inter_x1)
    inter_height = max(0, inter_y2 - inter_y1)
    inter_area = inter_width * inter_height
    
    # Calculate union
    area1 = box1["w"] * box1["h"]
    area2 = box2["w"] * box2["h"]
    union_area = area1 + area2 - inter_area
    
    if union_area == 0:
        return 0.0
        
    return inter_area / union_area


def find_best_match_by_iou(
    detections: List[Dict],
    reference_box: Dict,
    min_iou: float = 0.3
) -> Optional[Dict]:
    """
    Find the detection that best matches a reference box by IoU.
    
    Args:
        detections: List of detected bounding boxes
        reference_box: Reference bbox to match against
        min_iou: Minimum IoU threshold for a match
        
    Returns:
        Best matching detection or None if no good match found
    """
    if not detections:
        return None
        
    best_match = None
    best_iou = min_iou
    
    for det in detections:
        iou = calculate_iou(det, reference_box)
        if iou > best_iou:
            best_iou = iou
            best_match = det
            
    return best_match
