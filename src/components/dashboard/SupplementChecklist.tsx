'use client'

import { useState } from 'react'
import { Check, Plus, Trash2, Pencil } from 'lucide-react'
import { LiquidModal } from '@/components/ui/LiquidModal'
import { stackForDate } from '@/lib/supplements'
import { isTrainingDay } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { useSupplements, useToggleSupplement } from '@/lib/hooks/useSupplements'
import {
  useCustomSupplements, useAddCustomSupplement, useDeleteCustomSupplement,
  useUpdateCustomSupplement, customSlotsForDate,
} from '@/lib/hooks/useCustomSupplements'

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const COLORS = ['#8E9AAC', '#E0703C', '#3E9E7A', '#3D7AB8', '#D4AF37', '#B4522A']
const FORMS = ['pill', 'capsule', 'powder', 'tablet', 'liquid']

/** Sleek daily supplement timeline — tap to check off; saves to the DB (logical day).
 *  Includes user-defined custom supplements (schedule + dose) merged into the day. */
export function SupplementChecklist() {
  const { data: taken } = useSupplements()
  const toggle = useToggleSupplement()
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

  const [manage, setManage] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', dose: '', trainingDose: '', restDose: '', notes: '', time: '09:00', color: COLORS[0], formType: FORMS[0], days: [0, 1, 2, 3, 4, 5, 6] })
  /** The row being dose-edited, and the draft. `null` = nothing open. */
  const [editing, setEditing] = useState<{ id: string; name: string; dose: string } | null>(null)

  const toggleDay = (d: number) =>
    setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() }))

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
              const on = taken?.has(item.key) ?? false
              // Anything with a row id is editable — which, once seeded, is
              // everything. Before, only user-added items could be touched and
              // the nine that mattered were frozen in a constant.
              const rowId = item.customId
              return (
                <div key={item.key} className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggle.mutate({ itemKey: item.key, taken: !on })}
                    aria-pressed={on}
                    className="flex-1 flex items-center gap-3 rounded-xl px-3 py-2.5 border text-left transition-colors min-h-[48px]"
                    style={{ borderColor: on ? `${slot.accent}55` : 'rgba(255,255,255,0.06)', background: on ? `${slot.accent}14` : 'rgba(255,255,255,0.02)' }}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border-2 shrink-0" style={{ borderColor: on ? slot.accent : 'rgba(255,255,255,0.25)', background: on ? slot.accent : 'transparent' }}>
                      {on && <Check className="h-3 w-3 text-bg" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-fluid-sm font-medium text-text truncate">{item.name}</span>
                      {/* The rule, where there is one. It lives in the row, so
                          editing it in the app changes the export too. */}
                      {item.notes && <span className="block text-[10px] text-muted truncate">{item.notes}</span>}
                    </span>
                    <span className="helix-num text-fluid-xs text-muted shrink-0">{item.dose}</span>
                  </button>
                  {manage && rowId && (
                    <>
                      <button onClick={() => setEditing({ id: rowId, name: item.name, dose: item.dose })}
                        className="p-2 rounded-lg text-muted hover:text-text shrink-0" aria-label={`Edit ${item.name}`}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => delCustom.mutate(rowId)}
                        className="p-2 rounded-lg text-muted hover:text-danger shrink-0" aria-label={`Delete ${item.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Builder / manage controls */}
      <div className="pl-6 flex items-center gap-2">
        <button onClick={() => { setAdding(true); setManage(false) }}
          className="btn-glass min-h-[40px] text-fluid-xs">
          <Plus className="w-3.5 h-3.5" /> Add supplement
        </button>
        {(customs?.length ?? 0) > 0 && (
          <button onClick={() => setManage((v) => !v)} className="btn-glass min-h-[40px] text-fluid-xs">
            {manage ? 'Done' : 'Manage'}
          </button>
        )}
      </div>

      {/* Edit dose — the verb that was missing. L-Citrulline sat at 3 g in every
          surface while 6 g was being taken, and there was no way to correct it
          short of a deploy. */}
      <LiquidModal open={editing != null} onClose={() => setEditing(null)} title={editing?.name ?? 'Edit'} accent="#8E9AAC">
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-muted">Dose</span>
            <input
              value={editing?.dose ?? ''}
              onChange={(e) => setEditing((s) => (s ? { ...s, dose: e.target.value } : s))}
              placeholder="e.g. 6 g"
              className="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text"
            />
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(null)} className="btn-glass min-h-[44px] px-4">Cancel</button>
            <button
              disabled={updCustom.isPending || !editing?.dose.trim()}
              onClick={() => {
                if (!editing?.dose.trim()) return
                updCustom.mutate(
                  { id: editing.id, patch: { dose: editing.dose.trim() } },
                  { onSuccess: () => setEditing(null) },
                )
              }}
              className="btn-primary min-h-[44px] px-4 disabled:opacity-50">
              {updCustom.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </LiquidModal>

      {/* Add-supplement modal — a sleek popup, not an inline expansion. */}
      <LiquidModal open={adding} onClose={() => setAdding(false)} title="Add supplement" accent="#8E9AAC">
        <div className="space-y-2.5">
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" className="rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text" />
              <input value={form.dose} onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))} placeholder="Dose (e.g. 2 caps)" className="rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text" />
              <input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className="rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text helix-num" />
              <select value={form.formType} onChange={(e) => setForm((f) => ({ ...f, formType: e.target.value }))} className="rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text capitalize">
                {FORMS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>

            {/* Optional training/rest dose split (e.g. Multivitamin 2 tabs training / 1 rest).
                Blank → the base dose is used on both. */}
            <div className="grid grid-cols-2 gap-2">
              <input value={form.trainingDose} onChange={(e) => setForm((f) => ({ ...f, trainingDose: e.target.value }))}
                placeholder="Training-day dose (optional)" className="rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text" />
              <input value={form.restDose} onChange={(e) => setForm((f) => ({ ...f, restDose: e.target.value }))}
                placeholder="Rest-day dose (optional)" className="rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text" />
            </div>

            {/* A rule the dose can't state on its own. Stored on the row and
                printed verbatim in the weekly export, which is why it is free
                text rather than a fixed vocabulary. */}
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder='Note / rule (optional) — e.g. "empty stomach"'
              className="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text" />

            {/* Colour */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-muted">Colour</span>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))} aria-label={`Colour ${c}`}
                  className="w-6 h-6 rounded-full border-2 transition-transform active:scale-90"
                  style={{ background: c, borderColor: form.color === c ? '#fff' : 'transparent' }} />
              ))}
            </div>

            {/* Schedule days */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted mr-1">Days</span>
              {WD.map((d, i) => (
                <button key={i} onClick={() => toggleDay(i)}
                  className="w-7 h-7 rounded-full text-[11px] font-bold transition-colors"
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
      </LiquidModal>
    </div>
  )
}
