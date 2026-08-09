'use client'

import { useEffect, useState } from 'react'
import { Send, Check, ExternalLink, KeyRound, Loader2 } from 'lucide-react'
import { authedFetch } from '@/lib/utils/authedFetch'
import { supabase } from '@/lib/supabase/client'

type Result = { exported: number; skipped: number; failed: { date: string; error: string }[]; remaining: number }

/**
 * Notion sync — multi-tenant. Each user saves their OWN integration secret +
 * database id (stored in notion_credentials, RLS-scoped to them); the sync route
 * reads those per request. One button then batch-exports every logged day not yet
 * in Notion. Resumable: shows the remaining count and re-runs until clear.
 */
export function NotionSync() {
  const [pending, setPending] = useState<number | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Credential form
  const [showForm, setShowForm] = useState(false)
  const [token, setToken] = useState('')
  const [dbId, setDbId] = useState('')
  const [savingCreds, setSavingCreds] = useState(false)
  const [credMsg, setCredMsg] = useState<string | null>(null)

  const loadPending = async () => {
    try {
      const res = await authedFetch('/api/notion/sync-all', { method: 'GET' })
      const data = await res.json() as { configured?: boolean; pending?: number | null }
      setConfigured(data.configured ?? false)
      setPending(data.pending ?? null)
    } catch { setConfigured(false) }
  }
  useEffect(() => { void loadPending() }, [])

  const saveCreds = async () => {
    setSavingCreds(true); setCredMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setCredMsg('Not signed in'); return }
      const { error: e } = await supabase.from('notion_credentials').upsert(
        { user_id: session.user.id, token: token.trim(), db_id: dbId.trim() } as unknown as never,
        { onConflict: 'user_id' },
      )
      if (e) { setCredMsg(/relation|does not exist|schema cache/i.test(e.message) ? 'Run the notion_credentials paste-SQL first.' : e.message); return }
      setCredMsg('Connected.')
      setToken(''); setDbId(''); setShowForm(false)
      await loadPending()
    } catch (e) {
      setCredMsg(e instanceof Error ? e.message : 'Save failed')
    } finally { setSavingCreds(false) }
  }

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

  const inputCls = 'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-primary/60 transition-[border-color]'

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text">Integrations · Notion</h2>
        <span className={`text-[11px] font-semibold ${configured ? 'text-success' : 'text-warn'}`}>
          {configured == null ? '' : configured ? 'Connected' : 'Not connected'}
        </span>
      </div>
      <p className="text-fluid-xs text-muted">
        Push a curated one-page summary (macros · training · sleep · effort) for every logged day to your own Notion database.
        {pending != null && <> <span className="text-primary font-semibold">{pending}</span> day{pending === 1 ? '' : 's'} pending.</>}
      </p>

      {/* Credential manager — each user brings their own Notion integration. */}
      <button onClick={() => setShowForm((v) => !v)}
        className="btn-glass w-full justify-between min-h-[42px] text-fluid-xs">
        <span className="flex items-center gap-2"><KeyRound className="w-3.5 h-3.5 text-primary" /> {configured ? 'Update connection' : 'Connect Notion'}</span>
        <span className="text-muted">{showForm ? '−' : '+'}</span>
      </button>

      {showForm && (
        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <label className="block">
            <span className="block text-[11px] text-muted mb-1">Integration Secret (starts with <code>ntn_</code> / <code>secret_</code>)</span>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ntn_…" autoComplete="off" className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-[11px] text-muted mb-1">Daily-Log Database ID</span>
            <input type="text" value={dbId} onChange={(e) => setDbId(e.target.value)} placeholder="32-char id from the database URL" autoComplete="off" className={inputCls} />
          </label>
          <button onClick={saveCreds} disabled={savingCreds || !token.trim() || !dbId.trim()}
            className="btn-primary w-full justify-center min-h-[42px] disabled:opacity-50">
            {savingCreds ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Save connection</>}
          </button>
          <p className="text-[10px] text-muted flex items-center gap-1">
            <ExternalLink className="w-3 h-3" /> Create an integration at notion.so/my-integrations, then share your Daily-Log database with it.
          </p>
          {credMsg && <p className={`text-[11px] ${credMsg === 'Connected.' ? 'text-success' : 'text-danger'}`}>{credMsg}</p>}
        </div>
      )}

      {/* Primary: UPSERT every logged day + its metrics into the Daily Logs DB. */}
      <button onClick={() => run(true)} disabled={running || !configured}
        className="btn-primary w-full justify-center min-h-[46px] disabled:opacity-50">
        {running ? 'Syncing…' : <><Send className="w-4 h-4" /> Sync to Notion</>}
      </button>

      {/* Secondary: only the days that have never been pushed (cheaper). */}
      <button onClick={() => run(false)} disabled={running || !configured || pending === 0}
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
    </section>
  )
}
