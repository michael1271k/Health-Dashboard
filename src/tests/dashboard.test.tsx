import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { ReadinessCard } from '@/components/dashboard/ReadinessCard'
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

describe('ReadinessCard', () => {
  it('shows Train Hard when score is high', () => {
    const highScore = {
      id: '1', user_id: 'u1', date: '2024-01-15',
      score: 90, sleep_score: 85, nutrition_score: 90,
      activity_score: 80, workout_score: 75, recovery_score: 90,
      battery_pct: 85, computed_at: new Date().toISOString(),
    } as const
    render(<ReadinessCard score={highScore} sleep={null} />)
    expect(screen.getByText('Train Hard')).toBeInTheDocument()
  })

  it('shows Rest Today when no data', () => {
    render(<ReadinessCard score={null} sleep={null} />)
    expect(screen.getByText('Rest Today')).toBeInTheDocument()
  })
})
