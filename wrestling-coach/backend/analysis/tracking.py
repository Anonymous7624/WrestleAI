"""
Target Tracking Module for Wrestling Coach
Uses OpenCV CSRT tracker with re-acquisition fallback.
"""

from typing import Dict, Optional, Tuple
import cv2
import numpy as np

from .detection import detect_persons, find_best_match_by_iou


class TargetTracker:
    """
    Tracks a target person through video frames using CSRT tracker.
    Automatically re-acquires target if tracking is lost.
    """
    
    def __init__(self, initial_box: Dict, frame: np.ndarray):
        """
        Initialize tracker with a target bounding box.
        
        Args:
            initial_box: Dict with x, y, w, h keys (pixel coordinates)
            frame: First frame of video (BGR numpy array)
        """
        self.last_box = initial_box.copy()
        self.tracker = None
        self.lost_frames = 0
        self.max_lost_frames = 15  # Frames before attempting re-acquisition
        
        # Initialize CSRT tracker
        self._init_tracker(frame, initial_box)
    
    def _init_tracker(self, frame: np.ndarray, box: Dict):
        """Initialize or reinitialize the CSRT tracker."""
        # Create new CSRT tracker
        self.tracker = cv2.TrackerCSRT_create()
        
        # Convert box to (x, y, w, h) tuple
        bbox = (box["x"], box["y"], box["w"], box["h"])
        
        # Initialize tracker
        success = self.tracker.init(frame, bbox)
        if success:
            self.lost_frames = 0
    
    def update(self, frame: np.ndarray) -> Tuple[bool, Dict]:
        """
        Update tracker with new frame.
        
        Args:
            frame: Current frame (BGR numpy array)
            
        Returns:
            Tuple of (success, bounding_box_dict)
        """
        if self.tracker is None:
            return False, self.last_box
        
        # Try to update tracker
        success, bbox = self.tracker.update(frame)
        
        if success:
            # Convert bbox tuple to dict
            x, y, w, h = [int(v) for v in bbox]
            
            # Sanity check on bbox dimensions
            if w > 10 and h > 10:
                self.last_box = {"x": x, "y": y, "w": w, "h": h}
                self.lost_frames = 0
                return True, self.last_box
        
        # Tracking failed, increment lost counter
        self.lost_frames += 1
        
        # Try re-acquisition if lost for too long
        if self.lost_frames >= self.max_lost_frames:
            reacquired_box = self._try_reacquire(frame)
            if reacquired_box:
                self._init_tracker(frame, reacquired_box)
                self.last_box = reacquired_box
                return True, self.last_box
        
        # Return last known position
        return False, self.last_box
    
    def _try_reacquire(self, frame: np.ndarray) -> Optional[Dict]:
        """
        Attempt to re-acquire the target using detection and IoU matching.
        
        Args:
            frame: Current frame
            
        Returns:
            Re-acquired bounding box or None
        """
        # Run person detection on current frame
        detections = detect_persons(frame, confidence_threshold=0.4)
        
        if not detections:
            return None
        
        # Find best match by IoU with last known position
        return find_best_match_by_iou(detections, self.last_box, min_iou=0.2)
    
    def force_reacquire(self, frame: np.ndarray) -> bool:
        """
        Force a re-acquisition attempt (useful if tracking seems wrong).
        
        Args:
            frame: Current frame
            
        Returns:
            True if re-acquisition succeeded
        """
        reacquired_box = self._try_reacquire(frame)
        if reacquired_box:
            self._init_tracker(frame, reacquired_box)
            self.last_box = reacquired_box
            return True
        return False
    
    def get_current_box(self) -> Dict:
        """Get the current/last known bounding box."""
        return self.last_box.copy()


def expand_box(
    box: Dict,
    frame_width: int,
    frame_height: int,
    padding_ratio: float = 0.2
) -> Dict:
    """
    Expand a bounding box by a padding ratio while keeping it within frame bounds.
    
    Args:
        box: Dict with x, y, w, h keys
        frame_width: Width of the frame
        frame_height: Height of the frame
        padding_ratio: How much to expand (0.2 = 20% on each side)
        
    Returns:
        Expanded bounding box dict
    """
    x, y, w, h = box["x"], box["y"], box["w"], box["h"]
    
    # Calculate padding
    pad_w = int(w * padding_ratio)
    pad_h = int(h * padding_ratio)
    
    # Expand box
    new_x = max(0, x - pad_w)
    new_y = max(0, y - pad_h)
    new_w = min(frame_width - new_x, w + 2 * pad_w)
    new_h = min(frame_height - new_y, h + 2 * pad_h)
    
    return {"x": new_x, "y": new_y, "w": new_w, "h": new_h}
