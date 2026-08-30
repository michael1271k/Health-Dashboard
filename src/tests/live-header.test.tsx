import { describe, it, expect, afterEach, vi } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LazyMotion, domMax } from 'framer-motion'
import { LiveSessionHero } from '@/components/command-center/LiveSessionHero'
import { LiveSessionBar } from '@/components/command-center/LiveSessionBar'
import { GOLD, MUSCLE } from '@/lib/theme/palette'
import type { SessionDraft } from '@/lib/sessions/draft'

/**
 * ── THE TITLE IS THE SIZE OF A TITLE ─────────────────────────────────────────
 *
 * The live session's identity lived only in the pinned bar, at `text-fluid-sm`
 * — 13–15px, and smaller than the volume figure printed beside it. It was small
 * because a pinned bar has to be small; the mistake was asking the bar to be
 * the title.
 *
 * So the arrangement is the report's: a large title in the document, and a
 * compact copy in the bar that fades in once the hero has scrolled off. The
 * failure mode of that arrangement is silent — both halves visible at once, or
 * neither — so the pieces that decide it are asserted here.
 *
 * The fixture this emits is what `e2e/live-header.spec.ts` screenshots; jsdom
 * has no layout engine and cannot tell you that a title wraps.
 */

const FIXTURE = resolve(__dirname, '../../e2e/__fixtures__/live-header.html')

// `useLoggedSessionDates` fetches; the date picker is closed and needs none of it.
vi.mock('@/lib/hooks/useDayVault', () => ({ useLoggedSessionDates: () => ({ data: new Set<string>() }) }))
// The lever tag reads the cut schedule, which is not what this file is about.
vi.mock('@/components/nutrition/LeverTag', () => ({ LeverTag: () => <span>Rung 3</span> }))

afterEach(cleanup)

/** `#D4AF37` → `rgb(212, 175, 55)`, which is how jsdom reports an inline hex. */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

const DRAFT = {
  date: '2026-08-20',
  splitDay: 'Upper B',
  dayKey: 'upper_b',
  week: 6,
  phase: 'CUT',
  notes: '',
  exercises: [{
    // `muscleGroups` the way a real draft carries them — the name table alone
    // does not know this lift, which is the bug `templateToDraft` had.
    localId: 'ex0', name: 'Barbell Bench Press', kind: 'lift', muscleGroups: ['chest', 'triceps'],
    sets: [{ weightKg: 60, reps: 8, done: true }],
  }],
} as unknown as SessionDraft

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}><LazyMotion features={domMax} strict>{ui}</LazyMotion></QueryClientProvider>
}

const HERO = (
  <LiveSessionHero draft={DRAFT} accent={GOLD} volumeKg={12480} sets={18} recordCount={2} onBack={() => {}} onSetDate={() => {}} onFinish={() => {}} onOpenDuration={() => {}} onDiscard={() => {}} />
)

describe('the live session hero', () => {
  it('names the workout at title size, in the workout\'s own colour', () => {
    const { container } = render(wrap(HERO))
    const h1 = container.querySelector('h1')
    // The program day's own label, in its own case — not `splitDay.toUpperCase()`,
    // which is what the bar used to shout when it had no better source.
    expect(h1?.textContent).toBe('Upper B')
    // `text-fluid-sm` is what it was — roughly 13–15px, and smaller than the
    // numbers underneath it. The scale's companion tokens carry the tracking
    // and leading for the larger size, so this is not just a font-size.
    //
    // It stepped 2xl → xl when the muscle figure left this row: at 390px a real
    // workout name ("Legs & Core A") ellipsized against three controls, and the
    // name is the one thing on this screen that is nowhere else on it. The
    // assertion is on the FLOOR, not on one token — the failure this guards
    // against is the title falling back to bar size, and xl is still the
    // largest type on the screen by a clear margin.
    expect(h1?.className, 'the title is back at bar size').toMatch(/text-fluid-(xl|2xl|3xl)\b/)
    // jsdom normalises an inline hex to `rgb()`, so the comparison converts
    // rather than hardcoding a second spelling of the same colour.
    expect(getComputedStyle(h1!).color).toBe(rgb(GOLD))
  })

  it('carries the three figures that move while you lift, and nothing that cannot', () => {
    const { container } = render(wrap(HERO))
    const text = container.textContent ?? ''
    for (const label of ['Volume', 'Sets', 'Records']) {
      expect(text, `no "${label}" tile`).toContain(label)
    }
    expect(text).toContain('12,480')
    expect(text).toContain('18')
    // Duration, average HR and calories belong to the finish sheet — they
    // cannot be answered until the session ends.
    for (const absent of ['Duration', 'Calories', 'Avg HR']) {
      expect(text, `"${absent}" cannot be known yet`).not.toContain(absent)
    }
  })

  it('shows the NAME, never the strapline', () => {
    // `buildTemplateDraft` composes the title as "Legs & Core B · Posterior
    // Focus". That is a document heading, not a header: at 360px it truncated
    // to "Legs & Core B · Posterio…", cutting the only part that was optional.
    const composed = { ...DRAFT, dayKey: 'legs_b', title: 'Legs & Core B · Posterior Focus' } as SessionDraft
    const { container } = render(wrap(
      <LiveSessionHero draft={composed} accent={GOLD} volumeKg={0} sets={0} recordCount={0}
        onBack={() => {}} onSetDate={() => {}} onFinish={() => {}} onOpenDuration={() => {}} onDiscard={() => {}} />,
    ))
    expect(container.querySelector('h1')?.textContent).toBe('Legs & Core B')
    expect(container.textContent ?? '').not.toContain('Posterior Focus')
  })

  it('carries exactly one of each header control, and no tools', () => {
    // There used to be a second of each in a sticky band above this block whose
    // only visible content at scroll-top was the chevron. The band is gone; the
    // collapsed bar carries the other copy and the two never coexist.
    const { container } = render(wrap(HERO))
    const labelled = (needle: string) => Array.from(container.querySelectorAll('button'))
      .filter((b) => (b.getAttribute('aria-label') ?? '').includes(needle)).length
    // "Minimise", not "Back". The chevron never discarded anything — the draft
    // has autosaved since the day it was written and the pill above the tab bar
    // is what you come back to. Naming it Back was the reason leaving the deck
    // felt like losing the workout.
    expect(labelled('Minimise')).toBe(1)
    expect(labelled('Session options')).toBe(1)
    // ── AND THE TWO BETWEEN-SETS TOOLS ARE NOT UP HERE ──
    // The rest timer and the muscle figure were two more 44px controls in a row
    // that already held four things, and the workout name — the one fact this
    // screen cannot recover from anywhere else — was ellipsizing because of it.
    // Neither is used mid-set. Both are rows in the session menu now.
    expect(labelled('Muscle distribution'), 'the figure is back in the header').toBe(0)
    expect(labelled('Timer and stopwatch'), 'the clock is back in the header').toBe(0)
  })

  it('keeps the elapsed reading beside Finish, as a figure and not a tile', () => {
    // It is the one number in this header you read without deciding anything,
    // and Finish is the decision it informs. The tinted box, the border and the
    // "DURATION" caps label were 44px of chrome around four characters.
    // The fixture has no `startedAt`; the reading renders nothing without one,
    // which is correct on a back-dated or edited deck ("now minus started" is
    // not a duration there) and is why it has to be supplied here.
    const live = { ...DRAFT, startedAt: new Date(Date.now() - 12 * 60_000).toISOString() } as SessionDraft
    const { container } = render(wrap(
      <LiveSessionHero draft={live} accent={GOLD} volumeKg={0} sets={0} recordCount={0}
        onBack={() => {}} onSetDate={() => {}} onFinish={() => {}} onOpenDuration={() => {}} onDiscard={() => {}} />,
    ))
    const btn = Array.from(container.querySelectorAll('button'))
      .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Duration'))
    expect(btn, 'the elapsed reading is gone').toBeTruthy()
    expect(btn?.textContent ?? '', 'the caps label came back').not.toMatch(/Duration/)
  })

  it('tints the muscle figure by MUSCLE GROUP, not by the workout colour', async () => {
    // This asserted the opposite — that the figure carried the day's accent.
    // The accent still owns the header's chrome, but on the body it answered a
    // question the title had already answered ("which session is this") while
    // leaving the only question the figure can answer — where did the work land
    // — with no colour at all. Each muscle now wears its group's hue.
    //
    // Reached through the menu, which is where the figure lives now.
    render(wrap(HERO))
    await userEvent.click(screen.getByLabelText('Session options'))
    await userEvent.click(screen.getByText('Muscle focus'))
    // Every svg on the page, joined: the menu row carries a lucide glyph of its
    // own, and the atlas is the one further down.
    const html = Array.from(document.querySelectorAll('svg')).map((n) => n.innerHTML).join('')
    expect(html).not.toContain(GOLD)
    const hues = new Set(Object.values(MUSCLE).map((h) => h.toLowerCase()))
    const painted = [...hues].filter((h) => html.toLowerCase().includes(h))
    expect(painted.length, 'no landmark hue reached the figure').toBeGreaterThan(0)
  })

  it('states the date exactly once, and as a control', () => {
    const { container } = render(wrap(HERO))
    const matches = (container.textContent ?? '').match(/Thu 20 Aug/g) ?? []
    expect(matches.length, 'the date is printed more than once').toBe(1)
    const btn = Array.from(container.querySelectorAll('button'))
      .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Session date'))
    expect(btn, 'the date is a label, not the control it used to be').toBeTruthy()
  })

  /** The row that reaches a tool, inside the opened session menu. */
  const menuRow = (label: string) => Array.from(document.querySelectorAll('button'))
    .find((b) => b.textContent?.startsWith(label))

  it('offers both tools as menu rows, inert before a set is ticked', async () => {
    // The muscle row used to `return null` until there was something to show.
    // A control that materialises mid-session is worse than an inert one: in
    // the header it shifted the title sideways at the moment you were reaching
    // for a tick, and in a menu it makes the feature look absent.
    const cold = { ...DRAFT, exercises: [{ ...DRAFT.exercises[0], sets: [{ weightKg: 60, reps: 8, done: false }] }] } as SessionDraft
    render(wrap(
      <LiveSessionHero draft={cold} accent={GOLD} volumeKg={0} sets={0} recordCount={0} onBack={() => {}} onSetDate={() => {}} onFinish={() => {}} onOpenDuration={() => {}} onDiscard={() => {}} />,
    ))
    await userEvent.click(screen.getByLabelText('Session options'))
    expect(menuRow('Rest timer'), 'the rest timer is unreachable').toBeTruthy()
    const muscle = menuRow('Muscle focus')
    expect(muscle, 'the muscle row is missing before the first tick').toBeTruthy()
    expect(muscle?.hasAttribute('disabled'), 'it should be inert, not absent').toBe(true)
  })

  it('enables the muscle row the moment there is an answer', async () => {
    // The other half of the claim above. A control that is always inert is
    // worse than one that is absent: it looks like the feature is broken.
    render(wrap(HERO))
    await userEvent.click(screen.getByLabelText('Session options'))
    expect(menuRow('Muscle focus')?.hasAttribute('disabled'), 'a ticked set did not wake the row').toBe(false)
  })

  it('emits the fixture the browser test measures', () => {
    // BOTH states, stacked: the hero as it sits at the top of the deck, and the
    // collapsed bar as it slides in once the hero scrolls off. The bar is the
    // half that had no coverage at all and the half that was reported as
    // "looks terrible" — a long title ellipsized on one line.
    const html = renderToStaticMarkup(
      <div id="probe-header">
        <div data-probe-part="hero">{wrap(HERO)}</div>
        {/* `transform` makes this a containing block for `position: fixed`, so
            the bar lays out inside its own 60px box instead of jumping to the
            top of the viewport and covering the hero. That is a real CSS rule,
            not a hack — and it is the only way to see both halves at once, which
            in the app never happens. */}
        <div data-probe-part="bar" style={{ position: 'relative', height: 60, transform: 'translateZ(0)' }}>
          {wrap(
            <LiveSessionBar
              draft={{ ...DRAFT, dayKey: 'legs_b', title: 'Legs & Core B · Posterior Focus' } as SessionDraft}
              accent={GOLD} volumeKg={12480} sets={18} recordCount={2} shown onBack={() => {}} onFinish={() => {}}
            />,
          )}
        </div>
      </div>,
    )
    expect(html).toContain('Upper B')
    // Escaped, because this is serialised markup rather than a DOM node — the
    // browser side reads `textContent` and sees the ampersand.
    expect(html).toContain('Legs &amp; Core B')
    expect(html).not.toContain('Posterior Focus')
    mkdirSync(dirname(FIXTURE), { recursive: true })
    writeFileSync(FIXTURE, html, 'utf8')
  })
})
