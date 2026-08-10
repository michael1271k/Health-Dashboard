'use client'

import { useState } from 'react'
import { Scale, Plus, Pencil, Check } from 'lucide-react'
import { BodyMap } from '@/components/day/BodyMap'
import { InBodyHeadline, hasScaleMetrics } from '@/components/day/InBody'
import { useSaveBodyMetrics, type DayVaultData } from '@/lib/hooks/useDayVault'
import { WEIGH_IN_SKIP_REASONS, DEFAULT_WEIGH_IN_SKIP_REASON, weighInSkipReason } from '@/lib/body/weighIn'
import { EMBER } from '@/lib/theme/palette'

// Was `const ACCENT = '#E0703C'` — a name that lied about its value in two
// separate files. The Body domain's accent is the signature ember.
const ACCENT = EMBER

/**
 * Why there is no weight today.
 *
 * A missing weigh-in and a deliberately skipped one look identical in the data,
 * and the weekly export has been printing `[Skip: no reason recorded]` on every
 * weightless day since the reader shipped — the column exists, nothing writes
 * it. This is the writer.
 *
 * "AS PLANNED" IS THE DEFAULT, AND IT IS NOT STORED. Skipping the scale before a
 * bowel movement is the protocol, not a lapse, so an unrecorded day resolves to
 * it — on every past and future day alike, with no backfill and no write. The
 * chip therefore shows as SELECTED whenever nothing else is, and tapping it
 * clears the column back to null rather than writing the default text: storing
 * the default would make the day indistinguishable from one deliberately marked,
 * and would freeze today's wording into old rows if it ever changed.
 *
 * Chips rather than a dropdown: six options is a row, not a menu. Recording a
 * reason must NEVER look like a weigh-in — this writes one text column and
 * touches nothing `hasScaleMetrics` reads, so a skipped day still reads as
 * skipped on every other surface.
 */
function WeighInSkip({ date, current }: { date: string; current: string | null }) {
  const save = useSaveBodyMetrics(date)
  const [other, setOther] = useState('')
  const [showOther, setShowOther] = useState(false)
  // What the day MEANS right now — the stored reason, or the default.
  const effective = weighInSkipReason(current)
  const isPreset = (WEIGH_IN_SKIP_REASONS as readonly string[]).includes(effective)

  const set = (reason: string | null) => save.mutate({ weighin_skip_reason: reason })

  return (
    <div className="w-full space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-muted text-center">Why?</p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {WEIGH_IN_SKIP_REASONS.map((r) => {
          const on = effective === r
          return (
            <button
              key={r}
              type="button"
              // Tapping any chip while it is already on returns the day to the
              // default, which is `null` — including the default's own chip,
              // where the tap is simply a no-op write of null.
              onClick={() => set(on || r === DEFAULT_WEIGH_IN_SKIP_REASON ? null : r)}
              aria-pressed={on}
              className="rounded-full px-3 min-h-[36px] text-[11px] font-semibold transition-colors"
              style={{
                color: on ? ACCENT : undefined,
                background: on ? `${ACCENT}1f` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${on ? `${ACCENT}66` : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {r}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => { setShowOther((v) => !v); if (!isPreset) setOther(effective) }}
          aria-pressed={!isPreset}
          className="rounded-full px-3 min-h-[36px] text-[11px] font-semibold transition-colors"
          style={{
            color: !isPreset ? ACCENT : undefined,
            background: !isPreset ? `${ACCENT}1f` : 'rgba(255,255,255,0.03)',
            border: `1px solid ${!isPreset ? `${ACCENT}66` : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          {!isPreset ? effective : 'Other…'}
        </button>
      </div>

      {showOther && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Reason"
            maxLength={60}
            className="flex-1 min-w-0 rounded-lg bg-white/[0.03] border border-white/[0.08] px-2.5 min-h-[36px]
                       text-[11px] text-text placeholder:text-muted/40 outline-none focus:border-primary/40"
            aria-label="Other skip reason"
          />
          <button
            type="button"
            onClick={() => { const v = other.trim(); if (v) { set(v); setShowOther(false) } }}
            disabled={!other.trim()}
            className="btn-glass min-h-[36px] px-2.5 disabled:opacity-40"
            aria-label="Save reason"
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The Body page of the Nexus pager — the whole body-composition domain in one
 * place, whether or not the day has been weighed.
 *
 * WHAT THIS REPLACES
 * The pager's Body page rendered `BodyMap`, which early-returns a one-sentence
 * stub on any day without a weigh-in — so a named tab led to a dead end most
 * days. The form that would fill it (the old `InBodyCard`) sat ~400px further
 * down the page, below all three tabs, so the fix for the empty page was
 * somewhere you had to scroll past the empty page to find.
 *
 * Now the page is self-sufficient: no reading → it IS the entry prompt; a
 * reading → the silhouette, the four headline numbers, and an Edit row. Either
 * way the form opens in its own drawer rather than inline: nine inputs inside a
 * summary would make the band as tall as the thing it summarises.
 */
export function BodyPanel({ date, log, onEdit }: {
  date: string
  log: DayVaultData['log']
  /**
   * Open the scale-metrics form.
   *
   * BodyPanel used to own that form and render it in its own <Sheet>. It is now
   * itself the body of a sheet, and a sheet inside a sheet for a FORM is the
   * wrong shape — a form is a push, not a second drawer over the first. The
   * page owns one drawer enum, so `inbody` REPLACES `body` and closing it
   * returns there. That also deleted the `?section=inbody` deep link's 120ms
   * setTimeout, which was racing a query resolution.
   */
  onEdit: () => void
}) {
  const has = hasScaleMetrics(log)
  // A day is "unweighed" on the WEIGHT, not on whether some other field was
  // filled — entering a BMI alone doesn't mean you stood on the scale.
  const unweighed = log?.weight_kg == null

  return (
    <>
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-3" style={{ borderColor: `${ACCENT}26` }}>
        {has ? (
          <>
            <BodyMap log={log} />
            <InBodyHeadline log={log} date={date} />
            <button
              type="button"
              onClick={onEdit}
              className="w-full flex items-center gap-2.5 min-h-[44px] text-left text-muted hover:text-text transition-colors"
            >
              <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: `${ACCENT}1a`, color: ACCENT }}>
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span className="flex-1 text-fluid-xs font-medium">Edit measurements</span>
            </button>
            {unweighed && <WeighInSkip date={date} current={log?.weighin_skip_reason ?? null} />}
          </>
        ) : (
          /* No weigh-in. The page is the prompt — not a stub telling you to go
             and find a card elsewhere. */
          <div className="flex flex-col items-center justify-center text-center gap-3 py-8">
            <span className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: `${ACCENT}1a`, color: ACCENT, boxShadow: `0 0 18px ${ACCENT}33` }}>
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
              onClick={onEdit}
              className="btn-primary min-h-[44px] px-4 justify-center"
              style={{ background: ACCENT, boxShadow: `0 0 18px ${ACCENT}55` }}
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Add scale metrics
            </button>
            <WeighInSkip date={date} current={log?.weighin_skip_reason ?? null} />
          </div>
        )}
      </section>

    </>
  )
}
