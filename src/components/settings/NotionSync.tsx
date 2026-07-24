'use client'

import { useEffect, useState } from 'react'
import { Send, Check, ExternalLink } from 'lucide-react'
import { authedFetch } from '@/lib/utils/authedFetch'

type Result = { exported: number; skipped: number; failed: { date: string; error: string }[]; remaining: number }

/**
 * Bulk Notion sync — one button that batch-exports every logged day not yet in
 * Notion. Resumable: shows the remaining count and re-runs until clear.
 */
export function NotionSync() {
  const [pending, setPending] = useState<number | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadPending = async () => {
    try {
      const res = await authedFetch('/api/notion/sync-all', { method: 'GET' })
      const data = await res.json() as { configured?: boolean; pending?: number | null }
      setConfigured(data.configured ?? false)
      setPending(data.pending ?? null)
    } catch { setConfigured(false) }
  }
  useEffect(() => { void loadPending() }, [])

  const run = async (force = false) => {
    setRunning(true); setError(null)
    try {
      const res = await authedFetch('/api/notion/sync-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const data = await res.json() as Result & { error?: string }
      if (!res.ok) throw new Error(data.error ?? `Sync failed (${res.status})`)
      setResult(data)
      await loadPending()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally { setRunning(false) }
  }

  return (
    <section className="helix-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text">Integrations</h2>
        {configured === false && <span className="text-[11px] text-warn">Notion not configured</span>}
      </div>
      <p className="text-fluid-xs text-muted">
        Push a curated one-page summary (macros · training · sleep · effort) for every logged day to your Notion database.
        {pending != null && <> <span className="text-primary font-semibold">{pending}</span> day{pending === 1 ? '' : 's'} pending.</>}
      </p>

      {/* Primary: UPSERT every logged day + its metrics into the Daily Logs DB. */}
      <button onClick={() => run(true)} disabled={running || configured === false}
        className="btn-primary w-full justify-center min-h-[46px] disabled:opacity-50">
        {running ? 'Syncing…' : <><Send className="w-4 h-4" /> Sync to Notion</>}
      </button>

      {/* Secondary: only the days that have never been pushed (cheaper). */}
      <button onClick={() => run(false)} disabled={running || configured === false || pending === 0}
        className="btn-glass w-full justify-center min-h-[40px] text-fluid-xs disabled:opacity-50">
        {pending === 0 ? <><Check className="w-3.5 h-3.5" /> No new days</> : <>Sync new days only</>}
      </button>

      {result && (
        <div className="text-fluid-xs text-muted space-y-1">
          <p><span className="text-success font-semibold">{result.exported}</span> exported
            {result.skipped > 0 && <> · {result.skipped} empty skipped</>}
            {result.remaining > 0 && <> · <span className="text-primary">{result.remaining} remaining</span> (tap again)</>}
          </p>
          {result.failed.length > 0 && (
            <p className="text-danger">{result.failed.length} failed: {result.failed[0].date} — {result.failed[0].error}</p>
          )}
        </div>
      )}
      {error && <p className="text-danger text-fluid-xs" role="alert">{error}</p>}
      {configured === false && (
        <p className="text-[11px] text-muted flex items-center gap-1">
          <ExternalLink className="w-3 h-3" /> Add NOTION_TOKEN + NOTION_DAILY_LOG_DB_ID to your environment.
        </p>
      )}
    </section>
  )
}
