import { Component } from 'react'

/**
 * Renders `fallback` instead of crashing when a child throws - most importantly when a
 * remote asset (the Bloxity avatar CDN) is unreachable, which would otherwise take the
 * whole canvas down with it.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.warn('[game] component failed, using fallback:', error)
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

export default ErrorBoundary
