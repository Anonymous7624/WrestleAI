import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'

import Header from './components/Header'
import UploadStep from './components/UploadStep'
import TargetSelectStep from './components/TargetSelectStep'
import AnchorSelectStep from './components/AnchorSelectStep'
import AnalysisStep from './components/AnalysisStep'
import ResultsStep from './components/ResultsStep'

// Backend API base URL - change this if deploying elsewhere
const API_BASE = 'http://localhost:8000'

// Local storage keys
const STORAGE_KEYS = {
  SESSION: 'wrestlerAI-session',
  UPLOAD_DATA: 'wrestlerAI-uploadData',
  LAST_TARGET: 'wrestlerAI-lastTarget',
}

// Application states
const STATES = {
  UPLOAD: 'upload',
  TARGET_SELECT: 'target_select',
  ANCHOR_SELECT: 'anchor_select',  // New anchor-based selection
  ANALYZING: 'analyzing',
  RESULTS: 'results'
}

/**
 * Session state structure:
 * {
 *   analyses: Array<AnalysisResult>,       // All completed analyses in order
 *   currentMode: "new" | "continuation",   // Mode for next upload
 *   matchContext: {                        // Accumulated context for continuation mode
 *     totalShotAttempts: number,
 *     totalLevelChanges: number,
 *     totalSprawls: number,
 *     recurringIssues: { [tipTitle: string]: number },
 *     clipsSummary: string,
 *     lastClipIndex: number
 *   }
 * }
 */

/**
 * AnalysisResult structure:
 * {
 *   clipIndex: number,
 *   timestamp: string (ISO),
 *   isContinuation: boolean,
 *   pointers: Array<Pointer>,
 *   metrics: object,
 *   timeline: Array<TimelineEvent>,
 *   events: Array<WrestlingEvent>,
 *   coach_speech: string,
 *   annotated_video_url: string,
 *   job_id: string,
 *   duration_analyzed: number (seconds)
 * }
 */

function getInitialSession() {
  const cached = localStorage.getItem(STORAGE_KEYS.SESSION)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch (e) {
      localStorage.removeItem(STORAGE_KEYS.SESSION)
    }
  }
  return {
    analyses: [],
    currentMode: 'new',
    matchContext: {
      totalShotAttempts: 0,
      totalLevelChanges: 0,
      totalSprawls: 0,
      recurringIssues: {},
      clipsSummary: '',
      lastClipIndex: 0
    }
  }
}

function App() {
  // Session state (persisted)
  const [session, setSession] = useState(getInitialSession)
  
  // App state
  const [appState, setAppState] = useState(() => {
    const initialSession = getInitialSession()
    return initialSession.analyses.length > 0 ? STATES.RESULTS : STATES.UPLOAD
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

  // Mode for current/pending upload
  const pendingModeRef = useRef('new')

  // Persist session to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session))
  }, [session])

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

  // Build prior context from last analysis for continuation mode
  const buildPriorContext = useCallback(() => {
    if (session.analyses.length === 0) return null
    
    const lastAnalysis = session.analyses[session.analyses.length - 1]
    const context = session.matchContext
    
    return {
      // From last analysis
      lastTips: lastAnalysis.pointers?.slice(0, 3).map(p => ({
        title: p.title,
        evidence: p.evidence
      })) || [],
      lastEvents: lastAnalysis.events?.map(e => ({
        type: e.type,
        timestamp: e.t_start
      })) || [],
      lastMetrics: {
        knee_angle_avg: lastAnalysis.metrics?.knee_angle?.avg,
        stance_width_avg: lastAnalysis.metrics?.stance_width?.avg
      },
      coachSpeechSummary: lastAnalysis.coach_speech?.slice(0, 200) || '',
      
      // Accumulated context
      totalShotAttempts: context.totalShotAttempts,
      totalLevelChanges: context.totalLevelChanges,
      totalSprawls: context.totalSprawls,
      recurringIssues: context.recurringIssues,
      clipNumber: context.lastClipIndex + 1
    }
  }, [session])

  // Update match context after analysis
  const updateMatchContext = useCallback((analysisResult, isContinuation) => {
    setSession(prev => {
      const newContext = { ...prev.matchContext }
      
      // Count events from this analysis
      const events = analysisResult.events || []
      const shotAttempts = events.filter(e => 
        e.type?.toLowerCase().includes('shot') || 
        e.type?.toLowerCase().includes('takedown')
      ).length
      const levelChanges = events.filter(e => 
        e.type?.toLowerCase().includes('level')
      ).length
      const sprawls = events.filter(e => 
        e.type?.toLowerCase().includes('sprawl')
      ).length
      
      // Update totals
      newContext.totalShotAttempts += shotAttempts
      newContext.totalLevelChanges += levelChanges
      newContext.totalSprawls += sprawls
      
      // Track recurring issues
      const pointers = analysisResult.pointers || []
      pointers.forEach(p => {
        const key = p.title?.toLowerCase() || ''
        if (key) {
          newContext.recurringIssues[key] = (newContext.recurringIssues[key] || 0) + 1
        }
      })
      
      // Update clip index
      newContext.lastClipIndex = prev.matchContext.lastClipIndex + 1
      
      // Build clips summary
      const clipCount = newContext.lastClipIndex
      newContext.clipsSummary = `Analyzed ${clipCount} clip${clipCount > 1 ? 's' : ''} in this session.`
      
      return {
        ...prev,
        matchContext: newContext
      }
    })
  }, [])

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
      // Use anchor selection for better tracking
      setAppState(STATES.ANCHOR_SELECT)
    } catch (err) {
      setError(err.message || 'Failed to upload video. Is the backend running?')
      setIsUploading(false)
    }
  }

  // Run analysis with selected target (legacy single-point tracking)
  const handleAnalyze = async (targetBox, tStart) => {
    if (!uploadData) return

    // Save target for retry
    setLastTarget({ targetBox, tStart })

    setAppState(STATES.ANALYZING)
    setError(null)
    setAnalyzeStarted(true)
    setAnalyzeComplete(false)

    const isContinuation = pendingModeRef.current === 'continuation'
    const clipIndex = session.matchContext.lastClipIndex + 1

    try {
      const requestBody = {
        target_box: targetBox,
        t_start: tStart,
        continuation: isContinuation,
        clip_index: clipIndex
      }

      // Add prior context if in continuation mode
      if (isContinuation) {
        requestBody.prior_context = buildPriorContext()
      }

      const response = await fetch(`${API_BASE}/api/analyze/${uploadData.job_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `Analysis failed (${response.status})`)
      }

      const data = await response.json()
      
      // Build analysis result with metadata
      const analysisResult = {
        ...data,
        clipIndex,
        timestamp: new Date().toISOString(),
        isContinuation,
        duration_analyzed: uploadData.duration_seconds || 0
      }
      
      // Append to session analyses (don't replace!)
      setSession(prev => ({
        ...prev,
        analyses: [...prev.analyses, analysisResult]
      }))
      
      // Update match context
      updateMatchContext(analysisResult, isContinuation)
      
      setAnalyzeComplete(true)
      
      // Small delay to show completion state
      setTimeout(() => {
        setAppState(STATES.RESULTS)
        // Reset mode back to new for next upload
        pendingModeRef.current = 'new'
      }, 1500)
    } catch (err) {
      setError(err.message || 'Failed to analyze video.')
      setAnalyzeComplete(false)
    }
  }

  // Run analysis with anchor-based tracking (new robust method)
  const handleAnalyzeWithAnchors = async (anchors) => {
    if (!uploadData) return

    // Save anchors for retry
    setLastTarget({ anchors })

    setAppState(STATES.ANALYZING)
    setError(null)
    setAnalyzeStarted(true)
    setAnalyzeComplete(false)

    try {
      const response = await fetch(`${API_BASE}/api/analyze-with-anchors/${uploadData.job_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          anchors: anchors,
          continuation: false
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
      if (lastTarget.anchors) {
        // Anchor-based retry
        handleAnalyzeWithAnchors(lastTarget.anchors)
      } else {
        // Legacy single-point retry
        handleAnalyze(lastTarget.targetBox, lastTarget.tStart)
      }
    } else {
      setAppState(STATES.ANCHOR_SELECT)
      setError(null)
    }
  }

  // Go back to target selection
  const handleBackToTarget = () => {
    setAppState(STATES.ANCHOR_SELECT)
    setError(null)
  }

  // Clear chat - wipe everything and start fresh
  const handleClearChat = () => {
    setAppState(STATES.UPLOAD)
    setUploadData(null)
    setError(null)
    setIsUploading(false)
    setUploadComplete(false)
    setAnalyzeStarted(false)
    setAnalyzeComplete(false)
    setLastTarget(null)
    pendingModeRef.current = 'new'
    
    // Reset session to initial state
    setSession({
      analyses: [],
      currentMode: 'new',
      matchContext: {
        totalShotAttempts: 0,
        totalLevelChanges: 0,
        totalSprawls: 0,
        recurringIssues: {},
        clipsSummary: '',
        lastClipIndex: 0
      }
    })
    
    // Clear all localStorage
    localStorage.removeItem(STORAGE_KEYS.SESSION)
    localStorage.removeItem(STORAGE_KEYS.UPLOAD_DATA)
    localStorage.removeItem(STORAGE_KEYS.LAST_TARGET)
  }

  // Logo click - go to home/upload without wiping analyses
  const handleLogoClick = () => {
    setAppState(STATES.UPLOAD)
    setUploadData(null)
    setError(null)
    setIsUploading(false)
    setUploadComplete(false)
    setAnalyzeStarted(false)
    setAnalyzeComplete(false)
    setLastTarget(null)
    
    // Clear upload-related localStorage but keep session
    localStorage.removeItem(STORAGE_KEYS.UPLOAD_DATA)
    localStorage.removeItem(STORAGE_KEYS.LAST_TARGET)
  }

  // Upload another (new, unrelated analysis)
  const handleUploadAnother = () => {
    pendingModeRef.current = 'new'
    setAppState(STATES.UPLOAD)
    setUploadData(null)
    setError(null)
    setIsUploading(false)
    setUploadComplete(false)
    setAnalyzeStarted(false)
    setAnalyzeComplete(false)
    setLastTarget(null)
    
    localStorage.removeItem(STORAGE_KEYS.UPLOAD_DATA)
    localStorage.removeItem(STORAGE_KEYS.LAST_TARGET)
  }

  // Upload continuation (next part of same match)
  const handleUploadContinuation = () => {
    pendingModeRef.current = 'continuation'
    setAppState(STATES.UPLOAD)
    setUploadData(null)
    setError(null)
    setIsUploading(false)
    setUploadComplete(false)
    setAnalyzeStarted(false)
    setAnalyzeComplete(false)
    setLastTarget(null)
    
    localStorage.removeItem(STORAGE_KEYS.UPLOAD_DATA)
    localStorage.removeItem(STORAGE_KEYS.LAST_TARGET)
  }

  // Go back to results (if we have any)
  const handleBackToResults = () => {
    if (session.analyses.length > 0) {
      setAppState(STATES.RESULTS)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <Header 
        onLogoClick={handleLogoClick}
        onClearChat={handleClearChat}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <AnimatePresence mode="wait">
          {/* Upload Step */}
          {appState === STATES.UPLOAD && (
            <UploadStep
              key="upload"
              onUpload={handleUpload}
              isUploading={isUploading}
              isContinuationMode={pendingModeRef.current === 'continuation'}
              hasExistingAnalyses={session.analyses.length > 0}
              onBackToResults={handleBackToResults}
            />
          )}

          {/* Anchor Selection Step (New - Robust tracking) */}
          {appState === STATES.ANCHOR_SELECT && uploadData && (
            <AnchorSelectStep
              key="anchor"
              uploadData={uploadData}
              onAnalyze={handleAnalyzeWithAnchors}
              onBack={handleNewAnalysis}
              apiBase={API_BASE}
            />
          )}

          {/* Target Selection Step (Legacy - single point) */}
          {appState === STATES.TARGET_SELECT && uploadData && (
            <TargetSelectStep
              key="target"
              uploadData={uploadData}
              onAnalyze={handleAnalyze}
              onBack={handleLogoClick}
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
          {appState === STATES.RESULTS && session.analyses.length > 0 && (
            <ResultsStep
              key="results"
              session={session}
              apiBase={API_BASE}
              onUploadAnother={handleUploadAnother}
              onUploadContinuation={handleUploadContinuation}
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
