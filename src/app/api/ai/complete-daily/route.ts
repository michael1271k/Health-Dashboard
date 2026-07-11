/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase v2 hand-authored Insert/Update types resolve to `never`; payloads are cast at write sites. */
/**
 * POST /api/ai/complete-daily
 *
 * The AI Chat "scale completion" capability. The user types a free-form
 * Hebrew/English message describing today's missing scale metrics, e.g.:
 *   "השלמה מהמשקל להיום: מים 55.6, שריר 77.2, ויסרלי 7"
 * Claude parses it into structured fields and PATCHes today's daily_logs row
 * (only the fields the user provided), then mirrors overlapping values into
 * body_composition so charts reflect them.
 *
 * Body: { text: string, date?: 'YYYY-MM-DD' }
 */

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { denyIfUnauthorized } from '@/lib/auth/guard'
import { todayIsrael } from '@/lib/ingest/dailyLog'

const FieldsSchema = z.object({
  muscle_percent: z.number().nullable().optional(),
  water_percent:  z.number().nullable().optional(),
  bone_mineral:   z.number().nullable().optional(),
  visceral_fat:   z.number().nullable().optional(),
  bmr:            z.number().nullable().optional(),
  body_fat_pct:   z.number().nullable().optional(),
  weight_kg:      z.number().nullable().optional(),
  lean_mass_kg:   z.number().nullable().optional(),
  bmi:            z.number().nullable().optional(),
})
type Fields = z.infer<typeof FieldsSchema>

const SYSTEM = `You extract body-composition scale metrics from a short Hebrew/English message and return ONLY JSON.
Map terms to fields (values are numbers; omit/-null anything not mentioned — NEVER invent):
- מים / water / "water %"            → water_percent
- שריר / muscle / "muscle %"          → muscle_percent
- ויסרלי / visceral / "visceral fat"  → visceral_fat
- עצם / bone / "bone mineral"         → bone_mineral
- BMR / חילוף חומרים                  → bmr
- שומן / "body fat" / fat %            → body_fat_pct
- משקל / weight                       → weight_kg
- מסת שריר / lean mass (kg)            → lean_mass_kg
- BMI                                 → bmi
Return ONLY valid JSON matching the schema.`

export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req)
  if (denied) return denied

  const supabase = getServerSupabaseClient()
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError || !users.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = users[0].id

  let text: string
  let dateOverride: string | undefined
  try {
    const body = await req.json() as { text?: unknown; date?: unknown }
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return NextResponse.json({ error: '`text` (string) is required' }, { status: 400 })
    }
    text = body.text.trim()
    if (typeof body.date === 'string') dateOverride = body.date
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  const client = new Anthropic({ apiKey })
  let fields: Fields
  try {
    const resp = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
      output_config: {
        format: {
          type: 'json_schema' as const,
          schema: {
            type: 'object',
            properties: {
              muscle_percent: { type: ['number', 'null'] },
              water_percent:  { type: ['number', 'null'] },
              bone_mineral:   { type: ['number', 'null'] },
              visceral_fat:   { type: ['number', 'null'] },
              bmr:            { type: ['number', 'null'] },
              body_fat_pct:   { type: ['number', 'null'] },
              weight_kg:      { type: ['number', 'null'] },
              lean_mass_kg:   { type: ['number', 'null'] },
              bmi:            { type: ['number', 'null'] },
            },
          },
        },
      },
    })
    const block = resp.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') throw new Error('No text block')
    fields = FieldsSchema.parse(JSON.parse(block.text))
  } catch (err) {
    console.error('[ai/complete-daily] parse error:', err)
    return NextResponse.json({ error: 'Could not parse metrics', detail: String(err) }, { status: 422 })
  }

  // Keep only provided (non-null) fields
  const provided = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => typeof v === 'number'),
  ) as Record<string, number>

  if (!Object.keys(provided).length) {
    return NextResponse.json({ error: 'No recognizable metrics in message' }, { status: 422 })
  }

  const date = dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride) ? dateOverride : todayIsrael()

  // PATCH daily_logs today (upsert so it works even if no Shortcut row yet)
   
  const { error: dlErr } = await supabase
    .from('daily_logs')
    .upsert({ user_id: userId, date, ...provided } as any, { onConflict: 'user_id,date' })
  if (dlErr) return NextResponse.json({ error: 'Update failed', detail: dlErr.message }, { status: 500 })

  // Mirror overlapping fields to body_composition (so charts reflect them)
   
  const bc: Record<string, any> = {}
  if ('water_percent' in provided) bc.water_pct = provided.water_percent
  if ('body_fat_pct' in provided)  bc.body_fat_pct = provided.body_fat_pct
  if ('weight_kg' in provided)     bc.weight_kg = provided.weight_kg
  if ('lean_mass_kg' in provided)  bc.muscle_mass_kg = provided.lean_mass_kg
  if ('bmi' in provided)           bc.bmi = provided.bmi
  if (Object.keys(bc).length) {
    const { data: existing } = await supabase.from('body_composition').select('id').eq('user_id', userId).eq('date', date).limit(1)
    if (((existing ?? []) as unknown[]).length) {
      await supabase.from('body_composition').update(bc as unknown as never).eq('user_id', userId).eq('date', date)
    } else if (bc.weight_kg !== undefined) {
       
      await supabase.from('body_composition').insert({
        user_id: userId, hk_uuid: null, measured_at: `${date}T00:00:00Z`, date,
        weight_kg: bc.weight_kg, body_fat_pct: bc.body_fat_pct ?? null,
        muscle_mass_kg: bc.muscle_mass_kg ?? null, water_pct: bc.water_pct ?? null,
        bone_mass_kg: null, bmi: bc.bmi ?? null,
      } as any)
    }
  }

  return NextResponse.json({ ok: true, date, updated: provided })
}
