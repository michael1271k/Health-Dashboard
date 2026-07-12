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
  carbsG?: number | null
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
export interface InsightInput { days: DayPoint[]; sessions: SessionPoint[]; contextMode?: string; todayISO?: string }

/** Days since the most recent session, or null with no sessions at all. */
export function daysSinceLastSession(sessions: SessionPoint[], todayISO: string): number | null {
  if (!sessions.length) return null
  const last = sessions.reduce((m, s) => (s.date > m ? s.date : m), sessions[0].date)
  return Math.round((new Date(`${todayISO}T00:00:00Z`).getTime() - new Date(`${last}T00:00:00Z`).getTime()) / 86400000)
}

/**
 * Data-gap awareness: when there's been no training for a week+,
 * SAY SO — and the volume-comparison builders are suppressed entirely so the
 * coach never "compares" a blank week and invents trends.
 */
export function trainingGap(sessions: SessionPoint[], todayISO: string): Insight | null {
  const gap = daysSinceLastSession(sessions, todayISO)
  if (gap == null) {
    return {
      id: 'training-gap', tone: 'neutral', confidence: 0.95,
      headline: 'No training history in this window',
      detail: 'Volume and PR comparisons are paused until your first logged session — nothing here is being estimated or invented.',
    }
  }
  if (gap < 7) return null
  return {
    id: 'training-gap', tone: 'neutral', confidence: 0.95,
    headline: `${gap} days since your last session`,
    detail: `Training comparisons are paused — a ${gap}-day gap makes week-over-week volume math meaningless. Expect the first session back to feel ~10% heavier than it is; start at re-entry loads and the numbers return within two sessions.`,
  }
}

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

/**
 * Weight trajectory — SYSTEM UPDATE v5.1 rules:
 *   · Single-day deltas have ZERO decision authority — judge only the 7-day
 *     rolling average, week-over-week.
 *   · Rate targets: cut −0.40…−0.50 kg/wk · bulk +0.20…+0.25 kg/wk.
 *   · Spikes ≤1.5 kg within 72h of a leg/heavy session or travel are auto-flagged
 *     (neutral note, never an alert).
 *   · STALL = 7-day average flat/rising for 14 consecutive days with no flagged
 *     event in the final 72h.
 *   · Maintenance-transition rebound of +0.5–1.2 kg = glycogen, never fat gain.
 */
function weightTrend(days: DayPoint[], sessions: SessionPoint[], contextMode?: string): Insight | null {
  const w = days.filter((d) => d.weightKg != null) as Array<DayPoint & { weightKg: number }>
  if (w.length < 8) return null

  const weights = w.map((d) => d.weightKg)
  const thisWeek = mean(weights.slice(-7))
  const lastWeek = mean(weights.slice(-14, -7))
  if (!lastWeek) return null
  const wow = round(thisWeek - lastWeek, 2)

  // Phase intent from the calorie goal (v5.1 bands)
  const goal = days.findLast?.((d) => d.calorieGoal)?.calorieGoal ?? days[days.length - 1]?.calorieGoal ?? null
  const phase = goal == null ? null : goal <= 2050 ? 'cut' : goal < 2450 ? 'maintenance' : 'bulk'

  // Flagged-event window: heavy session or travel within the final 72h
  const last3 = new Set(w.slice(-3).map((d) => d.date))
  const flagged = contextMode === 'travel' || sessions.some((s) => last3.has(s.date) && s.volumeKg > 0)
  const lastDelta = weights.length >= 2 ? weights[weights.length - 1] - weights[weights.length - 2] : 0
  if (flagged && lastDelta > 0 && lastDelta <= 1.5 && wow >= 0 && phase === 'cut') {
    return {
      id: 'weight-trend',
      headline: 'Scale spike auto-flagged — not fat',
      detail: `+${round(lastDelta, 1)} kg within 72h of a heavy session/travel is water + glycogen noise. The 7-day average (${round(thisWeek, 1)} kg) stays the only number with decision authority.`,
      tone: 'neutral',
      confidence: 0.6,
    }
  }

  // Maintenance-transition glycogen rebound
  if (phase === 'maintenance' && wow >= 0.5 && wow <= 1.2) {
    return {
      id: 'weight-trend',
      headline: 'Glycogen rebound — expected, not fat gain',
      detail: `The 7-day average is up ${wow} kg entering maintenance — textbook glycogen + water refill (+0.5–1.2 kg band). Hold the protocol.`,
      tone: 'positive',
      confidence: 0.75,
    }
  }

  // STALL detection (cut): rolling average flat/rising 14 consecutive days, no flag
  if (phase === 'cut' && w.length >= 21 && !flagged) {
    const rolling: number[] = []
    for (let i = 6; i < weights.length; i++) rolling.push(mean(weights.slice(i - 6, i + 1)))
    const win = rolling.slice(-14)
    if (win.length === 14 && win[13] >= win[0] - 0.05) {
      return {
        id: 'weight-trend',
        headline: 'Cut stall detected (14-day plateau)',
        detail: `The 7-day average has been flat or rising for 14 consecutive days with no flagged event — a true stall by v5.1 rules. Consider a small deficit or step adjustment.`,
        tone: 'caution',
        confidence: 0.85,
      }
    }
  }

  // Rate-vs-target verdict
  const band = phase === 'cut' ? [-0.5, -0.4] : phase === 'bulk' ? [0.2, 0.25] : null
  if (band) {
    const inBand = wow >= band[0] - 0.05 && wow <= band[1] + 0.05
    return {
      id: 'weight-trend',
      headline: inBand ? `On-target ${phase} rate` : `${phase === 'cut' ? 'Cut' : 'Bulk'} rate off target`,
      detail: `7-day average moved ${wow > 0 ? '+' : ''}${wow} kg week-over-week (target ${band[0]} to ${band[1]}). Rolling average only — single days carry zero authority.`,
      tone: inBand ? 'positive' : 'caution',
      confidence: inBand ? 0.7 : 0.75,
    }
  }
  return {
    id: 'weight-trend',
    headline: Math.abs(wow) < 0.15 ? 'Weight is holding steady' : wow < 0 ? 'Downward weekly trend' : 'Upward weekly trend',
    detail: `7-day rolling average: ${round(lastWeek, 1)} → ${round(thisWeek, 1)} kg (${wow > 0 ? '+' : ''}${wow} kg week-over-week).`,
    tone: 'neutral',
    confidence: 0.4,
  }
}

/**
 * Compute the ranked insight set. Returns up to `limit` highest-confidence,
 * strict-English insights. Empty array when there isn't enough data yet.
 */
/**
 * Fuel → Force Correlator: day-before carbs vs next-day session
 * volume, median-split. Only speaks with ≥4 sessions per bucket and a ≥5%
 * volume separation — otherwise stays silent rather than inventing a pattern.
 */
export function fuelVsForce(days: DayPoint[], sessions: SessionPoint[]): Insight | null {
  const carbsByDate = new Map(days.filter((d) => d.carbsG != null).map((d) => [d.date, d.carbsG as number]))
  const prevISO = (d: string) => {
    const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10)
  }
  const pairs = sessions
    .map((s) => {
      const carbs = carbsByDate.get(prevISO(s.date))
      return carbs != null ? { carbs, vol: s.volumeKg } : null
    })
    .filter((p): p is { carbs: number; vol: number } => p !== null)
  if (pairs.length < 8) return null

  const sorted = [...pairs].sort((a, b) => a.carbs - b.carbs)
  const half = Math.floor(sorted.length / 2)
  const low = sorted.slice(0, half), high = sorted.slice(sorted.length - half)
  if (low.length < 4 || high.length < 4) return null
  const lowVol = mean(low.map((p) => p.vol))
  const highVol = mean(high.map((p) => p.vol))
  if (lowVol <= 0) return null
  const diffPct = Math.round(((highVol - lowVol) / lowVol) * 100)
  if (Math.abs(diffPct) < 5) return null

  const carbCut = Math.round(mean([low[low.length - 1].carbs, high[0].carbs]))
  return diffPct > 0
    ? {
        id: 'fuel-force', tone: 'positive',
        headline: `Carbs the day before are worth +${diffPct}% volume`,
        detail: `Sessions after a ${carbCut}g+ carb day averaged ${diffPct}% more volume than after lower-carb days (${pairs.length} sessions). Front-load carbs the evening before training days.`,
        confidence: Math.min(0.9, 0.5 + Math.abs(diffPct) / 40),
      }
    : {
        id: 'fuel-force', tone: 'neutral',
        headline: `Prior-day carbs aren't driving your volume`,
        detail: `Higher-carb days preceded ${Math.abs(diffPct)}% LESS volume (${pairs.length} sessions) — your output is currently limited by something other than fuel (likely sleep or recovery).`,
        confidence: Math.min(0.75, 0.4 + Math.abs(diffPct) / 50),
      }
}

export function computeInsights(input: InsightInput, limit = 3): Insight[] {
  // Gap-awareness gate: with a 7-day+ training gap (or no sessions at all) the
  // volume-comparison builders are OFF — recovery/nutrition insights still run.
  const todayISO = input.todayISO ?? new Date().toISOString().slice(0, 10)
  const gap = daysSinceLastSession(input.sessions, todayISO)
  const gapped = gap == null || gap >= 7

  const builders = [
    gapped ? trainingGap(input.sessions, todayISO) : sleepVsVolume(input.days, input.sessions),
    recoveryDrift(input.days),
    calorieAdherence(input.days),
    weightTrend(input.days, input.sessions, input.contextMode),
    gapped ? null : fuelVsForce(input.days, input.sessions),
  ]
  return builders
    .filter((x): x is Insight => x !== null)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
}
