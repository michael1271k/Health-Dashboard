/**
 * The Intellectual Insight Coach — deterministic, zero-LLM analytics that mine
 * real correlations from the user's recent metrics. Strict English. No network,
 * no randomness: same data → same insights, so it's free to run client-side.
 */

export interface DayPoint {
  date: string
  sleepMin: number | null
  restHr: number | null
  respiratory: number | null
  weightKg: number | null
  calories: number | null
  calorieGoal: number | null
}

export interface SessionPoint { date: string; volumeKg: number }

export type InsightTone = 'positive' | 'caution' | 'neutral'

export interface Insight {
  id: string
  headline: string
  detail: string
  tone: InsightTone
  /** 0–1, used to rank which insights surface. */
  confidence: number
}

// ── math ───────────────────────────────────────────────────────────────────
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

/** Pearson correlation, or null if < 4 pairs or zero variance. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 4) return null
  const mx = mean(xs.slice(0, n))
  const my = mean(ys.slice(0, n))
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my
    num += a * b; dx += a * a; dy += b * b
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

/** Least-squares slope per index (per day), or null if < 3 points. */
export function linregSlope(ys: number[]): number | null {
  const n = ys.length
  if (n < 3) return null
  const mx = (n - 1) / 2
  const my = mean(ys)
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    const a = i - mx
    num += a * (ys[i] - my); den += a * a
  }
  return den === 0 ? null : num / den
}

const round = (n: number, d = 0) => {
  const f = 10 ** d
  return Math.round(n * f) / f
}

// ── insight builders ─────────────────────────────────────────────────────────
export interface InsightInput { days: DayPoint[]; sessions: SessionPoint[] }

/** Sleep the night of a session vs that session's training volume. */
function sleepVsVolume(days: DayPoint[], sessions: SessionPoint[]): Insight | null {
  const sleepByDate = new Map(days.filter((d) => d.sleepMin != null).map((d) => [d.date, d.sleepMin as number]))
  const pairs = sessions
    .map((s) => ({ sleep: sleepByDate.get(s.date), vol: s.volumeKg }))
    .filter((p): p is { sleep: number; vol: number } => p.sleep != null && p.vol > 0)
  if (pairs.length < 4) return null

  const r = pearson(pairs.map((p) => p.sleep), pairs.map((p) => p.vol))
  const low = pairs.filter((p) => p.sleep < 390) // < 6.5h
  const high = pairs.filter((p) => p.sleep >= 450) // ≥ 7.5h

  if (low.length >= 2 && high.length >= 2) {
    const lowAvg = mean(low.map((p) => p.vol))
    const highAvg = mean(high.map((p) => p.vol))
    if (highAvg > 0 && lowAvg < highAvg) {
      const drop = round((1 - lowAvg / highAvg) * 100)
      if (drop >= 8) {
        return {
          id: 'sleep-volume',
          headline: 'Short sleep is costing you volume',
          detail: `After nights under 6.5h you averaged ${round(lowAvg).toLocaleString()} kg vs ${round(highAvg).toLocaleString()} kg following 7.5h+ — a ${drop}% drop across ${pairs.length} sessions.`,
          tone: 'caution',
          confidence: Math.min(0.95, 0.5 + drop / 100),
        }
      }
    }
  }
  if (r != null && Math.abs(r) >= 0.4) {
    return {
      id: 'sleep-volume',
      headline: r > 0 ? 'Sleep is fuelling your lifts' : 'Inverse sleep–volume pattern',
      detail: `Sleep duration and training volume correlate at r=${round(r, 2)} over ${pairs.length} sessions.`,
      tone: r > 0 ? 'positive' : 'caution',
      confidence: Math.abs(r),
    }
  }
  return null
}

/** Resting HR (and respiratory rate) trend vs baseline — early fatigue signal. */
function recoveryDrift(days: DayPoint[]): Insight | null {
  const hr = days.filter((d) => d.restHr != null) as Array<DayPoint & { restHr: number }>
  if (hr.length < 5) return null
  const recent = hr.slice(-3)
  const baseline = hr.slice(0, -3)
  if (baseline.length < 2) return null
  const recentAvg = mean(recent.map((d) => d.restHr))
  const baseAvg = mean(baseline.map((d) => d.restHr))
  if (baseAvg <= 0) return null
  const pct = round((recentAvg / baseAvg - 1) * 100)

  // Respiratory corroboration (optional)
  const resp = days.filter((d) => d.respiratory != null) as Array<DayPoint & { respiratory: number }>
  let respNote = ''
  if (resp.length >= 5) {
    const rRecent = mean(resp.slice(-3).map((d) => d.respiratory))
    const rBase = mean(resp.slice(0, -3).map((d) => d.respiratory))
    if (rBase > 0 && rRecent / rBase - 1 >= 0.05) {
      respNote = ` Respiratory rate is up too (${round(rBase, 1)}→${round(rRecent, 1)} br/min) — both point the same way.`
    }
  }

  if (pct >= 4) {
    return {
      id: 'recovery-drift',
      headline: 'Resting HR is creeping up',
      detail: `Your last 3 days average ${round(recentAvg)} bpm vs a ${round(baseAvg)} bpm baseline (+${pct}%) — often an early fatigue or under-recovery signal.${respNote}`,
      tone: 'caution',
      confidence: Math.min(0.9, 0.5 + pct / 30),
    }
  }
  if (pct <= -4) {
    return {
      id: 'recovery-drift',
      headline: 'Recovery is trending well',
      detail: `Resting HR dropped to ${round(recentAvg)} bpm vs a ${round(baseAvg)} bpm baseline (${pct}%) — a sign your system is well-recovered.`,
      tone: 'positive',
      confidence: Math.min(0.85, 0.45 + Math.abs(pct) / 30),
    }
  }
  return null
}

/** Calorie-adherence trend: this week vs last. */
function calorieAdherence(days: DayPoint[]): Insight | null {
  const ok = days.filter((d) => d.calories != null && d.calorieGoal && d.calorieGoal > 0) as Array<DayPoint & { calories: number; calorieGoal: number }>
  if (ok.length < 8) return null
  const onTarget = (d: { calories: number; calorieGoal: number }) => Math.abs(d.calories - d.calorieGoal) / d.calorieGoal <= 0.1
  const recent = ok.slice(-7)
  const prior = ok.slice(-14, -7)
  if (prior.length < 3) return null
  const rPct = round((recent.filter(onTarget).length / recent.length) * 100)
  const pPct = round((prior.filter(onTarget).length / prior.length) * 100)
  const delta = rPct - pPct
  if (Math.abs(delta) < 12) return null
  return {
    id: 'calorie-adherence',
    headline: delta > 0 ? 'Nutrition discipline is climbing' : 'Calorie adherence slipped',
    detail: `${rPct}% of the last 7 days landed within 10% of your calorie goal, vs ${pPct}% the week before (${delta > 0 ? '+' : ''}${delta} pts).`,
    tone: delta > 0 ? 'positive' : 'caution',
    confidence: Math.min(0.85, 0.4 + Math.abs(delta) / 100),
  }
}

/** Weight trajectory over the window. */
function weightTrend(days: DayPoint[]): Insight | null {
  const w = days.filter((d) => d.weightKg != null) as Array<DayPoint & { weightKg: number }>
  if (w.length < 5) return null
  const slope = linregSlope(w.map((d) => d.weightKg))
  if (slope == null) return null
  const perWeek = slope * 7
  if (Math.abs(perWeek) < 0.1) {
    return {
      id: 'weight-trend',
      headline: 'Weight is holding steady',
      detail: `Body weight is essentially flat (${round(perWeek, 2)} kg/week) over ${w.length} readings — a stable maintenance signal.`,
      tone: 'neutral',
      confidence: 0.35,
    }
  }
  return {
    id: 'weight-trend',
    headline: perWeek < 0 ? 'Steady downward weight trend' : 'Weight is trending up',
    detail: `Body weight is moving ${perWeek < 0 ? 'down' : 'up'} ${Math.abs(round(perWeek, 2))} kg/week across ${w.length} readings (${round(w[0].weightKg, 1)}→${round(w[w.length - 1].weightKg, 1)} kg).`,
    tone: 'neutral',
    confidence: Math.min(0.7, 0.4 + Math.abs(perWeek)),
  }
}

/**
 * Compute the ranked insight set. Returns up to `limit` highest-confidence,
 * strict-English insights. Empty array when there isn't enough data yet.
 */
export function computeInsights(input: InsightInput, limit = 3): Insight[] {
  const builders = [
    sleepVsVolume(input.days, input.sessions),
    recoveryDrift(input.days),
    calorieAdherence(input.days),
    weightTrend(input.days),
  ]
  return builders
    .filter((x): x is Insight => x !== null)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
}
