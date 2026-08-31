'use client'

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'

/**
 * ── ONE PLACE TO GET THE OPTIMISTIC DANCE RIGHT ──────────────────────────────
 *
 * Forty-six `useMutation` call sites exist in this app. Five of them were
 * optimistic; the other forty-one wrote, waited for the network, and only then
 * invalidated — so every tap on a water figure, a cardio entry, a macro
 * override or a daily target held the number still until Supabase answered. On
 * a phone in a gym that is not a spinner, it is a control that appears not to
 * have registered the tap, which is the thing people tap twice.
 *
 * The dance has four steps and all four are load-bearing:
 *
 *   1. `cancelQueries` — an in-flight refetch that resolves AFTER the optimistic
 *      write would overwrite it with the pre-write server state. This is the
 *      step everyone forgets, and it fails intermittently, which is worse.
 *   2. snapshot — the rollback needs the exact previous value, not a
 *      reconstruction of it.
 *   3. `setQueryData` — the UI moves now.
 *   4. rollback on error, invalidate on settle — the server is still the
 *      authority, it is simply consulted second.
 *
 * Hand-writing that forty-one times is how step 1 goes missing. The five that
 * already do it correctly (`useSupplements`, `useRecovery`, `useFatigue`,
 * `useSleepOnset`, `useNutritionException`) are left alone: they are tested,
 * and rewriting working rollbacks to route through a new abstraction is risk
 * with no payoff.
 *
 * ── ON TYPES ─────────────────────────────────────────────────────────────────
 * `apply` receives and returns `unknown` deliberately. A patch usually spans
 * several caches of different shapes (the day bundle, the day vault, a trend
 * series), and forcing one generic across them would either erase the
 * differences or need a type parameter per entry. Each call site casts what it
 * actually knows, in one line, where the shape is obvious.
 */
export interface OptimisticPatch<TVars> {
  /** Exact key to patch. Prefixes are for invalidation; a WRITE must be exact. */
  key: QueryKey
  /**
   * Next cached value for this entry. Return `undefined` to leave it untouched —
   * which is the right answer when the cache has nothing for this key yet, since
   * seeding it here would invent a value the server never sent.
   */
  apply: (prev: unknown, vars: TVars) => unknown
}

export function useOptimisticMutation<TVars, TData = unknown>({
  mutationFn,
  patches,
  invalidate = [],
  onSuccess,
  onError,
}: {
  mutationFn: (vars: TVars) => Promise<TData>
  /** Caches to move before the network is consulted. */
  patches: (vars: TVars) => OptimisticPatch<TVars>[]
  /** Key PREFIXES to invalidate once the write settles, either way. */
  invalidate?: QueryKey[]
  onSuccess?: (data: TData, vars: TVars) => void
  onError?: (error: unknown, vars: TVars) => void
}) {
  const qc = useQueryClient()

  return useMutation<TData, unknown, TVars, { snapshots: Array<[QueryKey, unknown]> }>({
    mutationFn,

    onMutate: async (vars) => {
      const entries = patches(vars)
      // Cancel FIRST, all of them, before any write: a refetch already in
      // flight against any patched key would land on top of the optimistic
      // value and silently revert it.
      await Promise.all(entries.map((e) => qc.cancelQueries({ queryKey: e.key })))

      const snapshots: Array<[QueryKey, unknown]> = []
      for (const entry of entries) {
        const prev = qc.getQueryData(entry.key)
        const next = entry.apply(prev, vars)
        if (next === undefined) continue
        snapshots.push([entry.key, prev])
        qc.setQueryData(entry.key, next)
      }
      return { snapshots }
    },

    onError: (error, vars, ctx) => {
      // Restore in reverse, so overlapping keys unwind in the order they were
      // written rather than the order they were listed.
      for (const [key, prev] of [...(ctx?.snapshots ?? [])].reverse()) {
        qc.setQueryData(key, prev)
      }
      onError?.(error, vars)
    },

    onSuccess,

    // Settled, not success: a rolled-back cache is still a cache that disagrees
    // with the server about why, and the refetch is what ends the argument.
    onSettled: () => {
      for (const key of invalidate) qc.invalidateQueries({ queryKey: key })
    },
  })
}
