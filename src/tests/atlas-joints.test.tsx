import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MuscleAtlas, jointKey } from '@/components/body/MuscleAtlas'
import { JOINT_POINTS, MUSCLE_PATHS, jointsOnView } from '@/lib/body/atlas'
import { JOINTS } from '@/lib/body/subRegions'

/**
 * The joint layer's one job is to be visible and to change nothing else.
 *
 * Every assertion here is about what it must NOT do: not take a tap, not add a
 * keyboard stop, not appear where a caller did not ask for it. The figure is
 * rendered 110px wide, where the smallest muscle path is under 3px across —
 * there is no room for a second set of targets, and the sheet's 44px rows are
 * where a joint is actually chosen.
 */
describe('the joint ring layer', () => {
  it('covers every joint in the vocabulary', () => {
    const drawn = new Set(JOINT_POINTS.map((j) => j.joint))
    for (const j of JOINTS) expect(drawn.has(j), `${j} is on no view`).toBe(true)
  })

  it('puts a paired joint on both sides and a midline one only once per view', () => {
    for (const view of ['front', 'back'] as const) {
      const onView = jointsOnView(view)
      const knees = onView.filter((j) => j.joint === 'Knee')
      expect(knees.map((k) => k.side).sort()).toEqual(['left', 'right'])
      expect(onView.filter((j) => j.joint === 'Neck')).toHaveLength(1)
    }
    // The lumbar junction has no front. Anatomy, not an omission.
    expect(jointsOnView('front').some((j) => j.joint === 'Lumbar junction')).toBe(false)
    expect(jointsOnView('back').some((j) => j.joint === 'Lumbar junction')).toBe(true)
  })

  it('keeps every ring inside the viewBox', () => {
    for (const j of JOINT_POINTS) {
      expect(j.cx, `${j.joint} cx`).toBeGreaterThan(0)
      expect(j.cx, `${j.joint} cx`).toBeLessThan(120)
      expect(j.cy, `${j.joint} cy`).toBeGreaterThan(0)
      expect(j.cy, `${j.joint} cy`).toBeLessThan(260)
    }
  })

  it('draws nothing unless a caller asks for it', () => {
    const { container } = render(<MuscleAtlas view="front" interactive />)
    expect(container.querySelectorAll('circle')).toHaveLength(0)
  })

  it('never adds a tap target or a keyboard stop', () => {
    const before = render(<MuscleAtlas view="front" interactive />)
    const stopsBefore = before.container.querySelectorAll('[tabindex="0"]').length

    const after = render(
      <MuscleAtlas view="front" interactive flaggedJoints={new Set([jointKey('Knee', 'left')])} />,
    )
    const rings = after.container.querySelectorAll('circle')
    expect(rings.length).toBe(jointsOnView('front').length)
    // The ring group opts out of hit testing wholesale, exactly as the
    // definition layer does — a hairline over the quad must never eat the
    // quad's own tap, and neither must a ring.
    for (const ring of rings) {
      const group = ring.closest('g')!
      expect(group.style.pointerEvents).toBe('none')
    }
    expect(after.container.querySelectorAll('[tabindex="0"]').length).toBe(stopsBefore)
  })

  it('leaves the front view at one keyboard stop per drawn muscle', () => {
    // The number the UX review measured before v2. Sub-dividing the paths per
    // side would have taken it past 75 on one view; the sheet carries that
    // detail instead, so this number must not move.
    const { container } = render(<MuscleAtlas view="front" interactive />)
    const front = MUSCLE_PATHS.filter((p) => p.view === 'front').length
    expect(container.querySelectorAll('[tabindex="0"]').length).toBe(front)
  })
})
