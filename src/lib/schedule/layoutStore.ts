/**
 * A synchronous read-through cache for `program_day_layout`.
 *
 * **Supabase is the source of truth.** This module exists for one reason:
 * `programDayFor` and `scheduleDayFor` (programs.ts) are SYNCHRONOUS and are
 * called during render, by roughly every surface that names a day. A permanent
 * weekday remap has to be readable from inside them, which rules out a hook and
 * rules out awaiting anything.
 *
 * ── IT IS A PROPER EXTERNAL STORE, NOT A MODULE VARIABLE ─────────────────────
 * That distinction is the whole lesson of `schedule/overrides.ts:13-26`: a plain
 * cached object is INVISIBLE to React, so when the DB fetch lands and replaces
 * it, nothing re-renders — no component is subscribed to a variable. The visible
 * bug there (2026-08-04) was a swap that wrote correctly, fetched correctly, and
 * still drew the old day, because `scheduleDayFor` had already been called and
 * nothing asked it again.
 *
 * So: every write bumps a version, `useScheduleVersion()` subscribes to it
 * alongside the override and plan-prefs stores, and reads stay synchronous.
 *
 * SSR-safe: on the server the cache is empty and every caller falls back to the
 * weekday authored in programs.ts, which is the correct answer for a device that
 * has never remapped anything.
 */
import { parseLayout, type DayLayout } from './layout'

const KEY = 'helix_program_layout'

/** programId → layout. One plan can be remapped without touching another. */
type Store = Record<string, DayLayout>

let cache: Store | null = null
let version = 0
const listeners = new Set<() => void>()

function emit(): void {
  version += 1
  for (const l of listeners) l()
}

/** Subscribe to layout changes. Returns an unsubscribe. */
export function subscribeProgramLayout(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Monotonic counter — changes exactly when some plan's layout changes. */
export function programLayoutVersion(): number {
  return version
}

function load(): Store {
  if (cache) return cache
  if (typeof window === 'undefined') { cache = {}; return cache }
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    const out: Store = {}
    for (const [programId, layout] of Object.entries(raw ?? {})) out[programId] = parseLayout(layout)
    cache = out
  } catch {
    cache = {}
  }
  return cache
}

function persist(c: Store): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(KEY, JSON.stringify(c)) } catch { /* ignore */ }
}

/** The stored layout for a plan — `{}` means "run it exactly as authored". */
export function getProgramLayout(programId: string): DayLayout {
  return load()[programId] ?? {}
}

/** Optimistic local write, mirroring the DB upsert so the UI cascades at once. */
export function setProgramLayoutLocal(programId: string, layout: DayLayout | null): void {
  const c = load()
  if (layout == null) {
    if (!(programId in c)) return
    delete c[programId]
  } else {
    c[programId] = layout
  }
  persist(c)
  emit()
}

/**
 * Replace the whole cache from a DB fetch — the cross-device sync path.
 *
 * Emits only when something actually differs, so the routine revalidation that
 * returns identical rows costs no renders. The comparison is on VALUES, never on
 * `JSON.stringify` of the raw payloads: Postgres re-orders jsonb keys, so two
 * identical layouts serialise differently and every refetch would look like a
 * change (see `canonicalLayout`).
 */
export function hydrateProgramLayouts(rows: Array<{ program_id: string; layout: unknown }>): void {
  const next: Store = {}
  for (const r of rows) next[r.program_id] = parseLayout(r.layout)
  const prev = load()

  const ids = new Set([...Object.keys(prev), ...Object.keys(next)])
  let changed = false
  for (const id of ids) {
    const a = prev[id] ?? {}
    const b = next[id] ?? {}
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      if (a[k] !== b[k]) { changed = true; break }
    }
    if (changed) break
  }

  cache = next
  persist(next)
  if (changed) emit()
}

/**
 * Another TAB remapped the week. `storage` events fire only in the OTHER
 * documents, which is exactly right: the writing tab already emitted.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    try {
      const raw = JSON.parse(e.newValue ?? '{}') as Record<string, unknown>
      const out: Store = {}
      for (const [programId, layout] of Object.entries(raw ?? {})) out[programId] = parseLayout(layout)
      cache = out
    } catch {
      cache = {}
    }
    emit()
  })
}
