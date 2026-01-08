# Analysis module for Wrestling Coach
# Includes pose analysis, person detection, and target tracking

from .pose_analyze import analyze_video, extract_first_frame
from .detection import detect_persons, auto_select_target
from .tracking import TargetTracker, expand_box

__all__ = [
    'analyze_video',
    'extract_first_frame',
    'detect_persons',
    'auto_select_target',
    'TargetTracker',
    'expand_box'
]
