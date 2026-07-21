'use client'

import { supabase } from '@/lib/supabase/client'

/**
 * Boot-time preference hydration: the database row (user_goals) is the source
 * of truth for device preferences; localStorage is only its per-device cache
 * for synchronous reads. Pulling on every launch makes Safari, the Home-Screen
 * PWA, and any other browser context render with identical settings.
 */
export async function hydratePrefsFromDb(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('user_goals')
      .select('unit_system, reduce_motion, active_program')
      .maybeSingle()
    if (error || !data) return // columns not migrated yet / no row — device values stand
    const g = data as { unit_system: string | null; reduce_motion: boolean | null; active_program: string | null }

    if (g.unit_system) localStorage.setItem('helix_units', g.unit_system)
    if (g.reduce_motion != null) {
      localStorage.setItem('helix_reduce_motion', g.reduce_motion ? '1' : '0')
      document.documentElement.dataset.reduceMotion = g.reduce_motion ? 'true' : 'false'
    }
    if (g.active_program) localStorage.setItem('helix_active_program', g.active_program)
    // Wake any mounted listeners (unit hooks re-read on this event).
    window.dispatchEvent(new Event('apex-units-change'))
  } catch { /* never block boot on preference sync */ }
}
