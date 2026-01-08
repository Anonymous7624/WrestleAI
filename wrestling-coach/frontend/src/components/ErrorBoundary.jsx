import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * ErrorBoundary component to catch JavaScript errors in child components
 * and display a friendly fallback UI with a reset button.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Log the error for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    // Clear the error state
    this.setState({ hasError: false, error: null, errorInfo: null })
    
    // Call the onReset callback if provided (e.g., handleClearChat)
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-dark-900 border border-dark-800 rounded-2xl p-8 text-center shadow-xl">
            {/* Error Icon */}
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-2">
              Something went wrong
            </h2>

            {/* Description */}
            <p className="text-dark-400 mb-6">
              An unexpected error occurred. Click the button below to reset and try again.
            </p>

            {/* Error details (collapsed) */}
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-dark-500 text-sm cursor-pointer hover:text-dark-400 transition-colors">
                  View error details
                </summary>
                <div className="mt-2 p-3 bg-dark-800 rounded-lg overflow-auto max-h-32">
                  <code className="text-xs text-red-400 whitespace-pre-wrap">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack && (
                      <span className="text-dark-500">
                        {this.state.errorInfo.componentStack}
                      </span>
                    )}
                  </code>
                </div>
              </details>
            )}

            {/* Reset Button */}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-brand-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-brand-500/25 transition-all"
            >
              <RefreshCw className="w-5 h-5" />
              Reset App
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
