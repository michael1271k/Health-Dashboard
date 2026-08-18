'use client'

import { useState } from 'react'
import { Flag, Sparkles } from 'lucide-react'
import type { SessionDraft } from '@/lib/sessions/draft'
import { GOLD, AMETHYST } from '@/lib/theme/palette'

/**
 * The coach lines that arrive with a seeded draft — an insight from the last
 * report, a flag left for this session.
 *
 * ── WHAT THIS FILE USED TO BE ────────────────────────────────────────────────
 * `CoachHeaderCard`: a title row, a date-picker chip, a live volume/sets/records
 * rail, and these notes. Before that it was a title row, a six-cell 3x2 grid of
 * bordered tinted badges at ~54px each, and up to two tinted rounded callouts —
 * roughly 200px before the first exercise appeared, on the one screen whose
 * entire purpose is the middle. Three of those six badges were Duration, Avg HR
 * and Calories: facts you CANNOT KNOW UNTIL THE SESSION ENDS, being edited at
 * the top of the screen throughout a workout. They moved to `FinishSheet`.
 *
 * The identity and the live rail have now moved too — up into `LiveSessionBar`,
 * which is pinned. They were the two things that had to stay on screen, and
 * this rail scrolls away on a phone with the first swipe.
 *
 * What is left is the only thing here that is neither identity nor a running
 * total: what the coach said. Which is a paragraph, not a header.
 */
export function CoachNotes({ draft }: { draft: SessionDraft }) {
  if (!draft.coachInsight && !draft.nextSessionFlag) return null
  return (
    <div className="space-y-1.5">
      {/* A 2px rule instead of a tinted rounded block: the colour still says
          which kind of note this is, without the callout eating the width of
          the screen to say it. */}
      {draft.coachInsight && <Note text={draft.coachInsight} color={AMETHYST} icon={Sparkles} />}
      {draft.nextSessionFlag && <Note text={draft.nextSessionFlag} color={GOLD} icon={Flag} />}
    </div>
  )
}

/**
 * A coach line. Collapsed to two lines by default and tapped open — these
 * arrive from a pasted report and can run to a paragraph, which at the top of
 * the logging screen is a wall between you and the first set.
 */
function Note({ text, color, icon: Icon }: { text: string; color: string; icon: typeof Flag }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="w-full flex gap-2 items-start text-left py-1 pl-2.5 active:scale-[0.995] transition-transform"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <Icon className="w-3 h-3 shrink-0 mt-[3px]" style={{ color }} aria-hidden="true" />
      <p className={`text-[11px] leading-snug text-text/90 ${open ? '' : 'line-clamp-2'}`} dir="auto">{text}</p>
    </button>
  )
}
