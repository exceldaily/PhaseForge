'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    return { hasError: true, message }
  }

  override componentDidCatch() {
    // Error is already captured in state — extend here to send to a monitoring service
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="rounded-full bg-red-100 p-4">
            <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Something went wrong</p>
            <p className="mt-1 text-xs text-slate-500">{this.state.message}</p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
