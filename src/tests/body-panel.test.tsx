import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
function renderPanel(log: Record<string, number | null> | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BodyPanel date="2026-08-03" log={log as never} />
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
    // The four headline readings, with the two masses named separately — `lean`
    // used to be one ambiguous tile here. Weight × muscle% is LEAN SOFT tissue,
    // and says so: calling it "Muscle" put ~50 kg beside a scale reporting ~27.
    for (const label of ['Weight', 'Body Fat', 'Lean Soft', 'Fat-Free']) {
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

  it('keeps the entry form out of the page until asked', () => {
    // Pager pages share a height: rendering the form inline would make the
    // Sleep and Hydration pages as tall as a dozen inputs.
    renderPanel({ weight_kg: 64.2, body_fat_pct: 17.3 })
    expect(screen.queryByLabelText('Weight in kg')).toBeNull()
    expect(screen.queryByRole('button', { name: /save metrics/i })).toBeNull()
  })

  it('opens the editor straight away for the ?section=inbody deep link', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <BodyPanel date="2026-08-03" log={null as never} openEditor />
      </QueryClientProvider>,
    )
    expect(screen.getByLabelText('Weight in kg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save metrics/i })).toBeInTheDocument()
  })
})
