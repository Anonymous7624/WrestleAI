import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import clsx from 'clsx'

// Extract key highlights from metrics
function getHighlights(metrics) {
  const highlights = []
  
  if (metrics.knee_angle) {
    highlights.push({
      label: 'Avg Knee Angle',
      value: `${metrics.knee_angle.avg}°`,
      status: metrics.knee_angle.pct_above_threshold > 30 ? 'warning' : 'good',
      detail: `${metrics.knee_angle.pct_above_threshold}% above threshold`
    })
  }
  
  if (metrics.stance_width) {
    highlights.push({
      label: 'Avg Stance Width',
      value: metrics.stance_width.avg,
      status: metrics.stance_width.pct_below_threshold > 30 ? 'warning' : 'good',
      detail: `${metrics.stance_width.pct_below_threshold}% below threshold`
    })
  }
  
  if (metrics.hands_drop) {
    highlights.push({
      label: 'Hand Position',
      value: metrics.hands_drop.avg,
      status: metrics.hands_drop.pct_above_threshold > 30 ? 'warning' : 'good',
      detail: `${metrics.hands_drop.pct_above_threshold}% dropped`
    })
  }
  
  if (metrics.back_lean_angle) {
    highlights.push({
      label: 'Back Lean',
      value: `${metrics.back_lean_angle.avg}°`,
      status: metrics.back_lean_angle.pct_excessive > 30 ? 'warning' : 'good',
      detail: `${metrics.back_lean_angle.pct_excessive}% excessive`
    })
  }
  
  if (metrics.motion_stability) {
    const stable = metrics.motion_stability.knee_variance < 100
    highlights.push({
      label: 'Stability Score',
      value: stable ? 'Stable' : 'Unstable',
      status: stable ? 'good' : 'warning',
      detail: `Variance: ${metrics.motion_stability.knee_variance.toFixed(0)}`
    })
  }
  
  if (metrics.frames_analyzed) {
    highlights.push({
      label: 'Frames Analyzed',
      value: metrics.frames_analyzed,
      status: 'neutral',
      detail: `~${Math.round(metrics.frames_analyzed / 30)}s at 30fps`
    })
  }
  
  return highlights.slice(0, 6)
}

export default function MetricGrid({ metrics }) {
  const [showRawJson, setShowRawJson] = useState(false)
  const highlights = getHighlights(metrics)

  return (
    <div className="space-y-6">
      {/* Highlights Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {highlights.map((highlight, index) => (
          <motion.div
            key={highlight.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className={clsx(
              'relative p-4 rounded-xl border transition-all',
              'bg-dark-900/50 border-dark-700 hover:border-dark-600'
            )}
          >
            {/* Status Indicator */}
            <div className={clsx(
              'absolute top-3 right-3 w-2 h-2 rounded-full',
              highlight.status === 'good' && 'bg-green-500',
              highlight.status === 'warning' && 'bg-amber-500',
              highlight.status === 'neutral' && 'bg-dark-500'
            )} />

            <span className="text-dark-500 text-xs font-medium uppercase tracking-wide">
              {highlight.label}
            </span>
            
            <div className="mt-2 flex items-baseline gap-2">
              <span className={clsx(
                'text-2xl font-bold',
                highlight.status === 'good' && 'text-green-400',
                highlight.status === 'warning' && 'text-amber-400',
                highlight.status === 'neutral' && 'text-white'
              )}>
                {highlight.value}
              </span>
              
              {highlight.status === 'good' && (
                <TrendingUp className="w-4 h-4 text-green-500" />
              )}
              {highlight.status === 'warning' && (
                <TrendingDown className="w-4 h-4 text-amber-500" />
              )}
            </div>
            
            <p className="text-dark-500 text-xs mt-1">{highlight.detail}</p>
          </motion.div>
        ))}
      </div>

      {/* Detailed Metrics Accordion */}
      <div className="border border-dark-700 rounded-xl overflow-hidden">
        <motion.button
          onClick={() => setShowRawJson(!showRawJson)}
          className="w-full flex items-center justify-between p-4 bg-dark-900/50 hover:bg-dark-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-dark-400" />
            <span className="text-dark-300 font-medium">Raw Metrics Data</span>
          </div>
          {showRawJson ? (
            <ChevronUp className="w-5 h-5 text-dark-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-dark-400" />
          )}
        </motion.button>

        <AnimatePresence>
          {showRawJson && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-4 bg-dark-950 border-t border-dark-700">
                <pre className="text-xs text-dark-400 font-mono overflow-x-auto scrollbar-thin max-h-80">
                  {JSON.stringify(metrics, null, 2)}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
