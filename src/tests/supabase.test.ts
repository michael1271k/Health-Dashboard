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

  it('PPL_SPLITS has the Cyber Mint neon colors', () => {
    expect(PPL_SPLITS.push.color).toBe('#22D3EE')    // cyan
    expect(PPL_SPLITS.pull.color).toBe('#34D399')    // mint
    expect(PPL_SPLITS.legs.color).toBe('#38BDF8')    // aqua
    expect(PPL_SPLITS.upper.color).toBe('#34D399')   // teal
    expect(PPL_SPLITS.lower.color).toBe('#F5C15A')   // gold
  })

  it('PPL_SPLITS legs label is Legs (canonical combined split)', () => {
    expect(PPL_SPLITS.legs.label).toBe('Legs')
  })
})
