import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Activity } from 'lucide-react'
import { Surface, Zone, ZoneHeader, ZoneRow, ZoneSkeleton, ZoneEmpty } from '@/components/ui/Zone'

const haptic = vi.hoisted(() => vi.fn())
vi.mock('@/lib/native/haptics', () => ({ tapLight: haptic, tapSuccess: vi.fn() }))

afterEach(() => { cleanup(); haptic.mockClear() })

/**
 * `Surface` is the primitive every band, header, skeleton and tile composes.
 * The split it enforces — the SURFACE bleeds, the CONTENT takes a measure — is
 * the whole reason one component can serve a 390px phone and a 27" monitor, so
 * that is what these pin.
 */
describe('Surface — bleed the box, measure the content', () => {
  it('lets a band reach both screen edges while its content stays readable', () => {
    const { container } = render(<Surface accent="#fff">body</Surface>)
    const surface = container.firstElementChild as HTMLElement
    expect(surface.className).not.toContain('max-w')
    expect(container.querySelector('.max-w-\\[68ch\\]')).not.toBeNull()
  })

  it('offers a wider measure for charts and a full-width escape hatch', () => {
    const { container: data } = render(<Surface measure="data">c</Surface>)
    expect(data.querySelector('.max-w-\\[96ch\\]')).not.toBeNull()

    cleanup()
    const { container: full } = render(<Surface measure="full">c</Surface>)
    expect(full.querySelector('[class*="max-w"]')).toBeNull()
  })

  it('draws the accent rule only when given an accent', () => {
    const { container: withAccent } = render(<Surface accent="#E0703C">a</Surface>)
    expect(withAccent.querySelector('[aria-hidden="true"]')).not.toBeNull()

    cleanup()
    const { container: without } = render(<Surface>a</Surface>)
    expect(without.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('gives an inset a radius and a band none, so bands can butt together', () => {
    const { container: inset } = render(<Surface variant="inset">a</Surface>)
    expect((inset.firstElementChild as HTMLElement).className).toContain('rounded-2xl')

    cleanup()
    const { container: band } = render(<Surface variant="band">a</Surface>)
    expect((band.firstElementChild as HTMLElement).className).not.toContain('rounded')
  })
})

describe('Surface — interaction', () => {
  it('renders a real button, not a clickable div, when it can be pressed', async () => {
    const onPress = vi.fn()
    render(<Surface as="button" onPress={onPress} label="Open recovery">x</Surface>)
    const button = screen.getByRole('button', { name: 'Open recovery' })
    await userEvent.click(button)
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('fires the haptic on pointer-DOWN, not on release', async () => {
    // Acknowledging a press only once the finger lifts reads as lag however
    // fast the handler is, so the feedback has to lead the commit.
    render(<Surface as="button" onPress={() => {}} label="Tap me">x</Surface>)
    const button = screen.getByRole('button', { name: 'Tap me' })

    await userEvent.pointer({ target: button, keys: '[MouseLeft>]' }) // down, not released
    expect(haptic).toHaveBeenCalledOnce()
  })

  it('stays inert — and silent — when it is not interactive', async () => {
    render(<Surface label="Just a band">x</Surface>)
    expect(screen.queryByRole('button')).toBeNull()
    await userEvent.click(screen.getByLabelText('Just a band'))
    expect(haptic).not.toHaveBeenCalled()
  })

  it('renders a navigating row as a link so the keyboard can reach it', () => {
    render(<ZoneRow href="/day/2026-08-09">Hydration</ZoneRow>)
    expect(screen.getByRole('link', { name: 'Hydration' })).toHaveAttribute('href', '/day/2026-08-09')
  })

  it('leaves a plain row as a div — button semantics would promise activation', () => {
    // The Fuel row's handler is a double-tap gesture, not a single activation.
    render(<ZoneRow onClick={() => {}}>Fuel</ZoneRow>)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('ZoneSkeleton — reserve the space, do not collapse it', () => {
  it('holds an explicit height so arriving data does not shove the page down', () => {
    const { container } = render(<ZoneSkeleton label="Volume" height={240} />)
    const block = container.querySelector('.animate-pulse') as HTMLElement
    expect(block.style.height).toBe('240px')
  })

  it('stands in for text lines when there is no fixed visual', () => {
    const { container } = render(<ZoneSkeleton rows={4} />)
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4)
  })

  it('is announced as loading rather than as empty content', () => {
    render(<ZoneSkeleton label="Vitals" />)
    expect(screen.getByLabelText('Vitals loading')).toBeInTheDocument()
  })
})

describe('ZoneEmpty — nothing to show, said usefully', () => {
  it('names what would be here and offers the way to fill it', () => {
    render(
      <ZoneEmpty
        icon={Activity}
        title="No cardio logged"
        hint="Sessions sync from Apple Health."
        action={<button type="button">Add one</button>}
      />,
    )
    expect(screen.getByText('No cardio logged')).toBeInTheDocument()
    expect(screen.getByText('Sessions sync from Apple Health.')).toBeInTheDocument()
    // An empty state with no exit is a dead end.
    expect(screen.getByRole('button', { name: 'Add one' })).toBeInTheDocument()
  })
})

describe('ZoneHeader — a title line without a heading per section', () => {
  it('carries a subtitle and an action alongside the title', () => {
    render(
      <Zone label="Plan" accent="#fff">
        <ZoneHeader title="Upper A" subtitle="Week 6 · push" action={<span>3 sets</span>} />
      </Zone>,
    )
    expect(screen.getByText('Upper A')).toBeInTheDocument()
    expect(screen.getByText('Week 6 · push')).toBeInTheDocument()
    expect(screen.getByText('3 sets')).toBeInTheDocument()
  })
})
