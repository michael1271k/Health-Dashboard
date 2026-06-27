'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ActiveSession } from './ActiveSession'
import type { SplitDay } from '@/lib/types/workout'
import { Sparkles, Check, Loader2, PenLine, MessageSquare } from 'lucide-react'

interface WorkoutChatProps {
  splitDay: SplitDay
  onClose: () => void
}

interface ParseResult {
  sessionId: string
  totalVolumeKg: number
  setCount: number
  prCount: number
  newPRs: Array<{ exerciseName: string; est1rm: number }>
  metrics: { durationMin?: number | null; avgBpm?: number | null; caloriesBurned?: number | null }
  reportMd: string
}

export function WorkoutChat({ splitDay, onClose }: WorkoutChatProps) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'chat' | 'manual'>('chat')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)

  async function submit() {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/parse-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), splitDay }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Parse failed')
      setResult(json as ParseResult)
      qc.invalidateQueries({ queryKey: ['workout_sessions'] })
      qc.invalidateQueries({ queryKey: ['workout_sets'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  // ── Manual fallback (Phase 4 slider logger) ──
  if (mode === 'manual') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setMode('chat')}
          className="btn-ghost text-xs gap-1.5"
        >
          <MessageSquare className="w-3.5 h-3.5" /> Back to AI chat
        </button>
        <ActiveSession onSaved={() => { qc.invalidateQueries({ queryKey: ['workout_sessions'] }); }} />
      </div>
    )
  }

  // ── Result view ──
  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-success">
          <Check className="w-5 h-5" />
          <h3 className="font-heading font-bold text-lg text-text">Session Saved</h3>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Volume" value={`${Math.round(result.totalVolumeKg)}kg`} />
          <Stat label="Sets" value={String(result.setCount)} />
          <Stat label="PRs" value={String(result.prCount)} />
        </div>
        {(result.metrics.caloriesBurned != null || result.metrics.durationMin != null) && (
          <p className="text-xs text-muted-vital text-center">
            {result.metrics.durationMin != null && `${result.metrics.durationMin} min`}
            {result.metrics.durationMin != null && result.metrics.caloriesBurned != null && ' · '}
            {result.metrics.caloriesBurned != null && `${result.metrics.caloriesBurned} kcal (Apple Health)`}
          </p>
        )}
        {result.reportMd && (
          <div className="vital-card max-h-72 overflow-y-auto">
            <div className="prose-invert text-sm whitespace-pre-wrap text-text" dir="auto">
              {result.reportMd}
            </div>
          </div>
        )}
        <button onClick={onClose} className="btn-primary w-full justify-center">Done</button>
      </div>
    )
  }

  // ── Chat input view ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-semibold capitalize">{splitDay} · AI Logger</span>
        </div>
        <button onClick={() => setMode('manual')} className="btn-ghost text-xs gap-1.5">
          <PenLine className="w-3.5 h-3.5" /> Manual
        </button>
      </div>

      <p className="text-xs text-muted-vital leading-relaxed">
        Describe your session in Hebrew or English — exercises, weights, reps, how it felt.
        Claude fills the details; BPM &amp; calories come from Apple Health.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        dir="auto"
        rows={7}
        placeholder={'לדוגמה: לחיצת חזה 80 קג 3 סטים של 8, הרגשתי חזק...\ne.g. Bench press 80kg 3x8, felt strong; incline DB 30kg 3x10'}
        className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-text text-sm
                   placeholder:text-muted-vital focus:outline-none focus:ring-2 focus:ring-primary/60
                   resize-none leading-relaxed"
      />

      {error && <p className="text-danger text-sm">{error}</p>}

      <button
        onClick={submit}
        disabled={busy || !text.trim()}
        className="btn-primary w-full justify-center disabled:opacity-50"
      >
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Parsing &amp; saving…</> : <><Sparkles className="w-4 h-4" /> Parse &amp; Save</>}
      </button>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card py-2.5">
      <div className="vital-number font-bold text-text">{value}</div>
      <div className="text-[11px] text-muted-vital">{label}</div>
    </div>
  )
}
