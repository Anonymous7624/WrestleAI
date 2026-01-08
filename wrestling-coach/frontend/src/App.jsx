import { useState, useRef, useEffect, useCallback } from 'react'

// Backend API base URL - change this if deploying elsewhere
const API_BASE = 'http://localhost:8000'

// Application states
const STATES = {
  UPLOAD: 'upload',
  TARGET_SELECT: 'target_select',
  ANALYZING: 'analyzing',
  RESULTS: 'results'
}

function App() {
  const [appState, setAppState] = useState(STATES.UPLOAD)
  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)
  
  // Upload metadata state
  const [uploadData, setUploadData] = useState(null)
  
  // Target selection state
  const [currentTime, setCurrentTime] = useState(0)
  const [maxTime, setMaxTime] = useState(15)
  const [frameUrl, setFrameUrl] = useState(null)
  const [boxes, setBoxes] = useState([])
  const [frameWidth, setFrameWidth] = useState(0)
  const [frameHeight, setFrameHeight] = useState(0)
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [autoTarget, setAutoTarget] = useState(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [loadingFrame, setLoadingFrame] = useState(false)
  
  const fileInputRef = useRef(null)
  const previewImageRef = useRef(null)
  const sliderDebounceRef = useRef(null)

  // Handle file selection
  const handleFileSelect = (selectedFile) => {
    if (selectedFile) {
      const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm']
      const ext = selectedFile.name.split('.').pop().toLowerCase()
      const validExts = ['mp4', 'mov', 'avi', 'mkv', 'webm']
      
      if (!validTypes.includes(selectedFile.type) && !validExts.includes(ext)) {
        setError('Please select a valid video file (mp4, mov, avi, mkv, webm)')
        return
      }
      
      setFile(selectedFile)
      setError(null)
      setResults(null)
      setUploadData(null)
      setSelectedTarget(null)
      setCurrentTime(0)
    }
  }

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    handleFileSelect(droppedFile)
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleInputChange = (e) => {
    handleFileSelect(e.target.files[0])
  }

  // Fetch frame and boxes for current time
  const fetchFrameAndBoxes = useCallback(async (jobId, t) => {
    setLoadingFrame(true)
    try {
      // Fetch frame image
      const frameResponse = await fetch(`${API_BASE}/api/frame/${jobId}?t=${t}`)
      if (frameResponse.ok) {
        const blob = await frameResponse.blob()
        const url = URL.createObjectURL(blob)
        // Revoke previous URL to avoid memory leaks
        if (frameUrl) {
          URL.revokeObjectURL(frameUrl)
        }
        setFrameUrl(url)
      }
      
      // Fetch boxes
      const boxesResponse = await fetch(`${API_BASE}/api/boxes/${jobId}?t=${t}`)
      if (boxesResponse.ok) {
        const data = await boxesResponse.json()
        setBoxes(data.boxes || [])
        setAutoTarget(data.auto_target)
        setFrameWidth(data.frame_width)
        setFrameHeight(data.frame_height)
        
        // If no target selected yet, pre-select auto target
        if (!selectedTarget && data.auto_target) {
          setSelectedTarget(data.auto_target)
        }
      }
    } catch (err) {
      console.error('Failed to fetch frame/boxes:', err)
    } finally {
      setLoadingFrame(false)
    }
  }, [frameUrl, selectedTarget])

  // Upload video and get metadata
  const handleUpload = async () => {
    if (!file) return

    setError(null)
    setAppState(STATES.ANALYZING)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `Upload failed (${response.status})`)
      }

      const data = await response.json()
      setUploadData(data)
      
      // Calculate max scrub time (min of 15 seconds or video duration)
      const maxT = Math.min(15, data.duration_seconds)
      setMaxTime(maxT)
      setCurrentTime(0)
      
      // Fetch initial frame and boxes
      await fetchFrameAndBoxes(data.job_id, 0)
      
      setAppState(STATES.TARGET_SELECT)
    } catch (err) {
      setError(err.message || 'Failed to upload video. Is the backend running?')
      setAppState(STATES.UPLOAD)
    }
  }

  // Handle slider change with debouncing
  const handleSliderChange = (e) => {
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    
    // Clear previous debounce
    if (sliderDebounceRef.current) {
      clearTimeout(sliderDebounceRef.current)
    }
    
    // Debounce the fetch to avoid too many requests while sliding
    sliderDebounceRef.current = setTimeout(() => {
      if (uploadData) {
        // Clear current selection when time changes
        setSelectedTarget(null)
        fetchFrameAndBoxes(uploadData.job_id, newTime)
      }
    }, 150)
  }

  // Run analysis with selected target
  const runAnalysis = async (targetBox, tStart) => {
    if (!uploadData) return
    
    setAppState(STATES.ANALYZING)
    setError(null)

    try {
      const response = await fetch(`${API_BASE}/api/analyze/${uploadData.job_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_box: targetBox,
          t_start: tStart
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `Analysis failed (${response.status})`)
      }

      const data = await response.json()
      setResults(data)
      setAppState(STATES.RESULTS)
    } catch (err) {
      setError(err.message || 'Failed to analyze video.')
      setAppState(STATES.TARGET_SELECT)
    }
  }

  // Handle target box click
  const handleBoxClick = (detection) => {
    setSelectedTarget(detection)
  }

  // Calculate scaled coordinates for drawing boxes on the displayed image
  const getScaledBox = (box) => {
    if (!frameWidth || !imageSize.width) return null
    
    const scaleX = imageSize.width / frameWidth
    const scaleY = imageSize.height / frameHeight
    
    return {
      x: box.x * scaleX,
      y: box.y * scaleY,
      w: box.w * scaleX,
      h: box.h * scaleY
    }
  }

  // Handle image load to get actual displayed dimensions
  const handleImageLoad = useCallback(() => {
    if (previewImageRef.current) {
      setImageSize({
        width: previewImageRef.current.clientWidth,
        height: previewImageRef.current.clientHeight
      })
    }
  }, [])

  // Proceed with analysis using selected target
  const handleAnalyzeSelected = () => {
    if (selectedTarget) {
      runAnalysis(
        { x: selectedTarget.x, y: selectedTarget.y, w: selectedTarget.w, h: selectedTarget.h },
        currentTime
      )
    }
  }

  // Auto-select (null target_box lets backend decide)
  const handleAutoSelect = () => {
    runAnalysis(null, currentTime)
  }

  // Download annotated video
  const handleDownload = () => {
    if (results?.annotated_video_url) {
      window.open(`${API_BASE}${results.annotated_video_url}`, '_blank')
    }
  }

  // Clear / reset
  const handleClear = () => {
    setFile(null)
    setResults(null)
    setError(null)
    setUploadData(null)
    setSelectedTarget(null)
    setAutoTarget(null)
    setBoxes([])
    setCurrentTime(0)
    setAppState(STATES.UPLOAD)
    if (frameUrl) {
      URL.revokeObjectURL(frameUrl)
      setFrameUrl(null)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Format timestamp for display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`
  }

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (frameUrl) {
        URL.revokeObjectURL(frameUrl)
      }
      if (sliderDebounceRef.current) {
        clearTimeout(sliderDebounceRef.current)
      }
    }
  }, [])

  return (
    <div className="app">
      <header className="header">
        <h1>🤼 Wrestling Coach</h1>
        <p className="subtitle">AI-powered technique analysis with target tracking</p>
      </header>

      <main className="main">
        {/* Upload Section */}
        {appState === STATES.UPLOAD && (
          <section className="upload-section">
            <div
              className={`drop-zone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleClick}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
                onChange={handleInputChange}
                hidden
              />
              {file ? (
                <div className="file-info">
                  <span className="file-icon">🎬</span>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                </div>
              ) : (
                <div className="drop-prompt">
                  <span className="drop-icon">📁</span>
                  <p>Drag & drop a video here</p>
                  <p className="drop-or">or click to select</p>
                  <p className="drop-hint">Supports: mp4, mov, avi, mkv, webm</p>
                </div>
              )}
            </div>

            <div className="button-row">
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={!file}
              >
                Upload Video
              </button>
              {file && (
                <button className="btn btn-secondary" onClick={handleClear}>
                  Clear
                </button>
              )}
            </div>
          </section>
        )}

        {/* Target Selection Section */}
        {appState === STATES.TARGET_SELECT && uploadData && (
          <section className="target-section">
            <h2>Select Your Target</h2>
            <p className="target-instructions">
              Use the slider to scrub through the first {maxTime.toFixed(1)} seconds. 
              Click on the person you want to analyze.
            </p>
            
            {/* Timeline Slider */}
            <div className="timeline-slider-container">
              <div className="slider-labels">
                <span>0:00</span>
                <span className="current-time">{formatTime(currentTime)}</span>
                <span>{formatTime(maxTime)}</span>
              </div>
              <input
                type="range"
                className="timeline-slider"
                min="0"
                max={maxTime}
                step="0.1"
                value={currentTime}
                onChange={handleSliderChange}
              />
              <p className="slider-hint">
                Drag the slider to find a frame where you're clearly visible
              </p>
            </div>
            
            {/* Frame Preview with Boxes */}
            <div className="preview-container">
              {loadingFrame && (
                <div className="frame-loading">
                  <div className="mini-spinner"></div>
                </div>
              )}
              {frameUrl && (
                <>
                  <img 
                    ref={previewImageRef}
                    src={frameUrl} 
                    alt="Video frame preview"
                    className="preview-image"
                    onLoad={handleImageLoad}
                  />
                  
                  {/* Clickable detection boxes overlay */}
                  <div className="detection-overlay">
                    {boxes.map((det) => {
                      const scaled = getScaledBox(det)
                      if (!scaled) return null
                      
                      const isSelected = selectedTarget && selectedTarget.id === det.id
                      const isAuto = autoTarget && autoTarget.id === det.id
                      
                      return (
                        <div
                          key={det.id}
                          className={`detection-box ${isSelected ? 'selected' : ''} ${isAuto && !selectedTarget ? 'auto' : ''}`}
                          style={{
                            left: `${scaled.x}px`,
                            top: `${scaled.y}px`,
                            width: `${scaled.w}px`,
                            height: `${scaled.h}px`,
                          }}
                          onClick={() => handleBoxClick(det)}
                        >
                          <span className="detection-label">
                            #{det.id} {isAuto ? '(suggested)' : ''} {det.score ? `${Math.round(det.score * 100)}%` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
              
              {!frameUrl && !loadingFrame && (
                <div className="no-frame">
                  <p>Loading frame...</p>
                </div>
              )}
            </div>

            {/* Selection Info */}
            <div className="target-info">
              {boxes.length === 0 ? (
                <p className="no-detection">No persons detected at this timestamp. Try a different moment.</p>
              ) : selectedTarget ? (
                <p>Selected: <strong>Person #{selectedTarget.id}</strong> at {formatTime(currentTime)}</p>
              ) : (
                <p>Click on a bounding box to select your target ({boxes.length} person{boxes.length !== 1 ? 's' : ''} detected)</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="button-row">
              <button
                className="btn btn-primary"
                onClick={handleAnalyzeSelected}
                disabled={!selectedTarget}
              >
                Analyze from {formatTime(currentTime)}
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={handleAutoSelect}
                disabled={boxes.length === 0}
              >
                Auto Select & Analyze
              </button>
              <button className="btn btn-secondary" onClick={handleClear}>
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* Error Display */}
        {error && (
          <div className="error-box">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Analyzing State */}
        {appState === STATES.ANALYZING && (
          <div className="analyzing-box">
            <div className="spinner"></div>
            <p>Analyzing video with target tracking…</p>
            <p className="analyzing-detail">This may take a moment depending on video length.</p>
          </div>
        )}

        {/* Results Section */}
        {appState === STATES.RESULTS && results && (
          <section className="results-section">
            <h2>Analysis Results</h2>

            {/* Coach's Speech - NEW SECTION */}
            {results.coach_speech && (
              <div className="coach-speech-card">
                <h3>🎙️ Coach's Speech</h3>
                <div className="coach-speech-content">
                  <p>{results.coach_speech}</p>
                </div>
              </div>
            )}

            {/* Top Notes / Pointers */}
            <div className="pointers-card">
              <h3>📋 Top Coaching Notes ({results.pointers.length})</h3>
              <ul className="pointers-list">
                {results.pointers.map((pointer, idx) => (
                  <li key={idx} className="pointer-item">
                    <div className="pointer-header">
                      <span className="pointer-number">{idx + 1}</span>
                      <span className="pointer-title">{pointer.title}</span>
                    </div>
                    <div className="pointer-why"><strong>Why:</strong> {pointer.why}</div>
                    <div className="pointer-fix"><strong>Fix:</strong> {pointer.fix}</div>
                    {pointer.evidence && (
                      <div className="pointer-evidence"><strong>Evidence:</strong> {pointer.evidence}</div>
                    )}
                    {pointer.when && pointer.when !== 'N/A' && (
                      <div className="pointer-when"><strong>When:</strong> {pointer.when}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Wrestling Events Section */}
            {results.events && results.events.length > 0 && (
              <div className="events-card">
                <h3>🤼 Detected Wrestling Events</h3>
                <div className="events-list">
                  {results.events.map((event, idx) => (
                    <div key={idx} className={`event-item event-${event.type.toLowerCase()}`}>
                      <div className="event-header">
                        <span className="event-type">{event.type.replace(/_/g, ' ')}</span>
                        <span className="event-confidence">{Math.round(event.confidence * 100)}% confidence</span>
                      </div>
                      <div className="event-time">
                        {formatTime(event.t_start)} - {formatTime(event.t_end)}
                      </div>
                      <div className="event-description">{event.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline Events */}
            {results.timeline && results.timeline.length > 0 && (
              <div className="timeline-card">
                <h3>⏱️ Timeline Events</h3>
                <div className="timeline-list">
                  {results.timeline.map((event, idx) => (
                    <div key={idx} className="timeline-item">
                      <div className="timeline-time">
                        {formatTime(event.timestamp)}
                        <span className="timeline-duration">({event.duration.toFixed(1)}s)</span>
                      </div>
                      <div className="timeline-message">{event.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metrics Summary */}
            <div className="metrics-card">
              <h3>📊 Detailed Metrics</h3>
              <div className="metrics-grid">
                {results.metrics.knee_angle && (
                  <div className="metric-item">
                    <div className="metric-label">Knee Angle</div>
                    <div className="metric-value">{results.metrics.knee_angle.avg}°</div>
                    <div className="metric-detail">
                      Range: {results.metrics.knee_angle.min}° - {results.metrics.knee_angle.max}°
                    </div>
                    <div className={`metric-pct ${results.metrics.knee_angle.pct_above_threshold > 30 ? 'bad' : 'good'}`}>
                      {results.metrics.knee_angle.pct_above_threshold}% above threshold
                    </div>
                  </div>
                )}
                
                {results.metrics.stance_width && (
                  <div className="metric-item">
                    <div className="metric-label">Stance Width</div>
                    <div className="metric-value">{results.metrics.stance_width.avg}</div>
                    <div className="metric-detail">
                      Range: {results.metrics.stance_width.min} - {results.metrics.stance_width.max}
                    </div>
                    <div className={`metric-pct ${results.metrics.stance_width.pct_below_threshold > 30 ? 'bad' : 'good'}`}>
                      {results.metrics.stance_width.pct_below_threshold}% below threshold
                    </div>
                  </div>
                )}
                
                {results.metrics.hands_drop && (
                  <div className="metric-item">
                    <div className="metric-label">Hand Position</div>
                    <div className="metric-value">{results.metrics.hands_drop.avg}</div>
                    <div className="metric-detail">
                      Worst: {results.metrics.hands_drop.max}
                    </div>
                    <div className={`metric-pct ${results.metrics.hands_drop.pct_above_threshold > 30 ? 'bad' : 'good'}`}>
                      {results.metrics.hands_drop.pct_above_threshold}% dropped
                    </div>
                  </div>
                )}
                
                {results.metrics.back_lean_angle && (
                  <div className="metric-item">
                    <div className="metric-label">Back Lean</div>
                    <div className="metric-value">{results.metrics.back_lean_angle.avg}°</div>
                    <div className="metric-detail">
                      Worst: {results.metrics.back_lean_angle.max}°
                    </div>
                    <div className={`metric-pct ${results.metrics.back_lean_angle.pct_excessive > 30 ? 'bad' : 'good'}`}>
                      {results.metrics.back_lean_angle.pct_excessive}% excessive
                    </div>
                  </div>
                )}

                {results.metrics.motion_stability && (
                  <div className="metric-item">
                    <div className="metric-label">Stability</div>
                    <div className="metric-value">
                      {results.metrics.motion_stability.knee_variance < 100 ? 'Good' : 'Unstable'}
                    </div>
                    <div className="metric-detail">
                      Knee var: {results.metrics.motion_stability.knee_variance}
                    </div>
                    <div className="metric-detail">
                      Stance var: {results.metrics.motion_stability.stance_variance}
                    </div>
                  </div>
                )}

                <div className="metric-item">
                  <div className="metric-label">Frames Analyzed</div>
                  <div className="metric-value">{results.metrics.frames_analyzed}</div>
                  <div className="metric-detail">
                    ~{Math.round(results.metrics.frames_analyzed / 30)}s at 30fps
                  </div>
                </div>
              </div>
            </div>

            {/* Download Button */}
            <div className="download-section">
              <button className="btn btn-download" onClick={handleDownload}>
                📥 Download Annotated Video
              </button>
              <button className="btn btn-secondary" onClick={handleClear}>
                Analyze Another Video
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>Wrestling Coach MVP • Target tracking with CSRT • Pose analysis by MediaPipe • Detection by YOLOv8</p>
      </footer>
    </div>
  )
}

export default App
