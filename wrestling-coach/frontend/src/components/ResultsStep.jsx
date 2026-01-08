import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { 
  Download, 
  Copy, 
  Check, 
  FileText, 
  Play,
  RefreshCw,
  Clock,
  Award
} from 'lucide-react'
import clsx from 'clsx'
import SectionNav from './SectionNav'
import TipCard from './TipCard'
import MetricGrid from './MetricGrid'

export default function ResultsStep({ results, apiBase, onNewAnalysis }) {
  const [activeSection, setActiveSection] = useState('tips')
  const [copiedSpeech, setCopiedSpeech] = useState(false)
  const sectionsRef = useRef({})

  // Intersection observer for active section tracking
  useEffect(() => {
    const observers = []
    const sectionIds = ['tips', 'speech', 'timeline', 'metrics', 'video']
    
    sectionIds.forEach(id => {
      const element = document.getElementById(`section-${id}`)
      if (element) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                setActiveSection(id)
              }
            })
          },
          { threshold: 0.3, rootMargin: '-100px 0px -50% 0px' }
        )
        observer.observe(element)
        observers.push(observer)
      }
    })

    return () => observers.forEach(obs => obs.disconnect())
  }, [])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleCopySpeech = async () => {
    if (results?.coach_speech) {
      try {
        await navigator.clipboard.writeText(results.coach_speech)
        setCopiedSpeech(true)
        setTimeout(() => setCopiedSpeech(false), 2000)
      } catch (err) {
        console.error('Failed to copy:', err)
      }
    }
  }

  const handleDownloadReport = () => {
    // Generate printable HTML report
    const reportContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Wrestler AI - Analysis Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
    h1 { font-size: 28px; margin-bottom: 8px; color: #4f46e5; }
    h2 { font-size: 20px; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
    h3 { font-size: 16px; margin-bottom: 8px; }
    p { line-height: 1.6; color: #374151; }
    .header { margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
    .subtitle { color: #6b7280; font-size: 14px; }
    .speech { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 24px; }
    .tip { margin-bottom: 20px; padding: 16px; border-left: 4px solid #4f46e5; background: #f9fafb; }
    .tip-title { font-weight: 600; font-size: 15px; margin-bottom: 8px; }
    .tip-label { font-weight: 500; color: #6b7280; font-size: 13px; }
    .timeline-item { display: flex; gap: 16px; margin-bottom: 12px; align-items: flex-start; }
    .timeline-time { background: #e5e7eb; padding: 4px 12px; border-radius: 4px; font-family: monospace; font-size: 13px; flex-shrink: 0; }
    .metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .metric { text-align: center; padding: 16px; background: #f9fafb; border-radius: 8px; }
    .metric-value { font-size: 24px; font-weight: 700; color: #4f46e5; }
    .metric-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>🥋 Wrestler AI</h1>
    <p class="subtitle">Analysis Report • ${new Date().toLocaleDateString()}</p>
  </div>

  ${results?.coach_speech ? `
  <h2>Coach's Speech</h2>
  <div class="speech">
    <p>${results.coach_speech}</p>
  </div>
  ` : ''}

  <h2>Coaching Tips</h2>
  ${results?.pointers?.map((pointer, i) => `
  <div class="tip">
    <div class="tip-title">${i + 1}. ${pointer.title}</div>
    <p><span class="tip-label">Why:</span> ${pointer.why}</p>
    <p><span class="tip-label">Fix:</span> ${pointer.fix}</p>
    ${pointer.evidence ? `<p><span class="tip-label">Evidence:</span> ${pointer.evidence}</p>` : ''}
  </div>
  `).join('') || ''}

  ${results?.timeline?.length ? `
  <h2>Timeline Events</h2>
  ${results.timeline.map(event => `
  <div class="timeline-item">
    <span class="timeline-time">${formatTime(event.timestamp)}</span>
    <span>${event.message}</span>
  </div>
  `).join('')}
  ` : ''}

  <h2>Key Metrics</h2>
  <div class="metrics-grid">
    ${results?.metrics?.knee_angle ? `
    <div class="metric">
      <div class="metric-value">${results.metrics.knee_angle.avg}°</div>
      <div class="metric-label">Avg Knee Angle</div>
    </div>
    ` : ''}
    ${results?.metrics?.stance_width ? `
    <div class="metric">
      <div class="metric-value">${results.metrics.stance_width.avg}</div>
      <div class="metric-label">Stance Width</div>
    </div>
    ` : ''}
    ${results?.metrics?.frames_analyzed ? `
    <div class="metric">
      <div class="metric-value">${results.metrics.frames_analyzed}</div>
      <div class="metric-label">Frames Analyzed</div>
    </div>
    ` : ''}
  </div>

  <div class="footer">
    <p>Generated by Wrestler AI • ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
    `

    const blob = new Blob([reportContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wrestler-ai-report-${Date.now()}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadVideo = () => {
    if (results?.annotated_video_url) {
      window.open(`${apiBase}${results.annotated_video_url}`, '_blank')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex gap-8"
    >
      {/* Sidebar Navigation */}
      <div className="hidden lg:block w-48 flex-shrink-0">
        <SectionNav 
          activeSection={activeSection} 
          onSectionChange={setActiveSection} 
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-12">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Analysis Complete</h2>
            <p className="text-dark-400 mt-1">Review your personalized coaching feedback</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onNewAnalysis}
            className="flex items-center gap-2 px-4 py-2 bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            New Analysis
          </motion.button>
        </motion.div>

        {/* Tips Section */}
        <section id="section-tips">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
              <Award className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Top Coaching Tips</h3>
              <p className="text-dark-500 text-sm">{results?.pointers?.length || 0} personalized recommendations</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {results?.pointers?.map((pointer, idx) => (
              <TipCard key={idx} pointer={pointer} index={idx} />
            ))}
          </div>
        </section>

        {/* Coach's Speech Section */}
        {results?.coach_speech && (
          <section id="section-speech">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <span className="text-xl">🎙️</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Coach's Speech</h3>
                <p className="text-dark-500 text-sm">Comprehensive feedback summary</p>
              </div>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative rounded-2xl border border-dark-700 overflow-hidden"
            >
              {/* Decorative gradient bar */}
              <div className="h-1 bg-gradient-to-r from-brand-500 via-purple-500 to-pink-500" />
              
              <div className="p-6 sm:p-8 bg-gradient-to-br from-dark-900/80 to-dark-900/40">
                <p className="text-dark-200 text-lg leading-relaxed">
                  {results.coach_speech}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 p-4 bg-dark-900/50 border-t border-dark-800">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCopySpeech}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    copiedSpeech 
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700'
                  )}
                >
                  {copiedSpeech ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy summary
                    </>
                  )}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDownloadReport}
                  className="flex items-center gap-2 px-4 py-2 bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Download report
                </motion.button>
              </div>
            </motion.div>
          </section>
        )}

        {/* Timeline Section */}
        {results?.timeline?.length > 0 && (
          <section id="section-timeline">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Timeline Events</h3>
                <p className="text-dark-500 text-sm">Key moments during your match</p>
              </div>
            </div>

            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[52px] top-0 bottom-0 w-px bg-dark-700" />
              
              <div className="space-y-4">
                {results.timeline.map((event, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-start gap-4 relative"
                  >
                    {/* Time badge */}
                    <div className="w-[88px] flex-shrink-0">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-dark-800 rounded-lg font-mono text-sm text-amber-400">
                        {formatTime(event.timestamp)}
                      </div>
                    </div>

                    {/* Dot */}
                    <div className="absolute left-[48px] top-2 w-3 h-3 rounded-full bg-dark-800 border-2 border-amber-500 z-10" />

                    {/* Content */}
                    <div className="flex-1 p-4 bg-dark-900/50 border border-dark-700 rounded-xl">
                      <p className="text-dark-200">{event.message}</p>
                      {event.duration && (
                        <span className="text-dark-500 text-xs mt-2 block">
                          Duration: {event.duration.toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Wrestling Events Section */}
        {results?.events?.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <span className="text-xl">🤼</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Wrestling Events</h3>
                <p className="text-dark-500 text-sm">Detected techniques and movements</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {results.events.map((event, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className={clsx(
                    'p-4 rounded-xl border',
                    'bg-dark-900/50 border-dark-700'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-white capitalize">
                      {event.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs bg-dark-700 text-dark-300 px-2 py-1 rounded-full">
                      {Math.round(event.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-dark-400 text-sm mb-2">{event.description}</p>
                  <span className="text-amber-400 text-xs font-mono">
                    {formatTime(event.t_start)} - {formatTime(event.t_end)}
                  </span>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Metrics Section */}
        {results?.metrics && (
          <section id="section-metrics">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <span className="text-xl">📊</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Detailed Metrics</h3>
                <p className="text-dark-500 text-sm">Technical analysis breakdown</p>
              </div>
            </div>

            <MetricGrid metrics={results.metrics} />
          </section>
        )}

        {/* Video Section */}
        <section id="section-video">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center">
              <Play className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Annotated Video</h3>
              <p className="text-dark-500 text-sm">Your footage with AI overlays</p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-dark-700 overflow-hidden bg-dark-900/50"
          >
            {/* Video Preview Placeholder */}
            <div className="aspect-video bg-dark-800 flex items-center justify-center">
              {results?.annotated_video_url ? (
                <video
                  src={`${apiBase}${results.annotated_video_url}`}
                  controls
                  className="w-full h-full"
                  poster=""
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="text-center text-dark-500">
                  <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Video preview not available</p>
                </div>
              )}
            </div>

            {/* Download Button */}
            {results?.annotated_video_url && (
              <div className="p-4 border-t border-dark-700">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDownloadVideo}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-shadow"
                >
                  <Download className="w-5 h-5" />
                  Download Annotated Video
                </motion.button>
              </div>
            )}
          </motion.div>
        </section>
      </div>
    </motion.div>
  )
}
