import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sun, Moon, Upload, BarChart3 } from 'lucide-react'
import clsx from 'clsx'

export default function Header({ currentStep, onNavigate, hasResults }) {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wrestlerAI-darkMode') !== 'false'
    }
    return true
  })

  useEffect(() => {
    localStorage.setItem('wrestlerAI-darkMode', darkMode)
    if (darkMode) {
      document.body.classList.remove('light')
    } else {
      document.body.classList.add('light')
    }
  }, [darkMode])

  return (
    <header className={clsx(
      'sticky top-0 z-50 backdrop-blur-lg border-b',
      darkMode 
        ? 'bg-dark-950/80 border-dark-800' 
        : 'bg-white/80 border-gray-200'
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <motion.div 
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="relative">
              <span className="text-2xl">🥋</span>
              <motion.div 
                className="absolute -bottom-1 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-500 to-purple-500 rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              />
            </div>
            <div>
              <h1 className={clsx(
                'text-xl font-bold tracking-tight',
                darkMode ? 'text-white' : 'text-gray-900'
              )}>
                Wrestler AI
              </h1>
              <div className="h-0.5 w-full bg-gradient-to-r from-brand-500 via-purple-500 to-pink-500 rounded-full opacity-60" />
            </div>
          </motion.div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onNavigate('upload')}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                currentStep === 'upload'
                  ? 'bg-brand-600 text-white'
                  : darkMode
                    ? 'text-dark-300 hover:text-white hover:bg-dark-800'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              )}
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload</span>
            </motion.button>

            {hasResults && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onNavigate('results')}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  currentStep === 'results'
                    ? 'bg-brand-600 text-white'
                    : darkMode
                      ? 'text-dark-300 hover:text-white hover:bg-dark-800'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Results</span>
              </motion.button>
            )}

            {/* Dark Mode Toggle */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setDarkMode(!darkMode)}
              className={clsx(
                'p-2 rounded-lg transition-colors ml-2',
                darkMode 
                  ? 'text-dark-400 hover:text-yellow-400 hover:bg-dark-800' 
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              )}
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </header>
  )
}
