import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChevronLeft, 
  Play, 
  Target, 
  Zap, 
  AlertTriangle,
  User,
  Clock
} from 'lucide-react'
import clsx from 'clsx'

export default function TargetSelectStep({ 
  uploadData,
  onAnalyze,
  onBack,
  apiBase
}) {
  const [currentTime, setCurrentTime] = useState(0)
  const [frameUrl, setFrameUrl] = useState(null)
  const [boxes, setBoxes] = useState([])
  const [frameWidth, setFrameWidth] = useState(0)
  const [frameHeight, setFrameHeight] = useState(0)
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [autoTarget, setAutoTarget] = useState(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [loadingFrame, setLoadingFrame] = useState(false)
  const [hoveredBox, setHoveredBox] = useState(null)
  
  const previewImageRef = useRef(null)
  const sliderDebounceRef = useRef(null)
  const containerRef = useRef(null)

  const maxTime = Math.min(15, uploadData?.duration_seconds || 15)

  // Fetch frame and boxes for current time
  const fetchFrameAndBoxes = useCallback(async (jobId, t) => {
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
        
        // Pre-select auto target if nothing selected
        if (!selectedTarget && data.auto_target) {
          setSelectedTarget(data.auto_target)
        }
      }
    } catch (err) {
      console.error('Failed to fetch frame/boxes:', err)
    } finally {
      setLoadingFrame(false)
    }
  }, [frameUrl, selectedTarget, apiBase])

  // Initial fetch
  useEffect(() => {
    if (uploadData?.job_id) {
      fetchFrameAndBoxes(uploadData.job_id, 0)
    }
    return () => {
      if (frameUrl) {
        URL.revokeObjectURL(frameUrl)
      }
      if (sliderDebounceRef.current) {
        clearTimeout(sliderDebounceRef.current)
      }
    }
  }, [uploadData?.job_id])

  // Handle slider change with debouncing
  const handleSliderChange = (e) => {
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    
    if (sliderDebounceRef.current) {
      clearTimeout(sliderDebounceRef.current)
    }
    
    sliderDebounceRef.current = setTimeout(() => {
      if (uploadData) {
        setSelectedTarget(null)
        fetchFrameAndBoxes(uploadData.job_id, newTime)
      }
    }, 150)
  }

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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`
  }

  const handleAnalyzeSelected = () => {
    if (selectedTarget) {
      onAnalyze(
        { x: selectedTarget.x, y: selectedTarget.y, w: selectedTarget.w, h: selectedTarget.h },
        currentTime
      )
    }
  }

  const handleAutoSelect = () => {
    onAnalyze(null, currentTime)
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
          <h2 className="text-2xl font-bold text-white">Select Your Target</h2>
          <p className="text-dark-400 text-sm mt-1">
            Click on the athlete you want analyzed
          </p>
        </div>
        <div className="w-20" /> {/* Spacer */}
      </div>

      {/* Tooltip */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-center justify-center gap-2 text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-lg px-4 py-2"
      >
        <Target className="w-4 h-4" />
        <span className="text-sm">Scrub to find a clear frame, then click on the person you want to track</span>
      </motion.div>

      {/* Timeline Scrubber */}
      <div className="mb-6 p-4 rounded-xl bg-dark-900/50 border border-dark-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-dark-400">
            <Clock className="w-4 h-4" />
            <span className="text-sm">0:00</span>
          </div>
          <motion.div 
            className="flex items-center gap-2 px-3 py-1 bg-brand-500/20 rounded-full"
            key={currentTime}
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
          >
            <span className="font-mono text-brand-400 font-semibold">
              {formatTime(currentTime)}
            </span>
          </motion.div>
          <span className="text-dark-400 text-sm">{formatTime(maxTime)}</span>
        </div>
        
        <input
          type="range"
          className="scrubber"
          min="0"
          max={maxTime}
          step="0.1"
          value={currentTime}
          onChange={handleSliderChange}
        />
        
        <p className="text-center text-dark-500 text-xs mt-2">
          Scrub through the first {maxTime.toFixed(0)} seconds to find yourself
        </p>
      </div>

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
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full"
              />
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
                
                const isSelected = selectedTarget && selectedTarget.id === det.id
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
                    onClick={() => setSelectedTarget(det)}
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
              <span>No persons detected at this timestamp. Try scrubbing to a different moment.</span>
            </motion.div>
          ) : selectedTarget ? (
            <motion.div
              key="selected"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center gap-2 text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3"
            >
              <Target className="w-5 h-5" />
              <span>
                Selected: <strong>Person #{selectedTarget.id}</strong> at {formatTime(currentTime)}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="instructions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center text-dark-400"
            >
              Click on a bounding box to select ({boxes.length} person{boxes.length !== 1 ? 's' : ''} detected)
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleAnalyzeSelected}
          disabled={!selectedTarget}
          className={clsx(
            'flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all',
            selectedTarget
              ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40'
              : 'bg-dark-700 text-dark-400 cursor-not-allowed'
          )}
        >
          <Play className="w-5 h-5" />
          Analyze from {formatTime(currentTime)}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleAutoSelect}
          disabled={boxes.length === 0}
          className={clsx(
            'flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all',
            boxes.length > 0
              ? 'bg-dark-700 text-white hover:bg-dark-600 border border-dark-600'
              : 'bg-dark-800 text-dark-500 cursor-not-allowed'
          )}
        >
          <Zap className="w-5 h-5" />
          Auto Select & Analyze
        </motion.button>
      </div>
    </motion.div>
  )
}
