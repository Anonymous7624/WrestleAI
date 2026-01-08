import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChevronLeft, 
  ChevronRight,
  Scissors,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Clock,
  Info
} from 'lucide-react'
import clsx from 'clsx'

const MIN_CLIP_LENGTH = 3 // Minimum 3 seconds

export default function TrimStep({ 
  uploadData,
  onTrimComplete,
  onBack,
  apiBase
}) {
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(uploadData?.duration_seconds || 10)
  const [currentPreviewTime, setCurrentPreviewTime] = useState(0)
  const [frameUrl, setFrameUrl] = useState(null)
  const [loadingFrame, setLoadingFrame] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  
  const playIntervalRef = useRef(null)
  const duration = uploadData?.duration_seconds || 0
  
  // Fetch frame at current preview time
  const fetchFrame = useCallback(async (t) => {
    if (!uploadData?.job_id) return
    
    setLoadingFrame(true)
    try {
      const response = await fetch(`${apiBase}/api/frame/${uploadData.job_id}?t=${t}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        if (frameUrl) {
          URL.revokeObjectURL(frameUrl)
        }
        setFrameUrl(url)
      }
    } catch (err) {
      console.error('Failed to fetch frame:', err)
    } finally {
      setLoadingFrame(false)
    }
  }, [uploadData?.job_id, apiBase, frameUrl])
  
  // Initial frame load
  useEffect(() => {
    fetchFrame(0)
    return () => {
      if (frameUrl) {
        URL.revokeObjectURL(frameUrl)
      }
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
      }
    }
  }, [])
  
  // Update frame when preview time changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFrame(currentPreviewTime)
    }, 150)
    return () => clearTimeout(timer)
  }, [currentPreviewTime])
  
  // Handle play/pause preview
  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false)
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
        playIntervalRef.current = null
      }
    } else {
      setIsPlaying(true)
      // Start from current position, loop within trim range
      let t = currentPreviewTime
      if (t < trimStart || t >= trimEnd) {
        t = trimStart
        setCurrentPreviewTime(t)
      }
      
      playIntervalRef.current = setInterval(() => {
        setCurrentPreviewTime(prev => {
          const next = prev + 0.5
          if (next >= trimEnd) {
            return trimStart
          }
          return next
        })
      }, 500)
    }
  }
  
  // Stop play when component unmounts or trim changes
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
      }
    }
  }, [trimStart, trimEnd])
  
  // Calculate effective duration
  const effectiveDuration = trimEnd - trimStart
  const isValidTrim = effectiveDuration >= MIN_CLIP_LENGTH && trimStart < trimEnd
  
  // Format time helper
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`
  }
  
  // Handle start trim change
  const handleStartChange = (value) => {
    const newStart = parseFloat(value)
    setTrimStart(newStart)
    // Ensure preview stays within bounds
    if (currentPreviewTime < newStart) {
      setCurrentPreviewTime(newStart)
    }
  }
  
  // Handle end trim change
  const handleEndChange = (value) => {
    const newEnd = parseFloat(value)
    setTrimEnd(newEnd)
    // Ensure preview stays within bounds
    if (currentPreviewTime > newEnd) {
      setCurrentPreviewTime(newEnd)
    }
  }
  
  // Save trim and proceed
  const handleContinue = async () => {
    if (!isValidTrim) {
      setError(`Trimmed clip must be at least ${MIN_CLIP_LENGTH} seconds`)
      return
    }
    
    setIsSaving(true)
    setError(null)
    
    try {
      // Send trim data to backend
      const response = await fetch(`${apiBase}/api/set-trim/${uploadData.job_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trim_start: trimStart,
          trim_end: trimEnd
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to save trim settings')
      }
      
      const data = await response.json()
      
      // Proceed to next step with trim data
      onTrimComplete({
        trim_start: trimStart,
        trim_end: trimEnd,
        effective_duration: data.effective_duration || effectiveDuration
      })
    } catch (err) {
      setError(err.message || 'Failed to save trim settings')
    } finally {
      setIsSaving(false)
    }
  }
  
  // Skip trim (use full video)
  const handleSkipTrim = async () => {
    setTrimStart(0)
    setTrimEnd(duration)
    
    // Save full duration trim
    setIsSaving(true)
    try {
      await fetch(`${apiBase}/api/set-trim/${uploadData.job_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trim_start: 0,
          trim_end: duration
        }),
      })
      
      onTrimComplete({
        trim_start: 0,
        trim_end: duration,
        effective_duration: duration
      })
    } catch (err) {
      // Even if save fails, proceed with defaults
      onTrimComplete({
        trim_start: 0,
        trim_end: duration,
        effective_duration: duration
      })
    } finally {
      setIsSaving(false)
    }
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
            <Scissors className="w-6 h-6 text-brand-500" />
            Trim Your Clip
          </h2>
          <p className="text-dark-400 text-sm mt-1">
            Remove non-wrestling portions from start and end
          </p>
        </div>
        <div className="w-20" />
      </div>
      
      {/* Important instruction banner */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-300">Trim off all parts where you are NOT wrestling</h3>
            <p className="text-amber-300/70 text-sm mt-1">
              Remove footage of standing around, walking to position, or any breaks. 
              Keep only the active wrestling portion for best analysis results.
            </p>
          </div>
        </div>
      </motion.div>
      
      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Frame Preview */}
      <div className="relative rounded-xl overflow-hidden bg-dark-900 border border-dark-800 mb-6">
        {/* Loading Overlay */}
        <AnimatePresence>
          {loadingFrame && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-dark-900/60 z-10 flex items-center justify-center"
            >
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Frame Image */}
        {frameUrl ? (
          <img 
            src={frameUrl} 
            alt="Video frame preview"
            className="w-full h-auto max-h-[400px] object-contain"
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-dark-500">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}
        
        {/* Time indicator overlay */}
        <div className="absolute bottom-4 left-4 bg-dark-900/80 px-3 py-1.5 rounded-lg">
          <span className="text-white font-mono text-sm">
            {formatTime(currentPreviewTime)}
          </span>
        </div>
        
        {/* Trim indicator */}
        {(currentPreviewTime < trimStart || currentPreviewTime > trimEnd) && (
          <div className="absolute top-4 right-4 bg-red-500/80 px-3 py-1.5 rounded-lg">
            <span className="text-white text-sm font-medium">Outside trim range</span>
          </div>
        )}
      </div>
      
      {/* Preview Scrubber */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="p-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-white transition-colors"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          
          <div className="flex-1 relative">
            {/* Background track */}
            <div className="h-2 bg-dark-800 rounded-full">
              {/* Trimmed range highlight */}
              <div 
                className="absolute h-2 bg-brand-500/30 rounded-full"
                style={{
                  left: `${(trimStart / duration) * 100}%`,
                  width: `${((trimEnd - trimStart) / duration) * 100}%`
                }}
              />
            </div>
            
            {/* Preview scrubber */}
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={currentPreviewTime}
              onChange={(e) => setCurrentPreviewTime(parseFloat(e.target.value))}
              className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
            />
            
            {/* Preview position indicator */}
            <div 
              className="absolute top-0 w-3 h-3 bg-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-0.5"
              style={{ left: `${(currentPreviewTime / duration) * 100}%` }}
            />
          </div>
          
          <span className="text-dark-400 text-sm font-mono w-16 text-right">
            {formatTime(duration)}
          </span>
        </div>
      </div>
      
      {/* Trim Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Start Trim */}
        <div className="p-4 bg-dark-900/50 rounded-xl border border-dark-800">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-dark-300">Start Time</label>
            <span className="text-brand-400 font-mono">{formatTime(trimStart)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, trimEnd - MIN_CLIP_LENGTH)}
            step={0.1}
            value={trimStart}
            onChange={(e) => handleStartChange(e.target.value)}
            className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
          />
          <div className="flex justify-between text-xs text-dark-500 mt-1">
            <span>0:00</span>
            <span>{formatTime(Math.max(0, trimEnd - MIN_CLIP_LENGTH))}</span>
          </div>
        </div>
        
        {/* End Trim */}
        <div className="p-4 bg-dark-900/50 rounded-xl border border-dark-800">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-dark-300">End Time</label>
            <span className="text-brand-400 font-mono">{formatTime(trimEnd)}</span>
          </div>
          <input
            type="range"
            min={Math.min(duration, trimStart + MIN_CLIP_LENGTH)}
            max={duration}
            step={0.1}
            value={trimEnd}
            onChange={(e) => handleEndChange(e.target.value)}
            className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
          />
          <div className="flex justify-between text-xs text-dark-500 mt-1">
            <span>{formatTime(Math.min(duration, trimStart + MIN_CLIP_LENGTH))}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      
      {/* Duration Summary */}
      <div className="mb-6 p-4 rounded-xl bg-dark-800/50 border border-dark-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-brand-400" />
            <div>
              <div className="text-white font-medium">Trimmed Duration</div>
              <div className="text-dark-400 text-sm">
                {formatTime(trimStart)} → {formatTime(trimEnd)}
              </div>
            </div>
          </div>
          <div className={clsx(
            'text-2xl font-bold',
            isValidTrim ? 'text-green-400' : 'text-red-400'
          )}>
            {effectiveDuration.toFixed(1)}s
          </div>
        </div>
        
        {!isValidTrim && (
          <div className="mt-3 text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Clip must be at least {MIN_CLIP_LENGTH} seconds
          </div>
        )}
      </div>
      
      {/* Quick Trim Buttons */}
      <div className="flex flex-wrap gap-2 mb-6 justify-center">
        <button
          onClick={() => { setTrimStart(0); setTrimEnd(duration); }}
          className="px-3 py-1.5 rounded-lg bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 text-sm transition-colors"
        >
          Full Video
        </button>
        <button
          onClick={() => { setTrimStart(0); setTrimEnd(Math.min(duration, 15)); }}
          className="px-3 py-1.5 rounded-lg bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 text-sm transition-colors"
        >
          First 15s
        </button>
        <button
          onClick={() => { setTrimStart(Math.max(0, duration - 15)); setTrimEnd(duration); }}
          className="px-3 py-1.5 rounded-lg bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 text-sm transition-colors"
        >
          Last 15s
        </button>
        <button
          onClick={() => { 
            const mid = duration / 2;
            setTrimStart(Math.max(0, mid - 7.5)); 
            setTrimEnd(Math.min(duration, mid + 7.5)); 
          }}
          className="px-3 py-1.5 rounded-lg bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 text-sm transition-colors"
        >
          Middle 15s
        </button>
      </div>
      
      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSkipTrim}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-dark-700 text-dark-300 hover:text-white hover:bg-dark-600 transition-colors"
        >
          Skip Trimming
          <ChevronRight className="w-5 h-5" />
        </motion.button>
        
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleContinue}
          disabled={!isValidTrim || isSaving}
          className={clsx(
            'flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-lg transition-all',
            isValidTrim && !isSaving
              ? 'bg-gradient-to-r from-brand-600 to-purple-600 text-white shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40'
              : 'bg-dark-700 text-dark-400 cursor-not-allowed'
          )}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5" />
              Continue to Anchor Selection
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </motion.button>
      </div>
      
      {/* Help text */}
      <p className="text-center text-dark-500 text-sm mt-4">
        <Info className="w-4 h-4 inline mr-1" />
        Trimming helps focus the analysis on actual wrestling action for more accurate feedback.
      </p>
    </motion.div>
  )
}
