'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Blast-radius container for the `ssr:false` recharts surfaces. A stale-chunk /
 * element-type error inside a dynamically-loaded chart used to escape to the
 * root error boundary as React #130 and take down the whole app; here it
 * degrades to a small retry card, so a chart failure is never fatal.
 */
export class WidgetBoundary extends Component<
  { children: ReactNode; label?: string; minHeight?: number },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('[WidgetBoundary]', this.props.label ?? 'widget', error)
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="helix-card flex flex-col items-center justify-center gap-2 text-center"
          style={{ minHeight: this.props.minHeight ?? 160 }}>
          <AlertTriangle className="w-5 h-5 text-warn" aria-hidden="true" />
          <p className="text-fluid-xs text-muted">{this.props.label ?? 'This widget'} couldn&apos;t load.</p>
          <button type="button" onClick={() => this.setState({ failed: false })}
            className="btn-glass min-h-[36px] text-fluid-xs">
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
