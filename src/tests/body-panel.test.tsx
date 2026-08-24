import { describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BodyPanel } from '@/components/day/BodyPanel'

/**
 * The Body page used to be `BodyMap` alone, which early-returns a one-sentence
 * stub on any day without a weigh-in — a named tab leading to a dead end most
 * days — while the form that would fill it sat ~400px further down the page,
 * below all three tabs.
 *
 * These pin the two faces: the page is never empty, and the entry point is
 * always ON the page that needs it.
 */
function renderPanel(log: Record<string, number | string | null> | null, onEdit = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BodyPanel date="2026-08-03" log={log as never} onEdit={onEdit} />
    </QueryClientProvider>,
  )
}

describe('BodyPanel — a self-sufficient Body page', () => {
  it('is the entry prompt when the day has no weigh-in', () => {
    renderPanel(null)
    expect(screen.getByText('No weigh-in today')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add scale metrics/i })).toBeInTheDocument()
  })

  it('shows the composition and an edit route once a reading exists', () => {
    renderPanel({ weight_kg: 64.2, body_fat_pct: 17.3, muscle_percent: 78.3 })
    expect(screen.queryByText('No weigh-in today')).toBeNull()
    expect(screen.getByRole('button', { name: /edit measurements/i })).toBeInTheDocument()
    // The headline readings, with the two masses named separately — `lean` used
    // to be one ambiguous tile here. Weight × muscle% is LEAN SOFT TISSUE, and
    // says so: calling it "Muscle" put ~50 kg beside a scale reporting ~27.
    for (const label of ['Weight', 'Body Fat', 'Lean Soft Tissue', 'Fat-Free']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('64.2')).toBeInTheDocument()
  })

  it('prefers the SKELETAL reading over lean soft tissue when it was taken', () => {
    // The two are ~23 kg apart; the tile must never show them under one name.
    renderPanel({ weight_kg: 64.2, body_fat_pct: 17.3, muscle_percent: 78.3, skeletal_muscle_mass_kg: 26.8 })
    expect(screen.getAllByText('Skeletal').length).toBeGreaterThan(0)
    // Twice over: the headline tile and the composition bar, which now plots it
    // against the 40–50% band that always belonged to it.
    expect(screen.getAllByText('26.8').length).toBeGreaterThan(0)
    expect(screen.getByText('Skeletal Muscle')).toBeInTheDocument()
    expect(screen.queryByText('Lean Soft')).toBeNull()
  })

  it('offers the skip-reason chips only while the day carries no weight', () => {
    renderPanel(null)
    expect(screen.getByRole('button', { name: 'No BM' })).toBeInTheDocument()
    cleanup()
    renderPanel({ weight_kg: 64.2 })
    expect(screen.queryByRole('button', { name: 'No BM' })).toBeNull()
  })

  /**
   * "As Planned" is the DEFAULT, not just another chip. Skipping the scale
   * before a bowel movement is the protocol, so an unrecorded weightless day
   * already means something — and the chip row has to show that it does, or the
   * default is invisible and reads as "nothing chosen".
   */
  it('pre-selects "As Planned" on any weightless day with nothing recorded', () => {
    renderPanel(null)
    expect(screen.getByRole('button', { name: 'As Planned' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'No BM' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('yields the default the moment a real reason is recorded', () => {
    renderPanel({ weighin_skip_reason: 'Travel' })
    expect(screen.getByRole('button', { name: 'Travel' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'As Planned' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows a free-text reason on its own chip rather than falling back', () => {
    renderPanel({ weighin_skip_reason: 'Weird scale reading' })
    expect(screen.getByRole('button', { name: 'Weird scale reading' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'As Planned' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the entry form out of the page until asked', () => {
    // Pager pages share a height: rendering the form inline would make the
    // Sleep and Hydration pages as tall as a dozen inputs.
    renderPanel({ weight_kg: 64.2, body_fat_pct: 17.3 })
    expect(screen.queryByLabelText('Weight in kg')).toBeNull()
    expect(screen.queryByRole('button', { name: /save metrics/i })).toBeNull()
  })

  // BodyPanel no longer OWNS the editor. It is itself the body of a drawer, and
  // the form is a sibling drawer the page swaps to — a form is a push, not a
  // second drawer stacked on the first. So what this component must guarantee
  // is that it asks, from both of its two faces.
  it('asks the page to open the editor when there is no weigh-in', async () => {
    const onEdit = vi.fn()
    renderPanel(null, onEdit)
    await userEvent.click(screen.getByRole('button', { name: /add scale metrics/i }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('asks the page to open the editor when a reading already exists', async () => {
    const onEdit = vi.fn()
    renderPanel({ weight_kg: 64.2, body_fat_pct: 17.3, muscle_percent: 78.3 }, onEdit)
    await userEvent.click(screen.getByRole('button', { name: /edit measurements/i }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
