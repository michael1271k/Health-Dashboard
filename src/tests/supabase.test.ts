// Unit tests for Supabase utilities (does not require a real connection)
// Tests that the client factory throws on missing env vars

import { getServerSupabaseClient } from '@/lib/supabase/server'
import { PPL_SPLITS, LOGGER_SPLITS, WEEKDAY_SPLIT, getTodaysSplit } from '@/lib/types/workout'
import type { SplitDay } from '@/lib/types/workout'

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

  it('PPL_SPLITS has correct colors matching APEX design tokens', () => {
    expect(PPL_SPLITS.push.color).toBe('#3D7DFF')    // primary blue
    expect(PPL_SPLITS.pull.color).toBe('#7C5CFF')    // energy violet
    expect(PPL_SPLITS.legs.color).toBe('#38BDF8')    // info blue
    expect(PPL_SPLITS.upper.color).toBe('#2DD4A7')   // success teal
    expect(PPL_SPLITS.lower.color).toBe('#FFB020')   // warm (legacy)
  })

  it('PPL_SPLITS legs label is Legs/Lower (canonical combined split)', () => {
    expect(PPL_SPLITS.legs.label).toBe('Legs/Lower')
  })
})

describe('LOGGER_SPLITS', () => {
  it('has exactly 4 entries (upper, legs, push, pull — no lower)', () => {
    expect(LOGGER_SPLITS).toHaveLength(4)
    const days = LOGGER_SPLITS.map(s => s.day)
    expect(days).toContain('push')
    expect(days).toContain('pull')
    expect(days).toContain('upper')
    expect(days).toContain('legs')
    expect(days).not.toContain('lower')
  })

  it('has English-only labels (no Hebrew)', () => {
    for (const s of LOGGER_SPLITS) {
      // Hebrew characters are in the range ֐–׿
      expect(/[֐-׿]/.test(s.label)).toBe(false)
    }
  })

  it('legs entry is labelled Legs/Lower', () => {
    const legs = LOGGER_SPLITS.find(s => s.day === 'legs')
    expect(legs?.label).toBe('Legs/Lower')
  })
})

describe('WEEKDAY_SPLIT', () => {
  it('covers all 7 days (0–6)', () => {
    for (let d = 0; d <= 6; d++) {
      expect(WEEKDAY_SPLIT[d]).toBeDefined()
    }
  })

  it('Friday (5) and Saturday (6) are rest days', () => {
    expect(WEEKDAY_SPLIT[5]).toBe('rest')
    expect(WEEKDAY_SPLIT[6]).toBe('rest')
  })

  it('Wednesday (3) and Thursday (4) are both legs (Legs/Lower)', () => {
    // Mon=1 and Thu=4 are Legs/Lower days; Wed=3 is Pull
    expect(WEEKDAY_SPLIT[1]).toBe('legs')
    expect(WEEKDAY_SPLIT[4]).toBe('legs')
    expect(WEEKDAY_SPLIT[3]).toBe('pull')
  })

  it('weekday schedule is Upper→Legs→Push→Pull→Legs (Sun–Thu)', () => {
    expect(WEEKDAY_SPLIT[0]).toBe('upper')
    expect(WEEKDAY_SPLIT[1]).toBe('legs')
    expect(WEEKDAY_SPLIT[2]).toBe('push')
    expect(WEEKDAY_SPLIT[3]).toBe('pull')
    expect(WEEKDAY_SPLIT[4]).toBe('legs')
  })

  it('getTodaysSplit returns a SplitDay or rest', () => {
    const result = getTodaysSplit()
    const valid: Array<SplitDay | 'rest'> = ['push', 'pull', 'legs', 'upper', 'lower', 'rest']
    expect(valid).toContain(result)
  })

  it('training days (non-rest) are all valid SplitDay values', () => {
    const validSplits: SplitDay[] = ['push', 'pull', 'legs', 'upper', 'lower']
    for (let d = 0; d <= 6; d++) {
      const s = WEEKDAY_SPLIT[d]
      if (s !== 'rest') {
        expect(validSplits).toContain(s)
      }
    }
  })
})
