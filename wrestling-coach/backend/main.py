"""
Wrestling Coach Backend API
FastAPI server for video analysis with pose estimation and target tracking
"""

import os
import uuid
import json
import base64
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

import cv2

from analysis.pose_analyze import analyze_video, extract_first_frame
from analysis.detection import detect_persons, auto_select_target

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
PREVIEWS_DIR = BASE_DIR / "previews"
UPLOADS_DIR.mkdir(exist_ok=True)
OUTPUTS_DIR.mkdir(exist_ok=True)
PREVIEWS_DIR.mkdir(exist_ok=True)

# Supported video extensions
SUPPORTED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


@app.get("/")
def root():
    """Health check endpoint"""
    return {"status": "ok", "service": "wrestling-coach-api"}


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    """
    Upload a video file and get job_id + first frame with person detections.
    
    This is the first step in the analysis flow:
    1. User uploads video
    2. Backend extracts first frame, detects persons
    3. Returns job_id, preview image (base64), and bounding boxes
    4. User can then select target and call /api/analyze
    
    Returns:
        job_id: Unique identifier for this job
        preview_image: Base64-encoded JPEG of first frame
        detections: List of detected person bounding boxes
        auto_target: Auto-selected target if user skips selection
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
    
    # Extract first frame
    try:
        first_frame, width, height = extract_first_frame(str(input_path))
    except ValueError as e:
        # Clean up on error
        if input_path.exists():
            input_path.unlink()
        raise HTTPException(status_code=400, detail=str(e))
    
    # Detect persons in first frame
    try:
        detections = detect_persons(first_frame)
    except Exception as e:
        # Detection failure shouldn't block upload, just return empty
        detections = []
    
    # Auto-select target (for fallback)
    auto_target = auto_select_target(detections, width, height)
    
    # Draw bounding boxes on preview frame for visualization
    preview_frame = first_frame.copy()
    for i, det in enumerate(detections):
        x, y, w, h = det["x"], det["y"], det["w"], det["h"]
        color = (0, 255, 0) if auto_target and det["id"] == auto_target["id"] else (255, 165, 0)
        cv2.rectangle(preview_frame, (x, y), (x + w, y + h), color, 3)
        
        # Add ID label
        label = f"#{det['id']} ({det['score']:.0%})"
        label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
        cv2.rectangle(preview_frame, (x, y - 25), (x + label_size[0] + 5, y), color, -1)
        cv2.putText(preview_frame, label, (x + 2, y - 7), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    
    # Encode preview frame as base64 JPEG
    _, buffer = cv2.imencode('.jpg', preview_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    preview_base64 = base64.b64encode(buffer).decode('utf-8')
    
    # Also save preview to disk (for potential later use)
    preview_path = PREVIEWS_DIR / f"{job_id}_preview.jpg"
    cv2.imwrite(str(preview_path), preview_frame)
    
    return {
        "job_id": job_id,
        "filename": filename,
        "preview_image": f"data:image/jpeg;base64,{preview_base64}",
        "frame_width": width,
        "frame_height": height,
        "detections": detections,
        "auto_target": auto_target
    }


@app.post("/api/analyze")
async def analyze(
    job_id: str = Form(...),
    target_box: Optional[str] = Form(None)
):
    """
    Analyze an uploaded video with target tracking.
    
    Args:
        job_id: Job ID from /api/upload
        target_box: Optional JSON string with target bounding box {"x", "y", "w", "h"}
                   If not provided, auto-selection will be used.
    
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
    input_files = list(UPLOADS_DIR.glob(f"{job_id}_*"))
    if not input_files:
        raise HTTPException(status_code=404, detail="Upload not found. Please upload video first.")
    
    input_path = input_files[0]
    output_path = OUTPUTS_DIR / f"{job_id}_annotated.mp4"
    
    # Parse target_box if provided
    parsed_target = None
    if target_box:
        try:
            parsed_target = json.loads(target_box)
            # Validate required keys
            required_keys = {"x", "y", "w", "h"}
            if not all(k in parsed_target for k in required_keys):
                raise ValueError(f"target_box must contain keys: {required_keys}")
            # Convert to int
            parsed_target = {
                "x": int(parsed_target["x"]),
                "y": int(parsed_target["y"]),
                "w": int(parsed_target["w"]),
                "h": int(parsed_target["h"])
            }
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid target_box JSON format")
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid target_box: {str(e)}")
    
    # Run pose analysis with target tracking
    try:
        result = analyze_video(str(input_path), str(output_path), target_box=parsed_target)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    
    # Build response
    return {
        "job_id": job_id,
        "pointers": result["pointers"],
        "metrics": result["metrics"],
        "timeline": result.get("timeline", []),
        "annotated_video_url": f"/api/output/{job_id}"
    }


@app.post("/api/analyze-direct")
async def analyze_direct(
    file: UploadFile = File(...),
    target_box: Optional[str] = Form(None)
):
    """
    Direct upload + analyze in one step (for backwards compatibility).
    
    This combines upload and analyze into a single endpoint.
    If target_box is not provided, auto-selection will be used.
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
    output_path = OUTPUTS_DIR / f"{job_id}_annotated.mp4"
    
    try:
        contents = await file.read()
        with open(input_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
    
    # Parse target_box if provided
    parsed_target = None
    if target_box:
        try:
            parsed_target = json.loads(target_box)
            parsed_target = {
                "x": int(parsed_target["x"]),
                "y": int(parsed_target["y"]),
                "w": int(parsed_target["w"]),
                "h": int(parsed_target["h"])
            }
        except (json.JSONDecodeError, ValueError, TypeError):
            parsed_target = None  # Fall back to auto-selection
    
    # Run analysis
    try:
        result = analyze_video(str(input_path), str(output_path), target_box=parsed_target)
    except ValueError as e:
        if input_path.exists():
            input_path.unlink()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if input_path.exists():
            input_path.unlink()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    
    return {
        "job_id": job_id,
        "pointers": result["pointers"],
        "metrics": result["metrics"],
        "timeline": result.get("timeline", []),
        "annotated_video_url": f"/api/output/{job_id}"
    }


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


@app.get("/api/preview/{job_id}")
def get_preview(job_id: str):
    """
    Get the preview image for a job (first frame with bounding boxes).
    """
    # Validate job_id format
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")
    
    # Find preview file
    preview_path = PREVIEWS_DIR / f"{job_id}_preview.jpg"
    
    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="Preview not found")
    
    return FileResponse(
        path=str(preview_path),
        media_type="image/jpeg",
        filename=f"preview_{job_id}.jpg"
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
