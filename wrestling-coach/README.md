# Wrestling Coach MVP

A local-first video analysis app that provides coaching pointers for wrestling technique using pose estimation.

## Features

- Upload video clips (mp4/mov) via drag-and-drop or file picker
- AI-powered pose analysis using MediaPipe
- Coaching pointers based on body positioning
- Annotated video output with pose overlay
- Metrics display (knee angle, stance width, hand position)

## Requirements

- **Python 3.9+** (tested with 3.10/3.11)
- **Node.js 18+** (with npm)
- Windows PC (also works on Mac/Linux)

## Project Structure

```
wrestling-coach/
├── README.md
├── .gitignore
├── frontend/          # React + Vite frontend
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── App.css
└── backend/           # FastAPI backend
    ├── requirements.txt
    ├── main.py
    ├── analysis/
    │   └── pose_analyze.py
    ├── uploads/       # (auto-created, gitignored)
    └── outputs/       # (auto-created, gitignored)
```

## Setup Instructions (Windows)

### 1. Backend Setup

Open a terminal (PowerShell or Command Prompt) and navigate to the backend folder:

```bash
cd wrestling-coach/backend
```

Create and activate a Python virtual environment:

```bash
# Create virtual environment
python -m venv .venv

# Activate (PowerShell)
.venv\Scripts\Activate.ps1

# OR Activate (Command Prompt)
.venv\Scripts\activate.bat

# OR Activate (Git Bash / Linux / Mac)
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

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
3. Click "Analyze" to process the video
4. View coaching pointers and metrics
5. Download the annotated video with pose overlay

## API Endpoints

- `POST /api/analyze` - Upload and analyze a video file
- `GET /api/output/{job_id}` - Download annotated video

## Notes

- The `uploads/` and `outputs/` folders are created automatically on first use
- These folders are gitignored to avoid committing video files
- Analysis is limited to the first 20 seconds of video for performance
- Supported formats: mp4, mov, avi, mkv, webm

## Troubleshooting

**MediaPipe installation issues on Windows:**
```bash
pip install --upgrade pip
pip install mediapipe
```

**OpenCV codec issues:**
- The app uses mp4v codec which should work on most systems
- If video output fails, ensure you have proper video codecs installed

**CORS errors:**
- Make sure the backend is running on port 8000
- Check that CORS is enabled in main.py
