"""
Wrestling Coach Backend API
FastAPI server for video analysis with pose estimation and target tracking

API Endpoints:
- POST /api/upload - Upload video, get job_id + video metadata
- GET /api/frame/{job_id}?t=<seconds> - Get JPEG frame at timestamp
- GET /api/boxes/{job_id}?t=<seconds> - Get person detection boxes at timestamp
- POST /api/analyze/{job_id} - Analyze video with target selection
- GET /api/output/{job_id} - Download annotated video
"""

import uuid
import json
from pathlib import Path
from typing import Optional, Any

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, JSONResponse

import cv2
import numpy as np
from pydantic import BaseModel

from analysis.pose_analyze import analyze_video
from analysis.detection import detect_persons, auto_select_target


def convert_numpy_types(obj: Any) -> Any:
    """
    Recursively convert numpy scalar types and arrays to native Python types.
    
    Handles:
    - np.bool_ -> bool
    - np.integer (int8, int16, int32, int64, etc.) -> int
    - np.floating (float16, float32, float64, etc.) -> float
    - np.ndarray -> list (via .tolist())
    - dict -> recursively process values
    - list/tuple -> recursively process elements
    
    Args:
        obj: Any Python object that may contain numpy types
        
    Returns:
        Object with all numpy types converted to native Python types
    """
    if obj is None:
        return None
    
    # Handle numpy bool (must check before np.integer since np.bool_ is also integer-like)
    if isinstance(obj, np.bool_):
        return bool(obj)
    
    # Handle numpy integers
    if isinstance(obj, np.integer):
        return int(obj)
    
    # Handle numpy floats
    if isinstance(obj, np.floating):
        return float(obj)
    
    # Handle numpy arrays
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    
    # Handle dictionaries - recursively convert values
    if isinstance(obj, dict):
        return {key: convert_numpy_types(value) for key, value in obj.items()}
    
    # Handle lists - recursively convert elements
    if isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    
    # Handle tuples - recursively convert elements, return as list for JSON
    if isinstance(obj, tuple):
        return [convert_numpy_types(item) for item in obj]
    
    # Return other types as-is (str, int, float, bool, etc.)
    return obj


def verify_json_serializable(obj: Any, context: str = "payload") -> bool:
    """
    Verify that an object is JSON serializable.
    Raises ValueError with helpful message if not.
    
    Args:
        obj: Object to verify
        context: Description for error messages
        
    Returns:
        True if serializable
        
    Raises:
        ValueError: If object cannot be serialized to JSON
    """
    try:
        json.dumps(obj)
        return True
    except (TypeError, ValueError) as e:
        raise ValueError(f"JSON serialization failed for {context}: {e}")

# Create app
app = FastAPI(title="Wrestling Coach API")

# CORS configuration for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure upload and output directories exist
BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUTS_DIR = BASE_DIR / "outputs"
UPLOADS_DIR.mkdir(exist_ok=True)
OUTPUTS_DIR.mkdir(exist_ok=True)

# Supported video extensions
SUPPORTED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

# Max seconds to allow scrubbing for target selection
MAX_SCRUB_SECONDS = 15


# Pydantic models for request/response
class TargetBox(BaseModel):
    x: int
    y: int
    w: int
    h: int


class AnalyzeRequest(BaseModel):
    target_box: Optional[TargetBox] = None
    t_start: float = 0.0


@app.get("/")
def root():
    """Health check endpoint"""
    return {"status": "ok", "service": "wrestling-coach-api"}


def get_video_metadata(video_path: str) -> dict:
    """Extract video metadata using cv2."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")
    
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_seconds = frame_count / fps if fps > 0 else 0
    
    cap.release()
    
    return {
        "fps": fps,
        "width": width,
        "height": height,
        "duration_seconds": round(duration_seconds, 2),
        "frame_count": frame_count
    }


def find_upload_file(job_id: str) -> Path:
    """Find the uploaded file for a job_id."""
    input_files = list(UPLOADS_DIR.glob(f"{job_id}_*"))
    if not input_files:
        raise HTTPException(status_code=404, detail="Upload not found. Please upload video first.")
    return input_files[0]


def extract_frame_at_time(video_path: str, t_seconds: float, max_t: float = None):
    """
    Extract a single frame at the given timestamp.
    
    Args:
        video_path: Path to video file
        t_seconds: Time in seconds
        max_t: Maximum allowed time (clamps t_seconds)
    
    Returns:
        BGR frame as numpy array, or None if failed
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    
    # Get video info
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps if fps > 0 else 0
    
    # Clamp t_seconds
    if max_t is not None:
        t_seconds = min(t_seconds, max_t)
    t_seconds = max(0, min(t_seconds, duration))
    
    # Seek to timestamp
    cap.set(cv2.CAP_PROP_POS_MSEC, t_seconds * 1000)
    
    ret, frame = cap.read()
    cap.release()
    
    return frame if ret else None


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    """
    Upload a video file and get job_id + video metadata.
    
    Returns:
        job_id: Unique identifier for this job
        duration_seconds: Video duration
        fps: Frames per second
        width: Frame width
        height: Frame height
    """
    # Validate file extension
    filename = file.filename or "video.mp4"
    ext = Path(filename).suffix.lower()
    
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Supported: {', '.join(SUPPORTED_EXTENSIONS)}"
        )
    
    # Generate unique job ID
    job_id = str(uuid.uuid4())
    
    # Save uploaded file
    input_path = UPLOADS_DIR / f"{job_id}_{filename}"
    
    try:
        # Write uploaded file to disk
        contents = await file.read()
        with open(input_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
    
    # Get video metadata
    try:
        metadata = get_video_metadata(str(input_path))
    except ValueError as e:
        # Clean up on error
        if input_path.exists():
            input_path.unlink()
        raise HTTPException(status_code=400, detail=str(e))
    
    return {
        "job_id": job_id,
        "filename": filename,
        "duration_seconds": metadata["duration_seconds"],
        "fps": metadata["fps"],
        "width": metadata["width"],
        "height": metadata["height"]
    }


@app.get("/api/frame/{job_id}")
async def get_frame(
    job_id: str,
    t: float = Query(default=0, description="Timestamp in seconds")
):
    """
    Get a JPEG image of the frame at timestamp t.
    
    Args:
        job_id: Job ID from /api/upload
        t: Timestamp in seconds (clamped to [0, min(15, duration)])
    
    Returns:
        JPEG image response
    """
    # Validate job_id format
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")
    
    # Find uploaded file
    input_path = find_upload_file(job_id)
    
    # Get video metadata to determine max time
    try:
        metadata = get_video_metadata(str(input_path))
        max_t = min(MAX_SCRUB_SECONDS, metadata["duration_seconds"])
    except ValueError:
        max_t = MAX_SCRUB_SECONDS
    
    # Clamp t to valid range
    t = max(0, min(t, max_t))
    
    # Extract frame
    frame = extract_frame_at_time(str(input_path), t, max_t)
    
    if frame is None:
        raise HTTPException(status_code=500, detail="Failed to extract frame from video")
    
    # Encode as JPEG
    success, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not success:
        raise HTTPException(status_code=500, detail="Failed to encode frame as JPEG")
    
    return Response(
        content=buffer.tobytes(),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=60"}
    )


@app.get("/api/boxes/{job_id}")
async def get_boxes(
    job_id: str,
    t: float = Query(default=0, description="Timestamp in seconds")
):
    """
    Get person detection boxes at timestamp t.
    
    Args:
        job_id: Job ID from /api/upload
        t: Timestamp in seconds (clamped to [0, min(15, duration)])
    
    Returns:
        List of detection boxes: [{id, x, y, w, h, score}]
    """
    # Validate job_id format
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")
    
    # Find uploaded file
    input_path = find_upload_file(job_id)
    
    # Get video metadata to determine max time
    try:
        metadata = get_video_metadata(str(input_path))
        max_t = min(MAX_SCRUB_SECONDS, metadata["duration_seconds"])
        width = metadata["width"]
        height = metadata["height"]
    except ValueError:
        raise HTTPException(status_code=500, detail="Failed to read video metadata")
    
    # Clamp t to valid range
    t = max(0, min(t, max_t))
    
    # Extract frame
    frame = extract_frame_at_time(str(input_path), t, max_t)
    
    if frame is None:
        raise HTTPException(status_code=500, detail="Failed to extract frame from video")
    
    # Run person detection
    try:
        detections = detect_persons(frame, confidence_threshold=0.5)
    except Exception as e:
        # Detection failure shouldn't be a hard error
        detections = []
    
    # Also compute auto-selected target
    auto_target = auto_select_target(detections, width, height)
    
    return {
        "boxes": detections,
        "auto_target": auto_target,
        "frame_width": width,
        "frame_height": height,
        "timestamp": t
    }


@app.post("/api/analyze/{job_id}")
async def analyze(job_id: str, request: AnalyzeRequest):
    """
    Analyze an uploaded video with target tracking.
    
    Args:
        job_id: Job ID from /api/upload
        request: JSON body with:
            - target_box: {x, y, w, h} or null for auto-selection
            - t_start: Start timestamp in seconds (default 0)
    
    Returns:
        job_id: Same job ID
        pointers: List of coaching pointers (top 8)
        metrics: Aggregated metrics with percentages
        timeline: List of timestamped events
        annotated_video_url: URL to download annotated video
    """
    # Validate job_id format
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")
    
    # Find uploaded file
    input_path = find_upload_file(job_id)
    output_path = OUTPUTS_DIR / f"{job_id}_annotated.mp4"
    
    # Get video metadata
    try:
        metadata = get_video_metadata(str(input_path))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Parse target_box
    parsed_target = None
    if request.target_box:
        parsed_target = {
            "x": request.target_box.x,
            "y": request.target_box.y,
            "w": request.target_box.w,
            "h": request.target_box.h
        }
    
    # Clamp t_start to valid range
    t_start = max(0, min(request.t_start, metadata["duration_seconds"]))
    
    # Run pose analysis with target tracking
    try:
        result = analyze_video(
            str(input_path), 
            str(output_path), 
            target_box=parsed_target,
            t_start=t_start
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    
    # Build response payload
    response_payload = {
        "job_id": job_id,
        "pointers": result["pointers"],
        "metrics": result["metrics"],
        "timeline": result.get("timeline", []),
        "events": result.get("events", []),
        "coach_speech": result.get("coach_speech", ""),
        "annotated_video_url": f"/api/output/{job_id}"
    }
    
    # Convert all numpy types to native Python types for JSON serialization
    response_payload = convert_numpy_types(response_payload)
    
    # Return as JSONResponse to ensure proper serialization
    return JSONResponse(content=response_payload)


@app.get("/api/output/{job_id}")
def get_output(job_id: str):
    """
    Download annotated video by job ID.
    """
    # Validate job_id format
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")
    
    # Find output file
    output_path = OUTPUTS_DIR / f"{job_id}_annotated.mp4"
    
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Annotated video not found")
    
    return FileResponse(
        path=str(output_path),
        media_type="video/mp4",
        filename=f"wrestling_analysis_{job_id}.mp4"
    )


def _test_numpy_conversion():
    """
    Quick sanity check to verify numpy type conversion works correctly.
    Run with: python -c "from main import _test_numpy_conversion; _test_numpy_conversion()"
    """
    test_payload = {
        "bool_val": np.bool_(True),
        "int32_val": np.int32(42),
        "int64_val": np.int64(123456789),
        "float32_val": np.float32(3.14),
        "float64_val": np.float64(2.71828),
        "array_val": np.array([1, 2, 3]),
        "nested_dict": {
            "numpy_float": np.float64(99.9),
            "list_with_numpy": [np.int32(1), np.float32(2.5), np.bool_(False)]
        },
        "tuple_val": (np.int32(1), np.float64(2.0)),
        "none_val": None,
        "native_int": 123,
        "native_str": "hello"
    }
    
    converted = convert_numpy_types(test_payload)
    
    # Verify JSON serialization works
    try:
        json_str = json.dumps(converted)
        print("✓ JSON serialization successful")
        print(f"  Result: {json_str[:100]}...")
    except (TypeError, ValueError) as e:
        print(f"✗ JSON serialization failed: {e}")
        return False
    
    # Verify types are correct
    assert isinstance(converted["bool_val"], bool), "bool conversion failed"
    assert isinstance(converted["int32_val"], int), "int32 conversion failed"
    assert isinstance(converted["int64_val"], int), "int64 conversion failed"
    assert isinstance(converted["float32_val"], float), "float32 conversion failed"
    assert isinstance(converted["float64_val"], float), "float64 conversion failed"
    assert isinstance(converted["array_val"], list), "array conversion failed"
    assert isinstance(converted["nested_dict"]["numpy_float"], float), "nested float conversion failed"
    assert isinstance(converted["tuple_val"], list), "tuple conversion failed"
    
    print("✓ All type conversions verified")
    return True


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
