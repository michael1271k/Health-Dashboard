import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tile } from '@/components/ui/Zone'
import { Footprints } from 'lucide-react'

/**
 * These used to cover `MetricCard`, which had no call sites left anywhere in
 * the app — only this file kept it alive. `Tile` supersedes it and is the one
 * that actually ships, so the coverage moved rather than being deleted.
 */
describe('Tile', () => {
  it('renders label and value', () => {
    render(<Tile label="Steps" value={8432} unit="steps" icon={Footprints} />)
    expect(screen.getByText('Steps')).toBeInTheDocument()
    expect(screen.getByText('8432')).toBeInTheDocument()
    expect(screen.getByText('steps')).toBeInTheDocument()
  })

  it('renders dash when value is null', () => {
    render(<Tile label="Steps" value={null} icon={Footprints} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('hides the unit when there is no value to qualify', () => {
    // "— steps" reads as a measurement of nothing; the dash stands alone.
    render(<Tile label="Steps" value={null} unit="steps" icon={Footprints} />)
    expect(screen.queryByText('steps')).not.toBeInTheDocument()
  })

  it('shows skeleton when loading', () => {
    const { container } = render(<Tile label="Steps" value={null} icon={Footprints} isLoading />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('keeps its shape when a reading is absent', () => {
    // The grid this sits in must not reflow because one metric is missing.
    const { container } = render(<Tile label="Steps" value={undefined} />)
    expect(container.firstElementChild?.className).toContain('flex-col')
  })
})
