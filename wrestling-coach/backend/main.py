"""
Wrestling Coach Backend API
FastAPI server for video analysis with pose estimation
"""

import os
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from analysis.pose_analyze import analyze_video

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


@app.get("/")
def root():
    """Health check endpoint"""
    return {"status": "ok", "service": "wrestling-coach-api"}


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Analyze uploaded video for wrestling pose feedback.
    
    Returns coaching pointers, metrics, and URL to download annotated video.
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
        # Write uploaded file to disk
        contents = await file.read()
        with open(input_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
    
    # Run pose analysis
    try:
        result = analyze_video(str(input_path), str(output_path))
    except ValueError as e:
        # Clean up input file on error
        if input_path.exists():
            input_path.unlink()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Clean up input file on error
        if input_path.exists():
            input_path.unlink()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    
    # Build response
    return {
        "job_id": job_id,
        "pointers": result["pointers"],
        "metrics": result["metrics"],
        "annotated_video_url": f"/api/output/{job_id}"
    }


@app.get("/api/output/{job_id}")
def get_output(job_id: str):
    """
    Download annotated video by job ID.
    """
    # Validate job_id format (basic UUID check)
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
