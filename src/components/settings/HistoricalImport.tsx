'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, DatabaseZap } from 'lucide-react'

interface Counts {
  dailyPages: number; gymPages: number; nutrition: number
  bodyComp: number; metrics: number; sleep: number; sessions: number
}

export function HistoricalImport() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Counts | null>(null)
  const [done, setDone] = useState<Counts | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(dryRun: boolean) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/migrate-history${dryRun ? '?dryRun=1' : ''}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      if (dryRun) { setPreview(json.counts); setDone(null) }
      else {
        setDone(json.counts); setPreview(null)
        qc.invalidateQueries() // refresh all views with the imported data
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="vital-card space-y-3">
      <div className="flex items-center gap-2">
        <DatabaseZap className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-text">Historical Import (Notion → Supabase)</h2>
      </div>
      <p className="text-xs text-muted-vital leading-relaxed">
        One-time import of your Daily Log + PPL sessions from Notion. Idempotent — safe to re-run.
        Preview first to see counts, then commit.
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => run(true)} disabled={busy} className="btn-ghost text-sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Preview (dry run)'}
        </button>
        <button onClick={() => run(false)} disabled={busy || !preview} className="btn-primary text-sm disabled:opacity-50">
          Commit import
        </button>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      {preview && (
        <div className="text-xs text-muted-vital">
          <p className="text-text font-medium mb-1">Dry run — would import:</p>
          {summary(preview)}
        </div>
      )}
      {done && (
        <div className="text-xs text-success">
          <p className="font-medium mb-1">Imported ✓</p>
          {summary(done)}
        </div>
      )}
    </section>
  )
}

function summary(c: Counts) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums">
      <li>Daily pages: {c.dailyPages}</li>
      <li>Gym pages: {c.gymPages}</li>
      <li>Nutrition: {c.nutrition}</li>
      <li>Body comp: {c.bodyComp}</li>
      <li>Metrics: {c.metrics}</li>
      <li>Sleep: {c.sleep}</li>
      <li>Sessions: {c.sessions}</li>
    </ul>
  )
}
