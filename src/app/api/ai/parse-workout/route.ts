/**
 * POST /api/ai/parse-workout
 *
 * The AI Chat workout logger. Accepts a free-form Hebrew/English session
 * description and:
 *  1. Extracts a structured schema (sets + session metrics) via Claude.
 *  2. Fills missing BPM/calories/duration from Apple Health (matchWorkoutMetrics).
 *  3. Resolves exercise names → real exercises.id UUIDs (creates missing).
 *  4. Saves via the shared saveSession() service (volume, PRs, Notion push).
 *  5. Generates a markdown "Gym Session Report" and stores it on the session.
 *
 * Body: { text: string, splitDay?: 'push'|'pull'|'legs'|'upper'|'lower' }
 */

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { denyIfUnauthorized } from '@/lib/auth/guard'
import { resolveExercises } from '@/lib/sessions/resolveExercises'
import { saveSession } from '@/lib/sessions/save'
import { matchWorkoutMetrics } from '@/lib/health/matchWorkout'
import { parseHevyWorkout } from '@/lib/hevy/parse'
import type { SaveWorkoutPayload, SplitDay } from '@/lib/types/workout'

const ParsedSetSchema = z.object({
  exerciseName:   z.string().min(1),
  exerciseNameHe: z.string().optional(),
  setNumber:      z.number().int().positive(),
  weightKg:       z.number().nonnegative(),
  reps:           z.number().int().positive(),
  rpe:            z.number().min(1).max(10).optional(),
})

const ParsedWorkoutSchema = z.object({
  splitDay:       z.enum(['push', 'pull', 'legs', 'upper', 'lower']),
  startedAt:      z.string(),
  endedAt:        z.string(),
  durationMin:    z.number().nullable().optional(),
  avgBpm:         z.number().nullable().optional(),
  caloriesBurned: z.number().nullable().optional(),
  sets:           z.array(ParsedSetSchema).min(1),
  notes:          z.string().default(''),
})
type ParsedWorkout = z.infer<typeof ParsedWorkoutSchema>

const PARSE_SYSTEM = `You are a workout-log parser for a personal fitness app. The user logs gym sessions in Hebrew or English.
Extract the structured data EXACTLY per the JSON schema.
Rules:
1. Map Hebrew exercise names to canonical English names (e.g. "לחיצת חזה" → "Bench Press"); keep the Hebrew in exerciseNameHe.
2. Infer splitDay from the exercises if not explicitly stated.
3. NEVER invent sets, weights, reps, RPE, BPM, calories, or duration — only extract what is explicitly stated. Use null for unstated durationMin/avgBpm/caloriesBurned.
4. If a date/time is mentioned, parse it; otherwise use the provided current UTC time for startedAt and startedAt+60min for endedAt.
5. Preserve the user's original notes (Hebrew or English) verbatim.
6. Return ONLY valid JSON matching the schema.`

const REPORT_SYSTEM = `You are an elite strength coach writing a concise "Gym Session Report" in Markdown, mirroring a personal training journal.
Structure:
## Session Summary
One or two sentences on the session's focus and quality.
## Top Sets
Bullet the heaviest/most notable set per exercise.
## PRs
List any personal records (or "None this session").
## Volume
Total volume and how it compares to the trailing average (if provided).
## Feel & Notes
Reflect the athlete's stated feelings/notes; add one brief coaching cue.
Rules: base everything strictly on the supplied data; do not fabricate numbers. Be direct and motivating, not flowery.`

/** Fill sets with missing/zero weight from the user's most recent set of that exercise. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fillWeightsFromHistory(supabase: any, userId: string, payload: SaveWorkoutPayload): Promise<void> {
  const zeroIds = [...new Set(payload.sets.filter((s) => !s.weightKg).map((s) => s.exerciseId))]
  if (!zeroIds.length) return
  const { data } = await supabase
    .from('workout_sets')
    .select('exercise_id, weight_kg, created_at')
    .eq('user_id', userId)
    .in('exercise_id', zeroIds)
    .gt('weight_kg', 0)
    .order('created_at', { ascending: false })
  const last = new Map<string, number>()
  for (const r of (data ?? []) as Array<{ exercise_id: string; weight_kg: number }>) {
    if (!last.has(r.exercise_id)) last.set(r.exercise_id, r.weight_kg)
  }
  for (const s of payload.sets) if (!s.weightKg && last.has(s.exerciseId)) s.weightKg = last.get(s.exerciseId) as number
}

export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req)
  if (denied) return denied

  const supabase = getServerSupabaseClient()
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError || !users.length) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = users[0].id

  let text: string
  let hintSplit: SplitDay | undefined
  try {
    const body = await req.json() as { text?: unknown; splitDay?: unknown }
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return NextResponse.json({ error: '`text` (string) is required' }, { status: 400 })
    }
    text = body.text.trim()
    if (typeof body.splitDay === 'string') hintSplit = body.splitDay as SplitDay
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }
  const client = new Anthropic({ apiKey })
  const nowIso = new Date().toISOString()

  // ── 0. Fast path: deterministic Hevy clipboard parser (no LLM) ──────────────
  // A clean Hevy export is parsed instantly into structured sets; the structured
  // data still flows downstream into resolveExercises + the AI report generator.
  // Only when this returns null (not Hevy / freeform notes added) do we fall back
  // to the AI extractor below.
  let parsed: ParsedWorkout
  const hevy = parseHevyWorkout(text)
  if (hevy) {
    const sets = hevy.exercises.flatMap((ex) =>
      ex.sets.map((s) => ({
        exerciseName: ex.name,
        setNumber: s.setNumber,
        weightKg: s.weightKg,
        reps: s.reps,
        ...(s.rpe != null ? { rpe: s.rpe } : {}),
      })),
    )
    parsed = ParsedWorkoutSchema.parse({
      splitDay: hintSplit ?? hevy.splitGuess ?? 'push',
      startedAt: nowIso,
      endedAt: nowIso,
      durationMin: null,
      avgBpm: null,
      caloriesBurned: null,
      sets,
      notes: '',
    })
  } else {
  // ── 1. AI extraction (fallback) ─────────────────────────────────────────────
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: PARSE_SYSTEM,
      messages: [{
        role: 'user',
        content: `Parse this workout log. Current UTC time: ${nowIso}.${hintSplit ? ` The user opened the "${hintSplit}" split.` : ''}\n\n${text}`,
      }],
      output_config: {
        format: {
          type: 'json_schema' as const,
          schema: {
            type: 'object',
            properties: {
              splitDay:       { type: 'string', enum: ['push', 'pull', 'legs', 'upper', 'lower'] },
              startedAt:      { type: 'string' },
              endedAt:        { type: 'string' },
              durationMin:    { type: ['number', 'null'] },
              avgBpm:         { type: ['number', 'null'] },
              caloriesBurned: { type: ['number', 'null'] },
              notes:          { type: 'string' },
              sets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    exerciseName:   { type: 'string' },
                    exerciseNameHe: { type: 'string' },
                    setNumber:      { type: 'number' },
                    weightKg:       { type: 'number' },
                    reps:           { type: 'number' },
                    rpe:            { type: 'number' },
                  },
                  required: ['exerciseName', 'setNumber', 'weightKg', 'reps'],
                },
              },
            },
            required: ['splitDay', 'startedAt', 'endedAt', 'sets', 'notes'],
          },
        },
      },
    })
    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text block in Claude response')
    parsed = ParsedWorkoutSchema.parse(JSON.parse(textBlock.text))
  } catch (err) {
    console.error('[ai/parse-workout] parse error:', err)
    return NextResponse.json({ error: 'Failed to parse workout log', detail: String(err) }, { status: 422 })
  }
  } // end AI-extraction fallback

  const splitDay = hintSplit ?? parsed.splitDay
  const dateISO = parsed.startedAt.slice(0, 10)

  // ── 2. Fill metrics from Apple Health ───────────────────────────────────────
  const metrics = await matchWorkoutMetrics(supabase, userId, dateISO, {
    durationMin: parsed.durationMin ?? null,
    avgBpm: parsed.avgBpm ?? null,
    caloriesBurned: parsed.caloriesBurned ?? null,
  })

  // ── 3. Resolve exercise names → UUIDs ───────────────────────────────────────
  const nameMap = await resolveExercises(
    supabase, userId, splitDay,
    parsed.sets.map((s) => ({ name: s.exerciseName, nameHe: s.exerciseNameHe })),
  )

  const payload: SaveWorkoutPayload = {
    splitDay,
    startedAt: parsed.startedAt,
    endedAt: parsed.endedAt,
    notes: parsed.notes,
    sets: parsed.sets
      .filter((s) => nameMap.has(s.exerciseName))
      .map((s) => ({
        exerciseId: nameMap.get(s.exerciseName)!,
        exerciseName: s.exerciseName,
        exerciseNameHe: s.exerciseNameHe,
        setNumber: s.setNumber,
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
      })),
  }

  if (!payload.sets.length) {
    return NextResponse.json({ error: 'No resolvable sets parsed from text' }, { status: 422 })
  }

  // Auto-fill missing/zero weights from the most recent matching session.
  await fillWeightsFromHistory(supabase, userId, payload)

  // ── 4. Save (volume, PRs, Notion) ───────────────────────────────────────────
  let result
  try {
    result = await saveSession(supabase, userId, payload, {
      durationMin: metrics.durationMin,
      avgBpm: metrics.avgBpm,
      caloriesBurned: metrics.caloriesBurned,
    })
  } catch (err) {
    console.error('[ai/parse-workout] save error:', err)
    return NextResponse.json({ error: 'Failed to save session', detail: String(err) }, { status: 500 })
  }

  // ── 5. Generate the Gym Session Report ──────────────────────────────────────
  let reportMd = ''
  try {
    const reportInput = {
      splitDay,
      date: dateISO,
      durationMin: metrics.durationMin,
      avgBpm: metrics.avgBpm,
      caloriesBurned: metrics.caloriesBurned,
      totalVolumeKg: Math.round(result.totalVolumeKg),
      prCount: result.prCount,
      newPRs: result.newPRs,
      sets: payload.sets.map((s) => ({ exercise: s.exerciseName, weightKg: s.weightKg, reps: s.reps, rpe: s.rpe })),
      notes: parsed.notes,
    }
    const rpt = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      thinking: { type: 'adaptive' },
      system: REPORT_SYSTEM,
      messages: [{ role: 'user', content: `Write the session report from this data:\n\n${JSON.stringify(reportInput, null, 2)}` }],
    })
    const block = rpt.content.find((b) => b.type === 'text')
    reportMd = block && block.type === 'text' ? block.text : ''
    if (reportMd) {
      await supabase
        .from('workout_sessions')
        .update({ report_md: reportMd } as unknown as never)
        .eq('id', result.sessionId)
    }
  } catch (err) {
    console.error('[ai/parse-workout] report error (non-fatal):', err)
  }

  return NextResponse.json({
    sessionId: result.sessionId,
    splitDay,
    totalVolumeKg: result.totalVolumeKg,
    setCount: result.setCount,
    prCount: result.prCount,
    newPRs: result.newPRs,
    notionPageId: result.notionPageId,
    metrics,
    reportMd,
    parsed,
  })
}
