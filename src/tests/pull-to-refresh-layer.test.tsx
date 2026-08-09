import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PullToRefresh } from '@/components/ui/PullToRefresh'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

/**
 * PullToRefresh wraps EVERY page in the app, so whatever it puts on its
 * container is a property of the whole application.
 *
 * It used to render `transform: translate3d(0, ${pull}px, 0)` unconditionally,
 * which at rest is `translate3d(0,0,0)` — visually identical to no transform
 * and behaviourally nothing like it. A transformed element becomes the
 * containing block for every position:fixed descendant (which is why overlays
 * must be portalled to <body>), forces a permanent compositor layer, and on
 * iOS makes any descendant backdrop-filter sample the wrong buffer and paint
 * solid black.
 *
 * jsdom cannot see compositing, but it can see the inline style — and the
 * absence of the property is the entire fix. `transform: none` would NOT do:
 * some engines still treat a specified transform as establishing a containing
 * block, so the property has to be gone, not neutral.
 */
function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PullToRefresh>
        <p data-testid="page">page content</p>
      </PullToRefresh>
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('PullToRefresh does not promote the page it wraps', () => {
  it('puts no transform on the content wrapper at rest', () => {
    const { getByTestId } = renderShell()
    const wrapper = getByTestId('page').parentElement!

    // Not "none", not "translate3d(0,0,0)" — absent.
    expect(wrapper.style.transform).toBe('')
    expect(wrapper.getAttribute('style')).toBeNull()
  })

  it('renders no style attribute anywhere on the wrapping chain to <body>', () => {
    // A promoted ancestor is just as damaging as a promoted wrapper, and this
    // component adds two siblings plus the container.
    const { getByTestId } = renderShell()
    for (let el = getByTestId('page').parentElement; el && el !== document.body; el = el.parentElement) {
      expect(el.style.transform).toBe('')
      expect(el.style.willChange).toBe('')
      expect(el.style.filter).toBe('')
      expect(el.style.perspective).toBe('')
    }
  })

  it('keeps the children mounted and untouched', () => {
    const { getByTestId } = renderShell()
    expect(getByTestId('page')).toHaveTextContent('page content')
  })
})
