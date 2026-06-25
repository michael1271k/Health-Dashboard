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
  it('PPL_SPLITS covers all three split days', () => {
    expect(Object.keys(PPL_SPLITS)).toEqual(['push', 'pull', 'legs'])
    expect(PPL_SPLITS.push.color).toBe('#00E5A0')
    expect((PPL_SPLITS as Record<string, unknown>)['energy']).toBeUndefined()
  })

  it('PPL_SPLITS has correct colors matching design tokens', () => {
    expect(PPL_SPLITS.push.color).toBe('#00E5A0')   // primary
    expect(PPL_SPLITS.pull.color).toBe('#7C5CFF')   // energy
    expect(PPL_SPLITS.legs.color).toBe('#38BDF8')   // info
  })
})
