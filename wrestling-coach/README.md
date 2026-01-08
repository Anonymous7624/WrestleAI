# Wrestling Coach MVP

A local-first video analysis app that provides coaching pointers for wrestling technique using pose estimation with **target tracking**.

## Features

- **Scrub-to-Select**: Scrub through the first 15 seconds to find a frame where you're clearly visible
- **Target Selection**: Click to select which person to analyze (handles multiple people in frame)
- **Target Tracking**: Uses CSRT tracker to follow the selected person through the video
- **Cropped Pose Analysis**: Runs MediaPipe Pose on the tracked target's ROI for accurate analysis
- **Auto-Selection Fallback**: If you skip selection, automatically picks the largest/most central person
- **Rich Feedback**: 8+ metrics analyzed with percentages, thresholds, and evidence
- **Timeline Events**: See exactly when technique issues occurred during the clip
- **Annotated Video**: Download video with pose landmarks drawn only on your target

## What's New (v2.1)

- **Timeline Scrubbing**: Slider to browse first 15 seconds and pick your start frame
- **Dynamic Frame Preview**: Frame and detection boxes update as you scrub
- **Start Time Selection**: Analysis begins from your chosen moment
- **PyTorch 2.5 Compatibility**: Pinned versions to avoid `weights_only` issues with ultralytics

## Requirements

- **Python 3.9+** (tested with 3.10/3.11)
- **Node.js 18+** (with npm)
- Windows/Mac/Linux

## Project Structure

```
wrestling-coach/
├── README.md
├── .gitignore
├── frontend/              # React + Vite frontend (port 5173)
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx        # Main app with timeline scrubbing UI
│       └── App.css
└── backend/               # FastAPI backend (port 8000)
    ├── requirements.txt   # Includes pinned torch==2.5.1
    ├── main.py            # API endpoints
    ├── analysis/
    │   ├── __init__.py
    │   ├── pose_analyze.py  # Pose analysis with t_start support
    │   ├── detection.py     # YOLOv8 person detection
    │   └── tracking.py      # CSRT target tracking
    ├── uploads/           # (auto-created, gitignored)
    └── outputs/           # (auto-created, gitignored)
```

## Setup Instructions

### 1. Backend Setup (Port 8000)

Open a terminal and navigate to the backend folder:

```bash
cd wrestling-coach/backend
```

Create and activate a Python virtual environment:

```bash
# Create virtual environment
python -m venv .venv

# Activate (PowerShell on Windows)
.venv\Scripts\Activate.ps1

# OR Activate (Command Prompt on Windows)
.venv\Scripts\activate.bat

# OR Activate (Git Bash / Linux / Mac)
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

**Note on PyTorch**: The requirements pin `torch==2.5.1` to avoid the `weights_only=True` default in PyTorch 2.6+ which causes issues with ultralytics model loading.

**Note on Ultralytics/YOLOv8**: The first run will automatically download the YOLOv8n model (~6MB). This requires internet access once, then the model is cached locally.

Run the backend server:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at: **http://localhost:8000**

### 2. Frontend Setup (Port 5173)

Open a **new terminal** and navigate to the frontend folder:

```bash
cd wrestling-coach/frontend
```

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

The frontend will be available at: **http://localhost:5173**

## Usage

1. Open http://localhost:5173 in your browser
2. Drag and drop a video file (or click to select)
3. Click **"Upload Video"**
4. **NEW**: Use the timeline slider to scrub through the first 15 seconds
5. Find a frame where you're clearly visible and click on your bounding box
6. Click **"Analyze from X:XX"** to start analysis from that moment
7. View detailed coaching pointers, timeline events, and metrics
8. Download the annotated video with pose overlay

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | POST | Upload video, get job_id + video metadata |
| `/api/frame/{job_id}?t=<sec>` | GET | Get JPEG frame at timestamp |
| `/api/boxes/{job_id}?t=<sec>` | GET | Get person detection boxes at timestamp |
| `/api/analyze/{job_id}` | POST | Analyze video with target and start time |
| `/api/output/{job_id}` | GET | Download annotated video |

### POST /api/upload

Upload a video file.

**Request**: `multipart/form-data` with `file` field

**Response**:
```json
{
  "job_id": "uuid-string",
  "filename": "video.mp4",
  "duration_seconds": 45.5,
  "fps": 30.0,
  "width": 1920,
  "height": 1080
}
```

### GET /api/frame/{job_id}?t=<seconds>

Get a JPEG frame at the specified timestamp.

**Parameters**:
- `t`: Timestamp in seconds (clamped to [0, min(15, duration)])

**Response**: JPEG image

### GET /api/boxes/{job_id}?t=<seconds>

Get person detection boxes at the specified timestamp.

**Parameters**:
- `t`: Timestamp in seconds (clamped to [0, min(15, duration)])

**Response**:
```json
{
  "boxes": [
    {"id": 0, "x": 100, "y": 50, "w": 200, "h": 400, "score": 0.95},
    {"id": 1, "x": 600, "y": 60, "w": 180, "h": 380, "score": 0.88}
  ],
  "auto_target": {"id": 0, "x": 100, "y": 50, "w": 200, "h": 400, "score": 0.95},
  "frame_width": 1920,
  "frame_height": 1080,
  "timestamp": 2.5
}
```

### POST /api/analyze/{job_id}

Analyze the uploaded video with target tracking.

**Request Body** (JSON):
```json
{
  "target_box": {"x": 100, "y": 50, "w": 200, "h": 400},
  "t_start": 2.5
}
```

- `target_box`: Bounding box to track, or `null` for auto-selection
- `t_start`: Start timestamp in seconds (default 0)

**Response**:
```json
{
  "job_id": "uuid-string",
  "pointers": [
    {
      "title": "Get Lower",
      "why": "Your average knee angle is 152°...",
      "fix": "Bend your knees more...",
      "evidence": "Avg: 152°, Worst: 168°, Bad frames: 45%",
      "when": "Occurred at: 2.3s, 5.1s, 8.7s"
    }
  ],
  "metrics": {
    "knee_angle": {"avg": 152, "min": 130, "max": 168, "pct_above_threshold": 45},
    "stance_width": {...},
    "hands_drop": {...},
    "back_lean_angle": {...},
    "hip_height_ratio": {...},
    "elbow_flare": {...},
    "head_position": {...},
    "motion_stability": {"knee_variance": 45.2, "stance_variance": 0.002},
    "frames_analyzed": 450
  },
  "timeline": [
    {"timestamp": 2.3, "duration": 1.5, "metric": "knee_angle", "message": "Standing too upright (avg 158°)"}
  ],
  "annotated_video_url": "/api/output/uuid-string"
}
```

## Configuration

Backend settings in `analysis/pose_analyze.py`:

| Setting | Default | Description |
|---------|---------|-------------|
| `MAX_SECONDS` | 20 | Maximum video duration to analyze from start time |
| `KNEE_ANGLE_THRESHOLD` | 145° | Angle above which knees are "too straight" |
| `STANCE_WIDTH_THRESHOLD` | 0.18 | Normalized width below which stance is "narrow" |
| `HANDS_DROP_THRESHOLD` | 0.10 | Drop amount above which hands are "too low" |

## Troubleshooting

### PyTorch / Ultralytics "DetectionModel not allowed" Error

This error occurs with PyTorch 2.6+ due to the new `weights_only=True` default. The requirements.txt pins `torch==2.5.1` to avoid this. If you still see the error:

```bash
pip uninstall torch torchvision
pip install torch==2.5.1 torchvision==0.20.1
```

### Ultralytics/YOLOv8 Issues

```bash
pip install --upgrade ultralytics
```

If you get model download errors, check your internet connection. The model is cached after first download in `~/.cache/ultralytics/`.

### MediaPipe Installation Issues (Windows)

```bash
pip install --upgrade pip
pip install mediapipe
```

### OpenCV CSRT Tracker Not Found

Make sure you have `opencv-contrib-python` installed:

```bash
pip install opencv-contrib-python==4.9.0.80
```

### CORS Errors

Make sure the backend is running on port 8000 and the frontend on port 5173.

### Video Analysis Hangs

- Check that the video has at least one visible person
- Try a shorter video clip (under 20 seconds)
- Ensure you have sufficient RAM (at least 4GB free)

### No Persons Detected

- Try scrubbing to a different timestamp
- Ensure good lighting in the video
- Make sure the person is clearly visible (not too far from camera)

## How It Works

1. **Upload**: Video is uploaded and saved with a unique job ID; metadata extracted via cv2
2. **Scrubbing**: User scrubs timeline slider; frontend fetches frames and boxes dynamically
3. **Detection**: YOLOv8n runs on the requested frame to detect all persons (class=person only)
4. **Selection**: User clicks on their bounding box and chooses start time
5. **Tracking**: CSRT tracker initialized on the frame at t_start, follows target through subsequent frames
6. **Re-acquisition**: If tracker fails, system re-detects persons and matches by IOU
7. **Cropped Pose**: For each frame, the target's ROI is cropped and expanded 20%, then MediaPipe Pose runs on the crop
8. **Mapping**: Landmarks are mapped back to full-frame coordinates for drawing
9. **Analysis**: 8 metrics are computed per frame, then aggregated
10. **Timeline**: Events where metrics exceed thresholds for >0.5s are recorded
11. **Feedback**: Top 8 issues are ranked by impact score and returned with evidence

## Tech Stack

- **Frontend**: React 18 + Vite (port 5173)
- **Backend**: FastAPI + Uvicorn (port 8000)
- **Person Detection**: Ultralytics YOLOv8n (cached locally)
- **Tracking**: OpenCV CSRT Tracker
- **Pose Estimation**: MediaPipe Pose
- **Video Processing**: OpenCV

## Ports

| Service | Port |
|---------|------|
| Frontend (Vite) | 5173 |
| Backend (FastAPI) | 8000 |
