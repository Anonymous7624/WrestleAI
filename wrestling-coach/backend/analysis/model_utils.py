"""
Model Utilities for Wrestling Coach
Handles pose landmarker model path resolution and download.
"""

import os
from pathlib import Path
from typing import Optional
import urllib.request

# Model file info
POSE_MODEL_FILENAME = "pose_landmarker_lite.task"
POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"

# Get the models directory relative to this file
_BACKEND_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = _BACKEND_DIR / "models"


def get_pose_model_path() -> str:
    """
    Get the path to the pose landmarker model file.
    
    Returns:
        Absolute path to the pose_landmarker_lite.task file
        
    Raises:
        RuntimeError: If model file not found and auto-download fails
    """
    model_path = MODELS_DIR / POSE_MODEL_FILENAME
    
    if model_path.exists():
        return str(model_path)
    
    # Try to auto-download
    if _try_download_model(model_path):
        return str(model_path)
    
    # Download failed, raise helpful error
    raise RuntimeError(
        f"Pose landmarker model not found at: {model_path}\n\n"
        f"Please download the model manually:\n"
        f"1. Create directory: {MODELS_DIR}\n"
        f"2. Download from: {POSE_MODEL_URL}\n"
        f"3. Save as: {model_path}\n\n"
        f"Or run: curl -o {model_path} {POSE_MODEL_URL}"
    )


def _try_download_model(model_path: Path) -> bool:
    """
    Attempt to download the pose landmarker model.
    
    Args:
        model_path: Target path for the model file
        
    Returns:
        True if download succeeded, False otherwise
    """
    try:
        # Ensure models directory exists
        model_path.parent.mkdir(parents=True, exist_ok=True)
        
        print(f"Downloading pose landmarker model to {model_path}...")
        
        # Download with progress
        urllib.request.urlretrieve(POSE_MODEL_URL, str(model_path))
        
        # Verify file was downloaded
        if model_path.exists() and model_path.stat().st_size > 0:
            print(f"Successfully downloaded pose model ({model_path.stat().st_size / 1024 / 1024:.1f} MB)")
            return True
        else:
            return False
            
    except Exception as e:
        print(f"Failed to auto-download model: {e}")
        # Clean up partial download
        if model_path.exists():
            try:
                model_path.unlink()
            except:
                pass
        return False


def ensure_pose_model() -> str:
    """
    Ensure the pose model exists and return its path.
    Same as get_pose_model_path() but with a clearer name for callers
    who want to guarantee the model is available before use.
    
    Returns:
        Absolute path to the pose model
        
    Raises:
        RuntimeError: If model cannot be found or downloaded
    """
    return get_pose_model_path()
