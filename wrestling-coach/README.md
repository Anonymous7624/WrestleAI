# Wrestler AI 🥋

AI-powered wrestling technique analysis with anchor-based target tracking and pose estimation.

## Features

- **Anchor-Based Tracking**: Lock onto yourself at multiple timestamps for robust tracking that survives overlaps and camera shake
- **CSRT + Reacquisition**: Advanced tracking with automatic re-detection when target is lost
- **Pose Analysis**: Real-time pose estimation using MediaPipe
- **Smart Detection**: YOLOv8-powered athlete detection
- **Coaching Tips**: AI-generated personalized coaching recommendations (10+ tips covering stance, motion, entries, and defense)
- **Annotated Video**: Download your footage with AI overlays
- **Wrestling Event Detection**: Automatic detection of level changes, shot attempts, and sprawl defense

## Quick Start

### Prerequisites

- Python 3.8+
- Node.js 18+
- pip

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
python main.py
```

The backend will start at `http://localhost:8000`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will start at `http://localhost:5173`

### Production Build

```bash
cd frontend
npm run build
npm run preview
```

## Tech Stack

### Frontend
- React 18 with Vite
- Tailwind CSS for styling
- Framer Motion for animations
- Lucide React for icons

### Backend
- FastAPI
- OpenCV + CSRT Tracker
- MediaPipe for pose estimation
- YOLOv8 for detection

## Usage

1. **Upload**: Drag and drop your wrestling footage (MP4, MOV, AVI, MKV, WebM)
2. **Lock onto YOU**: Confirm which person is you at ~15 anchor timestamps throughout the video
   - Click on yourself in each frame
   - Use "Skip" if you're not in that particular frame
   - Auto-detect button selects the largest/centered person
3. **Analyze**: Watch the AI process your video with anchor-based tracking
4. **Review**: Get personalized coaching tips, timeline events, tracking diagnostics, and download the annotated video

## Anchor-Based Tracking

The anchor system dramatically improves tracking accuracy:

- **~15 anchors** are generated for videos under 90 seconds
- **Up to 30 anchors** for longer clips (≥90 seconds)
- **Spacing**: Automatically derived from duration (min 1s, max 10s)
- **Always includes** t=0 and end of video

When analyzing:
- Each segment between anchors uses its own tracker instance
- At anchor points with user-selected boxes, the tracker hard-resets to that position
- If tracking fails mid-segment, YOLO detection re-acquires the target
- Skipped anchors are handled gracefully (segment marked as "no target visible")

## API Endpoints

### Upload & Frame Access
- `POST /api/upload` - Upload video file, returns job_id and metadata
- `GET /api/frame/{job_id}?t={timestamp}` - Get JPEG frame at timestamp
- `GET /api/boxes/{job_id}?t={timestamp}` - Get detected bounding boxes at timestamp

### Anchor Generation
- `GET /api/anchors/{job_id}` - Get auto-generated anchor timestamps
  - Returns: `{ anchors: [t1, t2, ...], count: N, duration, fps, width, height }`

### Analysis
- `POST /api/analyze/{job_id}` - Legacy single-point analysis
  - Body: `{ target_box: {x,y,w,h}, t_start: float }`

- `POST /api/analyze-with-anchors/{job_id}` - Anchor-based analysis (recommended)
  - Body: `{ anchors: [{t: float, box: {x,y,w,h}|null, skipped: bool}], continuation: bool }`
  - Returns: pointers, metrics, timeline, events, tracking_diagnostics, annotated_video_url

### Output
- `GET /api/output/{job_id}` - Download annotated video

## Tracking Diagnostics

The anchor-based analysis returns tracking diagnostics:
- `num_reacquires`: How many times the tracker lost and re-found the target
- `num_segments_skipped`: Segments where no target was visible
- `percent_frames_with_target`: Percentage of frames with successful tracking

## License

MIT
