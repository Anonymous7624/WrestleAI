import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import clsx from 'clsx'

// Determine severity based on evidence/impact
function getSeverity(pointer) {
  const evidence = pointer.evidence?.toLowerCase() || ''
  const title = pointer.title?.toLowerCase() || ''
  
  // High severity keywords
  if (evidence.includes('consistently') || evidence.includes('excessive') || 
      evidence.includes('danger') || title.includes('critical')) {
    return 'high'
  }
  
  // Medium severity
  if (evidence.includes('often') || evidence.includes('frequently') ||
      evidence.includes('sometimes')) {
    return 'medium'
  }
  
  // Default to low
  return 'low'
}

const severityConfig = {
  high: {
    label: 'High Impact',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    textColor: 'text-red-400',
    icon: AlertTriangle,
  },
  medium: {
    label: 'Medium Impact',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-400',
    icon: AlertCircle,
  },
  low: {
    label: 'Refinement',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
    icon: Info,
  },
}

export default function TipCard({ pointer, index }) {
  const [copied, setCopied] = useState(false)
  
  const severity = getSeverity(pointer)
  const config = severityConfig[severity]
  const Icon = config.icon

  const handleCopy = async () => {
    const text = `${pointer.title}\n\nWhy: ${pointer.why}\n\nFix: ${pointer.fix}${pointer.evidence ? `\n\nEvidence: ${pointer.evidence}` : ''}`
    
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={clsx(
        'relative rounded-xl border p-5 transition-all hover:shadow-lg',
        'bg-dark-900/50 border-dark-700 hover:border-dark-600'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          {/* Number Badge */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">{index + 1}</span>
          </div>
          
          {/* Title */}
          <h4 className="text-white font-semibold text-lg leading-tight">
            {pointer.title}
          </h4>
        </div>

        {/* Severity Badge */}
        <div className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0',
          config.bgColor,
          config.textColor
        )}>
          <Icon className="w-3.5 h-3.5" />
          <span>{config.label}</span>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3 mb-4">
        <div>
          <span className="text-dark-500 text-sm font-medium">Why:</span>
          <p className="text-dark-300 mt-1">{pointer.why}</p>
        </div>
        
        <div>
          <span className="text-green-500 text-sm font-medium">Fix:</span>
          <p className="text-dark-200 mt-1">{pointer.fix}</p>
        </div>

        {pointer.evidence && (
          <div className="mt-3 p-3 rounded-lg bg-dark-800/50 border border-dark-700">
            <span className="text-dark-500 text-xs font-medium uppercase tracking-wide">Evidence</span>
            <p className="text-dark-400 text-sm font-mono mt-1">{pointer.evidence}</p>
          </div>
        )}

        {pointer.when && pointer.when !== 'N/A' && (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <span className="font-medium">When:</span>
            <span>{pointer.when}</span>
          </div>
        )}
      </div>

      {/* Copy Button */}
      <div className="flex justify-end">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleCopy}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            copied 
              ? 'bg-green-500/20 text-green-400'
              : 'bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700'
          )}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy tip
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  )
}
