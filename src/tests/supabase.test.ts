import { SPLIT } from '@/lib/theme/palette'
// Unit tests for Supabase utilities (does not require a real connection)
// Tests that the client factory throws on missing env vars

import { getServerSupabaseClient } from '@/lib/supabase/server'
import { PPL_SPLITS } from '@/lib/types/workout'

describe('Supabase client', () => {
  it('exports a supabase client creator with correct shape', () => {
    // The client module throws if env vars are missing,
    // so we verify the server client factory is a function
    expect(typeof getServerSupabaseClient).toBe('function')
  })
})

describe('Database types', () => {
  it('PPL_SPLITS covers all five PPL+ split days', () => {
    expect(Object.keys(PPL_SPLITS)).toEqual(['push', 'pull', 'legs', 'upper', 'lower'])
    expect((PPL_SPLITS as Record<string, unknown>)['energy']).toBeUndefined()
  })

  it('PPL_SPLITS uses the jewel-tone palette (one hue per split, no collisions)', () => {
    expect(PPL_SPLITS.push.color).toBe(SPLIT.push)
    expect(PPL_SPLITS.pull.color).toBe(SPLIT.pull)
    expect(PPL_SPLITS.legs.color).toBe(SPLIT.legs)
    expect(PPL_SPLITS.upper.color).toBe(SPLIT.upper)
    expect(PPL_SPLITS.lower.color).toBe(SPLIT.lower)
    // every split must be visually distinct
    const hues = Object.values(PPL_SPLITS).map((s) => s.color)
    expect(new Set(hues).size).toBe(hues.length)
  })

  it('PPL_SPLITS legs label is Legs (canonical combined split)', () => {
    expect(PPL_SPLITS.legs.label).toBe('Legs')
  })
})
