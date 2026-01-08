import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Upload, 
  Film, 
  Users, 
  Target, 
  Activity, 
  Award, 
  MessageSquare, 
  Video,
  Check,
  Loader2,
  AlertCircle,
  RotateCcw
} from 'lucide-react'
import clsx from 'clsx'

const ANALYSIS_STEPS = [
  { id: 'upload', label: 'Uploading clip', icon: Upload, duration: 0 },
  { id: 'frames', label: 'Extracting frames', icon: Film, duration: 2000 },
  { id: 'detect', label: 'Detecting athletes', icon: Users, duration: 3000 },
  { id: 'track', label: 'Locking target & tracking', icon: Target, duration: 4000 },
  { id: 'pose', label: 'Running pose analysis', icon: Activity, duration: 6000 },
  { id: 'score', label: 'Scoring technique', icon: Award, duration: 3000 },
  { id: 'notes', label: 'Generating coaching notes', icon: MessageSquare, duration: 4000 },
  { id: 'render', label: 'Rendering annotated video', icon: Video, duration: 5000 },
]

export default function AnalysisStep({ 
  uploadComplete,
  analyzeStarted,
  analyzeComplete,
  error,
  onRetry
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(uploadComplete ? 1 : 0)
  const [stepProgress, setStepProgress] = useState({})
  const progressTimerRef = useRef(null)
  const stepTimerRef = useRef(null)

  // Mark upload as complete when component mounts (if upload is done)
  useEffect(() => {
    if (uploadComplete) {
      setStepProgress(prev => ({ ...prev, upload: 'complete' }))
      setCurrentStepIndex(1)
    }
  }, [uploadComplete])

  // Progress through steps during analysis
  useEffect(() => {
    if (analyzeStarted && !analyzeComplete && !error) {
      // Start progressing through simulated steps
      let stepIdx = currentStepIndex

      const advanceStep = () => {
        if (stepIdx < ANALYSIS_STEPS.length - 1) {
          // Mark current step as complete
          setStepProgress(prev => ({ 
            ...prev, 
            [ANALYSIS_STEPS[stepIdx].id]: 'complete' 
          }))
          
          // Move to next step
          stepIdx++
          setCurrentStepIndex(stepIdx)
          setStepProgress(prev => ({ 
            ...prev, 
            [ANALYSIS_STEPS[stepIdx].id]: 'active' 
          }))

          // Schedule next step (don't complete the last step)
          if (stepIdx < ANALYSIS_STEPS.length - 1) {
            stepTimerRef.current = setTimeout(advanceStep, ANALYSIS_STEPS[stepIdx].duration)
          }
        }
      }

      // Start with frames step
      setStepProgress(prev => ({ 
        ...prev, 
        [ANALYSIS_STEPS[stepIdx].id]: 'active' 
      }))
      
      stepTimerRef.current = setTimeout(advanceStep, ANALYSIS_STEPS[stepIdx].duration)

      return () => {
        if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
      }
    }
  }, [analyzeStarted, analyzeComplete, error])

  // Handle analysis completion
  useEffect(() => {
    if (analyzeComplete) {
      // Mark all steps as complete
      const allComplete = {}
      ANALYSIS_STEPS.forEach(step => {
        allComplete[step.id] = 'complete'
      })
      setStepProgress(allComplete)
      setCurrentStepIndex(ANALYSIS_STEPS.length - 1)
    }
  }, [analyzeComplete])

  // Handle error - mark current step as error
  useEffect(() => {
    if (error) {
      const currentStep = ANALYSIS_STEPS[currentStepIndex]
      if (currentStep) {
        setStepProgress(prev => ({
          ...prev,
          [currentStep.id]: 'error'
        }))
      }
    }
  }, [error, currentStepIndex])

  const getStepStatus = (stepId, index) => {
    if (stepProgress[stepId]) return stepProgress[stepId]
    if (index < currentStepIndex) return 'complete'
    if (index === currentStepIndex) return 'active'
    return 'pending'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-2xl mx-auto"
    >
      {/* Header */}
      <div className="text-center mb-8">
        <motion.h2 
          className="text-2xl sm:text-3xl font-bold text-white mb-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Analysis in Progress
        </motion.h2>
        <motion.p 
          className="text-dark-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {error 
            ? 'Something went wrong during analysis'
            : analyzeComplete 
              ? 'Analysis complete!'
              : 'Our AI is examining your technique...'}
        </motion.p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
          <motion.div
            className={clsx(
              'h-full rounded-full',
              error 
                ? 'bg-red-500'
                : analyzeComplete 
                  ? 'bg-green-500'
                  : 'bg-gradient-to-r from-brand-500 to-purple-500'
            )}
            initial={{ width: '5%' }}
            animate={{ 
              width: error 
                ? `${((currentStepIndex + 1) / ANALYSIS_STEPS.length) * 100}%`
                : analyzeComplete 
                  ? '100%' 
                  : `${((currentStepIndex + 0.5) / ANALYSIS_STEPS.length) * 100}%`
            }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-dark-500">
          <span>Starting</span>
          <span>{Math.round(((currentStepIndex + 1) / ANALYSIS_STEPS.length) * 100)}%</span>
          <span>Complete</span>
        </div>
      </div>

      {/* Steps List */}
      <div className="bg-dark-900/50 border border-dark-800 rounded-2xl p-6 mb-8">
        <div className="space-y-1">
          {ANALYSIS_STEPS.map((step, index) => {
            const status = getStepStatus(step.id, index)
            const Icon = step.icon
            
            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={clsx(
                  'flex items-center gap-4 p-3 rounded-xl transition-colors',
                  status === 'active' && 'bg-brand-500/10',
                  status === 'error' && 'bg-red-500/10'
                )}
              >
                {/* Status Icon */}
                <div className={clsx(
                  'w-10 h-10 rounded-xl flex items-center justify-center transition-all',
                  status === 'complete' && 'bg-green-500/20 text-green-400',
                  status === 'active' && 'bg-brand-500/20 text-brand-400',
                  status === 'error' && 'bg-red-500/20 text-red-400',
                  status === 'pending' && 'bg-dark-800 text-dark-500'
                )}>
                  <AnimatePresence mode="wait">
                    {status === 'complete' ? (
                      <motion.div
                        key="check"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                      >
                        <Check className="w-5 h-5" />
                      </motion.div>
                    ) : status === 'active' ? (
                      <motion.div
                        key="loader"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <Loader2 className="w-5 h-5" />
                      </motion.div>
                    ) : status === 'error' ? (
                      <motion.div
                        key="error"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <AlertCircle className="w-5 h-5" />
                      </motion.div>
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </AnimatePresence>
                </div>

                {/* Label */}
                <div className="flex-1">
                  <span className={clsx(
                    'font-medium transition-colors',
                    status === 'complete' && 'text-green-400',
                    status === 'active' && 'text-white',
                    status === 'error' && 'text-red-400',
                    status === 'pending' && 'text-dark-500'
                  )}>
                    {step.label}
                  </span>
                </div>

                {/* Status Badge */}
                {status === 'active' && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-xs font-medium text-brand-400 bg-brand-500/20 px-2 py-1 rounded-full"
                  >
                    Processing
                  </motion.span>
                )}
                {status === 'complete' && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-xs font-medium text-green-400"
                  >
                    Done
                  </motion.span>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Error State */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center"
          >
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 mb-6">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-red-400 font-semibold text-lg mb-2">Analysis Failed</h3>
              <p className="text-dark-400 mb-4">{error}</p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onRetry}
                className="inline-flex items-center gap-2 px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl font-semibold transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                Try Again
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated Background Elements */}
      {!error && !analyzeComplete && (
        <div className="relative h-20 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-brand-500/30 rounded-full"
              initial={{ 
                x: Math.random() * 100 + '%', 
                y: 100,
                opacity: 0 
              }}
              animate={{ 
                y: -20,
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 2 + Math.random() * 2,
                repeat: Infinity,
                delay: i * 0.5,
                ease: 'easeOut'
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}
