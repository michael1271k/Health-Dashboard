'use client'

import { useState } from 'react'
import { ExternalLink, Send } from 'lucide-react'
import { authedFetch } from '@/lib/utils/authedFetch'

type ExportState = { phase: 'idle' | 'sending' | 'done' | 'error'; url?: string | null; message?: string }

/**
 * One-tap curated day export to the user's Notion daily-log database.
 * Stateless: each tap creates a fresh Notion page (documented v1 behavior).
 */
export function ExportToNotionButton({ date, compact = false }: { date: string; compact?: boolean }) {
  const [state, setState] = useState<ExportState>({ phase: 'idle' })

  const run = async () => {
    setState({ phase: 'sending' })
    try {
      const res = await authedFetch('/api/notion/export-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const data = await res.json() as { pageUrl?: string | null; error?: string }
      if (!res.ok) throw new Error(data.error ?? `Export failed (${res.status})`)
      setState({ phase: 'done', url: data.pageUrl })
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : 'Export failed' })
    }
  }

  if (state.phase === 'done') {
    return state.url ? (
      <a href={state.url} target="_blank" rel="noreferrer"
        className={`btn-glass justify-center min-h-[44px] ${compact ? '' : 'w-full'}`}
        style={{ color: '#16F5C3' }}>
        <ExternalLink className="w-4 h-4" /> Open in Notion
      </a>
    ) : (
      <span className="text-fluid-xs" style={{ color: '#16F5C3' }}>Exported ✓</span>
    )
  }

  return (
    <div className={compact ? '' : 'space-y-1'}>
      <button onClick={run} disabled={state.phase === 'sending'}
        className={`btn-glass justify-center min-h-[44px] disabled:opacity-50 ${compact ? '' : 'w-full'}`}>
        <Send className="w-4 h-4" />
        {state.phase === 'sending' ? 'Exporting…' : 'Export to Notion'}
      </button>
      {state.phase === 'error' && <p className="text-danger text-fluid-xs" role="alert">{state.message}</p>}
    </div>
  )
}
