'use client'

import { useState } from 'react'
import { CalendarDays, Flag, Sparkles } from 'lucide-react'
import type { SessionDraft } from '@/lib/sessions/draft'
import { draftTotals } from '@/lib/sessions/draft'
import { logicalTodayISO } from '@/lib/utils/day'
import { parseDurationMin } from '@/lib/utils/duration'
import { useLoggedSessionDates } from '@/lib/hooks/useDayVault'
import { DatePickerPopover } from './DatePickerPopover'

type StatPatch = Partial<NonNullable<SessionDraft['stats']>>

/**
 * Deck header: session identity, the custom date picker (late logging, blocks
 * already-logged dates), the editable stats strip (Duration / Avg HR / Calories
 * are tap-to-edit; Volume/Sets are live-derived), and coach insight/flag.
 */
export function CoachHeaderCard({ draft, onSetDate, onSetStats }: {
  draft: SessionDraft
  onSetDate: (dateISO: string) => void
  onSetStats: (patch: StatPatch) => void
}) {
  const totals = draftTotals(draft)
  const s = draft.stats
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: loggedDates } = useLoggedSessionDates()

  const dateLabel = new Date(draft.date + 'T12:00:00Z')
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="helix-card holo-sheen !p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading font-bold text-fluid-xl text-text leading-tight truncate">
            {draft.title ?? draft.splitDay.toUpperCase()}
          </h3>
          <p className="text-xs text-muted mt-0.5">
            {draft.week != null && <>Week {draft.week} · </>}
            {draft.phase && <span className="text-info font-semibold">{draft.phase === 'CUT' ? 'Cut' : draft.phase}</span>}
          </p>
        </div>
        {/* Date chip — tap to open the custom calendar (grays logged/future dates) */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-2 px-3.5 min-h-[44px] rounded-xl text-fluid-sm font-semibold text-text
                       bg-primary/10 border border-primary/30 hover:bg-primary/15 hover:border-primary/50 transition-colors"
            aria-label={`Session date: ${dateLabel}. Tap to change`}
            aria-expanded={pickerOpen}
          >
            <CalendarDays className="w-4 h-4 text-primary" aria-hidden="true" />
            {dateLabel}
          </button>
          {pickerOpen && (
            <DatePickerPopover
              value={draft.date}
              max={logicalTodayISO()}
              disabledDates={loggedDates ?? new Set()}
              onSelect={onSetDate}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Stats strip — Volume/Sets live-derived; Duration/Avg HR/Calories editable. */}
      <div className="grid grid-cols-3 gap-2">
        <Badge label="Volume" value={`${totals.volumeKg.toLocaleString()}`} unit="kg" color="#8B5CF6" />
        <Badge label="Sets" value={String(totals.sets)} color="#22D3EE" />
        <EditBadge label="Duration" value={s?.duration_min ?? null} unit="m" color="#EC4899"
          onChange={(v) => onSetStats({ duration_min: v })} parse={parseDurationMin} />
        <EditBadge label="Avg HR" value={s?.avg_hr_bpm ?? null} unit="bpm" color="#FB7185"
          onChange={(v) => onSetStats({ avg_hr_bpm: v })} />
        <EditBadge label="Calories" value={s?.calories_kcal ?? null} unit="kcal" color="#FBBF24"
          onChange={(v) => onSetStats({ calories_kcal: v })} />
        <Badge
          label="Δ vs prior"
          value={s?.volume_delta_pct_vs_prior != null ? `${s.volume_delta_pct_vs_prior > 0 ? '+' : ''}${s.volume_delta_pct_vs_prior}%` : '—'}
          color={s?.volume_delta_pct_vs_prior != null ? (s.volume_delta_pct_vs_prior >= 0 ? '#34D399' : '#FB7185') : '#8B97B2'}
        />
      </div>

      {draft.coachInsight && (
        <div className="rounded-xl px-3 py-2.5 flex gap-2 items-start"
          style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.22)' }}>
          <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
          <p className="text-sm text-text leading-relaxed" dir="auto">{draft.coachInsight}</p>
        </div>
      )}

      {draft.nextSessionFlag && (
        <div className="rounded-xl px-3 py-2.5 flex gap-2 items-start"
          style={{ background: 'rgba(232,197,122,0.07)', border: '1px solid rgba(232,197,122,0.35)' }}>
          <Flag className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#F5C15A' }} aria-hidden="true" />
          <p className="text-sm leading-relaxed" style={{ color: '#F5C15A' }} dir="auto">{draft.nextSessionFlag}</p>
        </div>
      )}
    </div>
  )
}

function Badge({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div className="rounded-xl px-2 py-2 text-center" style={{ background: `${color}14`, border: `1px solid ${color}33` }}>
      <div className="helix-num font-bold text-fluid-base tabular-nums leading-tight" style={{ color }}>
        {value}{unit && <span className="text-[10px] font-normal ml-0.5 opacity-70">{unit}</span>}
      </div>
      <div className="text-[10px] text-muted mt-0.5">{label}</div>
    </div>
  )
}

/** Tap-to-edit numeric metadata badge (Duration / Avg HR / Calories). */
function EditBadge({ label, value, unit, color, onChange, parse }: {
  label: string; value: number | null; unit: string; color: string
  onChange: (v: number | null) => void
  /** Custom string→number parser (e.g. Duration accepts "1:06"). */
  parse?: (raw: string) => number | null
}) {
  const [editing, setEditing] = useState(false)
  const toNumber = parse ?? ((raw: string) => (raw.trim() === '' ? null : Number(raw)))
  return (
    <div className="rounded-xl px-2 py-2 text-center" style={{ background: `${color}14`, border: `1px solid ${color}33` }}>
      {editing ? (
        <input
          autoFocus
          type={parse ? 'text' : 'number'}
          inputMode="numeric"
          defaultValue={value ?? ''}
          onBlur={(e) => { onChange(toNumber(e.target.value)); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="w-full bg-transparent text-center helix-num font-bold text-fluid-base tabular-nums outline-none"
          style={{ color }}
          aria-label={`Edit ${label}`}
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="w-full" aria-label={`Edit ${label}`}>
          <span className="helix-num font-bold text-fluid-base tabular-nums leading-tight" style={{ color }}>
            {value != null ? value : '—'}{value != null && <span className="text-[10px] font-normal ml-0.5 opacity-70">{unit}</span>}
          </span>
        </button>
      )}
      <div className="text-[10px] text-muted mt-0.5">{label} ✎</div>
    </div>
  )
}
