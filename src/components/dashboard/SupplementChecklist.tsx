'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Pencil, Undo2, EyeOff } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { STEEL } from '@/lib/theme/palette'
import { stackForDate, type Supplement } from '@/lib/supplements'
import { isTrainingDay } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { useSupplements, useSkipSupplement } from '@/lib/hooks/useSupplements'
import {
  useCustomSupplements, useAddCustomSupplement, useDeleteCustomSupplement,
  useUpdateCustomSupplement, customSlotsForDate,
} from '@/lib/hooks/useCustomSupplements'

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const COLORS = ['#8E9AAC', '#E0703C', '#3E9E7A', '#3D7AB8', '#D4AF37', '#B4522A']
const FORMS = ['pill', 'capsule', 'powder', 'tablet', 'liquid']

/** How far left the row travels to park its actions open. */
const ACTIONS_W = 132

/** The one media query that decides whether the row moves at all. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/**
 * One supplement, with its actions parked off-screen to the right.
 *
 * ── WHY THE CHECKBOX IS GONE ─────────────────────────────────────────────────
 * Ticking nine boxes a day was the interaction, and it produced a record that
 * was wrong more often than it was right: the app is not open at 22:00 most
 * nights, so the bedtime doses went unticked and the export called them skipped.
 * The stack is a protocol — the whole point of writing one down is that it is
 * what happens by default. So the row states the fact and asks for nothing.
 *
 * What is left is the exception, and an exception deserves a deliberate gesture
 * rather than a control sitting under your thumb all day. Swiping left parks
 * three actions; tapping the row opens the same three in a sheet, which is also
 * the whole interaction under `prefers-reduced-motion` and for anyone driving
 * this from a keyboard or VoiceOver.
 */
function SupplementRow({
  item, accent, time, skipped, onSkip, onUnskip, onEdit, onDelete,
}: {
  item: Supplement
  accent: string
  time: string
  skipped: boolean
  onSkip: () => void
  onUnskip: () => void
  onEdit: (() => void) | null
  onDelete: (() => void) | null
}) {
  const reduced = usePrefersReducedMotion()
  const [dx, setDx] = useState(0)
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState(false)
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null)

  const settle = (to: number) => { setDx(to); setOpen(to !== 0) }

  const onPointerDown = (e: React.PointerEvent) => {
    if (reduced) return
    start.current = { x: e.clientX, y: e.clientY, dragging: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    const mx = e.clientX - s.x
    const my = e.clientY - s.y
    // Vertical intent wins: this row lives in a scrolling sheet, and a swipe
    // handler that captures a downward drag makes the whole list feel stuck.
    if (!s.dragging && Math.abs(my) > Math.abs(mx)) { start.current = null; return }
    if (!s.dragging && Math.abs(mx) < 6) return
    s.dragging = true
    setDx(Math.max(-ACTIONS_W, Math.min(0, (open ? -ACTIONS_W : 0) + mx)))
  }
  const onPointerUp = () => {
    const s = start.current
    start.current = null
    if (!s) return
    if (!s.dragging) { setSheet(true); return }   // a tap, not a drag
    settle(dx < -ACTIONS_W / 2 ? -ACTIONS_W : 0)
  }

  const actions = (
    <>
      {skipped ? (
        <button onClick={() => { onUnskip(); settle(0); setSheet(false) }}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-text/80">
          <Undo2 className="w-4 h-4" aria-hidden="true" /> Undo
        </button>
      ) : (
        <button onClick={() => { onSkip(); settle(0); setSheet(false) }}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-text/80">
          <EyeOff className="w-4 h-4" aria-hidden="true" /> Skip
        </button>
      )}
      {onEdit && (
        <button onClick={() => { onEdit(); settle(0); setSheet(false) }}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-text/80">
          <Pencil className="w-4 h-4" aria-hidden="true" /> Edit
        </button>
      )}
      {onDelete && (
        <button onClick={() => { onDelete(); settle(0); setSheet(false) }}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-danger">
          <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete
        </button>
      )}
    </>
  )

  return (
    <>
      <div className="relative overflow-hidden rounded-xl">
        {/* Parked behind the row. `aria-hidden` because the sheet carries the
            same three actions and is the path assistive tech actually takes. */}
        <div className="absolute inset-y-0 right-0 flex items-stretch" style={{ width: ACTIONS_W }} aria-hidden="true">
          {actions}
        </div>
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { start.current = null; settle(0) }}
          onClick={(e) => { if (start.current) e.preventDefault() }}
          aria-label={`${item.name}${skipped ? ' — skipped today' : ''}. Actions.`}
          className="relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border text-left min-h-[48px] touch-pan-y"
          style={{
            borderColor: 'rgba(255,255,255,0.06)',
            background: 'var(--color-surface-2)',
            transform: `translateX(${dx}px)`,
            transition: start.current?.dragging ? 'none' : 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
            opacity: skipped ? 0.4 : 1,
          }}
        >
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: accent }} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className={`block text-fluid-sm font-medium text-text truncate ${skipped ? 'line-through' : ''}`}>
              {item.name}
            </span>
            {/* The rule, where there is one. It lives in the row, so editing it
                in the app changes the export too. */}
            {skipped
              ? <span className="block text-[10px] text-muted">Skipped today</span>
              : item.notes && <span className="block text-[10px] text-muted truncate">{item.notes}</span>}
          </span>
          <span className="helix-num text-fluid-xs text-muted shrink-0">{item.dose}</span>
          <span className="helix-num text-[10px] text-muted/70 shrink-0 tabular-nums">{time}</span>
        </button>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title={item.name} accent={accent} layer="stacked">
        <div className="flex items-stretch gap-2 h-20">{actions}</div>
      </Sheet>
    </>
  )
}

/**
 * The day's stack — a statement of the protocol, not a checklist.
 *
 * Every scheduled item counts as taken. Skipping one is an explicit act that
 * writes `taken = false`, and that is the only thing the export reports as a
 * miss. See `useSupplements` for the whole story of why the default flipped.
 */
export function SupplementChecklist() {
  const { data: skipped } = useSupplements()
  const skip = useSkipSupplement()
  const { data: customs } = useCustomSupplements()
  const addCustom = useAddCustomSupplement()
  const delCustom = useDeleteCustomSupplement()
  const updCustom = useUpdateCustomSupplement()

  const today = logicalTodayISO()
  // A Train↔Rest swap adds or removes the pre-workout stimulants, so this list
  // has to follow the schedule store, not just its own query.
  useScheduleVersion()
  const weekday = new Date(`${today}T12:00:00`).getDay()
  // ONE stack. The nine former built-ins are rows in `custom_supplements` like
  // everything else, so they are editable; the hardcoded protocol survives only
  // as the fallback for an unseeded database.
  const training = isTrainingDay(today)
  const slots = stackForDate(customSlotsForDate(customs ?? [], weekday, training), training, weekday)

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', dose: '', trainingDose: '', restDose: '', notes: '', time: '09:00', color: COLORS[0], formType: FORMS[0], days: [0, 1, 2, 3, 4, 5, 6] })
  /** The row being edited, and the draft. `null` = nothing open. */
  const [editing, setEditing] = useState<
    { id: string; name: string; dose: string; time: string; notes: string; color: string; days: number[] } | null
  >(null)

  const toggleDay = (d: number) =>
    setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() }))
  const toggleEditDay = (d: number) =>
    setEditing((s) => (s ? { ...s, days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d].sort() } : s))

  const submit = () => {
    if (!form.name.trim() || !form.dose.trim()) return
    addCustom.mutate(
      {
        name: form.name.trim(), dose: form.dose.trim(), color: form.color, form: form.formType, time: form.time, days: form.days,
        trainingDose: form.trainingDose.trim() || undefined, restDose: form.restDose.trim() || undefined,
        notes: form.notes.trim() || undefined,
      },
      { onSuccess: () => { setForm((f) => ({ ...f, name: '', dose: '', trainingDose: '', restDose: '', notes: '' })); setAdding(false) } },
    )
  }

  return (
    <div className="space-y-4">
      <p className="pl-6 text-[11px] text-muted leading-snug">
        Everything on the schedule counts as taken. Swipe a row — or tap it — to skip, edit or remove it.
      </p>

      {slots.map((slot, si) => (
        <div key={slot.key} className="relative pl-6">
          {si < slots.length - 1 && <span className="absolute left-[6px] top-5 -bottom-4 w-px bg-white/10" aria-hidden="true" />}
          <span className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2" style={{ borderColor: slot.accent, background: `${slot.accent}22` }} aria-hidden="true" />
          <div className="flex items-baseline gap-2 mb-2">
            <span className="helix-num text-fluid-sm font-bold" style={{ color: slot.accent }}>{slot.time}</span>
            <span className="text-fluid-xs text-muted uppercase tracking-wide">{slot.label}</span>
          </div>
          <div className="space-y-1.5">
            {slot.items.map((item) => {
              // Anything with a row id is editable — which, once seeded, is
              // everything. Before, only user-added items could be touched and
              // the nine that mattered were frozen in a constant.
              const rowId = item.customId
              const row = customs?.find((c) => c.id === rowId)
              return (
                <SupplementRow
                  key={item.key}
                  item={item}
                  accent={slot.accent}
                  time={row?.time ?? slot.time}
                  skipped={skipped?.has(item.key) ?? false}
                  onSkip={() => skip.mutate({ itemKey: item.key, skipped: true, scheduledTime: row?.time ?? slot.time })}
                  onUnskip={() => skip.mutate({ itemKey: item.key, skipped: false })}
                  onEdit={rowId ? () => setEditing({
                    id: rowId,
                    name: item.name,
                    dose: item.dose,
                    time: row?.time ?? slot.time,
                    notes: row?.schedule?.notes ?? '',
                    color: row?.color ?? slot.accent,
                    days: row?.schedule?.days ?? [0, 1, 2, 3, 4, 5, 6],
                  }) : null}
                  onDelete={rowId ? () => delCustom.mutate(rowId) : null}
                />
              )
            })}
          </div>
        </div>
      ))}

      <div className="pl-6">
        <button onClick={() => setAdding(true)} className="btn-glass min-h-[44px] text-fluid-xs">
          <Plus className="w-3.5 h-3.5" /> Add supplement
        </button>
      </div>

      {/* ── EDIT ──────────────────────────────────────────────────────────────
          Time was settable at creation and never afterwards, so a dose that
          moved from 19:00 to 22:00 was wrong in the app and in the export with
          no way to correct it short of deleting the row — which for a seeded
          supplement destroys the `schedule.key` its months of history hang off.
          `useUpdateCustomSupplement` MERGES `schedule`, so an edit that never
          mentions the key cannot drop it.

          layer="stacked": this checklist is itself rendered inside the
          dashboard's Stack sheet, so its own drawers have to paint ABOVE their
          parent. The body-scroll lock is ref-counted, so the nesting was always
          safe — only the z-index was missing. */}
      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing?.name ?? 'Edit'} accent={STEEL} layer="stacked">
        {editing && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wide text-muted">Name</span>
                <input value={editing.name} onChange={(e) => setEditing((s) => (s ? { ...s, name: e.target.value } : s))}
                  className="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 field-compact text-text" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wide text-muted">Dose</span>
                <input value={editing.dose} onChange={(e) => setEditing((s) => (s ? { ...s, dose: e.target.value } : s))}
                  placeholder="e.g. 6 g"
                  className="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 field-compact text-text" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wide text-muted">Time</span>
                <input type="time" value={editing.time} onChange={(e) => setEditing((s) => (s ? { ...s, time: e.target.value } : s))}
                  className="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 field-compact text-text helix-num" />
              </label>
              <div className="flex flex-col justify-end">
                <span className="text-[10px] uppercase tracking-wide text-muted mb-1">Colour</span>
                {/* gap-4 rather than gap-1.5: the `.hit-44` slop is 44pt wide and
                    a tighter row would let each swatch's target cover its
                    neighbour's, so the one painted last would take both taps. */}
                <div className="flex items-center gap-4">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => setEditing((s) => (s ? { ...s, color: c } : s))} aria-label={`Colour ${c}`}
                      className="hit-44 w-5 h-5 rounded-full border-2 transition-transform active:scale-90"
                      style={{ background: c, borderColor: editing.color === c ? '#fff' : 'transparent' }} />
                  ))}
                </div>
              </div>
            </div>

            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-muted">Note / rule</span>
              <input value={editing.notes} onChange={(e) => setEditing((s) => (s ? { ...s, notes: e.target.value } : s))}
                placeholder='e.g. "2 tabs on leg days"'
                className="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 field-compact text-text" />
            </label>

            {/* `hit-44-y` below, not `hit-44`: seven toggles across a phone
                means a 44pt-WIDE target would overlap its neighbours and the
                one painted last would take both taps. Height is the axis a
                thumb actually misses on. */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted mr-1">Days</span>
              {WD.map((d, i) => (
                <button key={i} onClick={() => toggleEditDay(i)}
                  className="hit-44-y w-7 h-7 rounded-full text-[11px] font-bold transition-colors"
                  style={editing.days.includes(i)
                    ? { background: `${editing.color}22`, color: editing.color, border: `1px solid ${editing.color}66` }
                    : { color: '#79808C', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {d}
                </button>
              ))}
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setEditing(null)} className="btn-glass min-h-[44px] px-4">Cancel</button>
              <button
                disabled={updCustom.isPending || !editing.name.trim() || !editing.dose.trim()}
                onClick={() => {
                  if (!editing.name.trim() || !editing.dose.trim()) return
                  updCustom.mutate(
                    {
                      id: editing.id,
                      patch: {
                        name: editing.name.trim(),
                        dose: editing.dose.trim(),
                        time: editing.time,
                        color: editing.color,
                      },
                      schedule: { days: editing.days, notes: editing.notes.trim() || undefined },
                    },
                    { onSuccess: () => setEditing(null) },
                  )
                }}
                className="btn-primary min-h-[44px] px-4 disabled:opacity-50">
                {updCustom.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Add supplement — a drawer, not an inline expansion. */}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add supplement" accent={STEEL} layer="stacked">
        <div className="space-y-2.5">
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" className="rounded-lg bg-surface-2 border border-border px-3 py-2 field-compact text-text" />
              <input value={form.dose} onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))} placeholder="Dose (e.g. 2 caps)" className="rounded-lg bg-surface-2 border border-border px-3 py-2 field-compact text-text" />
              <input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className="rounded-lg bg-surface-2 border border-border px-3 py-2 field-compact text-text helix-num" />
              <select value={form.formType} onChange={(e) => setForm((f) => ({ ...f, formType: e.target.value }))} className="rounded-lg bg-surface-2 border border-border px-3 py-2 field-compact text-text capitalize">
                {FORMS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>

            {/* Optional training/rest dose split (e.g. Multivitamin 2 tabs training / 1 rest).
                Blank → the base dose is used on both. */}
            <div className="grid grid-cols-2 gap-2">
              <input value={form.trainingDose} onChange={(e) => setForm((f) => ({ ...f, trainingDose: e.target.value }))}
                placeholder="Training-day dose (optional)" className="rounded-lg bg-surface-2 border border-border px-3 py-2 field-compact text-text" />
              <input value={form.restDose} onChange={(e) => setForm((f) => ({ ...f, restDose: e.target.value }))}
                placeholder="Rest-day dose (optional)" className="rounded-lg bg-surface-2 border border-border px-3 py-2 field-compact text-text" />
            </div>

            {/* A rule the dose can't state on its own. Stored on the row and
                printed verbatim in the weekly export, which is why it is free
                text rather than a fixed vocabulary. */}
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder='Note / rule (optional) — e.g. "empty stomach"'
              className="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 field-compact text-text" />

            {/* Colour */}
            <div className="flex items-center gap-4">
              <span className="text-[10px] uppercase tracking-wide text-muted">Colour</span>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))} aria-label={`Colour ${c}`}
                  className="hit-44 w-6 h-6 rounded-full border-2 transition-transform active:scale-90"
                  style={{ background: c, borderColor: form.color === c ? '#fff' : 'transparent' }} />
              ))}
            </div>

            {/* Schedule days */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted mr-1">Days</span>
              {WD.map((d, i) => (
                <button key={i} onClick={() => toggleDay(i)}
                  className="hit-44-y w-7 h-7 rounded-full text-[11px] font-bold transition-colors"
                  style={form.days.includes(i)
                    ? { background: `${form.color}22`, color: form.color, border: `1px solid ${form.color}66` }
                    : { color: '#79808C', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {d}
                </button>
              ))}
            </div>

            {addCustom.isError && <p className="text-danger text-[11px]">{addCustom.error instanceof Error && /relation|does not exist|schema cache/i.test(addCustom.error.message) ? 'Run the custom_supplements paste-SQL first.' : 'Could not add.'}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setAdding(false)} className="btn-glass min-h-[44px] px-4">Cancel</button>
              <button onClick={submit} disabled={addCustom.isPending || !form.name.trim() || !form.dose.trim()}
                className="btn-primary min-h-[44px] px-4 disabled:opacity-50">
                {addCustom.isPending ? 'Adding…' : 'Add to protocol'}
              </button>
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
