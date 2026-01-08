# Wrestler AI 🥋

AI-powered wrestling technique analysis with target tracking and pose estimation.

## Features

- **Target Tracking**: Select and track a specific athlete throughout the video using CSRT tracker
- **Pose Analysis**: Real-time pose estimation using MediaPipe
- **Smart Detection**: YOLOv8-powered athlete detection
- **Coaching Tips**: AI-generated personalized coaching recommendations
- **Annotated Video**: Download your footage with AI overlays

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
- OpenAI GPT for coaching insights

## Usage

1. **Upload**: Drag and drop your wrestling footage (MP4, MOV, AVI, MKV, WebM)
2. **Select Target**: Scrub through the first 15 seconds and click on the athlete you want analyzed
3. **Analyze**: Watch the AI process your video through multiple analysis stages
4. **Review**: Get personalized coaching tips, timeline events, and download the annotated video

## API Endpoints

- `POST /api/upload` - Upload video file
- `GET /api/frame/{job_id}?t={timestamp}` - Get frame at timestamp
- `GET /api/boxes/{job_id}?t={timestamp}` - Get detected bounding boxes
- `POST /api/analyze/{job_id}` - Run full analysis with target selection

## License

MIT
