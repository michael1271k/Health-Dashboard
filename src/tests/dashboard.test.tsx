import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricCard } from '@/components/dashboard/MetricCard'
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
