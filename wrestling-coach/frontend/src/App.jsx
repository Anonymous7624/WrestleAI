import { useState, useRef } from 'react'

// Backend API base URL - change this if deploying elsewhere
const API_BASE = 'http://localhost:8000'

function App() {
  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)
  const fileInputRef = useRef(null)

  // Handle file selection
  const handleFileSelect = (selectedFile) => {
    if (selectedFile) {
      // Validate file type
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

  // File picker click
  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleInputChange = (e) => {
    handleFileSelect(e.target.files[0])
  }

  // Analyze video
  const handleAnalyze = async () => {
    if (!file) return

    setIsAnalyzing(true)
    setError(null)
    setResults(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `Analysis failed (${response.status})`)
      }

      const data = await response.json()
      setResults(data)
    } catch (err) {
      setError(err.message || 'Failed to analyze video. Is the backend running?')
    } finally {
      setIsAnalyzing(false)
    }
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
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🤼 Wrestling Coach</h1>
        <p className="subtitle">AI-powered technique analysis</p>
      </header>

      <main className="main">
        {/* Upload Section */}
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
              onClick={handleAnalyze}
              disabled={!file || isAnalyzing}
            >
              {isAnalyzing ? 'Analyzing…' : 'Analyze'}
            </button>
            {file && (
              <button className="btn btn-secondary" onClick={handleClear}>
                Clear
              </button>
            )}
          </div>
        </section>

        {/* Error Display */}
        {error && (
          <div className="error-box">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Analyzing State */}
        {isAnalyzing && (
          <div className="analyzing-box">
            <div className="spinner"></div>
            <p>Analyzing video… This may take a moment.</p>
          </div>
        )}

        {/* Results Section */}
        {results && (
          <section className="results-section">
            <h2>Analysis Results</h2>

            {/* Coaching Pointers */}
            <div className="pointers-card">
              <h3>📋 Coaching Pointers</h3>
              <ul className="pointers-list">
                {results.pointers.map((pointer, idx) => (
                  <li key={idx} className="pointer-item">
                    <div className="pointer-title">{pointer.title}</div>
                    <div className="pointer-why"><strong>Why:</strong> {pointer.why}</div>
                    <div className="pointer-fix"><strong>Fix:</strong> {pointer.fix}</div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Metrics */}
            <div className="metrics-card">
              <h3>📊 Metrics</h3>
              <pre className="metrics-json">
                {JSON.stringify(results.metrics, null, 2)}
              </pre>
            </div>

            {/* Download Button */}
            <div className="download-section">
              <button className="btn btn-download" onClick={handleDownload}>
                📥 Download Annotated Video
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>Wrestling Coach MVP • Pose analysis powered by MediaPipe</p>
      </footer>
    </div>
  )
}

export default App
