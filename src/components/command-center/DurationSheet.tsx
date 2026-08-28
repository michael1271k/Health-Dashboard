'use client'

import { useEffect, useState } from 'react'
import { Clock3, Pause, Play, Timer } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { formatClock } from '@/lib/sessions/sessionClock'
import { sessionActiveSec } from '@/lib/sessions/sessionElapsed'
import { tapLight } from '@/lib/native/haptics'
import { startTimeLabel } from '@/lib/utils/day'

/**
 * Everything the session clock knows, one tap from the header that shows it.
 *
 * ── WHY THE STOPWATCH NEEDED A SHEET AT ALL ──────────────────────────────────
 * The header reading answers "how long have I been here" and nothing else. The
 * two questions it CANNOT answer are the ones you ask when you look at it and
 * frown: what time did I actually start, and can I stop it while I take a phone
 * call. Both were unanswerable — the second was not implemented and the first
 * existed only inside `startedAt`, which nothing rendered.
 *
 * ── AND WHY PAUSING IS A ROW HERE RATHER THAN A CONTROL IN THE HEADER ────────
 * The header is a readout by design (see `SessionElapsed`) and it sits between
 * the rest clock and the muscle figure, two things you reach for mid-set. A
 * pause button in that group is a pause button under the thumb that is ticking
 * sets. Behind one deliberate tap, it is exactly as reachable and cannot be hit
 * by accident.
 */
export function DurationSheet({ open, onClose, startedAt, pausedMs, pausedAt, accent, onTogglePause }: {
  open: boolean
  onClose: () => void
  startedAt: string
  pausedMs?: number
  pausedAt?: string | null
  /** `dayColor(dayKey, splitDay)` — the session's own colour. */
  accent: string
  onTogglePause: () => void
}) {
  // Ticks only while the sheet is open, and only while the clock is running:
  // a paused sheet is showing a number that cannot change.
  const [now, setNow] = useState(() => Date.now())
  const paused = !!pausedAt
  useEffect(() => {
    if (!open || paused) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open, paused])

  const sec = sessionActiveSec(startedAt, now, { pausedMs, pausedAt })
  // Through the shared formatter, so this sheet and the post-workout summary
  // state the session's beginning in identical words.
  const startLabel = startTimeLabel(startedAt) || '—'

  return (
    <Sheet open={open} onClose={onClose} title="Duration" accent={accent}>
      <div className="space-y-2 pb-2">
        <Row label="Duration" icon={Timer} accent={accent}>
          <span className="helix-num font-bold text-fluid-lg tabular-nums leading-none"
            style={{ color: paused ? 'var(--color-muted)' : accent }}>
            {sec == null ? '—' : formatClock(sec)}
          </span>
        </Row>

        <Row label="Start Time" icon={Clock3} accent={accent}>
          <span className="helix-num text-fluid-sm tabular-nums text-text">{startLabel}</span>
        </Row>

        {/* Full width, the session's colour, and it says what it will DO — a
            paused workout's button reads "Resume", never a pause glyph you have
            to decode as "currently paused". */}
        <button
          type="button"
          onPointerDown={() => { void tapLight() }}
          onClick={onTogglePause}
          aria-pressed={paused}
          className="w-full min-h-[52px] rounded-xl inline-flex items-center justify-center gap-2
                     font-bold text-fluid-sm active:scale-[0.98] transition-transform mt-1"
          style={{
            color: accent,
            background: `${accent}1f`,
            border: `1px solid ${accent}66`,
          }}
        >
          {paused
            ? <><Play className="w-4 h-4" aria-hidden="true" /> Resume workout timer</>
            : <><Pause className="w-4 h-4" aria-hidden="true" /> Pause workout timer</>}
        </button>

        {/* What a pause does and does not touch. Without this the button looks
            like it might stop the Live Activity or the autosave, which is
            exactly the thing you do not want to gamble on mid-session. */}
        <p className="text-[10px] text-muted/70 leading-snug px-1">
          {paused
            ? 'Paused — sets, records and the Lock Screen card keep tracking. Only the duration is standing still.'
            : 'Pausing stops the duration only. Sets, records and the Lock Screen card keep tracking, and Finish records the time actually worked.'}
        </p>
      </div>
    </Sheet>
  )
}

/** One label/value line, in the same tinted-tile family as the finish sheet. */
function Row({ label, icon: Icon, accent, children }: {
  label: string; icon: typeof Timer; accent: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 min-h-[52px]"
      style={{ background: `${accent}0f`, border: `1px solid ${accent}2e` }}>
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] shrink-0"
        style={{ color: accent }}>
        <Icon className="w-3 h-3" aria-hidden="true" />
        {label}
      </span>
      <span className="ml-auto min-w-0 text-right">{children}</span>
    </div>
  )
}
