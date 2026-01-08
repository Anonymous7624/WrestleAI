import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileVideo, X, AlertCircle, CheckCircle2, Film, ArrowLeft, Repeat } from 'lucide-react'
import clsx from 'clsx'

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
const VALID_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm']
const VALID_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm']

export default function UploadStep({ 
  onUpload, 
  isUploading, 
  isContinuationMode = false,
  hasExistingAnalyses = false,
  onBackToResults
}) {
  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [videoDuration, setVideoDuration] = useState(null)
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)

  // Generate video preview thumbnail
  useEffect(() => {
    if (file) {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        setVideoDuration(video.duration)
        video.currentTime = Math.min(1, video.duration / 4)
      }
      video.onseeked = () => {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0)
        setPreview(canvas.toDataURL('image/jpeg', 0.8))
        URL.revokeObjectURL(video.src)
      }
      video.src = URL.createObjectURL(file)
    } else {
      setPreview(null)
      setVideoDuration(null)
    }
  }, [file])

  const validateFile = (selectedFile) => {
    const ext = selectedFile.name.split('.').pop().toLowerCase()
    
    if (!VALID_TYPES.includes(selectedFile.type) && !VALID_EXTENSIONS.includes(ext)) {
      return 'Invalid file type. Please upload MP4, MOV, AVI, MKV, or WebM.'
    }
    
    if (selectedFile.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`
    }
    
    return null
  }

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return
    
    const validationError = validateFile(selectedFile)
    if (validationError) {
      setError(validationError)
      setFile(null)
      return
    }
    
    setError(null)
    setFile(selectedFile)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    handleFileSelect(droppedFile)
  }

  const handleClear = () => {
    setFile(null)
    setError(null)
    setPreview(null)
    setVideoDuration(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-2xl mx-auto"
    >
      {/* Back to Results button (when we have existing analyses) */}
      {hasExistingAnalyses && (
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBackToResults}
          className="flex items-center gap-2 text-dark-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Results
        </motion.button>
      )}

      {/* Continuation Mode Banner */}
      {isContinuationMode && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl bg-purple-500/10 border border-purple-500/30"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Repeat className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-purple-300">Continuation Mode</h3>
              <p className="text-purple-300/70 text-sm">
                This clip will be analyzed as the next part of the same match
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Hero Section */}
      <div className="text-center mb-8">
        <motion.h2 
          className="text-3xl sm:text-4xl font-bold text-white mb-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {isContinuationMode 
            ? 'Upload Next Clip' 
            : hasExistingAnalyses 
              ? 'Upload Another Video'
              : 'Upload Your Wrestling Footage'
          }
        </motion.h2>
        <motion.p 
          className="text-dark-400 text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {isContinuationMode 
            ? 'Continue where you left off'
            : 'Get AI-powered technique analysis in seconds'
          }
        </motion.p>
      </div>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="mb-6"
          >
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
              <button 
                onClick={() => setError(null)}
                className="ml-auto p-1 hover:bg-red-500/20 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drop Zone */}
      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
        whileHover={!file ? { scale: 1.01 } : {}}
        className={clsx(
          'relative rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden',
          isDragging
            ? isContinuationMode 
              ? 'border-purple-500 bg-purple-500/10 scale-[1.02]'
              : 'border-brand-500 bg-brand-500/10 scale-[1.02]'
            : file
              ? 'border-green-500/50 bg-green-500/5 cursor-default'
              : isContinuationMode
                ? 'border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50 hover:bg-purple-500/10'
                : 'border-dark-600 bg-dark-900/50 hover:border-brand-500/50 hover:bg-dark-800/50'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
          onChange={(e) => handleFileSelect(e.target.files[0])}
          className="hidden"
        />

        <AnimatePresence mode="wait">
          {file ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6"
            >
              {/* Video Preview Card */}
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Thumbnail */}
                <div className="relative w-full sm:w-48 h-32 rounded-xl overflow-hidden bg-dark-800 flex-shrink-0">
                  {preview ? (
                    <img 
                      src={preview} 
                      alt="Video thumbnail" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-10 h-10 text-dark-500" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  {videoDuration && (
                    <span className="absolute bottom-2 right-2 text-xs font-mono bg-black/70 px-2 py-0.5 rounded text-white">
                      {formatDuration(videoDuration)}
                    </span>
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-green-400 text-sm font-medium">Ready to analyze</span>
                  </div>
                  <h3 className="text-white font-semibold text-lg truncate max-w-xs">
                    {file.name}
                  </h3>
                  <p className="text-dark-400 text-sm mt-1">
                    {formatFileSize(file.size)}
                    {videoDuration && ` • ${formatDuration(videoDuration)} duration`}
                  </p>
                </div>

                {/* Clear Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleClear()
                  }}
                  className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-12 sm:p-16 text-center"
            >
              <motion.div
                animate={isDragging ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
                className={clsx(
                  'inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6',
                  isContinuationMode ? 'bg-purple-500/10' : 'bg-brand-500/10'
                )}
              >
                <Upload className={clsx(
                  'w-8 h-8 transition-colors',
                  isDragging 
                    ? isContinuationMode ? 'text-purple-400' : 'text-brand-400'
                    : isContinuationMode ? 'text-purple-500' : 'text-brand-500'
                )} />
              </motion.div>
              
              <h3 className="text-white font-semibold text-xl mb-2">
                {isDragging ? 'Drop your video here' : 'Drag & drop your video'}
              </h3>
              <p className="text-dark-400 mb-4">
                or <span className={clsx(
                  'cursor-pointer',
                  isContinuationMode 
                    ? 'text-purple-400 hover:text-purple-300' 
                    : 'text-brand-400 hover:text-brand-300'
                )}>browse files</span>
              </p>
              <p className="text-dark-500 text-sm">
                Supports MP4, MOV, AVI, MKV, WebM • Max 500MB
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Animated border effect on drag */}
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={clsx(
              'absolute inset-0 border-2 rounded-2xl pointer-events-none',
              isContinuationMode ? 'border-purple-500' : 'border-brand-500'
            )}
            style={{
              background: isContinuationMode 
                ? 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.1), transparent)'
                : 'linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.1), transparent)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }}
          />
        )}
      </motion.div>

      {/* Upload Button */}
      <motion.div 
        className="mt-6 flex justify-center gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => file && onUpload(file)}
          disabled={!file || isUploading}
          className={clsx(
            'flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-base transition-all',
            file && !isUploading
              ? isContinuationMode
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40'
                : 'bg-gradient-to-r from-brand-600 to-purple-600 text-white shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40'
              : 'bg-dark-700 text-dark-400 cursor-not-allowed'
          )}
        >
          {isUploading ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
              />
              Uploading...
            </>
          ) : (
            <>
              <FileVideo className="w-5 h-5" />
              {isContinuationMode ? 'Continue Analysis' : 'Start Analysis'}
            </>
          )}
        </motion.button>
      </motion.div>

      {/* Features Grid (only show on fresh start) */}
      {!hasExistingAnalyses && (
        <motion.div 
          className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {[
            { icon: '🎯', title: 'Target Tracking', desc: 'AI follows your movement' },
            { icon: '📐', title: 'Pose Analysis', desc: 'Joint angles & posture' },
            { icon: '💡', title: 'Smart Tips', desc: 'Actionable coaching advice' },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.1 }}
              className="text-center p-4 rounded-xl bg-dark-900/50 border border-dark-800"
            >
              <span className="text-2xl mb-2 block">{feature.icon}</span>
              <h4 className="text-white font-medium text-sm">{feature.title}</h4>
              <p className="text-dark-500 text-xs mt-1">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}
