import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { ScoreRings } from '@/components/dashboard/ScoreRings'
import { BatteryOrbFallback } from '@/components/three/BatteryOrbFallback'
import { Footprints } from 'lucide-react'

describe('MetricCard', () => {
  it('renders label and value', () => {
    render(<MetricCard label="Steps" value={8432} unit="steps" icon={Footprints} />)
    expect(screen.getByText('Steps')).toBeInTheDocument()
    expect(screen.getByText('8432')).toBeInTheDocument()
    expect(screen.getByText('steps')).toBeInTheDocument()
  })

  it('renders dash when value is null', () => {
    render(<MetricCard label="Steps" value={null} icon={Footprints} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows skeleton when loading', () => {
    const { container } = render(
      <MetricCard label="Steps" value={null} icon={Footprints} isLoading />,
    )
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })
})

describe('BatteryOrbFallback', () => {
  it('renders SVG at 0%', () => {
    const { container } = render(<BatteryOrbFallback battery={0} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders SVG at 100%', () => {
    const { container } = render(<BatteryOrbFallback battery={100} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

describe('ScoreRings', () => {
  it('renders the centered value and an SVG of ring tracks', () => {
    const { container } = render(
      <ScoreRings
        centerValue={82}
        centerUnit="%"
        rings={[{ label: 'Battery', value: 82, color: '#6D5BFF' }]}
        caption="Good Energy"
      />,
    )
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText('Good Energy')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('shows an em-dash when there is no value', () => {
    render(<ScoreRings centerValue={null} rings={[{ label: 'x', value: 0, color: '#fff' }]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
