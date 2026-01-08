# Wrestling Coach MVP

A local-first video analysis app that provides coaching pointers for wrestling technique using pose estimation with **target tracking**.

## Features

- **Target Selection**: After upload, see first frame with detected persons and click to select who to analyze
- **Target Tracking**: Uses CSRT tracker to follow the selected person through the video (no more tracking the ref!)
- **Cropped Pose Analysis**: Runs MediaPipe Pose on the tracked target's ROI for accurate analysis
- **Auto-Selection Fallback**: If you skip selection, automatically picks the largest/most central person
- **Rich Feedback**: 8+ metrics analyzed with percentages, thresholds, and evidence
- **Timeline Events**: See exactly when technique issues occurred during the clip
- **Annotated Video**: Download video with pose landmarks drawn only on your target

## What's New (v2.0)

- **YOLOv8 Person Detection**: Accurate bounding boxes for person identification
- **CSRT Tracking**: Robust tracking that handles movement and brief occlusions
- **8 Metric Categories**: Knee angle, stance width, hand position, back lean, hip height, elbow flare, head position, motion stability
- **Timeline Analysis**: Timestamps when issues persist for >0.5 seconds
- **Evidence-Based Pointers**: Each coaching note includes specific numbers and percentages

## Requirements

- **Python 3.9+** (tested with 3.10/3.11)
- **Node.js 18+** (with npm)
- Windows/Mac/Linux

## Project Structure

```
wrestling-coach/
├── README.md
├── .gitignore
├── frontend/              # React + Vite frontend
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx        # Main app with target selection UI
│       └── App.css
└── backend/               # FastAPI backend
    ├── requirements.txt
    ├── main.py            # API endpoints
    ├── analysis/
    │   ├── __init__.py
    │   ├── pose_analyze.py  # Pose analysis with cropped ROI
    │   ├── detection.py     # YOLOv8 person detection
    │   └── tracking.py      # CSRT target tracking
    ├── uploads/           # (auto-created, gitignored)
    ├── outputs/           # (auto-created, gitignored)
    └── previews/          # (auto-created, gitignored)
```

## Setup Instructions

### 1. Backend Setup

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

**Note on Ultralytics/YOLOv8**: The first run will automatically download the YOLOv8n model (~6MB). This requires internet access once.

Run the backend server:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at: **http://localhost:8000**

### 2. Frontend Setup

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
3. Click **"Upload & Detect Persons"**
4. **NEW**: See the first frame with bounding boxes around detected persons
5. Click on the person you want to analyze (or use "Auto Selection")
6. Click **"Analyze Selected Target"**
7. View detailed coaching pointers, timeline events, and metrics
8. Download the annotated video with pose overlay

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | POST | Upload video, get first frame with person detections |
| `/api/analyze` | POST | Analyze uploaded video with target selection |
| `/api/analyze-direct` | POST | One-step upload + analyze (backwards compatible) |
| `/api/output/{job_id}` | GET | Download annotated video |
| `/api/preview/{job_id}` | GET | Get preview image with bounding boxes |

### Upload Response Example

```json
{
  "job_id": "uuid-string",
  "preview_image": "data:image/jpeg;base64,...",
  "frame_width": 1920,
  "frame_height": 1080,
  "detections": [
    {"id": 0, "x": 100, "y": 50, "w": 200, "h": 400, "score": 0.95},
    {"id": 1, "x": 600, "y": 60, "w": 180, "h": 380, "score": 0.88}
  ],
  "auto_target": {"id": 0, "x": 100, "y": 50, "w": 200, "h": 400, "score": 0.95}
}
```

### Analyze Response Example

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
    {"timestamp": 2.3, "duration": 1.5, "metric": "knee_angle", "message": "Standing too upright (avg 158°)"},
    {"timestamp": 5.1, "duration": 0.8, "metric": "hands_drop", "message": "Hands dropping (0.15)"}
  ],
  "annotated_video_url": "/api/output/uuid-string"
}
```

## Configuration

Backend settings in `analysis/pose_analyze.py`:

| Setting | Default | Description |
|---------|---------|-------------|
| `MAX_SECONDS` | 20 | Maximum video duration to analyze |
| `KNEE_ANGLE_THRESHOLD` | 145° | Angle above which knees are "too straight" |
| `STANCE_WIDTH_THRESHOLD` | 0.18 | Normalized width below which stance is "narrow" |
| `HANDS_DROP_THRESHOLD` | 0.10 | Drop amount above which hands are "too low" |

## Troubleshooting

### Ultralytics/YOLOv8 Issues

```bash
pip install --upgrade ultralytics
```

If you get model download errors, check your internet connection. The model is cached after first download.

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

## How It Works

1. **Upload**: Video is uploaded and saved with a unique job ID
2. **Detection**: YOLOv8n runs on the first frame to detect all persons
3. **Selection**: User clicks on their bounding box (or system auto-selects)
4. **Tracking**: CSRT tracker follows the target through all frames
5. **Cropped Pose**: For each frame, the target's ROI is cropped and expanded 20%, then MediaPipe Pose runs on the crop
6. **Mapping**: Landmarks are mapped back to full-frame coordinates for drawing
7. **Analysis**: 8 metrics are computed per frame, then aggregated
8. **Timeline**: Events where metrics exceed thresholds for >0.5s are recorded
9. **Feedback**: Top 8 issues are ranked by impact score and returned with evidence

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: FastAPI + Uvicorn
- **Person Detection**: Ultralytics YOLOv8n
- **Tracking**: OpenCV CSRT Tracker
- **Pose Estimation**: MediaPipe Pose
- **Video Processing**: OpenCV
