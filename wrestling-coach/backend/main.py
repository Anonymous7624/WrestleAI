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
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, JSONResponse

import cv2
import numpy as np
from pydantic import BaseModel

from analysis.pose_analyze import analyze_video, analyze_video_with_anchors
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


class AnchorBox(BaseModel):
    """Bounding box for an anchor point"""
    x: int
    y: int
    w: int
    h: int


class Anchor(BaseModel):
    """Single anchor point with timestamp, optional box, and skip flag"""
    t: float
    box: Optional[AnchorBox] = None
    skipped: bool = False


class PriorContext(BaseModel):
    """Context from prior analysis for continuation mode"""
    lastTips: Optional[List[str]] = None
    lastEvents: Optional[List[Dict[str, Any]]] = None
    lastMetrics: Optional[Dict[str, Any]] = None
    coachSpeechSummary: Optional[str] = None
    totalShotAttempts: Optional[int] = None
    totalLevelChanges: Optional[int] = None
    totalSprawls: Optional[int] = None
    recurringIssues: Optional[Dict[str, Any]] = None
    clipNumber: Optional[int] = None


class AnalyzeRequest(BaseModel):
    target_box: Optional[TargetBox] = None
    t_start: float = 0.0
    # Continuation mode fields (optional for backward compatibility)
    continuation: Optional[bool] = False
    clip_index: Optional[int] = None
    prior_context: Optional[PriorContext] = None


class AnalyzeWithAnchorsRequest(BaseModel):
    """Request body for anchor-based analysis"""
    anchors: list[Anchor]
    continuation: bool = False
    prior_context: Optional[dict] = None


@app.get("/")
def root():
    """Health check endpoint"""
    return {"status": "ok", "service": "wrestling-coach-api"}


def generate_anchor_timestamps(duration: float) -> list:
    """
    Generate anchor timestamps for a video based on duration.
    
    Rules:
    - ~15 anchors by default, up to 30 for videos >= 90s
    - spacing = duration / (N-1), clamped: min 1s, max 10s (max 30s for very long)
    - Always include t=0 and t=duration (or near end)
    
    Args:
        duration: Video duration in seconds
        
    Returns:
        List of anchor timestamps in seconds
    """
    if duration <= 0:
        return [0.0]
    
    # Determine number of anchors based on duration
    if duration >= 90:
        # For long clips, use up to 30 anchors
        target_anchors = min(30, max(15, int(duration / 3)))
    else:
        # Default ~15 anchors
        target_anchors = 15
    
    # Calculate spacing
    if target_anchors <= 1:
        return [0.0, duration] if duration > 0 else [0.0]
    
    spacing = duration / (target_anchors - 1)
    
    # Clamp spacing
    min_spacing = 1.0  # minimum 1 second
    max_spacing = 10.0  # maximum 10 seconds (30s allowed for very long videos)
    
    if duration > 300:  # > 5 minutes
        max_spacing = 30.0
    
    spacing = max(min_spacing, min(spacing, max_spacing))
    
    # Recalculate number of anchors based on clamped spacing
    num_anchors = max(2, int(duration / spacing) + 1)
    
    # Generate timestamps
    timestamps = []
    for i in range(num_anchors):
        t = i * spacing
        if t > duration:
            break
        timestamps.append(round(t, 2))
    
    # Ensure we include the end (or near end)
    if timestamps and timestamps[-1] < duration - 0.5:
        timestamps.append(round(duration, 2))
    elif not timestamps:
        timestamps = [0.0, round(duration, 2)] if duration > 0 else [0.0]
    
    # Ensure t=0 is first
    if timestamps[0] != 0.0:
        timestamps.insert(0, 0.0)
    
    return timestamps


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


@app.get("/api/anchors/{job_id}")
async def get_anchors(job_id: str):
    """
    Generate anchor timestamps for a video based on duration.
    
    Args:
        job_id: Job ID from /api/upload
    
    Returns:
        anchors: List of anchor timestamps in seconds
        count: Number of anchors
        duration: Video duration in seconds
    """
    # Validate job_id format
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")
    
    # Find uploaded file
    input_path = find_upload_file(job_id)
    
    # Get video metadata
    try:
        metadata = get_video_metadata(str(input_path))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    duration = metadata["duration_seconds"]
    
    # Generate anchor timestamps
    anchor_timestamps = generate_anchor_timestamps(duration)
    
    return {
        "anchors": anchor_timestamps,
        "count": len(anchor_timestamps),
        "duration": duration,
        "fps": metadata["fps"],
        "width": metadata["width"],
        "height": metadata["height"]
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
    
    # Parse prior_context if provided
    parsed_prior_context = None
    if request.prior_context:
        parsed_prior_context = {
            "lastTips": request.prior_context.lastTips,
            "lastEvents": request.prior_context.lastEvents,
            "lastMetrics": request.prior_context.lastMetrics,
            "coachSpeechSummary": request.prior_context.coachSpeechSummary,
            "totalShotAttempts": request.prior_context.totalShotAttempts or 0,
            "totalLevelChanges": request.prior_context.totalLevelChanges or 0,
            "totalSprawls": request.prior_context.totalSprawls or 0,
            "recurringIssues": request.prior_context.recurringIssues or {},
            "clipNumber": request.prior_context.clipNumber or 1
        }
    
    # Run pose analysis with target tracking
    try:
        result = analyze_video(
            str(input_path), 
            str(output_path), 
            target_box=parsed_target,
            t_start=t_start,
            continuation=request.continuation or False,
            clip_index=request.clip_index,
            prior_context=parsed_prior_context
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
        "annotated_video_url": f"/api/output/{job_id}",
        "match_context_out": result.get("match_context_out")  # For continuation tracking
    }
    
    # Convert all numpy types to native Python types for JSON serialization
    response_payload = convert_numpy_types(response_payload)
    
    # Return as JSONResponse to ensure proper serialization
    return JSONResponse(content=response_payload)


@app.post("/api/analyze-with-anchors/{job_id}")
async def analyze_with_anchors(job_id: str, request: AnalyzeWithAnchorsRequest):
    """
    Analyze an uploaded video using anchor-based tracking.
    
    This provides more robust tracking by using user-confirmed anchor points
    to reinitialize the tracker at key timestamps, preventing drift during
    overlaps or camera shake.
    
    Args:
        job_id: Job ID from /api/upload
        request: JSON body with:
            - anchors: Array of {t: float, box: {x,y,w,h} | null, skipped: bool}
            - continuation: Optional bool for continuing prior analysis
            - prior_context: Optional object with prior analysis context
    
    Returns:
        job_id: Same job ID
        pointers: List of coaching pointers (top 8-10)
        metrics: Aggregated metrics with percentages
        timeline: List of timestamped events
        events: Wrestling-specific events (shots, level changes, sprawls)
        tracking_diagnostics: {num_reacquires, num_segments_skipped, percent_frames_with_target}
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
    
    duration = metadata["duration_seconds"]
    
    # Validate anchors
    if not request.anchors:
        raise HTTPException(status_code=400, detail="At least one anchor is required")
    
    # Convert Pydantic models to dicts and validate
    anchors_list = []
    prev_t = -1.0
    for anchor in request.anchors:
        # Check sorted order
        if anchor.t <= prev_t:
            raise HTTPException(
                status_code=400, 
                detail=f"Anchors must be sorted by timestamp. Found {anchor.t} after {prev_t}"
            )
        
        # Check within bounds
        if anchor.t < 0 or anchor.t > duration + 0.5:
            raise HTTPException(
                status_code=400,
                detail=f"Anchor timestamp {anchor.t} is outside video duration [0, {duration}]"
            )
        
        prev_t = anchor.t
        
        anchor_dict = {
            "t": anchor.t,
            "box": None,
            "skipped": anchor.skipped
        }
        
        if anchor.box is not None:
            anchor_dict["box"] = {
                "x": anchor.box.x,
                "y": anchor.box.y,
                "w": anchor.box.w,
                "h": anchor.box.h
            }
        
        anchors_list.append(anchor_dict)
    
    # Run anchor-based analysis
    try:
        result = analyze_video_with_anchors(
            str(input_path),
            str(output_path),
            anchors=anchors_list
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
        "tracking_diagnostics": result.get("tracking_diagnostics", {}),
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
