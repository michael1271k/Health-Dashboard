'use client'

import { useEffect, useState } from 'react'
import { Scale, Plus, Pencil } from 'lucide-react'
import { BodyMap } from '@/components/day/BodyMap'
import { InBodyForm, InBodyHeadline, hasScaleMetrics } from '@/components/day/InBodyCard'
import { Sheet } from '@/components/ui/Sheet'
import type { DayVaultData } from '@/lib/hooks/useDayVault'

const TEAL = '#E0703C'

/**
 * The Body page of the Nexus pager — the whole body-composition domain in one
 * place, whether or not the day has been weighed.
 *
 * WHAT THIS REPLACES
 * The pager's Body page rendered `BodyMap`, which early-returns a one-sentence
 * stub on any day without a weigh-in — so a named tab led to a dead end most
 * days. The form that would fill it (`InBodyCard`) sat ~400px further down the
 * page, below all three tabs, so the fix for the empty page was somewhere you
 * had to scroll past the empty page to find.
 *
 * Now the page is self-sufficient: no reading → it IS the entry prompt; a
 * reading → the silhouette, the four headline numbers, and an Edit row. Either
 * way the form opens in a Sheet rather than inline, because pager pages share a
 * height and nine inputs would make the Sleep and Hydration pages that tall too.
 */
export function BodyPanel({ date, log, openEditor = false, onEditorClosed }: {
  date: string
  log: DayVaultData['log']
  /** Deep-link (`?section=inbody`) opens the editor on mount. */
  openEditor?: boolean
  onEditorClosed?: () => void
}) {
  const [editing, setEditing] = useState(openEditor)
  const has = hasScaleMetrics(log)

  // The deep-link arrives after the query resolves, so honour it whenever it
  // flips true rather than only at first render.
  useEffect(() => { if (openEditor) setEditing(true) }, [openEditor])

  const close = () => { setEditing(false); onEditorClosed?.() }

  return (
    <>
      <section className="helix-card space-y-3" style={{ borderColor: `${TEAL}26` }}>
        {has ? (
          <>
            <BodyMap log={log} />
            <InBodyHeadline log={log} />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="w-full flex items-center gap-2.5 min-h-[44px] text-left text-muted hover:text-text transition-colors"
            >
              <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: `${TEAL}1a`, color: TEAL }}>
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="flex-1 text-fluid-xs font-medium">Edit measurements</span>
            </button>
          </>
        ) : (
          /* No weigh-in. The page is the prompt — not a stub telling you to go
             and find a card elsewhere. */
          <div className="flex flex-col items-center justify-center text-center gap-3 py-8">
            <span className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: `${TEAL}1a`, color: TEAL, boxShadow: `0 0 18px ${TEAL}33` }}>
              <Scale className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-heading font-semibold text-fluid-sm text-text">No weigh-in today</p>
              <p className="text-[11px] text-muted mt-0.5 max-w-[240px]">
                Weight plus body-fat or muscle % maps your composition.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-primary min-h-[44px] px-4 justify-center"
              style={{ background: TEAL, boxShadow: `0 0 18px ${TEAL}55` }}
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Add scale metrics
            </button>
          </div>
        )}
      </section>

      <Sheet open={editing} onClose={close} title="InBody &amp; Scale Metrics">
        <p className="text-[11px] text-muted mb-3">
          Enter weight and a percentage — the masses derive and save themselves.
        </p>
        <InBodyForm date={date} log={log} onSaved={close} />
      </Sheet>
    </>
  )
}
