'use client'

import { useId } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
} from 'recharts'
import { Dumbbell, TrendingUp, Layers, Activity, Repeat, Info } from 'lucide-react'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { useExerciseHistory } from '@/lib/hooks/useExerciseHistory'
import { isUnloadedExercise } from '@/lib/exercises/bodyweight'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { shortDate } from '@/lib/utils/day'
import { STEEL, GOLD, MUTED } from '@/lib/theme/palette'

/**
 * Everything a single exercise has ever done — records, trends, recent work.
 *
 * Extracted from ExerciseHistorySheet so the same body can render inside a
 * drawer (from the session report, mid-workout) or as a full page (from the
 * library). The sheet is now a twelve-line wrapper around this.
 *
 * ── RENDERING HONESTLY AROUND THE RPC ────────────────────────────────────────
 * `exercise_history` computes `best_1rm` as a plain `max(est_1rm_kg)`, with no
 * Epley fallback and no rep-floor gate. For a bodyweight or timed movement the
 * stored column is exactly 0 — not "unknown", but literally zero — and the old
 * UI tested `!= null`, so a Plank proudly reported **Best est-1RM: 0** and drew
 * a flat zero line across its chart.
 *
 * Rather than print a dash where a number should be, an unloaded movement gets
 * the records that are REAL for it: reps. A one-rep max is not a fact about a
 * Pull-Up you do fifteen of, and pretending the field merely failed to load
 * says something false about the data.
 */
export function ExerciseHistoryBody({ exerciseId, exerciseName, accent = STEEL }: {
  exerciseId: string | null
  exerciseName: string
  /** The muscle group's colour, so a lift looks like its section. */
  accent?: string
}) {
  const { data, isPending } = useExerciseHistory(exerciseId)
  const unit = weightUnit()
  const uid = useId().replace(/:/g, '')
  const unloaded = isUnloadedExercise(exerciseName)

  const timeline = data?.timeline ?? []
  const r = data?.records

  // One shape for both hero series, so the chart has a single generic.
  // `> 0`, not `!= null`. Zero is the sentinel the column actually stores.
  const e1rmData = timeline
    .filter((p) => p.best_1rm != null && p.best_1rm > 0)
    .map((p) => ({ date: shortDate(p.day), value: displayWeight(p.best_1rm!) ?? 0 }))

  const volumeData = timeline
    .filter((p) => p.session_volume != null && p.session_volume > 0)
    .map((p) => ({ date: shortDate(p.day), volume: Math.round(displayWeight(p.session_volume!) ?? 0) }))

  const repsData = timeline
    .filter((p) => p.reps != null && p.reps > 0)
    .map((p) => ({ date: shortDate(p.day), value: p.reps! }))

  const bestReps = repsData.length ? Math.max(...repsData.map((p) => p.value)) : null
  const recent = [...timeline].reverse().slice(0, 8)

  if (isPending) {
    return <div className="h-64 animate-pulse rounded-xl bg-white/[0.04]" aria-hidden="true" />
  }

  const hero = unloaded
    ? { data: repsData, label: 'Reps per session', unit: '' }
    : { data: e1rmData, label: `Estimated 1RM · ${unit}`, unit }

  return (
    <div className="space-y-4">
      {/* Hero trend — 1RM for a loaded lift, reps for one you cannot load. */}
      {hero.data.length >= 2 ? (
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: accent }} /> {hero.label}
          </p>
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={hero.data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id={`heroFill-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} tickMargin={6} />
              <YAxis tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
              <Tooltip content={<ChartTooltip />} />
              <Area isAnimationActive={false} type="monotone" dataKey="value" name={hero.label}
                unit={hero.unit} stroke={accent} strokeWidth={2} fill={`url(#heroFill-${uid})`} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-fluid-sm text-muted text-center py-4">Not enough history yet — log this lift a few more times.</p>
      )}

      {/* Session volume answers "am I doing more work", which a 1RM curve cannot. */}
      {volumeData.length >= 2 && (
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" style={{ color: accent }} /> Session volume · {unit}
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={volumeData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} tickMargin={6} />
              <YAxis tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
              <Tooltip content={<ChartTooltip />} />
              <Bar isAnimationActive={false} dataKey="volume" name="volume" unit={unit} fill={accent} fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Records */}
      <div className="grid grid-cols-2 gap-2">
        <Record icon={Dumbbell} label="Heaviest"
          value={!unloaded && r?.heaviest_weight ? `${displayWeight(r.heaviest_weight)}` : '—'} unit={unit} />
        {unloaded ? (
          <Record icon={Repeat} label="Most reps in a session"
            value={bestReps != null ? bestReps.toLocaleString() : '—'} highlight />
        ) : (
          <Record icon={TrendingUp} label="Best est-1RM"
            value={r?.best_1rm ? `${displayWeight(r.best_1rm)}` : '—'}
            unit={unit} highlight
            note={r?.best_1rm ? undefined : 'no estimate yet'} />
        )}
        <Record icon={Layers} label="Heaviest single set"
          value={r?.best_set_volume ? `${Math.round(displayWeight(r.best_set_volume) ?? 0).toLocaleString()}` : '—'}
          unit={unit}
          // The RPC does not collapse L/R pairs the way volumeCredits does, and
          // it exposes no pair_id to let us. Say so rather than imply a total.
          info="Unilateral lifts count each side separately." />
        <Record icon={Activity} label="Best session vol"
          value={r?.best_session_volume ? `${Math.round(displayWeight(r.best_session_volume) ?? 0).toLocaleString()}` : '—'} unit={unit} />
      </div>
      <Record icon={Repeat} label="Total reps (all time)" value={(r?.total_reps ?? 0).toLocaleString()} />

      {/* Recent sessions */}
      {recent.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Recent sessions</p>
          {recent.map((p) => (
            <div key={p.day} className="flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/[0.05] px-3 py-2 text-fluid-xs">
              <span className="text-muted w-16 shrink-0">{shortDate(p.day)}</span>
              <span className="flex-1 helix-num text-text tabular-nums">
                {!unloaded && p.top_weight ? `${displayWeight(p.top_weight)}${unit}` : '—'}
              </span>
              <span className="helix-num text-muted tabular-nums">
                {p.session_volume ? `${Math.round(displayWeight(p.session_volume) ?? 0).toLocaleString()}${unit}` : '—'}
              </span>
              <span className="helix-num text-muted tabular-nums shrink-0">{p.reps ?? 0} reps</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Record({ icon: Icon, label, value, unit, highlight, note, info }: {
  icon: typeof Dumbbell
  label: string
  value: string
  unit?: string
  highlight?: boolean
  /** Shown in place of a unit when the number is genuinely unavailable. */
  note?: string
  /** A one-line caveat about how the number is computed. */
  info?: string
}) {
  const color = highlight ? GOLD : STEEL
  return (
    <div className="rounded-xl px-3 py-2.5"
      style={{ background: `${color}${highlight ? '14' : '0d'}`, border: `1px solid ${color}${highlight ? '55' : '2e'}` }}>
      <span className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color }}>
        <Icon className="w-3 h-3" aria-hidden="true" /> {label}
        {info && <Info className="w-2.5 h-2.5 opacity-60 shrink-0" aria-label={info} />}
      </span>
      <div className="helix-num font-bold text-fluid-lg text-text tabular-nums mt-0.5">
        {value}
        {unit && value !== '—' && <span className="text-[10px] text-muted font-normal ml-1">{unit}</span>}
      </div>
      {note && <span className="block text-[9px] text-muted mt-0.5">{note}</span>}
      {info && <span className="block text-[9px] text-muted/70 mt-0.5 leading-tight">{info}</span>}
    </div>
  )
}
