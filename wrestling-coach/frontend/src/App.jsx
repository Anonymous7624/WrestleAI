import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'

import Header from './components/Header'
import UploadStep from './components/UploadStep'
import TargetSelectStep from './components/TargetSelectStep'
import AnalysisStep from './components/AnalysisStep'
import ResultsStep from './components/ResultsStep'

// Backend API base URL - change this if deploying elsewhere
const API_BASE = 'http://localhost:8000'

// Local storage keys
const STORAGE_KEYS = {
  RESULTS: 'wrestlerAI-results',
  UPLOAD_DATA: 'wrestlerAI-uploadData',
  LAST_TARGET: 'wrestlerAI-lastTarget',
}

// Application states
const STATES = {
  UPLOAD: 'upload',
  TARGET_SELECT: 'target_select',
  ANALYZING: 'analyzing',
  RESULTS: 'results'
}

function App() {
  // App state
  const [appState, setAppState] = useState(() => {
    // Check if we have cached results
    const cachedResults = localStorage.getItem(STORAGE_KEYS.RESULTS)
    if (cachedResults) {
      try {
        JSON.parse(cachedResults)
        return STATES.RESULTS
      } catch (e) {
        localStorage.removeItem(STORAGE_KEYS.RESULTS)
      }
    }
    return STATES.UPLOAD
  })

  // Upload state
  const [uploadData, setUploadData] = useState(() => {
    const cached = localStorage.getItem(STORAGE_KEYS.UPLOAD_DATA)
    if (cached) {
      try {
        return JSON.parse(cached)
      } catch (e) {
        localStorage.removeItem(STORAGE_KEYS.UPLOAD_DATA)
      }
    }
    return null
  })

  // Results state
  const [results, setResults] = useState(() => {
    const cached = localStorage.getItem(STORAGE_KEYS.RESULTS)
    if (cached) {
      try {
        return JSON.parse(cached)
      } catch (e) {
        localStorage.removeItem(STORAGE_KEYS.RESULTS)
      }
    }
    return null
  })

  // Error state
  const [error, setError] = useState(null)

  // Analysis progress state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [analyzeStarted, setAnalyzeStarted] = useState(false)
  const [analyzeComplete, setAnalyzeComplete] = useState(false)

  // Last target for retry
  const [lastTarget, setLastTarget] = useState(() => {
    const cached = localStorage.getItem(STORAGE_KEYS.LAST_TARGET)
    if (cached) {
      try {
        return JSON.parse(cached)
      } catch (e) {
        localStorage.removeItem(STORAGE_KEYS.LAST_TARGET)
      }
    }
    return null
  })

  // Persist results to localStorage
  useEffect(() => {
    if (results) {
      localStorage.setItem(STORAGE_KEYS.RESULTS, JSON.stringify(results))
    }
  }, [results])

  // Persist upload data
  useEffect(() => {
    if (uploadData) {
      localStorage.setItem(STORAGE_KEYS.UPLOAD_DATA, JSON.stringify(uploadData))
    }
  }, [uploadData])

  // Persist last target
  useEffect(() => {
    if (lastTarget) {
      localStorage.setItem(STORAGE_KEYS.LAST_TARGET, JSON.stringify(lastTarget))
    }
  }, [lastTarget])

  // Handle file upload
  const handleUpload = async (file) => {
    setIsUploading(true)
    setError(null)
    setUploadComplete(false)
    setAnalyzeStarted(false)
    setAnalyzeComplete(false)

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
      setUploadComplete(true)
      setIsUploading(false)
      setAppState(STATES.TARGET_SELECT)
    } catch (err) {
      setError(err.message || 'Failed to upload video. Is the backend running?')
      setIsUploading(false)
    }
  }

  // Run analysis with selected target
  const handleAnalyze = async (targetBox, tStart) => {
    if (!uploadData) return

    // Save target for retry
    setLastTarget({ targetBox, tStart })

    setAppState(STATES.ANALYZING)
    setError(null)
    setAnalyzeStarted(true)
    setAnalyzeComplete(false)

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
      setAnalyzeComplete(true)
      
      // Small delay to show completion state
      setTimeout(() => {
        setAppState(STATES.RESULTS)
      }, 1500)
    } catch (err) {
      setError(err.message || 'Failed to analyze video.')
      setAnalyzeComplete(false)
    }
  }

  // Retry analysis
  const handleRetry = () => {
    if (lastTarget && uploadData) {
      handleAnalyze(lastTarget.targetBox, lastTarget.tStart)
    } else {
      setAppState(STATES.TARGET_SELECT)
      setError(null)
    }
  }

  // Go back to target selection
  const handleBackToTarget = () => {
    setAppState(STATES.TARGET_SELECT)
    setError(null)
  }

  // Start new analysis (clear everything)
  const handleNewAnalysis = () => {
    setAppState(STATES.UPLOAD)
    setUploadData(null)
    setResults(null)
    setError(null)
    setIsUploading(false)
    setUploadComplete(false)
    setAnalyzeStarted(false)
    setAnalyzeComplete(false)
    setLastTarget(null)
    
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEYS.RESULTS)
    localStorage.removeItem(STORAGE_KEYS.UPLOAD_DATA)
    localStorage.removeItem(STORAGE_KEYS.LAST_TARGET)
  }

  // Navigation handler
  const handleNavigate = (destination) => {
    if (destination === 'upload') {
      handleNewAnalysis()
    } else if (destination === 'results' && results) {
      setAppState(STATES.RESULTS)
    }
  }

  // Determine current step for header
  const getCurrentStep = () => {
    if (appState === STATES.RESULTS) return 'results'
    return 'upload'
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <Header 
        currentStep={getCurrentStep()}
        onNavigate={handleNavigate}
        hasResults={!!results}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AnimatePresence mode="wait">
          {/* Upload Step */}
          {appState === STATES.UPLOAD && (
            <UploadStep
              key="upload"
              onUpload={handleUpload}
              isUploading={isUploading}
            />
          )}

          {/* Target Selection Step */}
          {appState === STATES.TARGET_SELECT && uploadData && (
            <TargetSelectStep
              key="target"
              uploadData={uploadData}
              onAnalyze={handleAnalyze}
              onBack={handleNewAnalysis}
              apiBase={API_BASE}
            />
          )}

          {/* Analysis Step */}
          {appState === STATES.ANALYZING && (
            <AnalysisStep
              key="analyzing"
              uploadComplete={uploadComplete}
              analyzeStarted={analyzeStarted}
              analyzeComplete={analyzeComplete}
              error={error}
              onRetry={handleRetry}
            />
          )}

          {/* Results Step */}
          {appState === STATES.RESULTS && results && (
            <ResultsStep
              key="results"
              results={results}
              apiBase={API_BASE}
              onNewAnalysis={handleNewAnalysis}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-800 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-dark-500 text-sm">
            Wrestler AI • Target tracking with CSRT • Pose analysis by MediaPipe • Detection by YOLOv8
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
