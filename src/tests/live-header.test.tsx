import { describe, it, expect, afterEach, vi } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { render, cleanup } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LazyMotion, domMax } from 'framer-motion'
import { LiveSessionHero } from '@/components/command-center/LiveSessionHero'
import { GOLD } from '@/lib/theme/palette'
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
  <LiveSessionHero draft={DRAFT} accent={GOLD} volumeKg={12480} sets={18} recordCount={2} onSetDate={() => {}} />
)

describe('the live session hero', () => {
  it('names the workout at title size, in the workout\'s own colour', () => {
    const { container } = render(wrap(HERO))
    const h1 = container.querySelector('h1')
    expect(h1?.textContent).toBe('UPPER B')
    // `text-fluid-sm` is what it was — roughly 13–15px, and smaller than the
    // numbers underneath it. The scale's companion tokens carry the tracking
    // and leading for the larger size, so this is not just a font-size.
    expect(h1?.className, 'the title is back at bar size').toContain('text-fluid-2xl')
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

  it('states the date exactly once, and as a control', () => {
    const { container } = render(wrap(HERO))
    const matches = (container.textContent ?? '').match(/Thu 20 Aug/g) ?? []
    expect(matches.length, 'the date is printed more than once').toBe(1)
    const btn = Array.from(container.querySelectorAll('button'))
      .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Session date'))
    expect(btn, 'the date is a label, not the control it used to be').toBeTruthy()
  })

  it('draws the muscle button even before a set is ticked', () => {
    // It used to `return null` until there was something to show. In the header
    // that means a control materialising mid-session and shifting the title and
    // three figures sideways at the moment you are reaching for a tick.
    const cold = { ...DRAFT, exercises: [{ ...DRAFT.exercises[0], sets: [{ weightKg: 60, reps: 8, done: false }] }] } as SessionDraft
    const { container } = render(wrap(
      <LiveSessionHero draft={cold} accent={GOLD} volumeKg={0} sets={0} recordCount={0} onSetDate={() => {}} />,
    ))
    const btn = Array.from(container.querySelectorAll('button'))
      .find((b) => b.getAttribute('aria-label') === 'Muscle distribution for this session')
    expect(btn, 'the muscle button is missing before the first tick').toBeTruthy()
    expect(btn?.hasAttribute('disabled'), 'it should be inert, not absent').toBe(true)
  })

  it('enables the muscle button the moment there is an answer', () => {
    // The other half of the claim above. A control that is always inert is
    // worse than one that is absent: it looks like the feature is broken.
    const { container } = render(wrap(HERO))
    const btn = Array.from(container.querySelectorAll('button'))
      .find((b) => b.getAttribute('aria-label') === 'Muscle distribution for this session')
    expect(btn?.hasAttribute('disabled'), 'a ticked set did not wake the button').toBe(false)
  })

  it('emits the fixture the browser test measures', () => {
    const html = renderToStaticMarkup(
      <div id="probe-header" style={{ padding: 12 }}>{wrap(HERO)}</div>,
    )
    expect(html).toContain('UPPER B')
    mkdirSync(dirname(FIXTURE), { recursive: true })
    writeFileSync(FIXTURE, html, 'utf8')
  })
})
