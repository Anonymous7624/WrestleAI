# Wrestler AI 🥋

AI-powered wrestling technique analysis with anchor-based target tracking and pose estimation.

## Features

- **Video Trimming**: Trim your clip to focus on active wrestling portions before analysis
- **Anchor-Based Tracking**: Lock onto yourself at multiple timestamps for robust tracking that survives overlaps and camera shake
- **65% Completion Requirement**: Must answer at least 65% of anchor points (including "I'm not in frame") before analysis
- **Skill Level Selection**: Choose Beginner/Intermediate/Advanced to calibrate rating expectations
- **Wrestler Rating (1-10)**: Get an overall performance rating based on your skill level and detected issues
- **Inactive Frame Filtering**: Automatically excludes standing/reset time from metrics
- **CSRT + Reacquisition**: Advanced tracking with automatic re-detection when target is lost
- **Pose Analysis**: Real-time pose estimation using MediaPipe
- **Smart Detection**: YOLOv8-powered athlete detection
- **Coaching Tips**: AI-generated personalized coaching recommendations (10+ tips covering stance, motion, entries, and defense)
- **Annotated Video**: Download your footage with AI overlays
- **Wrestling Event Detection**: Automatic detection of level changes, shot attempts, and sprawl defense
- **Session Stacking**: Keep all clip analyses stacked until you clear the session
- **Inline Upload**: Add more clips directly from the Results page without navigating away

## Quick Start

### Prerequisites

- Python 3.8+
- Node.js 18+
- pip
- ffmpeg

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
- FFmpeg for frame extraction

## Usage

1. **Upload**: Drag and drop your wrestling footage (MP4, MOV, AVI, MKV, WebM)
2. **Trim**: Remove non-wrestling portions (standing, walking, breaks) from the start and end of your clip
3. **Select Skill Level**: Choose Beginner, Intermediate, or Advanced
4. **Lock onto YOU**: Confirm which person is you at ~15 anchor timestamps throughout the video
   - Click on yourself in each frame
   - Use "Skip (I'm not in frame)" if you're not visible
   - Auto-detect button selects the largest/centered person
   - Must answer at least 65% of anchors to enable analysis
5. **Analyze**: Watch the AI process your video with anchor-based tracking
6. **Review**: Get your 1-10 rating, personalized coaching tips, timeline events, tracking diagnostics, and download the annotated video
7. **Continue**: Upload more clips using the inline uploader directly from Results

## Anchor-Based Tracking

The anchor system dramatically improves tracking accuracy:

- **~15 anchors** are generated for videos under 90 seconds (within trimmed duration)
- **Up to 30 anchors** for longer clips (≥90 seconds)
- **Spacing**: Automatically derived from duration (min 1s, max 10s)
- **Always includes** t=0 and end of trimmed duration
- **65% completion required**: Must answer (select or skip) at least 65% of anchors

When analyzing:
- Each segment between anchors uses its own tracker instance
- At anchor points with user-selected boxes, the tracker hard-resets to that position
- If tracking fails mid-segment, YOLO detection re-acquires the target
- Skipped anchors are handled gracefully (segment marked as "no target visible")

## Inactive Frame Filtering

Frames are automatically marked as "inactive" (not wrestling) when:
- Knee angles are very high (>165° = nearly straight legs)
- Hip height is close to shoulder height (upright posture)
- Minimal forward lean

Inactive frames are excluded from:
- Metric averages (knee angles, stance width, etc.)
- Event detection (shots, level changes, sprawls)
- Quality rating

The results include:
- `percent_active_frames`: Percentage of frames with active wrestling
- `percent_inactive_frames`: Percentage of frames marked as standing/reset
- Warning if active coverage is low

## Wrestler Rating

The 1-10 rating is computed based on:
- **Skill Level**: Beginner (lenient), Intermediate (standard), Advanced (strict)
- **Issue Severity**: High/Medium/Low severity issues weighted differently
- **Coverage Penalty**: Reduced rating if tracking coverage is low
- **Inactive Penalty**: Reduced rating if too much standing/inactive time

## API Endpoints

### Upload & Trimming
- `POST /api/upload` - Upload video file, returns job_id and metadata
- `POST /api/set-trim/{job_id}` - Set trim points for the video
  - Body: `{ trim_start: float, trim_end: float }`

### Frame Access
- `GET /api/frame/{job_id}?t={timestamp}&use_trim={bool}` - Get JPEG frame at timestamp
  - If `use_trim=true`, t is relative to trim_start
- `GET /api/boxes/{job_id}?t={timestamp}&use_trim={bool}` - Get detected bounding boxes at timestamp

### Anchor Generation
- `GET /api/anchors/{job_id}` - Get auto-generated anchor timestamps (within trimmed duration)
  - Returns: `{ anchors: [t1, t2, ...], count: N, duration, trim_start, trim_end, ... }`

### Analysis
- `POST /api/analyze/{job_id}` - Legacy single-point analysis
  - Body: `{ target_box: {x,y,w,h}, t_start: float }`

- `POST /api/analyze-with-anchors/{job_id}` - Anchor-based analysis (recommended)
  - Body: `{ anchors: [{t: float, box: {x,y,w,h}|null, skipped: bool}], skill_level: string, continuation: bool }`
  - Returns: pointers, metrics, timeline, events, tracking_diagnostics, rating, rating_explanation, percent_inactive_frames, percent_active_frames, activity_warning, annotated_video_url

### Output
- `GET /api/output/{job_id}` - Download annotated video

## Tracking Diagnostics

The anchor-based analysis returns tracking diagnostics:
- `num_reacquires`: How many times the tracker lost and re-found the target
- `num_segments_skipped`: Segments where no target was visible
- `percent_frames_with_target`: Percentage of frames with successful tracking

## License

MIT
