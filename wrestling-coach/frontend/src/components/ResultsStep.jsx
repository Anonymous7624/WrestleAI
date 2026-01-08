import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Download, 
  Copy, 
  Check, 
  FileText, 
  Play,
  Clock,
  Award,
  ChevronDown,
  ChevronUp,
  Plus,
  ArrowDown,
  Layers,
  Target,
  Repeat,
  AlertTriangle
} from 'lucide-react'
import clsx from 'clsx'
import SectionNav from './SectionNav'
import TipCard from './TipCard'
import MetricGrid from './MetricGrid'

// Format time from seconds to MM:SS
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Format duration for display
function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '--'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

// Session Summary Panel component
function SessionSummary({ session, onCopySummary }) {
  const [copied, setCopied] = useState(false)
  const { analyses, matchContext } = session
  
  const totalClips = analyses.length
  const totalTips = analyses.reduce((sum, a) => sum + (a.pointers?.length || 0), 0)
  const totalEvents = analyses.reduce((sum, a) => sum + (a.events?.length || 0), 0)
  
  // Get top recurring issues (issues that appeared in 2+ clips)
  const recurringIssues = Object.entries(matchContext.recurringIssues || {})
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
  
  const handleCopy = async () => {
    const summary = buildSessionSummaryText(session)
    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-dark-700 bg-gradient-to-br from-dark-900/80 to-dark-900/40 overflow-hidden mb-8"
    >
      {/* Gradient bar */}
      <div className="h-1 bg-gradient-to-r from-brand-500 via-purple-500 to-pink-500" />
      
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
              <Layers className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Session Summary</h3>
              <p className="text-dark-500 text-sm">{totalClips} clip{totalClips !== 1 ? 's' : ''} analyzed</p>
            </div>
          </div>
          
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCopy}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              copied 
                ? 'bg-green-500/20 text-green-400'
                : 'bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700'
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
                Copy Summary
              </>
            )}
          </motion.button>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div className="p-3 bg-dark-800/50 rounded-xl text-center">
            <div className="text-2xl font-bold text-brand-400">{totalClips}</div>
            <div className="text-xs text-dark-500 uppercase">Clips</div>
          </div>
          <div className="p-3 bg-dark-800/50 rounded-xl text-center">
            <div className="text-2xl font-bold text-purple-400">{totalTips}</div>
            <div className="text-xs text-dark-500 uppercase">Tips</div>
          </div>
          <div className="p-3 bg-dark-800/50 rounded-xl text-center">
            <div className="text-2xl font-bold text-amber-400">{totalEvents}</div>
            <div className="text-xs text-dark-500 uppercase">Events</div>
          </div>
          <div className="p-3 bg-dark-800/50 rounded-xl text-center">
            <div className="text-2xl font-bold text-green-400">{matchContext.totalShotAttempts || 0}</div>
            <div className="text-xs text-dark-500 uppercase">Shots</div>
          </div>
        </div>
        
        {/* Recurring Issues */}
        {recurringIssues.length > 0 && (
          <div className="border-t border-dark-700 pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-dark-300">Recurring Issues</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recurringIssues.map(([issue, count]) => (
                <span 
                  key={issue}
                  className="px-3 py-1 bg-amber-500/10 text-amber-400 text-sm rounded-full border border-amber-500/20"
                >
                  {issue} ({count}x)
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// Build text summary for copying
function buildSessionSummaryText(session) {
  const { analyses, matchContext } = session
  const lines = [
    '🥋 WRESTLER AI SESSION SUMMARY',
    '================================',
    '',
    `📊 Total Clips Analyzed: ${analyses.length}`,
    `💡 Total Tips Generated: ${analyses.reduce((sum, a) => sum + (a.pointers?.length || 0), 0)}`,
    `🎯 Total Events Detected: ${analyses.reduce((sum, a) => sum + (a.events?.length || 0), 0)}`,
    `🤼 Shot Attempts: ${matchContext.totalShotAttempts || 0}`,
    '',
  ]
  
  const recurring = Object.entries(matchContext.recurringIssues || {})
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
  
  if (recurring.length > 0) {
    lines.push('⚠️ RECURRING ISSUES:')
    recurring.forEach(([issue, count]) => {
      lines.push(`  • ${issue} (${count}x)`)
    })
    lines.push('')
  }
  
  lines.push('CLIP DETAILS:')
  analyses.forEach((analysis, idx) => {
    lines.push(`\n--- Clip ${idx + 1} ${analysis.isContinuation ? '(Continuation)' : '(New)'} ---`)
    lines.push(`Tips: ${analysis.pointers?.length || 0}`)
    lines.push(`Events: ${analysis.events?.length || 0}`)
    if (analysis.coach_speech) {
      lines.push(`Coach: ${analysis.coach_speech.slice(0, 150)}...`)
    }
  })
  
  lines.push('\n================================')
  lines.push(`Generated: ${new Date().toLocaleString()}`)
  
  return lines.join('\n')
}

// Collapsible Analysis Card component
function AnalysisCard({ analysis, index, isExpanded, onToggle, apiBase, isLatest }) {
  const [copiedSpeech, setCopiedSpeech] = useState(false)
  
  const tipCount = analysis.pointers?.length || 0
  const eventCount = analysis.events?.length || 0
  const duration = formatDuration(analysis.duration_analyzed)
  
  const handleCopySpeech = async () => {
    if (analysis.coach_speech) {
      try {
        await navigator.clipboard.writeText(analysis.coach_speech)
        setCopiedSpeech(true)
        setTimeout(() => setCopiedSpeech(false), 2000)
      } catch (err) {
        console.error('Failed to copy:', err)
      }
    }
  }
  
  const handleDownloadReport = () => {
    // Generate printable HTML report for this clip
    const reportContent = generateClipReport(analysis, index)
    const blob = new Blob([reportContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wrestler-ai-clip-${index + 1}-${Date.now()}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  return (
    <motion.div
      id={`analysis-${index}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={clsx(
        'rounded-2xl border overflow-hidden transition-colors',
        isLatest ? 'border-brand-500/50 ring-2 ring-brand-500/20' : 'border-dark-700',
        'bg-dark-900/50'
      )}
    >
      {/* Card Header - Always visible */}
      <button
        onClick={onToggle}
        className="w-full p-4 sm:p-6 flex items-center justify-between hover:bg-dark-800/30 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className={clsx(
            'w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold',
            analysis.isContinuation 
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-brand-500/20 text-brand-400'
          )}>
            {index + 1}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">
                Clip {index + 1}
              </h3>
              {analysis.isContinuation && (
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                  Continuation
                </span>
              )}
              {isLatest && (
                <span className="px-2 py-0.5 bg-brand-500/20 text-brand-400 text-xs rounded-full">
                  Latest
                </span>
              )}
            </div>
            <p className="text-dark-400 text-sm mt-1">
              {duration} analyzed • {tipCount} tips • {eventCount} events
            </p>
          </div>
        </div>
        
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-dark-400" />
        </motion.div>
      </button>
      
      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 sm:px-6 pb-6 space-y-8 border-t border-dark-700 pt-6">
              {/* Tips Section */}
              {analysis.pointers?.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
                      <Award className="w-4 h-4 text-brand-400" />
                    </div>
                    <h4 className="font-semibold text-white">Coaching Tips</h4>
                  </div>
                  <div className="space-y-3">
                    {analysis.pointers.map((pointer, idx) => (
                      <TipCard key={idx} pointer={pointer} index={idx} />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Coach's Speech */}
              {analysis.coach_speech && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <span className="text-lg">🎙️</span>
                    </div>
                    <h4 className="font-semibold text-white">Coach's Speech</h4>
                  </div>
                  <div className="p-4 bg-dark-800/50 rounded-xl border border-dark-700">
                    <p className="text-dark-200 leading-relaxed">{analysis.coach_speech}</p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleCopySpeech}
                      className={clsx(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
                        copiedSpeech 
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-dark-800 text-dark-400 hover:text-white'
                      )}
                    >
                      {copiedSpeech ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedSpeech ? 'Copied!' : 'Copy'}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleDownloadReport}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-dark-800 text-dark-400 hover:text-white transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      Report
                    </motion.button>
                  </div>
                </div>
              )}
              
              {/* Timeline Events */}
              {analysis.timeline?.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-amber-400" />
                    </div>
                    <h4 className="font-semibold text-white">Timeline</h4>
                  </div>
                  <div className="space-y-2">
                    {analysis.timeline.map((event, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-dark-800/30 rounded-lg">
                        <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs font-mono rounded">
                          {formatTime(event.timestamp)}
                        </span>
                        <span className="text-dark-300 text-sm">{event.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Wrestling Events */}
              {analysis.events?.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <span className="text-lg">🤼</span>
                    </div>
                    <h4 className="font-semibold text-white">Wrestling Events</h4>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {analysis.events.map((event, idx) => (
                      <div key={idx} className="p-3 bg-dark-800/30 rounded-lg border border-dark-700">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-white capitalize">
                            {event.type?.replace(/_/g, ' ') || 'Event'}
                          </span>
                          <span className="text-xs bg-dark-700 text-dark-300 px-2 py-0.5 rounded">
                            {Math.round((event.confidence || 0) * 100)}%
                          </span>
                        </div>
                        <p className="text-dark-400 text-sm">{event.description}</p>
                        <span className="text-amber-400 text-xs font-mono">
                          {formatTime(event.t_start)} - {formatTime(event.t_end)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Metrics */}
              {analysis.metrics && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <span className="text-lg">📊</span>
                    </div>
                    <h4 className="font-semibold text-white">Metrics</h4>
                  </div>
                  <MetricGrid metrics={analysis.metrics} />
                </div>
              )}
              
              {/* Video */}
              {analysis.annotated_video_url && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center">
                      <Play className="w-4 h-4 text-pink-400" />
                    </div>
                    <h4 className="font-semibold text-white">Annotated Video</h4>
                  </div>
                  <div className="rounded-xl overflow-hidden bg-dark-800">
                    <video
                      src={`${apiBase}${analysis.annotated_video_url}`}
                      controls
                      className="w-full"
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => window.open(`${apiBase}${analysis.annotated_video_url}`, '_blank')}
                    className="mt-3 flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download Video
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Generate HTML report for a single clip
function generateClipReport(analysis, index) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Wrestler AI - Clip ${index + 1} Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
    h1 { font-size: 28px; margin-bottom: 8px; color: #4f46e5; }
    h2 { font-size: 20px; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
    p { line-height: 1.6; color: #374151; }
    .header { margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
    .subtitle { color: #6b7280; font-size: 14px; }
    .speech { background: #f9fafb; padding: 20px; border-radius: 8px; }
    .tip { margin-bottom: 20px; padding: 16px; border-left: 4px solid #4f46e5; background: #f9fafb; }
    .tip-title { font-weight: 600; font-size: 15px; margin-bottom: 8px; }
    .tip-label { font-weight: 500; color: #6b7280; font-size: 13px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🥋 Wrestler AI - Clip ${index + 1}</h1>
    <p class="subtitle">${analysis.isContinuation ? 'Continuation clip' : 'New analysis'} • ${new Date(analysis.timestamp).toLocaleDateString()}</p>
  </div>

  ${analysis.coach_speech ? `
  <h2>Coach's Speech</h2>
  <div class="speech">
    <p>${analysis.coach_speech}</p>
  </div>
  ` : ''}

  <h2>Coaching Tips</h2>
  ${analysis.pointers?.map((pointer, i) => `
  <div class="tip">
    <div class="tip-title">${i + 1}. ${pointer.title}</div>
    <p><span class="tip-label">Why:</span> ${pointer.why}</p>
    <p><span class="tip-label">Fix:</span> ${pointer.fix}</p>
    ${pointer.evidence ? `<p><span class="tip-label">Evidence:</span> ${pointer.evidence}</p>` : ''}
  </div>
  `).join('') || '<p>No tips generated.</p>'}

  <div class="footer">
    <p>Generated by Wrestler AI • ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `
}

export default function ResultsStep({ session, apiBase, onUploadAnother, onUploadContinuation }) {
  const [expandedCards, setExpandedCards] = useState(() => {
    // By default, expand the latest card
    const lastIndex = session.analyses.length - 1
    return new Set([lastIndex])
  })
  const latestRef = useRef(null)
  
  const toggleCard = (index) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }
  
  const scrollToLatest = () => {
    const latestIndex = session.analyses.length - 1
    const element = document.getElementById(`analysis-${latestIndex}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Also expand it if not already
      setExpandedCards(prev => new Set(prev).add(latestIndex))
    }
  }
  
  const expandAll = () => {
    setExpandedCards(new Set(session.analyses.map((_, i) => i)))
  }
  
  const collapseAll = () => {
    setExpandedCards(new Set())
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto"
    >
      {/* Session Summary */}
      <SessionSummary session={session} />
      
      {/* Session Timeline Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Session Timeline</h2>
          <p className="text-dark-400 mt-1">
            {session.analyses.length} analysis{session.analyses.length !== 1 ? 'es' : ''} in this session
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {session.analyses.length > 1 && (
            <>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={scrollToLatest}
                className="flex items-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white rounded-lg text-sm transition-colors"
              >
                <ArrowDown className="w-4 h-4" />
                Jump to Latest
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={expandedCards.size === session.analyses.length ? collapseAll : expandAll}
                className="flex items-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white rounded-lg text-sm transition-colors"
              >
                {expandedCards.size === session.analyses.length ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Collapse All
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Expand All
                  </>
                )}
              </motion.button>
            </>
          )}
        </div>
      </div>
      
      {/* Analysis Cards */}
      <div className="space-y-4 mb-8">
        {session.analyses.map((analysis, index) => (
          <AnalysisCard
            key={`${analysis.job_id}-${index}`}
            analysis={analysis}
            index={index}
            isExpanded={expandedCards.has(index)}
            onToggle={() => toggleCard(index)}
            apiBase={apiBase}
            isLatest={index === session.analyses.length - 1}
          />
        ))}
      </div>
      
      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="border-t border-dark-700 pt-8"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Continue Analyzing</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Upload Another (New Analysis) */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onUploadAnother}
            className="flex items-center gap-4 p-4 rounded-xl border border-dark-700 bg-dark-900/50 hover:bg-dark-800/50 transition-colors text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-brand-500/20 flex items-center justify-center flex-shrink-0">
              <Plus className="w-6 h-6 text-brand-400" />
            </div>
            <div>
              <h4 className="font-semibold text-white">Upload Another</h4>
              <p className="text-dark-400 text-sm mt-0.5">
                Start a new, unrelated analysis
              </p>
            </div>
          </motion.button>
          
          {/* Upload Continuation */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onUploadContinuation}
            className="flex items-center gap-4 p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 transition-colors text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Repeat className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h4 className="font-semibold text-white">Upload Next Part</h4>
              <p className="text-purple-300/70 text-sm mt-0.5">
                Continue the same match
              </p>
            </div>
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}
