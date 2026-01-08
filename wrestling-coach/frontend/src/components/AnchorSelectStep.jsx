import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChevronLeft, 
  ChevronRight,
  Play, 
  Target, 
  Zap, 
  AlertTriangle,
  User,
  Clock,
  SkipForward,
  CheckCircle2,
  Loader2,
  Lock
} from 'lucide-react'
import clsx from 'clsx'

export default function AnchorSelectStep({ 
  uploadData,
  onAnalyze,
  onBack,
  apiBase
}) {
  // Anchor data
  const [anchorTimestamps, setAnchorTimestamps] = useState([])
  const [anchors, setAnchors] = useState([])  // Array of {t, box, skipped}
  const [currentAnchorIndex, setCurrentAnchorIndex] = useState(0)
  const [loadingAnchors, setLoadingAnchors] = useState(true)
  
  // Frame data for current anchor
  const [frameUrl, setFrameUrl] = useState(null)
  const [boxes, setBoxes] = useState([])
  const [frameWidth, setFrameWidth] = useState(0)
  const [frameHeight, setFrameHeight] = useState(0)
  const [autoTarget, setAutoTarget] = useState(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [loadingFrame, setLoadingFrame] = useState(false)
  const [hoveredBox, setHoveredBox] = useState(null)
  
  const previewImageRef = useRef(null)
  const containerRef = useRef(null)

  // Fetch anchor timestamps on mount
  useEffect(() => {
    if (uploadData?.job_id) {
      fetchAnchors(uploadData.job_id)
    }
    return () => {
      if (frameUrl) {
        URL.revokeObjectURL(frameUrl)
      }
    }
  }, [uploadData?.job_id])

  // Fetch anchor timestamps from backend
  const fetchAnchors = async (jobId) => {
    setLoadingAnchors(true)
    try {
      const response = await fetch(`${apiBase}/api/anchors/${jobId}`)
      if (response.ok) {
        const data = await response.json()
        const timestamps = data.anchors || []
        setAnchorTimestamps(timestamps)
        
        // Initialize anchors array with empty selections
        setAnchors(timestamps.map(t => ({
          t,
          box: null,
          skipped: false
        })))
        
        // Fetch first anchor's frame
        if (timestamps.length > 0) {
          await fetchFrameAndBoxes(jobId, timestamps[0], 0)
        }
      }
    } catch (err) {
      console.error('Failed to fetch anchors:', err)
    } finally {
      setLoadingAnchors(false)
    }
  }

  // Fetch frame and boxes for a specific anchor
  const fetchFrameAndBoxes = useCallback(async (jobId, t, anchorIdx) => {
    setLoadingFrame(true)
    try {
      // Fetch frame image
      const frameResponse = await fetch(`${apiBase}/api/frame/${jobId}?t=${t}`)
      if (frameResponse.ok) {
        const blob = await frameResponse.blob()
        const url = URL.createObjectURL(blob)
        if (frameUrl) {
          URL.revokeObjectURL(frameUrl)
        }
        setFrameUrl(url)
      }
      
      // Fetch boxes
      const boxesResponse = await fetch(`${apiBase}/api/boxes/${jobId}?t=${t}`)
      if (boxesResponse.ok) {
        const data = await boxesResponse.json()
        setBoxes(data.boxes || [])
        setAutoTarget(data.auto_target)
        setFrameWidth(data.frame_width)
        setFrameHeight(data.frame_height)
      }
    } catch (err) {
      console.error('Failed to fetch frame/boxes:', err)
    } finally {
      setLoadingFrame(false)
    }
  }, [frameUrl, apiBase])

  // Navigate to specific anchor
  const goToAnchor = useCallback((index) => {
    if (index >= 0 && index < anchorTimestamps.length) {
      setCurrentAnchorIndex(index)
      fetchFrameAndBoxes(uploadData.job_id, anchorTimestamps[index], index)
    }
  }, [anchorTimestamps, uploadData?.job_id, fetchFrameAndBoxes])

  // Handle box selection
  const handleSelectBox = useCallback((box) => {
    setAnchors(prev => {
      const updated = [...prev]
      updated[currentAnchorIndex] = {
        ...updated[currentAnchorIndex],
        box: { x: box.x, y: box.y, w: box.w, h: box.h },
        skipped: false
      }
      return updated
    })
  }, [currentAnchorIndex])

  // Handle skip
  const handleSkip = useCallback(() => {
    setAnchors(prev => {
      const updated = [...prev]
      updated[currentAnchorIndex] = {
        ...updated[currentAnchorIndex],
        box: null,
        skipped: true
      }
      return updated
    })
    
    // Auto-advance to next anchor
    if (currentAnchorIndex < anchorTimestamps.length - 1) {
      goToAnchor(currentAnchorIndex + 1)
    }
  }, [currentAnchorIndex, anchorTimestamps.length, goToAnchor])

  // Handle auto-select (largest/centered box)
  const handleAutoSelect = useCallback(() => {
    if (autoTarget) {
      handleSelectBox(autoTarget)
    } else if (boxes.length > 0) {
      handleSelectBox(boxes[0])
    }
  }, [autoTarget, boxes, handleSelectBox])

  // Handle image load
  const handleImageLoad = useCallback(() => {
    if (previewImageRef.current) {
      setImageSize({
        width: previewImageRef.current.clientWidth,
        height: previewImageRef.current.clientHeight
      })
    }
  }, [])

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      if (previewImageRef.current) {
        setImageSize({
          width: previewImageRef.current.clientWidth,
          height: previewImageRef.current.clientHeight
        })
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Calculate scaled box coordinates
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

  // Format timestamp
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Get current anchor status
  const getCurrentAnchor = () => anchors[currentAnchorIndex] || { t: 0, box: null, skipped: false }
  const currentAnchor = getCurrentAnchor()

  // Check if ready to analyze (at least one anchor has a box)
  const hasAnySelection = anchors.some(a => a.box !== null)
  
  // Count completed anchors
  const completedCount = anchors.filter(a => a.box !== null || a.skipped).length
  const progressPercent = anchorTimestamps.length > 0 
    ? Math.round((completedCount / anchorTimestamps.length) * 100) 
    : 0

  // Handle analyze
  const handleAnalyze = () => {
    if (hasAnySelection) {
      onAnalyze(anchors)
    }
  }

  // Loading state
  if (loadingAnchors) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-4xl mx-auto text-center py-20"
      >
        <Loader2 className="w-10 h-10 animate-spin mx-auto text-brand-500 mb-4" />
        <p className="text-dark-400">Generating anchor points...</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="text-center flex-1">
          <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
            <Lock className="w-6 h-6 text-brand-500" />
            Lock onto YOU
          </h2>
          <p className="text-dark-400 text-sm mt-1">
            Confirm which person is you at key moments
          </p>
        </div>
        <div className="w-20" />
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-dark-400 text-sm">
            {completedCount} of {anchorTimestamps.length} anchors set
          </span>
          <span className="text-brand-400 text-sm font-medium">{progressPercent}%</span>
        </div>
        <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-brand-600 to-purple-600"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Anchor Navigation Pills */}
      <div className="mb-4 flex flex-wrap gap-2 justify-center">
        {anchorTimestamps.map((t, idx) => {
          const anchor = anchors[idx]
          const isSelected = anchor?.box !== null
          const isSkipped = anchor?.skipped
          const isCurrent = idx === currentAnchorIndex
          
          return (
            <button
              key={idx}
              onClick={() => goToAnchor(idx)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                isCurrent 
                  ? 'bg-brand-500 text-white ring-2 ring-brand-400 ring-offset-2 ring-offset-dark-950'
                  : isSelected
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : isSkipped
                      ? 'bg-dark-700 text-dark-400 border border-dark-600'
                      : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
              )}
            >
              {formatTime(t)}
              {isSelected && <CheckCircle2 className="w-3 h-3 inline ml-1" />}
              {isSkipped && <SkipForward className="w-3 h-3 inline ml-1" />}
            </button>
          )
        })}
      </div>

      {/* Current Anchor Info */}
      <motion.div 
        key={currentAnchorIndex}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-center justify-center gap-3 text-lg"
      >
        <span className="text-dark-400">Anchor</span>
        <span className="font-bold text-white">
          {currentAnchorIndex + 1} / {anchorTimestamps.length}
        </span>
        <span className="text-dark-600">•</span>
        <span className="flex items-center gap-1 text-brand-400">
          <Clock className="w-4 h-4" />
          t={formatTime(anchorTimestamps[currentAnchorIndex] || 0)}
        </span>
      </motion.div>

      {/* Tip Banner */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-center justify-center gap-2 text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-lg px-4 py-2"
      >
        <Target className="w-4 h-4" />
        <span className="text-sm">Click on yourself in each frame. Skip if you're not visible.</span>
      </motion.div>

      {/* Frame Preview Container */}
      <div 
        ref={containerRef}
        className="relative rounded-xl overflow-hidden bg-dark-900 border border-dark-800 mb-6"
      >
        {/* Loading Overlay */}
        <AnimatePresence>
          {loadingFrame && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-dark-900/80 backdrop-blur-sm z-20 flex items-center justify-center"
            >
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Frame Image */}
        {frameUrl ? (
          <div className="relative inline-block w-full">
            <img 
              ref={previewImageRef}
              src={frameUrl} 
              alt="Video frame preview"
              className="w-full h-auto max-h-[500px] object-contain"
              onLoad={handleImageLoad}
            />
            
            {/* Detection Boxes Overlay */}
            <div className="absolute inset-0">
              {boxes.map((det) => {
                const scaled = getScaledBox(det)
                if (!scaled) return null
                
                const isSelected = currentAnchor.box && 
                  currentAnchor.box.x === det.x && 
                  currentAnchor.box.y === det.y
                const isAuto = autoTarget && autoTarget.id === det.id
                const isHovered = hoveredBox === det.id
                
                return (
                  <motion.div
                    key={det.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={clsx(
                      'absolute cursor-pointer transition-all duration-200',
                      'border-3 rounded-md',
                      isSelected 
                        ? 'border-green-500 shadow-glow-green'
                        : isHovered
                          ? 'border-white shadow-glow'
                          : 'border-orange-500',
                      isAuto && !isSelected && !isHovered && 'border-dashed'
                    )}
                    style={{
                      left: `${scaled.x}px`,
                      top: `${scaled.y}px`,
                      width: `${scaled.w}px`,
                      height: `${scaled.h}px`,
                      borderWidth: '3px',
                    }}
                    onClick={() => handleSelectBox(det)}
                    onMouseEnter={() => setHoveredBox(det.id)}
                    onMouseLeave={() => setHoveredBox(null)}
                  >
                    {/* Label */}
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={clsx(
                        'absolute -top-7 left-0 px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap',
                        isSelected
                          ? 'bg-green-500 text-white'
                          : isHovered
                            ? 'bg-white text-dark-900'
                            : 'bg-orange-500 text-white'
                      )}
                    >
                      <User className="w-3 h-3 inline-block mr-1" />
                      #{det.id}
                      {isAuto && !isSelected && ' (suggested)'}
                      {det.score && ` • ${Math.round(det.score * 100)}%`}
                    </motion.div>

                    {/* Selection indicator */}
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </motion.div>
                    )}
                  </motion.div>
                )
              })}
            </div>

            {/* Skipped Overlay */}
            {currentAnchor.skipped && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-dark-900/60 flex items-center justify-center"
              >
                <div className="bg-dark-800 px-6 py-3 rounded-xl border border-dark-700">
                  <SkipForward className="w-6 h-6 text-dark-400 mx-auto mb-2" />
                  <p className="text-dark-400">Marked as skipped</p>
                </div>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-dark-500">
            <div className="text-center">
              <Play className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>Loading frame...</p>
            </div>
          </div>
        )}
      </div>

      {/* Selection Status */}
      <div className="mb-6">
        <AnimatePresence mode="wait">
          {boxes.length === 0 ? (
            <motion.div
              key="no-detection"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3"
            >
              <AlertTriangle className="w-5 h-5" />
              <span>No persons detected at this timestamp. Click Skip if you're not in frame.</span>
            </motion.div>
          ) : currentAnchor.box ? (
            <motion.div
              key="selected"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center gap-2 text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>
                Selected at {formatTime(anchorTimestamps[currentAnchorIndex])}
              </span>
            </motion.div>
          ) : currentAnchor.skipped ? (
            <motion.div
              key="skipped"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center gap-2 text-dark-400 bg-dark-800 border border-dark-700 rounded-lg px-4 py-3"
            >
              <SkipForward className="w-5 h-5" />
              <span>Skipped - not in frame</span>
            </motion.div>
          ) : (
            <motion.div
              key="instructions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center text-dark-400"
            >
              Click on yourself ({boxes.length} person{boxes.length !== 1 ? 's' : ''} detected)
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation and Action Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
        {/* Prev Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => goToAnchor(currentAnchorIndex - 1)}
          disabled={currentAnchorIndex === 0}
          className={clsx(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all',
            currentAnchorIndex > 0
              ? 'bg-dark-700 text-white hover:bg-dark-600'
              : 'bg-dark-800 text-dark-500 cursor-not-allowed'
          )}
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </motion.button>

        {/* Skip Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSkip}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-dark-700 text-dark-300 hover:bg-dark-600 hover:text-white transition-all"
        >
          <SkipForward className="w-5 h-5" />
          Skip (I'm not in frame)
        </motion.button>

        {/* Auto-detect Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleAutoSelect}
          disabled={boxes.length === 0}
          className={clsx(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all',
            boxes.length > 0
              ? 'bg-dark-700 text-white hover:bg-dark-600 border border-dark-600'
              : 'bg-dark-800 text-dark-500 cursor-not-allowed'
          )}
        >
          <Zap className="w-5 h-5" />
          Auto-detect
        </motion.button>

        {/* Next Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => goToAnchor(currentAnchorIndex + 1)}
          disabled={currentAnchorIndex >= anchorTimestamps.length - 1}
          className={clsx(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all',
            currentAnchorIndex < anchorTimestamps.length - 1
              ? 'bg-dark-700 text-white hover:bg-dark-600'
              : 'bg-dark-800 text-dark-500 cursor-not-allowed'
          )}
        >
          Next
          <ChevronRight className="w-5 h-5" />
        </motion.button>
      </div>

      {/* Analyze Button */}
      <div className="flex justify-center">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleAnalyze}
          disabled={!hasAnySelection}
          className={clsx(
            'flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-lg transition-all',
            hasAnySelection
              ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40'
              : 'bg-dark-700 text-dark-400 cursor-not-allowed'
          )}
        >
          <Play className="w-5 h-5" />
          Analyze Video
          {hasAnySelection && (
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-sm">
              {anchors.filter(a => a.box).length} anchors
            </span>
          )}
        </motion.button>
      </div>

      {/* Help text */}
      <p className="text-center text-dark-500 text-sm mt-4">
        Select yourself at multiple timestamps for more accurate tracking. 
        You can skip frames where you're not visible.
      </p>
    </motion.div>
  )
}
