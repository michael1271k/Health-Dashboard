/**
 * POST /api/ai/parse-workout
 *
 * Accepts a free-form Hebrew gym log (or English) and uses Claude to extract
 * a structured SaveWorkoutPayload. The extracted data is then forwarded to
 * the existing POST /api/sessions route which handles volume calc, PR
 * detection, Supabase insert, and Notion gym-log push.
 *
 * Body: { text: string }  — the raw Hebrew/English workout description
 *
 * Returns the same shape as POST /api/sessions on success.
 */

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getServerSupabaseClient } from '@/lib/supabase/server'

// ─── Schema for what Claude must return ───────────────────────────────────────

const ParsedSetSchema = z.object({
  exerciseId:     z.string().describe('Canonical English exercise name (used as placeholder ID)'),
  exerciseName:   z.string().describe('Canonical English exercise name'),
  exerciseNameHe: z.string().optional().describe('Hebrew exercise name if provided'),
  setNumber:      z.number().int().positive(),
  weightKg:       z.number().nonnegative(),
  reps:           z.number().int().positive(),
  rpe:            z.number().min(1).max(10).optional(),
})

const ParsedWorkoutSchema = z.object({
  splitDay:  z.enum(['push', 'pull', 'legs', 'upper', 'lower'])
              .describe('Infer from exercises if not stated'),
  startedAt: z.string().describe('ISO 8601 datetime — use today if not specified'),
  endedAt:   z.string().describe('ISO 8601 datetime — estimate +1h if not specified'),
  sets:      z.array(ParsedSetSchema).min(1),
  notes:     z.string().default('').describe('Preserve the original Hebrew notes verbatim'),
})

type ParsedWorkout = z.infer<typeof ParsedWorkoutSchema>

// ─── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a workout-log parser for a personal fitness tracking app.
The user logs their gym sessions in Hebrew or English.

Your ONLY job is to extract the structured data exactly as described in the JSON schema.
Rules:
1. Map Hebrew exercise names to their canonical English names (e.g. "לחיצת חזה" → "Bench Press").
2. Infer split_day from the exercises if not explicitly stated.
3. NEVER invent sets, weights, reps, or RPE — only extract what is explicitly stated.
4. If a date/time is mentioned, parse it. Otherwise use the current UTC datetime for startedAt and startedAt + 60 minutes for endedAt.
5. Preserve the user's original notes (Hebrew or English) verbatim in the notes field.
6. Return ONLY valid JSON matching the schema — no markdown, no commentary.`

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  // Auth guard
  const supabase = getServerSupabaseClient()
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError || !users.length) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse request body
  let text: string
  try {
    const body = await req.json() as { text?: unknown }
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return NextResponse.json({ error: '`text` (string) is required' }, { status: 400 })
    }
    text = body.text.trim()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  // Call Claude with structured output
  const client = new Anthropic({ apiKey })
  const today = new Date().toISOString()

  let parsed: ParsedWorkout
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Parse this workout log. Current UTC time: ${today}\n\n${text}`,
        },
      ],
      output_config: {
        format: {
          type: 'json_schema' as const,
          schema: {
            type: 'object',
            properties: {
              splitDay:  { type: 'string', enum: ['push', 'pull', 'legs', 'upper', 'lower'] },
              startedAt: { type: 'string' },
              endedAt:   { type: 'string' },
              notes:     { type: 'string' },
              sets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    exerciseId:     { type: 'string' },
                    exerciseName:   { type: 'string' },
                    exerciseNameHe: { type: 'string' },
                    setNumber:      { type: 'number' },
                    weightKg:       { type: 'number' },
                    reps:           { type: 'number' },
                    rpe:            { type: 'number' },
                  },
                  required: ['exerciseId', 'exerciseName', 'setNumber', 'weightKg', 'reps'],
                },
              },
            },
            required: ['splitDay', 'startedAt', 'endedAt', 'sets', 'notes'],
          },
        },
      },
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text block in Claude response')
    }
    parsed = ParsedWorkoutSchema.parse(JSON.parse(textBlock.text))
  } catch (err) {
    console.error('[ai/parse-workout] Claude error:', err)
    return NextResponse.json(
      { error: 'Failed to parse workout log', detail: String(err) },
      { status: 422 },
    )
  }

  // Forward to the existing /api/sessions route (reuse all its logic)
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const sessRes = await fetch(`${origin}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  })

  const sessBody = await sessRes.json()
  if (!sessRes.ok) {
    return NextResponse.json(
      { error: 'Session save failed', detail: sessBody },
      { status: sessRes.status },
    )
  }

  return NextResponse.json({ ...sessBody, parsedWorkout: parsed })
}
