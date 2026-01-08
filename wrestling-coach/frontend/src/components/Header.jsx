import { motion } from 'framer-motion'
import { Trash2 } from 'lucide-react'

export default function Header({ onLogoClick, onClearChat }) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-lg border-b bg-dark-950/80 border-dark-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo - Clickable to go home */}
          <motion.button 
            className="flex items-center gap-3 cursor-pointer"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            onClick={onLogoClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
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
              <h1 className="text-xl font-bold tracking-tight text-white">
                Wrestler AI
              </h1>
              <div className="h-0.5 w-full bg-gradient-to-r from-brand-500 via-purple-500 to-pink-500 rounded-full opacity-60" />
            </div>
          </motion.button>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            {/* Clear Chat Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClearChat}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 hover:border-red-500/50"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear Chat</span>
            </motion.button>
          </div>
        </div>
      </div>
    </header>
  )
}
