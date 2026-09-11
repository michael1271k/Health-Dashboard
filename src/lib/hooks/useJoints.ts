'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import type { SorenessSide } from '@/lib/body/subRegions'

/**
 * Joint and connective-tissue complaints — knees, wrists, elbows, AC joints, the
 * lumbar junction.
 *
 * ── BINARY, AND THAT IS THE DESIGN ───────────────────────────────────────────
 * The row's existence IS the flag. There is no severity column, because a 1–10
 * scale that nothing reads is a field that only ever rots: the readiness engine
 * does not look at this table, the workout recommender does not gate on it, and
 * a number nobody consumes would invite both of those to start — quietly, and
 * without the evidence a scored input needs.
 *
 * What it IS for: audit history, the raw weekly export, and giving a reader
 * (human or model) the context that the week's pressing dropped off because a
 * shoulder was complaining, not because the plan changed.
 *
 * ── WHY NOT A DOMS ROW WITH A FLAG ───────────────────────────────────────────
 * `doms_logs` rows are severities that reach the battery. A knee is not a
 * muscle, has no landmark, folds onto no DOMS group, and must never reach the
 * denominator — so sharing the table would mean a `where` clause on every read
 * that scores, and the first one anybody forgot would be a silent scoring bug.
 * A separate table cannot be forgotten.
 */

export interface JointFlag {
  joint: string
  side: SorenessSide
  note: string | null
}

// The key is written out at every site rather than hidden behind a helper: the
// coverage test in `query-key-coverage.test.ts` discovers registered keys by
// reading `useQuery` key literals, and a helper makes this table invisible to
// it — which is how a dead key once sat in seventeen places looking like
// coverage.
/** Today's flagged joints. Empty (not an error) when the table isn't migrated. */
export function useJointFlags(date = logicalTodayISO()) {
  return useQuery({
    queryKey: ['joint_flags', date],
    staleTime: 30_000,
    queryFn: async (): Promise<JointFlag[]> => {
      const { data, error } = await supabase.from('joint_flags')
        .select('joint, side, note').eq('date', date)
      if (error) return []   // table not migrated yet → degrade quietly
      return (data ?? []).map((r) => {
        const row = r as Partial<JointFlag>
        return {
          joint: String(row.joint ?? ''),
          side: (row.side ?? 'both') as SorenessSide,
          note: row.note ?? null,
        }
      })
    },
  })
}

const sameFlag = (a: Pick<JointFlag, 'joint' | 'side'>, b: Pick<JointFlag, 'joint' | 'side'>) =>
  a.joint === b.joint && a.side === b.side

/**
 * Raise or clear a joint flag.
 *
 * `on: false` deletes the row rather than writing a false, for the reason the
 * table has no severity: absence is the "no" and there is only one way to spell
 * it. A row meaning "not sore" would make the export's empty cell ambiguous.
 *
 * A note updates in place, so editing the words does not clear the flag.
 */
export function useToggleJoint(date = logicalTodayISO()) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ joint, side = 'both', on, note = null }: {
      joint: string; side?: SorenessSide; on: boolean; note?: string | null
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      if (!on) {
        const { error } = await supabase.from('joint_flags').delete()
          .eq('user_id', user.id).eq('date', date).eq('joint', joint).eq('side', side)
        if (error) throw new Error(error.message)
        return
      }
      const { error } = await supabase.from('joint_flags').upsert(
        { user_id: user.id, date, joint, side, note } as never,
        { onConflict: 'user_id,date,joint,side' },
      )
      if (error) throw new Error(error.message)
    },
    onMutate: async ({ joint, side = 'both', on, note = null }) => {
      await qc.cancelQueries({ queryKey: ['joint_flags', date] })
      const prev = qc.getQueryData<JointFlag[]>(['joint_flags', date])
      const rest = (prev ?? []).filter((f) => !sameFlag(f, { joint, side }))
      qc.setQueryData(['joint_flags', date], on ? [...rest, { joint, side, note }] : rest)
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['joint_flags', date], ctx.prev) },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['joint_flags', date] })
      // The weekly export reads `joint_flags` directly and caches the rendered
      // markdown, so flagging a knee and immediately tapping "Export Week"
      // would paste the document from before the flag. Same failure mode
      // `useLogDoms` documents for soreness.
      qc.invalidateQueries({ queryKey: ['weekly_export'] })
    },
  })
}
