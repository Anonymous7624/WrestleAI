import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileVideo, X, AlertCircle, CheckCircle2, Film, Repeat, Plus, ChevronUp, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
const VALID_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm']
const VALID_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm']

export default function InlineUploader({ 
  onUpload, 
  isUploading,
  isExpanded,
  onToggleExpand
}) {
  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [videoDuration, setVideoDuration] = useState(null)
  const [uploadMode, setUploadMode] = useState('new') // 'new' or 'continuation'
  const fileInputRef = useRef(null)

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

  const handleUpload = () => {
    if (file) {
      onUpload(file, uploadMode === 'continuation')
      // Clear after upload starts
      setTimeout(() => {
        setFile(null)
        setPreview(null)
        setVideoDuration(null)
      }, 500)
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
      className="border-t border-dark-700 pt-8 mt-8"
    >
      {/* Header - Always visible */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between mb-4 group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <Upload className="w-5 h-5 text-brand-400" />
          </div>
          <div className="text-left">
            <h3 className="text-lg font-semibold text-white">Upload Another Clip</h3>
            <p className="text-dark-400 text-sm">Add more footage to your session</p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          className="text-dark-400 group-hover:text-white transition-colors"
        >
          <ChevronDown className="w-5 h-5" />
        </motion.div>
      </button>

      {/* Expandable Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            {/* Mode Selector */}
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setUploadMode('new')}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all',
                  uploadMode === 'new'
                    ? 'border-brand-500 bg-brand-500/10 text-white'
                    : 'border-dark-700 bg-dark-900/50 text-dark-400 hover:border-dark-600 hover:text-white'
                )}
              >
                <Plus className="w-5 h-5" />
                <span className="font-medium">New/Unrelated</span>
              </button>
              <button
                onClick={() => setUploadMode('continuation')}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all',
                  uploadMode === 'continuation'
                    ? 'border-purple-500 bg-purple-500/10 text-white'
                    : 'border-dark-700 bg-dark-900/50 text-dark-400 hover:border-dark-600 hover:text-white'
                )}
              >
                <Repeat className="w-5 h-5" />
                <span className="font-medium">Same Match</span>
              </button>
            </div>

            {/* Mode description */}
            <div className={clsx(
              'mb-4 p-3 rounded-lg text-sm',
              uploadMode === 'continuation'
                ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                : 'bg-dark-800/50 text-dark-400'
            )}>
              {uploadMode === 'continuation' 
                ? 'This clip will be analyzed as a continuation of the same match, with context from previous clips.'
                : 'Start fresh analysis for a new or unrelated clip.'}
            </div>

            {/* Error Banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="mb-4"
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
              className={clsx(
                'relative rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden',
                isDragging
                  ? uploadMode === 'continuation'
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-brand-500 bg-brand-500/10'
                  : file
                    ? 'border-green-500/50 bg-green-500/5 cursor-default'
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
                    className="p-4"
                  >
                    <div className="flex items-center gap-4">
                      {/* Thumbnail */}
                      <div className="relative w-24 h-16 rounded-lg overflow-hidden bg-dark-800 flex-shrink-0">
                        {preview ? (
                          <img 
                            src={preview} 
                            alt="Video thumbnail" 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-6 h-6 text-dark-500" />
                          </div>
                        )}
                        {videoDuration && (
                          <span className="absolute bottom-1 right-1 text-xs font-mono bg-black/70 px-1 rounded text-white">
                            {formatDuration(videoDuration)}
                          </span>
                        )}
                      </div>

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          <span className="text-green-400 text-sm font-medium">Ready</span>
                        </div>
                        <h4 className="text-white font-medium text-sm truncate">
                          {file.name}
                        </h4>
                        <p className="text-dark-400 text-xs">
                          {formatFileSize(file.size)}
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
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="upload"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-8 text-center"
                  >
                    <Upload className={clsx(
                      'w-8 h-8 mx-auto mb-3',
                      isDragging ? 'text-brand-400' : 'text-dark-500'
                    )} />
                    <p className="text-dark-300 text-sm">
                      {isDragging ? 'Drop your video here' : 'Drag & drop or click to select'}
                    </p>
                    <p className="text-dark-500 text-xs mt-1">
                      MP4, MOV, AVI, MKV, WebM • Max 500MB
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Upload Button */}
            {file && (
              <motion.div 
                className="mt-4 flex justify-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleUpload}
                  disabled={isUploading}
                  className={clsx(
                    'flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all',
                    isUploading
                      ? 'bg-dark-700 text-dark-400 cursor-wait'
                      : uploadMode === 'continuation'
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25'
                        : 'bg-gradient-to-r from-brand-600 to-purple-600 text-white shadow-lg shadow-brand-500/25'
                  )}
                >
                  {isUploading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <FileVideo className="w-4 h-4" />
                      {uploadMode === 'continuation' ? 'Continue Analysis' : 'Start Analysis'}
                    </>
                  )}
                </motion.button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
