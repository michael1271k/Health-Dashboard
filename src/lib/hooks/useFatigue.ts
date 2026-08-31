'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { EMERALD, GOLD, OXIDE, SAND, STEEL } from '@/lib/theme/palette'

/**
 * Three readings a day, in words — and the middle two move with the day.
 *
 * ── WHY A TABLE AND NOT COLUMNS ON `daily_logs` ──────────────────────────────
 * `doms_logs` is the app's proven shape for per-day, per-key subjective data:
 * `(user_id, date, key, value)` with a unique index, upserted on conflict. This
 * copies it exactly, so the hook, the policy and the optimistic update are all
 * the same idea one file over — and a new slot is a row rather than a migration
 * on a table that is already 50 columns wide.
 *
 * ── AND WHY IT DOES NOT FEED THE SCORE ───────────────────────────────────────
 * `computeReadiness` is 100% computed from sleep, battery and recovery, and
 * `scoring/types.ts` calls `sessionRpe` "the only subjective signal the app
 * collects". Letting a self-report move the daily score would make it a number
 * you can talk yourself into — and every historical day has no value to compare
 * against, so every past day would silently be scored under a different rule
 * from every future one. This is a record, not an input.
 *
 * ── FOUR CLOCK SLOTS BECAME THREE, ONE OF WHICH IS CONTEXTUAL ────────────────
 * The old vocabulary was `morning · noon · evening · eod`: four anchors on the
 * clock, on a day whose shape is set by training. Two things were wrong with it.
 *
 * `eod` and `evening` asked the same question ninety minutes apart, and the
 * fourth tap was the one that stopped happening — which is the worst place to
 * lose a reading, because `latestFatigue` treats the last slot as the day's
 * summary.
 *
 * Worse, "Evening" on a leg day and "Evening" on a rest day are not the same
 * question, and the scale could never say which one had been answered. So the
 * middle and last slots now depend on the day:
 *
 *     training day   Waking · Before training · After training
 *     rest day       Waking · Midday          · Night
 *
 * Same three taps either way. What it buys is `fatigueDelta` — post minus pre,
 * the cost of the session in the only unit the wearer actually feels — and a
 * waking-to-waking series that is a clean 24-hour recovery signal because
 * nothing else shares its slot.
 */

/**
 * The whole vocabulary, IN THE ORDER A DAY HAPPENS.
 *
 * Not the slots any one day asks for — that is `slotsForDay`. This is the
 * ordering that makes `latestFatigue` correct for both day types at once:
 * a training day reads `waking(0) → pre(2) → post(3)` and a rest day reads
 * `waking(0) → midday(1) → night(4)`, and both are ascending. A vocabulary
 * ordered any other way would make one of the two run backwards.
 */
export const FATIGUE_SLOTS = ['waking', 'midday', 'pre', 'post', 'night'] as const
export type FatigueSlot = typeof FATIGUE_SLOTS[number]

/** What a rest day asks. */
export const REST_SLOTS: readonly FatigueSlot[] = ['waking', 'midday', 'night']
/** What a training day asks. */
export const TRAINING_SLOTS: readonly FatigueSlot[] = ['waking', 'pre', 'post']

/** The three slots a day of this kind asks for, in the order it asks them. */
export function slotsForDay(isTraining: boolean): readonly FatigueSlot[] {
  return isTraining ? TRAINING_SLOTS : REST_SLOTS
}

export const SLOT_LABEL: Record<FatigueSlot, string> = {
  waking: 'Waking',
  midday: 'Midday',
  pre: 'Before training',
  post: 'After training',
  night: 'Night',
}

/**
 * The old keys, and the slot each one stands in for.
 *
 * The paste-SQL renames them in place, so after it runs this map matches
 * nothing — which is exactly why it stays. Until it runs (and on any device
 * reading a row written by an older build) a day's history must still appear
 * in the right position rather than vanishing, and the app's rule everywhere
 * else is that an un-migrated database degrades quietly instead of showing a
 * blank tracker.
 *
 * `noon` and `evening` resolve DIFFERENTLY on a training day, because that is
 * the whole point of the new vocabulary: a reading taken at noon on a leg day
 * was taken before training, whatever the row happens to be called.
 */
const LEGACY_SLOTS: Record<string, { rest: FatigueSlot; training: FatigueSlot }> = {
  morning: { rest: 'waking', training: 'waking' },
  noon: { rest: 'midday', training: 'pre' },
  evening: { rest: 'night', training: 'post' },
  // `eod` folds onto the same slot as `evening` and WINS when both exist: it is
  // the later reading, and the later reading is the one the day ended on.
  eod: { rest: 'night', training: 'post' },
}

/** The modern slot a stored key means on a day of this kind, or null if unknown. */
export function normalizeSlot(raw: string, isTraining: boolean): FatigueSlot | null {
  if ((FATIGUE_SLOTS as readonly string[]).includes(raw)) return raw as FatigueSlot
  const legacy = LEGACY_SLOTS[raw]
  return legacy ? (isTraining ? legacy.training : legacy.rest) : null
}

/** Stored keys that fold onto the same slot, later-wins. Higher = later. */
const LEGACY_RANK: Record<string, number> = { morning: 0, noon: 1, evening: 2, eod: 3 }

/**
 * Five levels, named — and each with a sentence you can check against yourself.
 *
 * ── THE WORD IS THE CONTROL, THE SENTENCE IS THE DEFINITION ──────────────────
 * Numbers would invite arithmetic the scale does not support: the distance from
 * Fresh to Fine is not the distance from Heavy to Empty, and nothing here
 * averages them. But one word is not a definition either — "Worn" meant whatever
 * the last week had taught it to mean, which is how a five-point scale quietly
 * becomes a three-point one.
 *
 * So every level carries a BEHAVIOURAL sentence: not how you feel, but what you
 * could or would do. "Could train the plan, wouldn't chase a PR" is checkable in
 * a second and gives the same answer in March as it did in August; "moderately
 * tired" does not. The chips still show one word — the tap has to stay cheap —
 * and the sentence appears for the level you are on, with any other's readable
 * on a long press.
 *
 * Stored 1..5 (matching the DB CHECK) because an ordered small integer sorts,
 * indexes and compares; the WORD is what is ever shown.
 */
export interface FatigueLevel {
  value: number
  label: string
  /** Short form, for a row that has no space for the sentence. */
  hint: string
  /** The definition. What you could or would DO at this level. */
  detail: string
  color: string
}

export const FATIGUE_LEVELS: readonly FatigueLevel[] = [
  {
    value: 1, label: 'Fresh', color: EMERALD,
    hint: 'could add a rep',
    detail: 'Could add a rep to everything today.',
  },
  {
    value: 2, label: 'Fine', color: STEEL,
    hint: 'nothing would stop a session',
    detail: 'Normal. Nothing here would stop a planned session.',
  },
  {
    value: 3, label: 'Worn', color: SAND,
    hint: 'the plan, not a PR',
    detail: 'Could train the plan, would not chase a record.',
  },
  {
    value: 4, label: 'Heavy', color: GOLD,
    hint: 'stairs register',
    detail: 'Stairs register. The warm-up would decide whether to train.',
  },
  {
    value: 5, label: 'Empty', color: OXIDE,
    hint: 'would cancel',
    detail: 'Would cancel.',
  },
] as const

export function fatigueLevel(v: number | null | undefined): FatigueLevel | null {
  return FATIGUE_LEVELS.find((l) => l.value === v) ?? null
}

/** A day's readings, slot → level. Absent slots simply were not logged. */
export type FatigueDay = Partial<Record<FatigueSlot, number>>

/**
 * The session's cost, in the only unit the wearer feels: `post` − `pre`.
 *
 * Positive means the session took something out of you, which is the ordinary
 * case and not a warning. Null on a rest day, and on any training day missing
 * either end — a delta computed against an absent reading is a number that looks
 * like a measurement and is not one.
 */
export function fatigueDelta(day: FatigueDay): number | null {
  const pre = day.pre, post = day.post
  if (pre == null || post == null) return null
  return post - pre
}

/**
 * A day's readings.
 *
 * `isTraining` decides how a LEGACY row is filed — see `LEGACY_SLOTS`. It is a
 * parameter rather than a lookup inside the hook because `isTrainingDay` reads
 * the schedule store, which is invisible to React: a component that wants this
 * to update after a swap has to hold `useScheduleVersion()` itself, and hiding
 * that read in here would make the tracker freeze on whatever the cache held at
 * mount. See `useFatigueDay` for the wired-up version.
 */
export function useFatigue(date = logicalTodayISO(), isTraining = false) {
  return useQuery({
    queryKey: ['fatigue_logs', date, isTraining],
    staleTime: 30_000,
    queryFn: async (): Promise<FatigueDay> => {
      const { data, error } = await supabase.from('fatigue_logs')
        .select('slot, level').eq('date', date)
      // Degrade quietly if the table is not migrated yet — the same courtesy
      // `useDoms` extends, for the same reason: a tracker that throws takes the
      // whole day page down with it.
      if (error) return {}
      const out: FatigueDay = {}
      // Which stored key won each slot, so a fold (`evening` + `eod` → `night`)
      // resolves to the LATER reading rather than to whichever row Postgres
      // happened to hand back second.
      const wonBy: Partial<Record<FatigueSlot, number>> = {}
      for (const r of (data ?? []) as Array<{ slot: string; level: number }>) {
        const slot = normalizeSlot(r.slot, isTraining)
        if (!slot) continue
        const rank = LEGACY_RANK[r.slot] ?? 99   // a modern key always outranks a legacy one
        if (wonBy[slot] != null && wonBy[slot]! >= rank) continue
        wonBy[slot] = rank
        out[slot] = r.level
      }
      return out
    },
  })
}

export function useLogFatigue(date = logicalTodayISO()) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ slot, level }: { slot: FatigueSlot; level: number | null }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      // Clearing DELETES rather than writing a zero. There is no "0" level, and
      // a row that exists means the question was answered — which is a fact the
      // export reports and must not be faked.
      //
      // It also clears the LEGACY key this slot may still be stored under, so
      // un-ticking a migrated reading on a database whose paste-SQL has not run
      // does not leave the old row behind to reappear on the next read.
      if (level == null) {
        const legacy = Object.keys(LEGACY_SLOTS)
          .filter((k) => normalizeSlot(k, true) === slot || normalizeSlot(k, false) === slot)
        const { error } = await supabase.from('fatigue_logs')
          .delete().eq('user_id', user.id).eq('date', date)
          .in('slot', [slot, ...legacy])
        if (error) throw new Error(error.message)
        return
      }

      const { error } = await supabase.from('fatigue_logs').upsert(
        { user_id: user.id, date, slot, level } as never,
        { onConflict: 'user_id,date,slot' },
      )
      if (error) throw new Error(error.message)
    },
    // Optimistic, like DOMS: three taps in a row must not each wait for a round
    // trip, and the value is trivially re-derivable if the write fails.
    //
    // Both cache entries for the date are patched — the query key carries
    // `isTraining`, and a swap mid-session must not leave a stale twin behind.
    onMutate: async ({ slot, level }) => {
      await qc.cancelQueries({ queryKey: ['fatigue_logs', date] })
      const prev = qc.getQueriesData<FatigueDay>({ queryKey: ['fatigue_logs', date] })
      qc.setQueriesData<FatigueDay>({ queryKey: ['fatigue_logs', date] }, (old) => {
        const next: FatigueDay = { ...(old ?? {}) }
        if (level == null) delete next[slot]
        else next[slot] = level
        return next
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.prev ?? []) qc.setQueryData(key, data)
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['fatigue_logs', date] }) },
  })
}

/**
 * The day's summary reading — the LATEST slot logged, not the mean.
 *
 * A mean of "Fresh at 7am, Empty at 9pm" is "Worn", which describes neither
 * moment and is the one answer that was never true. The tracker exists to show
 * the shape of a day; the single figure that stands for it is where the day
 * ended up.
 *
 * Iterating `FATIGUE_SLOTS` backwards is correct for BOTH day types — see the
 * note on that constant for why its order is what it is.
 */
export function latestFatigue(day: FatigueDay): { slot: FatigueSlot; level: number } | null {
  for (const slot of [...FATIGUE_SLOTS].reverse()) {
    const level = day[slot]
    if (level != null) return { slot, level }
  }
  return null
}
