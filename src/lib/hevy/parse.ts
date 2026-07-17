/**
 * Deterministic parser for the standard Hevy "Share / Copy workout" clipboard
 * format — no LLM anywhere. Feeds the Command Center's PastePanel client-side.
 *
 * Handles the classic multi-line export:
 *
 *   Push Day
 *   Saturday, 28 Jun 2026 at 10:30
 *
 *   Bench Press (Barbell)
 *   Set 1: 60 kg × 10
 *   Set 2: 80 kg × 8
 *   Plank
 *   Set 1: 47s
 *
 * …and the decorated variants Michael actually pastes:
 *   - single-line sets:      "Chest Press (Machine) Set 1: 35 kg x 12"
 *   - cardio measures:       "Treadmill / Set 1: 0.4 km - 5min 0s"  → `cardio[]`
 *   - the stats trailer:     "time: 1 hour 8 min, 4336.2 kg volume, 18 sets,
 *                             2 records by hevy, 125 avg bpm, 466 calories."
 *   - header date/time:      "Thursday, Jul 16, 2026 at 12:43pm" → dateISO/timeHHMM
 *
 * Returns `null` only when the text is not recognizably a Hevy export
 * (fewer than two set lines, or prose before any exercise). Prose AFTER
 * exercises is collected into `notes`, never fatal.
 */

import type { SplitDay } from '@/lib/types/workout'

export interface HevySet { setNumber: number; weightKg: number; reps: number; rpe?: number }
export interface HevyExercise { name: string; sets: HevySet[]; position: number }
export interface HevyCardio { name: string; distanceKm?: number; durationSec?: number; position: number }
export interface HevyStats {
  durationMin?: number
  volumeKg?: number
  sets?: number
  records?: number
  avgBpm?: number
  calories?: number
}
export interface HevyWorkout {
  title: string | null
  splitGuess: SplitDay | null
  /** Raw pre-exercise lines (title + date/meta) — day-key/date inference material. */
  header: string[]
  /** Workout date parsed from the header (explicit-year match wins), if any. */
  dateISO: string | null
  /** Start time "HH:MM" (24h) parsed from the header, if any. */
  timeHHMM: string | null
  exercises: HevyExercise[]
  cardio: HevyCardio[]
  stats: HevyStats | null
  /** Freeform note lines found after the first exercise. */
  notes: string | null
  /** Strength sets only (cardio measures excluded). */
  setCount: number
}

const round1 = (n: number) => Math.round(n * 10) / 10
// Weights keep 2-decimal precision: real cable/dumbbell loads move in 0.25 kg
// steps (3.75, 6.25, 36.25 from lb), and 0.1-quantizing them corrupts volume.
const round2 = (n: number) => Math.round(n * 100) / 100

// A Hevy set line: "Set 1:", "Set 12:", "Warm-up Set:", "Warmup Set 1:" …
const SET_LINE = /^\s*(?:warm[\s-]?up\s+)?set(?:\s+\d+)?\s*:/i
// The same pattern anywhere in a line — used to explode "Name Set 1: …" forms.
const MIDLINE_SET = /\b(?:warm[\s-]?up\s+)?set\s*\d*\s*:/gi

function isSetLine(line: string): boolean {
  return SET_LINE.test(line)
}

/**
 * Split single-line forms into name + set chunks so both
 * "Chest Press (Machine) Set 1: 35 kg x 12" and
 * "Treadmill / Set 1: 0.4 km - 5min 0s" parse like the multi-line format.
 */
function explodeLine(line: string): string[] {
  const idxs = [...line.matchAll(MIDLINE_SET)].map((m) => m.index)
  if (!idxs.length) return [line]
  const parts: string[] = []
  if (idxs[0] > 0) {
    const head = line.slice(0, idxs[0]).replace(/[/\-–·|,]\s*$/, '').trim()
    if (head) parts.push(head)
  }
  for (let i = 0; i < idxs.length; i++) {
    parts.push(line.slice(idxs[i], idxs[i + 1] ?? line.length).trim())
  }
  return parts
}

/** Lines that are workout metadata, not exercises (date, stats block). */
function isMetaLine(line: string): boolean {
  const l = line.trim().toLowerCase()
  if (!l) return true
  if (/^(duration|volume|records?|sets|total|prs?|calories|notes?)\b/.test(l)) return true
  // Date/time line: weekday or month name or "at HH:MM"
  if (/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/.test(l) && /\d/.test(l)) return true
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.test(l) && /\d/.test(l)) return true
  if (/\bat\s+\d{1,2}:\d{2}/.test(l)) return true
  return false
}

/** Looks like freeform prose (a note), not an exercise title. */
function looksLikeProse(line: string): boolean {
  const words = line.trim().split(/\s+/)
  if (words.length >= 8) return true
  if (/[.!?]$/.test(line.trim()) && words.length >= 4) return true
  return false
}

type Measure =
  | { kind: 'strength'; weightKg: number; reps: number }
  | { kind: 'cardio'; distanceKm?: number; durationSec?: number }

/** Parse the measure after the colon: weight×reps, cardio, reps-only, or time. */
function parseMeasure(raw: string): Measure | null {
  const s = raw.replace(/×/g, 'x').replace(/,/g, '')
  // weight (kg/lb) × reps  — also matches "+5 kg x 10" bodyweight-plus
  let m = s.match(/(-?\d+(?:\.\d+)?)\s*(kg|lbs?)\s*x\s*(\d+)/i)
  if (m) {
    let w = parseFloat(m[1])
    if (/^lb/i.test(m[2])) w = w * 0.453592
    return { kind: 'strength', weightKg: Math.max(0, round2(w)), reps: parseInt(m[3], 10) }
  }
  // Cardio: a distance ("0.4 km") and/or an explicit minutes duration
  // ("5min 0s"). Checked BEFORE the reps/seconds fallbacks so a treadmill
  // measure can never become a junk 0 kg × 1 strength set.
  const dist = s.match(/(\d+(?:\.\d+)?)\s*km\b/i)
  const mi = dist ? null : s.match(/(\d+(?:\.\d+)?)\s*mi(?:les?)?\b/i)
  const dur = s.match(/(\d+)\s*min(?:utes?|s)?\b(?:\s*(\d+)\s*s(?:ec(?:onds?)?)?\b)?/i)
  if (dist || mi || dur) {
    const cardio: Measure = { kind: 'cardio' }
    if (dist) cardio.distanceKm = parseFloat(dist[1])
    else if (mi) cardio.distanceKm = round1(parseFloat(mi[1]) * 1.60934)
    if (dur) cardio.durationSec = parseInt(dur[1], 10) * 60 + (dur[2] ? parseInt(dur[2], 10) : 0)
    return cardio
  }
  // bodyweight reps: "x 12", ": 12 reps", "12 reps"
  m = s.match(/x\s*(\d+)\s*reps?/i) || s.match(/:\s*(\d+)\s*reps?\b/i) || s.match(/\b(\d+)\s*reps\b/i)
  if (m) return { kind: 'strength', weightKg: 0, reps: parseInt(m[1], 10) }
  // pure "x 8"
  m = s.match(/x\s*(\d+)\b/i)
  if (m) return { kind: 'strength', weightKg: 0, reps: parseInt(m[1], 10) }
  // time-based (plank etc.): "47s" / "1:30" → persist as a single rep, no weight
  if (/\b\d+\s*s\b/i.test(s) || /\b\d+:\d{2}\b/.test(s)) return { kind: 'strength', weightKg: 0, reps: 1 }
  return null
}

/**
 * The Hevy stats trailer, e.g. "time: 1 hour 8 min, 4336.2 kg volume, 18 sets,
 * 2 records by hevy, 125 avg bpm, 466 calories." Requires ≥2 stat signatures
 * so a random sentence can never match. MUST run before the prose bail — this
 * exact line used to void the whole parse.
 */
function parseStatsLine(line: string): HevyStats | null {
  const l = line.toLowerCase().replace(/(\d),(\d)/g, '$1$2').replace(/,/g, ' ')
  let hits = 0
  const stats: HevyStats = {}

  const hr = l.match(/(\d+)\s*(?:hours?|hrs?|h)\b(?:\s*(?:and\s+)?(\d+)\s*(?:minutes?|mins?|m)\b)?/)
  if (hr) { stats.durationMin = parseInt(hr[1], 10) * 60 + (hr[2] ? parseInt(hr[2], 10) : 0); hits++ }
  else {
    const mins = l.match(/(?:time|duration)[:\s]+(\d+)\s*(?:minutes?|mins?|m)\b/)
    if (mins) { stats.durationMin = parseInt(mins[1], 10); hits++ }
  }
  const vol = l.match(/(\d+(?:\.\d+)?)\s*kg\s+volume\b/) || l.match(/volume[:\s]+(\d+(?:\.\d+)?)\s*kg\b/)
  if (vol) { stats.volumeKg = parseFloat(vol[1]); hits++ }
  const sets = l.match(/(\d+)\s*sets?\b/)
  if (sets) { stats.sets = parseInt(sets[1], 10); hits++ }
  const rec = l.match(/(\d+)\s*(?:records?|prs?)\b/)
  if (rec) { stats.records = parseInt(rec[1], 10); hits++ }
  const bpm = l.match(/(\d+)\s*avg\s*bpm\b/) || l.match(/avg\s*(?:hr|bpm)[:\s]+(\d+)/)
  if (bpm) { stats.avgBpm = parseInt(bpm[1], 10); hits++ }
  const cal = l.match(/(\d+)\s*(?:calories|kcal|cals?)\b/)
  if (cal) { stats.calories = parseInt(cal[1], 10); hits++ }

  return hits >= 2 ? stats : null
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const pad2 = (n: number) => String(n).padStart(2, '0')

/** Extract the workout date from the header lines; an explicit year wins. */
function parseHeaderDate(lines: string[]): string | null {
  let best: { y?: number; m: number; d: number } | null = null
  for (const line of lines) {
    const l = line.toLowerCase()
    const iso = l.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
    if (iso) return iso[0]
    let cand: { y?: number; m: number; d: number } | null = null
    // \b after the day stops "Jun 2026" being read as day=20 of June.
    let m = l.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?!\d)(?:[,\s]+(\d{4}))?/)
    if (m) cand = { m: MONTHS[m[1]], d: parseInt(m[2], 10), y: m[3] ? parseInt(m[3], 10) : undefined }
    else {
      m = l.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:[,\s]+(\d{4}))?/)
      if (m) cand = { d: parseInt(m[1], 10), m: MONTHS[m[2]], y: m[3] ? parseInt(m[3], 10) : undefined }
    }
    if (!cand || cand.d < 1 || cand.d > 31) continue
    if (cand.y) { best = cand; break }
    if (!best) best = cand
  }
  if (!best) return null
  const y = best.y ?? new Date().getFullYear()
  return `${y}-${pad2(best.m)}-${pad2(best.d)}`
}

/** Extract "at 12:43pm" → "12:43" (24h) from the header lines. */
function parseHeaderTime(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.toLowerCase().match(/\bat\s+(\d{1,2}):(\d{2})\s*(am|pm)?/)
    if (!m) continue
    let h = parseInt(m[1], 10)
    const min = parseInt(m[2], 10)
    if (m[3] === 'pm' && h < 12) h += 12
    if (m[3] === 'am' && h === 12) h = 0
    if (h > 23 || min > 59) continue
    return `${pad2(h)}:${pad2(min)}`
  }
  return null
}

const SPLIT_WORDS: Array<[RegExp, SplitDay]> = [
  [/\bpush\b/i, 'push'],
  [/\bpull\b/i, 'pull'],
  [/\bleg|lower\b/i, 'legs'],
  [/\bupper\b/i, 'upper'],
]

function guessSplit(text: string | null): SplitDay | null {
  if (!text) return null
  for (const [re, day] of SPLIT_WORDS) if (re.test(text)) return day
  return null
}

interface Entry { name: string; sets: HevySet[]; cardio: { distanceKm?: number; durationSec?: number } | null; position: number }

export function parseHevyWorkout(text: string): HevyWorkout | null {
  const lines: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim()
    if (t) lines.push(...explodeLine(t))
  }
  // Quick gate: a clean Hevy export has at least two "Set …:" lines.
  if (lines.filter(isSetLine).length < 2) return null

  let title: string | null = null
  const header: string[] = []
  const entries: Entry[] = []
  const noteLines: string[] = []
  let stats: HevyStats | null = null
  let current: Entry | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (isSetLine(line)) {
      const measure = parseMeasure(line.split(/:(.+)/)[1] ?? line)
      if (measure && current) {
        if (measure.kind === 'cardio') {
          const c = current.cardio ?? {}
          if (measure.distanceKm != null) c.distanceKm = round1((c.distanceKm ?? 0) + measure.distanceKm)
          if (measure.durationSec != null) c.durationSec = (c.durationSec ?? 0) + measure.durationSec
          current.cardio = c
        } else {
          current.sets.push({ setNumber: current.sets.length + 1, weightKg: measure.weightKg, reps: measure.reps })
        }
      }
      continue
    }

    const st = parseStatsLine(line)
    if (st) { stats = { ...(stats ?? {}), ...st }; continue }

    // Structural invariant of the format: an exercise name directly precedes
    // its set lines. This also stops the first exercise being eaten as the
    // title when the real title line was consumed as a date/meta line.
    const nextIsSet = i + 1 < lines.length && isSetLine(lines[i + 1])
    if (nextIsSet) {
      current = { name: line.replace(/\s+/g, ' ').trim(), sets: [], cardio: null, position: entries.length }
      entries.push(current)
      continue
    }

    if (isMetaLine(line)) {
      if (!entries.length) header.push(line)
      continue
    }
    if (title === null && entries.length === 0) {
      title = line
      header.push(line)
      continue
    }
    // Prose before any exercise ⇒ not a Hevy export. After exercises it's a
    // workout note — collect it, never fail the parse.
    if (looksLikeProse(line) && entries.length === 0) return null
    noteLines.push(line)
  }

  const exercises: HevyExercise[] = entries
    .filter((e) => e.sets.length > 0)
    .map((e) => ({ name: e.name, sets: e.sets, position: e.position }))
  const cardio: HevyCardio[] = entries
    .filter((e) => e.sets.length === 0 && e.cardio)
    .map((e) => ({ name: e.name, distanceKm: e.cardio?.distanceKm, durationSec: e.cardio?.durationSec, position: e.position }))
  const setCount = exercises.reduce((n, e) => n + e.sets.length, 0)
  if (!exercises.length || setCount < 1) return null

  return {
    title,
    splitGuess: guessSplit(title) ?? guessSplit(header.join(' ')),
    header,
    dateISO: parseHeaderDate(header),
    timeHHMM: parseHeaderTime(header),
    exercises,
    cardio,
    stats,
    notes: noteLines.length ? noteLines.join('\n') : null,
    setCount,
  }
}
