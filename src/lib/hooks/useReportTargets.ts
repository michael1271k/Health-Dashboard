'use client'

import { useMemo } from 'react'
import { parseFmtV2, hasTargets, type ReportTargets } from '@/lib/reports/fmtV2'
import { useReports } from '@/lib/hooks/useReports'

/**
 * What the most recent pasted report asked for — read, never generated.
 *
 * The newest report describes the week that just ended and prescribes the one
 * you are in, which is why index 0 is the right row and not "the report for
 * this week": on a Tuesday there is no report for this week yet, and there never
 * will be until it is over.
 *
 * Returns `null` targets whenever nothing was pasted or nothing in the paste was
 * recognised. Every consumer renders nothing in that case — an absent
 * prescription is not a prescription of zero.
 */
export interface ReportTargetsResult {
  targets: ReportTargets | null
  /** The week the prescribing report covered, for "from last week's report". */
  weekStart: string | null
  isLoading: boolean
}

export function useReportTargets(): ReportTargetsResult {
  const { data, isLoading } = useReports()
  const latest = data?.[0]
  const md = latest?.content_md ?? null

  const targets = useMemo(() => {
    const parsed = parseFmtV2(md)
    return parsed && hasTargets(parsed.targets) ? parsed.targets : null
  }, [md])

  return { targets, weekStart: latest?.week_start ?? null, isLoading }
}
