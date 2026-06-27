'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ActiveSession } from './ActiveSession'
import type { SplitDay } from '@/lib/types/workout'
import { Sparkles, Check, Loader2, PenLine, MessageSquare, Dumbbell, Scale } from 'lucide-react'

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

const METRIC_LABELS: Record<string, string> = {
  muscle_percent: 'Muscle %', water_percent: 'Water %', bone_mineral: 'Bone',
  visceral_fat: 'Visceral', bmr: 'BMR', body_fat_pct: 'Body Fat %',
  weight_kg: 'Weight', lean_mass_kg: 'Lean Mass', bmi: 'BMI',
}

export function WorkoutChat({ splitDay, onClose }: WorkoutChatProps) {
  const qc = useQueryClient()
  const [view, setView] = useState<'chat' | 'manual'>('chat')
  const [intent, setIntent] = useState<'workout' | 'metrics'>('workout')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [metricsResult, setMetricsResult] = useState<Record<string, number> | null>(null)

  async function submit() {
    if (!text.trim()) return
    setBusy(true); setError(null)
    try {
      const endpoint = intent === 'workout' ? '/api/ai/parse-workout' : '/api/ai/complete-daily'
      const payload = intent === 'workout'
        ? { text: text.trim(), splitDay }
        : { text: text.trim() }
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Request failed')
      if (intent === 'workout') {
        setResult(json as ParseResult)
        qc.invalidateQueries({ queryKey: ['workout_sessions'] })
        qc.invalidateQueries({ queryKey: ['workout_sets'] })
      } else {
        setMetricsResult(json.updated as Record<string, number>)
        qc.invalidateQueries({ queryKey: ['daily_logs'] })
        qc.invalidateQueries({ queryKey: ['body_composition'] })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  // ── Manual fallback (Phase 4 slider logger) ──
  if (view === 'manual') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('chat')} className="btn-ghost text-xs gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" /> Back to AI chat
        </button>
        <ActiveSession onSaved={() => qc.invalidateQueries({ queryKey: ['workout_sessions'] })} />
      </div>
    )
  }

  // ── Workout result ──
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
            <div className="text-sm whitespace-pre-wrap text-text" dir="auto">{result.reportMd}</div>
          </div>
        )}
        <button onClick={onClose} className="btn-primary w-full justify-center">Done</button>
      </div>
    )
  }

  // ── Metrics completion result ──
  if (metricsResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-success">
          <Check className="w-5 h-5" />
          <h3 className="font-heading font-bold text-lg text-text">Today&apos;s metrics updated</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(metricsResult).map(([k, v]) => (
            <span key={k} className="glass-card px-3 py-1.5 text-sm">
              <span className="text-muted-vital">{METRIC_LABELS[k] ?? k}: </span>
              <span className="text-text font-semibold">{v}</span>
            </span>
          ))}
        </div>
        <button onClick={onClose} className="btn-primary w-full justify-center">Done</button>
      </div>
    )
  }

  // ── Input view ──
  return (
    <div className="space-y-4">
      {/* Intent segmented control */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {([['workout', 'Workout', Dumbbell], ['metrics', 'Scale Update', Scale]] as const).map(([val, label, Icon]) => (
          <button
            key={val}
            onClick={() => { setIntent(val); setError(null) }}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${intent === val ? 'glass-card--accent text-primary' : 'text-muted-vital'}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {intent === 'workout' ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-semibold capitalize">{splitDay} · AI Logger</span>
          </div>
          <button onClick={() => setView('manual')} className="btn-ghost text-xs gap-1.5">
            <PenLine className="w-3.5 h-3.5" /> Manual
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-primary">
          <Scale className="w-4 h-4" />
          <span className="text-sm font-semibold">Complete today&apos;s scale metrics</span>
        </div>
      )}

      <p className="text-xs text-muted-vital leading-relaxed">
        {intent === 'workout'
          ? 'Describe your session in Hebrew or English — exercises, weights, reps, how it felt. BPM & calories come from Apple Health.'
          : 'Type the metrics your smart scale shows that the Shortcut can’t capture (muscle %, water %, visceral fat, bone, BMR).'}
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        dir="auto"
        rows={intent === 'workout' ? 7 : 4}
        placeholder={intent === 'workout'
          ? 'לדוגמה: לחיצת חזה 80 קג 3 סטים של 8...\ne.g. Bench press 80kg 3x8, felt strong'
          : 'לדוגמה: השלמה מהמשקל להיום: מים 55.6, שריר 77.2, ויסרלי 7'}
        className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-text text-sm
                   placeholder:text-muted-vital focus:outline-none focus:ring-2 focus:ring-primary/60
                   resize-none leading-relaxed"
      />

      {error && <p className="text-danger text-sm">{error}</p>}

      <button onClick={submit} disabled={busy || !text.trim()} className="btn-primary w-full justify-center disabled:opacity-50">
        {busy
          ? <><Loader2 className="w-4 h-4 animate-spin" /> {intent === 'workout' ? 'Parsing & saving…' : 'Updating…'}</>
          : <><Sparkles className="w-4 h-4" /> {intent === 'workout' ? 'Parse & Save' : 'Update Today'}</>}
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
