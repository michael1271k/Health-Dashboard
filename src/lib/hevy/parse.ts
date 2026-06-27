/**
 * Deterministic parser for the standard Hevy "Share / Copy workout" clipboard
 * format — no LLM call. Example:
 *
 *   Push Day
 *   Saturday, 28 Jun 2026 at 10:30
 *
 *   Bench Press (Barbell)
 *   Set 1: 60 kg × 10
 *   Set 2: 80 kg × 8
 *   Incline Bench Press (Dumbbell)
 *   Warm-up Set: 20 kg × 12
 *   Set 1: 24 kg × 12
 *   Plank
 *   Set 1: 47s
 *   Pull Ups
 *   Set 1: 12 reps
 *
 * Returns structured exercises/sets that the parse-workout route feeds into the
 * exercise resolver + AI report generator, or `null` when the text isn't a clean
 * Hevy export (so the caller falls back to the AI extractor).
 */

import type { SplitDay } from '@/lib/types/workout'

export interface HevySet { setNumber: number; weightKg: number; reps: number; rpe?: number }
export interface HevyExercise { name: string; sets: HevySet[] }
export interface HevyWorkout {
  title: string | null
  splitGuess: SplitDay | null
  exercises: HevyExercise[]
  setCount: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

// A Hevy set line: "Set 1:", "Set 12:", "Warm-up Set:", "Warmup Set 1:" …
const SET_LINE = /^\s*(?:warm[\s-]?up\s+)?set(?:\s+\d+)?\s*:/i

function isSetLine(line: string): boolean {
  return SET_LINE.test(line)
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

/** Looks like freeform prose (a note), not an exercise title — trigger AI fallback. */
function looksLikeProse(line: string): boolean {
  const words = line.trim().split(/\s+/)
  if (words.length >= 8) return true
  if (/[.!?]$/.test(line.trim()) && words.length >= 4) return true
  return false
}

/** Parse the measure after the colon: weight×reps, reps-only, or time-based. */
function parseMeasure(raw: string): { weightKg: number; reps: number } | null {
  const s = raw.replace(/×/g, 'x').replace(/,/g, '')
  // weight (kg/lb) × reps  — also matches "+5 kg x 10" bodyweight-plus
  let m = s.match(/(-?\d+(?:\.\d+)?)\s*(kg|lbs?)\s*x\s*(\d+)/i)
  if (m) {
    let w = parseFloat(m[1])
    if (/^lb/i.test(m[2])) w = w * 0.453592
    return { weightKg: Math.max(0, round1(w)), reps: parseInt(m[3], 10) }
  }
  // bodyweight reps: "x 12", ": 12 reps", "12 reps"
  m = s.match(/x\s*(\d+)\s*reps?/i) || s.match(/:\s*(\d+)\s*reps?\b/i) || s.match(/\b(\d+)\s*reps\b/i)
  if (m) return { weightKg: 0, reps: parseInt(m[1], 10) }
  // pure "x 8"
  m = s.match(/x\s*(\d+)\b/i)
  if (m) return { weightKg: 0, reps: parseInt(m[1], 10) }
  // time-based (plank etc.): "47s" / "1:30" → persist as a single rep, no weight
  if (/\b\d+\s*s\b/i.test(s) || /\b\d+:\d{2}\b/.test(s)) return { weightKg: 0, reps: 1 }
  return null
}

const SPLIT_WORDS: Array<[RegExp, SplitDay]> = [
  [/\bpush\b/i, 'push'],
  [/\bpull\b/i, 'pull'],
  [/\bleg|lower\b/i, 'legs'],
  [/\bupper\b/i, 'upper'],
]

function guessSplit(title: string | null): SplitDay | null {
  if (!title) return null
  for (const [re, day] of SPLIT_WORDS) if (re.test(title)) return day
  return null
}

export function parseHevyWorkout(text: string): HevyWorkout | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  // Quick gate: a clean Hevy export has at least two "Set …:" lines.
  if (lines.filter(isSetLine).length < 2) return null

  let title: string | null = null
  const exercises: HevyExercise[] = []
  let current: HevyExercise | null = null
  let sawExerciseBeforeTitle = false

  for (const line of lines) {
    if (!line) continue

    if (isSetLine(line)) {
      const measure = parseMeasure(line.split(/:(.+)/)[1] ?? line)
      if (measure && current) {
        current.sets.push({ setNumber: current.sets.length + 1, ...measure })
      }
      continue
    }

    if (isMetaLine(line)) continue

    // Non-set, non-meta line → title (first one) or a new exercise.
    if (title === null && !sawExerciseBeforeTitle) {
      title = line
      continue
    }
    // A prose sentence means the user added freeform notes → let the AI handle it.
    if (looksLikeProse(line)) return null

    current = { name: line.replace(/\s+/g, ' ').trim(), sets: [] }
    exercises.push(current)
    sawExerciseBeforeTitle = true
  }

  const withSets = exercises.filter((e) => e.sets.length > 0)
  const setCount = withSets.reduce((n, e) => n + e.sets.length, 0)
  if (!withSets.length || setCount < 1) return null

  return { title, splitGuess: guessSplit(title), exercises: withSets, setCount }
}
