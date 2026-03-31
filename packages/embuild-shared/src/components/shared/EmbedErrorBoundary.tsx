"use client"

import React from "react"

interface EmbedErrorBoundaryProps {
  children: React.ReactNode
}

interface EmbedErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary for embed pages
 *
 * Catches rendering errors and displays a user-friendly fallback UI
 * instead of crashing the entire embed page.
 */
export class EmbedErrorBoundary extends React.Component<
  EmbedErrorBoundaryProps,
  EmbedErrorBoundaryState
> {
  constructor(props: EmbedErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): EmbedErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console for developers
    console.error("[EmbedErrorBoundary] Rendering error caught:", {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="text-center max-w-md">
            <div className="text-red-500 font-medium mb-2">
              Er is een fout opgetreden
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Deze visualisatie kan momenteel niet worden weergegeven.
            </p>
            {typeof window !== 'undefined' &&
             (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
             this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-xs font-mono text-muted-foreground">
                  Details voor ontwikkelaars
                </summary>
                <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto">
                  {this.state.error.message}
                  {"\n\n"}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
