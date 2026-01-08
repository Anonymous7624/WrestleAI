import { motion } from 'framer-motion'
import { 
  Lightbulb, 
  MessageSquare, 
  Clock, 
  BarChart3, 
  Video 
} from 'lucide-react'
import clsx from 'clsx'

const SECTIONS = [
  { id: 'tips', label: 'Tips', icon: Lightbulb },
  { id: 'speech', label: 'Speech', icon: MessageSquare },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'metrics', label: 'Metrics', icon: BarChart3 },
  { id: 'video', label: 'Video', icon: Video },
]

export default function SectionNav({ activeSection, onSectionChange }) {
  const scrollToSection = (sectionId) => {
    onSectionChange(sectionId)
    const element = document.getElementById(`section-${sectionId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <nav className="sticky top-20 space-y-1">
      <h3 className="text-xs font-semibold text-dark-500 uppercase tracking-wider mb-4 px-3">
        Results
      </h3>
      {SECTIONS.map((section) => {
        const Icon = section.icon
        const isActive = activeSection === section.id
        
        return (
          <motion.button
            key={section.id}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => scrollToSection(section.id)}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all',
              isActive 
                ? 'bg-brand-500/20 text-brand-400 border-l-2 border-brand-500'
                : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-medium">{section.label}</span>
            {isActive && (
              <motion.div
                layoutId="activeIndicator"
                className="ml-auto w-1.5 h-1.5 bg-brand-500 rounded-full"
              />
            )}
          </motion.button>
        )
      })}
    </nav>
  )
}
